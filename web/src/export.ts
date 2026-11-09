import { strToU8, zipSync, type Zippable } from 'fflate';
import type { Code } from './api';

// Describes the workspace so Import can restore it exactly: language, which file is the entry
// (the first one), empty folders and the stdin box.
export const MANIFEST = 'runverse.json';
export interface Manifest { runverse: 1; language: string; files: string[]; folders: string[]; stdin: string }

// Build the workspace as a .zip: files keep their folders, empty folders are kept, the stdin box is
// saved as stdin.txt when it has content, and runverse.json lets "Import workspace" read it back.
export function workspaceZip(code: Code): Uint8Array {
  const tree: Zippable = {};
  const dir = (path: string) =>
    path.split('/').reduce<Zippable>((node, part) => (node[part] ??= {}) as Zippable, tree);

  for (const folder of code.folders ?? []) dir(folder);
  for (const file of code.files) {
    const slash = file.name.lastIndexOf('/');
    const parent = slash < 0 ? tree : dir(file.name.slice(0, slash));
    parent[file.name.slice(slash + 1)] = strToU8(file.content);
  }
  if (code.stdin && !('stdin.txt' in tree)) tree['stdin.txt'] = strToU8(code.stdin);
  const manifest: Manifest = { runverse: 1, language: code.language, files: code.files.map(f => f.name), folders: code.folders ?? [], stdin: code.stdin };
  tree[MANIFEST] = strToU8(JSON.stringify(manifest, null, 2));

  return zipSync(tree, { level: 6 });
}

export function downloadWorkspaceZip(code: Code, name: string) {
  const blob = new Blob([workspaceZip(code) as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `${name}.zip` });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
