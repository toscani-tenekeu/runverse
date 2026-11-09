import { strFromU8, unzipSync } from 'fflate';
import type { Code, CodeFile } from './api';
import { MANIFEST, type Manifest } from './export';

// Limits for what a person can bring in.
export const MAX_FILE_BYTES = 1024 * 1024; // one file: 1 MB
export const MAX_FOLDER_BYTES = 100 * 1024 * 1024; // a folder or a whole workspace: 100 MB
export const MAX_FILES = 2000;

// Same rule as the API: up to 5 folder levels, names of letters, digits, dot, dash, underscore.
export const PATH = /^([A-Za-z0-9_][A-Za-z0-9_.-]{0,63}\/){0,4}[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;

export interface Skipped { name: string; reason: string }
export interface Picked { files: CodeFile[]; skipped: Skipped[] }

export const formatBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const COMPRESSED = new Set([
  'zip', 'gz', 'tgz', 'bz2', 'tbz', 'tbz2', 'xz', 'txz', '7z', 'rar', 'tar', 'zst', 'tzst', 'lz', 'lz4', 'lzma', 'z', 'br', 'cab', 'arj', 'sit', 'war', 'jar', 'apk', 'rpm', 'deb', 'dmg', 'iso',
]);

// File signatures of the common archive and compression formats, in case the extension lies.
function hasArchiveSignature(b: Uint8Array) {
  const at = (...bytes: number[]) => bytes.every((v, i) => b[i] === v);
  return (
    at(0x50, 0x4b, 0x03, 0x04) || at(0x50, 0x4b, 0x05, 0x06) || // zip, jar
    at(0x1f, 0x8b) || // gzip
    at(0x42, 0x5a, 0x68) || // bzip2
    at(0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00) || // xz
    at(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c) || // 7z
    at(0x52, 0x61, 0x72, 0x21) || // rar
    at(0x28, 0xb5, 0x2f, 0xfd) || // zstd
    (b.length > 262 && String.fromCharCode(...b.slice(257, 262)) === 'ustar') // tar
  );
}

// Strict UTF-8: anything that is not text (images, executables...) is refused.
const decoder = new TextDecoder('utf-8', { fatal: true });
function asText(b: Uint8Array): string | null {
  if (b.includes(0)) return null;
  try { return decoder.decode(b); } catch { return null; }
}

const IGNORED_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv']);

// Clean up a path from the user's disk into one the workspace accepts.
function cleanPath(raw: string): { path: string } | { reason: string } {
  const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.some(p => IGNORED_DIRS.has(p))) return { reason: 'dependency and cache folders are left out' };
  if (parts.some(p => p.startsWith('.'))) return { reason: 'hidden files are not supported' };
  const path = parts.map(p => p.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64)).join('/');
  if (parts.length > 5) return { reason: 'more than 5 folder levels' };
  if (!PATH.test(path)) return { reason: 'name not allowed' };
  return { path };
}

// Read files chosen with a file picker (kind 'files') or a folder picker (kind 'folder').
// Never throws for a bad file: it is skipped with a reason. Throws only when the folder as a whole is too big.
export async function readPicked(list: FileList, kind: 'files' | 'folder'): Promise<Picked> {
  const all = Array.from(list);
  const total = all.reduce((n, f) => n + f.size, 0);
  if (kind === 'folder' && total > MAX_FOLDER_BYTES) {
    throw new Error(`This folder is ${formatBytes(total)}. The limit is ${formatBytes(MAX_FOLDER_BYTES)}.`);
  }
  const files: CodeFile[] = [];
  const skipped: Skipped[] = [];
  const taken = new Set<string>();

  for (const f of all) {
    const shown = kind === 'folder' ? f.webkitRelativePath || f.name : f.name;
    const ext = f.name.includes('.') ? f.name.slice(f.name.lastIndexOf('.') + 1).toLowerCase() : '';
    if (COMPRESSED.has(ext)) { skipped.push({ name: shown, reason: 'compressed files are not accepted' }); continue; }
    if (f.size > MAX_FILE_BYTES) { skipped.push({ name: shown, reason: `larger than ${formatBytes(MAX_FILE_BYTES)}` }); continue; }
    const cleaned = cleanPath(shown);
    if ('reason' in cleaned) { skipped.push({ name: shown, reason: cleaned.reason }); continue; }
    if (files.length >= MAX_FILES) { skipped.push({ name: shown, reason: `more than ${MAX_FILES} files` }); continue; }
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (hasArchiveSignature(bytes)) { skipped.push({ name: shown, reason: 'compressed files are not accepted' }); continue; }
    const content = asText(bytes);
    if (content === null) { skipped.push({ name: shown, reason: 'not a text file' }); continue; }
    if (taken.has(cleaned.path)) { skipped.push({ name: shown, reason: 'same name as another file' }); continue; }
    taken.add(cleaned.path);
    files.push({ name: cleaned.path, content });
  }
  return { files, skipped };
}

// Read a .zip made by "Export" and give back the workspace inside it.
export async function readWorkspaceZip(file: File): Promise<Code> {
  if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('Choose a .zip file that was exported from Runverse.');
  if (file.size > MAX_FOLDER_BYTES) throw new Error(`This file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FOLDER_BYTES)}.`);

  let declared = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      // Look at the declared sizes first, so a zip bomb is refused before anything is inflated.
      filter: e => {
        declared += e.originalSize;
        if (declared > MAX_FOLDER_BYTES) throw new Error(`The workspace inside is bigger than ${formatBytes(MAX_FOLDER_BYTES)}.`);
        return true;
      },
    });
  } catch (e) {
    throw e instanceof Error && e.message.startsWith('The workspace') ? e : new Error('This file is not a valid .zip.');
  }

  const raw = entries[MANIFEST];
  if (!raw) throw new Error('This zip was not exported from Runverse (runverse.json is missing).');
  let manifest: Manifest;
  try { manifest = JSON.parse(strFromU8(raw)) as Manifest; } catch { throw new Error('runverse.json in this zip is damaged.'); }
  if (manifest.runverse !== 1 || typeof manifest.language !== 'string' || !Array.isArray(manifest.files)) {
    throw new Error('This workspace was made by a newer or different version of Runverse.');
  }
  if (manifest.files.length === 0 || manifest.files.length > MAX_FILES) throw new Error(`A workspace needs between 1 and ${MAX_FILES} files.`);

  const files: CodeFile[] = manifest.files.map(name => {
    const bytes = entries[name];
    if (typeof name !== 'string' || !PATH.test(name) || !bytes) throw new Error(`The zip does not match its runverse.json (${String(name)}).`);
    const content = asText(bytes);
    if (content === null) throw new Error(`${name} is not a text file.`);
    return { name, content };
  });
  const folders = (manifest.folders ?? []).filter(f => typeof f === 'string' && PATH.test(f));
  return { language: manifest.language, files, folders, stdin: typeof manifest.stdin === 'string' ? manifest.stdin : '' };
}

// A workspace waiting to open in a language page we are about to navigate to.
let pending: Code | null = null;
export const setPendingWorkspace = (code: Code) => { pending = code; };
export const takePendingWorkspace = (language: string): Code | null => {
  const code = pending?.language === language ? pending : null;
  if (code) pending = null;
  return code;
};
