import { strToU8, zipSync, type Zippable } from 'fflate';
import type { Code } from './api';

// Build the workspace as a .zip: files keep their folders, empty folders are kept,
// and the stdin box is saved as stdin.txt when it has content.
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
