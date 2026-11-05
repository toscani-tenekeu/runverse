import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { customAlphabet } from 'nanoid';

export interface Snippet {
  language: string;
  files: { name: string; content: string }[];
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

const insert = db.prepare('INSERT INTO snippets (id, language, files, stdin, created_at) VALUES (?, ?, ?, ?, ?)');
const select = db.prepare('SELECT language, files, stdin FROM snippets WHERE id = ?');

// No look-alike characters, so links are easy to read out loud.
const newId = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 8);

export function saveSnippet(s: Snippet): string {
  const id = newId();
  insert.run(id, s.language, JSON.stringify(s.files), s.stdin, Date.now());
  return id;
}

export function getSnippet(id: string): Snippet | undefined {
  const row = select.get(id) as { language: string; files: string; stdin: string } | undefined;
  return row && { language: row.language, files: JSON.parse(row.files), stdin: row.stdin };
}
