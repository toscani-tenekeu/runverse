import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { customAlphabet } from 'nanoid';

export interface Snippet {
  language: string;
  files: { name: string; content: string }[];
  folders?: string[];
  stdin: string;
}

const dir = process.env.DATA_DIR ?? './data';
mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(join(dir, 'runverse.db'));
db.exec(`CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  files TEXT NOT NULL,
  stdin TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
)`);

// Columns added after the first release. Links made before expiry existed get the 30-day maximum.
const columns = (db.prepare('PRAGMA table_info(snippets)').all() as { name: string }[]).map(c => c.name);
if (!columns.includes('folders')) db.exec(`ALTER TABLE snippets ADD COLUMN folders TEXT NOT NULL DEFAULT '[]'`);
if (!columns.includes('expires_at')) {
  db.exec('ALTER TABLE snippets ADD COLUMN expires_at INTEGER');
  db.prepare('UPDATE snippets SET expires_at = ? WHERE expires_at IS NULL').run(Date.now() + 30 * 86_400_000);
}
// Links made before deletion existed have no token, so only they can't be deleted early.
if (!columns.includes('delete_token')) db.exec('ALTER TABLE snippets ADD COLUMN delete_token TEXT');
db.exec('CREATE INDEX IF NOT EXISTS snippets_expires_at ON snippets (expires_at)');

const insert = db.prepare('INSERT INTO snippets (id, language, files, folders, stdin, created_at, expires_at, delete_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
const selectToken = db.prepare('SELECT delete_token FROM snippets WHERE id = ?');
const remove = db.prepare('DELETE FROM snippets WHERE id = ?');
const select = db.prepare('SELECT language, files, folders, stdin, expires_at FROM snippets WHERE id = ? AND expires_at > ?');
const purge = db.prepare('DELETE FROM snippets WHERE expires_at <= ?');

// No look-alike characters, so links are easy to read out loud.
const newId = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 8);

export function saveSnippet(s: Snippet, ttlMs: number): { id: string; expiresAt: number; deleteToken: string } {
  const id = newId();
  const now = Date.now();
  const deleteToken = randomBytes(18).toString('base64url');
  insert.run(id, s.language, JSON.stringify(s.files), JSON.stringify(s.folders ?? []), s.stdin, now, now + ttlMs, deleteToken);
  return { id, expiresAt: now + ttlMs, deleteToken };
}

export function getSnippet(id: string): (Snippet & { expiresAt: number }) | undefined {
  const row = select.get(id, Date.now()) as
    { language: string; files: string; folders: string; stdin: string; expires_at: number } | undefined;
  return row && {
    language: row.language,
    files: JSON.parse(row.files),
    folders: JSON.parse(row.folders),
    stdin: row.stdin,
    expiresAt: row.expires_at,
  };
}

export const purgeExpired = () => Number(purge.run(Date.now()).changes);

// Only the browser that created a link holds its token, so only it can delete the link early.
export function deleteSnippet(id: string, token: string): boolean {
  const row = selectToken.get(id) as { delete_token: string | null } | undefined;
  if (!row?.delete_token) return false;
  const a = Buffer.from(row.delete_token);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Number(remove.run(id).changes) > 0;
}
