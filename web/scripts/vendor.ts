// Bundles the libraries frontend framework projects can import into public/vendor/<name>.js.
// The preview inlines the bundles a project needs, so they work offline and need no CDN.
import { readdirSync } from 'node:fs';

const names = readdirSync('vendor').filter(f => f.endsWith('.ts') && f !== 'register.ts').map(f => f.slice(0, -3));
for (const name of names) {
  const result = await Bun.build({
    entrypoints: [`vendor/${name}.ts`],
    outdir: 'public/vendor',
    naming: `${name}.js`,
    format: 'iife',
    target: 'browser',
    minify: true,
    define: {
      'process.env.NODE_ENV': '"production"',
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
  });
  if (!result.success) {
    console.error(result.logs.join('\n'));
    process.exit(1);
  }
  console.log(`vendor/${name}.js ${(result.outputs[0].size / 1024).toFixed(0)} KB`);
}
