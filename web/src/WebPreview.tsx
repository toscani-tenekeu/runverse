import { useEffect, useRef, useState } from 'react';
import type { CodeFile } from './api';

export interface LogLine { level: 'log' | 'info' | 'warn' | 'error'; text: string }

// Runs inside the preview frame and forwards console output and errors to the editor.
const BRIDGE = `<script>(() => {
  const send = (level, args) => parent.postMessage({ __runverse: true, level, text: args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ') }, '*');
  for (const level of ['log', 'info', 'warn', 'error']) {
    const orig = console[level];
    console[level] = (...args) => { send(level, args); orig.apply(console, args); };
  }
  addEventListener('error', e => send('error', [e.message + (e.lineno ? ' (line ' + e.lineno + ')' : '')]));
  addEventListener('unhandledrejection', e => send('error', ['Unhandled promise rejection: ' + (e.reason && e.reason.message || e.reason)]));
})();<\/script>`;

const resolve = (from: string, ref: string) => {
  const parts = from.split('/').slice(0, -1);
  for (const seg of ref.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
};

// Build one HTML document: the first .html file, with project CSS and JS inlined
// (the sandboxed frame has no server to fetch them from).
export function buildDocument(files: CodeFile[]) {
  const page = files.find(f => f.name.endsWith('.html')) ?? files[0];
  const byName = new Map(files.map(f => [f.name, f.content]));
  const local = (ref: string) => (/^([a-z]+:|\/\/|\/)/i.test(ref) ? undefined : byName.get(resolve(page.name, ref.split(/[?#]/)[0])));

  let html = page.content
    .replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (tag, href) => {
      const css = /stylesheet/i.test(tag) ? local(href) : undefined;
      return css === undefined ? tag : `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`;
    })
    .replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, before, src, after) => {
      const js = local(src);
      return js === undefined ? tag : `<script${before}${after}>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`;
    });

  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + BRIDGE) : BRIDGE + html;
  return html;
}

interface Props {
  doc: string;
  version: number; // bump to reload the frame even when the document is unchanged
  onLog: (line: LogLine) => void;
}

export function WebPreview({ doc, version, onLog }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState(doc);
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  useEffect(() => { setSrc(doc); }, [doc, version]);

  useEffect(() => {
    const listen = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.__runverse) return;
      onLogRef.current({ level: e.data.level, text: String(e.data.text) });
    };
    addEventListener('message', listen);
    return () => removeEventListener('message', listen);
  }, []);

  return (
    <iframe
      key={version}
      ref={frame}
      className="preview-frame"
      title="Preview"
      // No allow-same-origin: the page can't reach Runverse's cookies or storage.
      sandbox="allow-scripts allow-modals allow-forms allow-popups"
      srcDoc={src}
    />
  );
}
