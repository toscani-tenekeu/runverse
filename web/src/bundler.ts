// Builds a frontend framework project (React, Vue, Svelte…) into one HTML document for the
// preview, entirely in the browser. Files are compiled to CommonJS-style modules, wired together
// by a small loader, and the framework libraries come from Runverse's own /vendor bundles.
import type { CodeFile } from './api';
import { injectBridge, inlineAssets } from './WebPreview';

type Compiled = { code: string; deps: string[] };

const VENDOR_BASE = `${import.meta.env.BASE_URL}vendor/`;

/** Which vendor bundle provides each package a project can import. */
const PACKAGES: Record<string, string> = {
  react: 'react', 'react-dom': 'react', 'react-dom/client': 'react', 'react/jsx-runtime': 'react', 'react/jsx-dev-runtime': 'react',
  vue: 'vue',
  svelte: 'svelte', 'svelte/animate': 'svelte', 'svelte/easing': 'svelte', 'svelte/events': 'svelte',
  'svelte/internal/client': 'svelte', 'svelte/internal/disclose-version': 'svelte', 'svelte/internal/flags/legacy': 'svelte',
  'svelte/motion': 'svelte', 'svelte/reactivity': 'svelte', 'svelte/store': 'svelte', 'svelte/transition': 'svelte',
  preact: 'preact', 'preact/hooks': 'preact', 'preact/jsx-runtime': 'preact', 'preact/jsx-dev-runtime': 'preact',
  alpinejs: 'alpine',
  '@tailwindcss/browser': 'tailwind',
};

export const AVAILABLE_PACKAGES = ['react', 'react-dom', 'vue', 'svelte', 'preact', 'alpinejs', '@tailwindcss/browser'];

const vendorCache = new Map<string, Promise<string>>();
const vendor = (name: string) => {
  if (!vendorCache.has(name)) {
    vendorCache.set(name, fetch(`${VENDOR_BASE}${name}.js`).then(r => {
      if (!r.ok) throw new Error(`The ${name} library could not be loaded (${r.status}).`);
      return r.text();
    }));
  }
  return vendorCache.get(name)!;
};

// Compilers are big, so each is loaded only when a project needs it.
const sucrase = () => import('sucrase');
const vueCompiler = () => import('@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js');
const svelteCompiler = () => import('svelte/compiler');

const EXTENSIONS = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.vue', '.svelte', '.json', '.css', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];

function normalize(path: string) {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);
const extOf = (path: string) => path.slice(path.lastIndexOf('.')).toLowerCase();

class BuildError extends Error {}

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const cssModule = (css: string) =>
  `const style = document.createElement('style');\nstyle.textContent = ${JSON.stringify(css)};\ndocument.head.appendChild(style);\n`;

async function toCommonJs(code: string, path: string, framework: string): Promise<string> {
  const { transform } = await sucrase();
  const ext = extOf(path);
  const typescript = ext === '.ts' || ext === '.tsx';
  // JSX is allowed in .js files of React and Preact projects too, as many people write it there.
  const jsx = ext === '.jsx' || ext === '.tsx' || (ext === '.js' && (framework === 'react' || framework === 'preact'));
  const transforms: ('imports' | 'jsx' | 'typescript')[] = ['imports'];
  if (jsx) transforms.push('jsx');
  if (typescript) transforms.push('typescript');
  return transform(code, {
    transforms,
    filePath: path,
    jsxRuntime: 'automatic',
    jsxImportSource: framework === 'preact' ? 'preact' : 'react',
    production: true,
    keepUnusedImports: false,
  }).code;
}

