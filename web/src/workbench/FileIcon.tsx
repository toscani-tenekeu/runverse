import { Braces, File, FileCode2, FileJson, FileText, FileTerminal, Folder, FolderOpen, Image, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Small coloured icons per file type, so a project reads at a glance (like VS Code's file icons).
const COLORS: Record<string, string> = {
  js: 'text-yellow-500', mjs: 'text-yellow-500', cjs: 'text-yellow-500', jsx: 'text-sky-400',
  ts: 'text-blue-500', tsx: 'text-sky-500', vue: 'text-emerald-500', svelte: 'text-orange-500',
  html: 'text-orange-500', htm: 'text-orange-500', css: 'text-blue-400', scss: 'text-pink-400',
  py: 'text-sky-500', php: 'text-indigo-400', rb: 'text-red-500', go: 'text-cyan-500', rs: 'text-orange-600',
  java: 'text-red-500', kt: 'text-violet-500', scala: 'text-red-500', c: 'text-blue-500', h: 'text-violet-400',
  cpp: 'text-blue-600', hpp: 'text-violet-500', cs: 'text-violet-500', swift: 'text-orange-500', dart: 'text-sky-400',
  lua: 'text-blue-600', r: 'text-blue-500', sql: 'text-amber-500', sh: 'text-green-500', bash: 'text-green-500',
  ex: 'text-purple-500', exs: 'text-purple-500', clj: 'text-green-500', hs: 'text-purple-400', zig: 'text-amber-500',
  json: 'text-yellow-500', md: 'text-sky-400', txt: 'text-muted-foreground', svg: 'text-amber-500',
  yml: 'text-red-400', yaml: 'text-red-400', toml: 'text-muted-foreground', env: 'text-yellow-600',
};

const ext = (name: string) => {
  const base = name.slice(name.lastIndexOf('/') + 1).toLowerCase();
  if (base.startsWith('.env')) return 'env';
  return base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : '';
};

export function FileIcon({ name, className }: { name: string; className?: string }) {
  const e = ext(name);
  const color = COLORS[e] ?? 'text-muted-foreground';
  const Icon = e === 'json' ? FileJson
    : e === 'md' || e === 'txt' ? FileText
    : e === 'sh' || e === 'bash' ? FileTerminal
    : ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(e) ? Image
    : ['yml', 'yaml', 'toml', 'ini', 'env', 'lock'].includes(e) ? Settings2
    : ['css', 'scss'].includes(e) ? Braces
    : e ? FileCode2 : File;
  return <Icon className={cn('size-4 shrink-0', color, className)} aria-hidden="true" />;
}

export function FolderIcon({ open, className }: { open: boolean; className?: string }) {
  const Icon = open ? FolderOpen : Folder;
  return <Icon className={cn('size-4 shrink-0 text-sky-500/80', className)} aria-hidden="true" />;
}