async function compileVue(source: string, path: string): Promise<string> {
  const { parse, compileScript, compileTemplate, compileStyle } = await vueCompiler();
  const { descriptor, errors } = parse(source, { filename: path });
  if (errors.length) throw new BuildError(`${path}: ${errors[0]!.message}`);
  const id = hash(path);
  const scoped = descriptor.styles.some(s => s.scoped);
  let code = '';
  if (descriptor.script || descriptor.scriptSetup) {
    const script = compileScript(descriptor, {
      id,
      inlineTemplate: true,
      genDefaultAs: '__sfc__',
      templateOptions: { compilerOptions: { scopeId: scoped ? `data-v-${id}` : undefined } },
    });
    code += script.content;
    if (descriptor.template && !descriptor.scriptSetup) code += templateCode();
  } else {
    code += 'const __sfc__ = {};\n';
    if (descriptor.template) code += templateCode();
  }
  function templateCode() {
    const template = compileTemplate({
      source: descriptor.template!.content,
      filename: path,
      id,
      scoped,
      compilerOptions: { scopeId: scoped ? `data-v-${id}` : undefined },
    });
    if (template.errors.length) throw new BuildError(`${path}: ${String(template.errors[0])}`);
    return `\n${template.code.replace(/\nexport (function|const) render/, '\n$1 render')}\n__sfc__.render = render;\n`;
  }
  if (scoped) code += `\n__sfc__.__scopeId = ${JSON.stringify(`data-v-${id}`)};\n`;
  for (const style of descriptor.styles) {
    const css = compileStyle({ source: style.content, filename: path, id: `data-v-${id}`, scoped: style.scoped });
    if (css.errors.length) throw new BuildError(`${path}: ${css.errors[0]!.message}`);
    code += cssModule(css.code);
  }
  code += '\nexport default __sfc__;\n';
  const lang = descriptor.scriptSetup?.lang ?? descriptor.script?.lang;
  return toCommonJs(code, lang === 'ts' ? path.replace(/\.vue$/, '.vue.ts') : path.replace(/\.vue$/, '.vue.js'), 'vue');
}

async function compileSvelte(source: string, path: string): Promise<string> {
  const { compile } = await svelteCompiler();
  try {
    const result = compile(source, { filename: path, generate: 'client', css: 'injected', dev: false });
    return toCommonJs(result.js.code, path.replace(/\.svelte$/, '.svelte.js'), 'svelte');
  } catch (e) {
    throw new BuildError(e instanceof Error ? e.message : String(e));
  }
}

/** Every `require("x")` left after compiling, in order. */
function requiresIn(code: string) {
  const found = new Set<string>();
  for (const m of code.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)) found.add(m[2]!);
  return [...found];
}

export interface BuiltDocument {
  doc: string;
  errors: string[];
}

/** Builds the preview document of a frontend framework project. */
export async function buildFrameworkDocument(files: CodeFile[], framework: string): Promise<BuiltDocument> {
  const byName = new Map(files.map(f => [f.name, f.content]));
  const page = files.find(f => f.name === 'index.html') ?? files.find(f => f.name.endsWith('.html'));
  if (!page) return errorDocument('Add an index.html: it is the page the preview shows.');

  const entries: string[] = [];
  const inline: CodeFile[] = [];
  // Module scripts are taken out of the page and loaded by the bundle at the end of <body>.
  let html = page.content.replace(/<script\b([^>]*)\btype=["']module["']([^>]*)>([\s\S]*?)<\/script>/gi, (tag, before, after, body) => {
    const src = `${before} ${after}`.match(/\bsrc=["']([^"']+)["']/)?.[1];
    if (src && /^([a-z]+:)?\/\//i.test(src)) return tag; // a module from the web stays as it is
    if (src) entries.push(normalize(src.startsWith('/') ? src : dirOf(page.name) + src));
    else if (body.trim()) {
      const name = `__inline_${inline.length}.js`;
      inline.push({ name, content: body });
      entries.push(name);
    }
    return '';
  });
  for (const file of inline) byName.set(file.name, file.content);

  const resolve = (from: string, spec: string): string => {
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const base = spec.startsWith('/') ? spec.slice(1) : dirOf(from) + spec;
      for (const ext of EXTENSIONS) {
        const candidate = normalize(base + ext);
        if (byName.has(candidate)) return candidate;
      }
      throw new BuildError(`${from}: cannot find "${spec}".`);
    }
    if (PACKAGES[spec]) return `vendor:${spec}`;
    throw new BuildError(
      `${from}: the package "${spec}" isn't available here. Frontend projects can import ${AVAILABLE_PACKAGES.join(', ')}. ` +
        'Other libraries can be added to index.html with a <script> tag from a CDN.',
    );
  };

  const compiled = new Map<string, Compiled & { map: Record<string, string> }>();
  const bundles = new Set<string>();
  const errors: string[] = [];

  async function visit(path: string) {
    if (compiled.has(path)) return;
    const source = byName.get(path);
    if (source === undefined) throw new BuildError(`Cannot find ${path}.`);
    const ext = extOf(path);
    let code: string;
    if (ext === '.vue') code = await compileVue(source, path);
    else if (ext === '.svelte') code = await compileSvelte(source, path);
    else if (ext === '.css') code = cssModule(source);
    else if (ext === '.json') code = `module.exports = ${source.trim() || 'null'};`;
    else if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) {
      try {
        code = await toCommonJs(source, path, framework);
      } catch (e) {
        throw new BuildError(e instanceof Error ? e.message.replace(/^Error transforming /, '') : String(e));
      }
    } else code = `module.exports = { __esModule: true, default: ${JSON.stringify(source)} };`;

    const deps = requiresIn(code);
    const map: Record<string, string> = {};
    compiled.set(path, { code, deps, map });
    for (const dep of deps) {
      const target = resolve(path, dep);
      map[dep] = target;
      if (target.startsWith('vendor:')) bundles.add(PACKAGES[dep]!);
      else await visit(target);
    }
  }

  try {
    for (const entry of entries) {
      if (!byName.has(entry)) throw new BuildError(`index.html loads ${entry}, which doesn't exist.`);
      await visit(entry);
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  let libraries = '';
  try {
    libraries = (await Promise.all([...bundles].map(vendor))).map(js => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`).join('\n');
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  if (errors.length) return errorDocument(errors.join('\n\n'));

  const modules = [...compiled].map(([path, m]) =>
    `${JSON.stringify(path)}: [function (require, module, exports) {\n${m.code}\n}, ${JSON.stringify(m.map)}]`).join(',\n');
  const loader = `<script>
(() => {
  const vendor = self.__rv_vendor || {};
  const modules = {\n${modules}\n};
  const cache = {};
  function load(path) {
    if (cache[path]) return cache[path].exports;
    const module = (cache[path] = { exports: {} });
    const [factory, map] = modules[path];
    const require = spec => {
      const target = map[spec];
      return target.startsWith('vendor:') ? vendor[target.slice(7)] : load(target);
    };
    factory.call(module.exports, require, module, module.exports);
    return module.exports;
  }
  for (const entry of ${JSON.stringify(entries)}) {
    try { load(entry); } catch (e) { console.error(e && e.stack ? e.stack.split('\\n').slice(0, 4).join('\\n') : String(e)); }
  }
})();
</script>`;

  const scripts = `${libraries}\n${safeScript(loader)}`;
  const lookup = (ref: string) => {
    if (/^([a-z]+:)?\/\//i.test(ref)) return undefined;
    const clean = ref.split(/[?#]/)[0]!;
    return byName.get(normalize(clean.startsWith('/') ? clean.slice(1) : dirOf(page.name) + clean));
  };
  html = inlineAssets(page, files, html, lookup);
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => `${scripts}\n</body>`) : html + scripts;
  return { doc: injectBridge(html), errors: [] };
}

/** "</script>" inside the bundle would end the tag early; split it in the module code. */
function safeScript(loader: string) {
  const open = '<script>';
  const close = '</script>';
  const inner = loader.slice(open.length, loader.length - close.length);
  return open + inner.replace(/<\/script/gi, '<\\/script') + close;
}

function errorDocument(message: string): BuiltDocument {
  const escaped = message.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  return {
    doc: `<!doctype html><meta charset="utf-8"><style>body{font:14px/1.5 ui-monospace,monospace;margin:0;padding:20px;background:#fff5f5;color:#9b1c1c}h1{font:600 15px system-ui,sans-serif;margin:0 0 10px}pre{white-space:pre-wrap;margin:0}</style><h1>The project could not be built</h1><pre>${escaped}</pre>`,
    errors: [message],
  };
}
