import { useMemo, useState, type KeyboardEvent } from 'react';
import type { FileTab } from './Explorer';
import { Modal } from './Settings';

// Does every character of the query appear in order? Returns a score (lower is better) or null.
function score(path: string, query: string): number | null {
  const p = path.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;
  const name = p.slice(p.lastIndexOf('/') + 1);
  if (name.startsWith(q)) return 0;
  if (name.includes(q)) return 1;
  if (p.includes(q)) return 2;
  let at = 0;
  for (const ch of q) {
    at = p.indexOf(ch, at);
    if (at < 0) return null;
    at++;
  }
  return 3;
}

// Ctrl+P: type a few letters of a file name and press Enter.
export function QuickOpen({ files, activeKey, onPick, onClose }: { files: FileTab[]; activeKey: string; onPick: (key: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  const results = useMemo(() => files
    .map(f => ({ f, s: score(f.name, query.trim()) }))
    .filter((r): r is { f: FileTab; s: number } => r.s !== null)
    .sort((a, b) => a.s - b.s || a.f.name.localeCompare(b.f.name))
    .slice(0, 50)
    .map(r => r.f), [files, query]);

  const pick = (f: FileTab | undefined) => { if (f) { onPick(f.key); onClose(); } };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[index]); }
  };

  return (
    <Modal title="Go to file" onClose={onClose} compact>
      <input
        className="quick-input" autoFocus value={query} spellCheck={false} autoComplete="off" aria-label="File name"
        placeholder="Type a file name" onChange={e => { setQuery(e.target.value); setIndex(0); }} onKeyDown={onKey}
      />
      <ul className="quick-list" role="listbox">
        {results.map((f, i) => (
          <li key={f.key} role="option" aria-selected={i === index} className={i === index ? 'on' : ''} onMouseEnter={() => setIndex(i)} onClick={() => pick(f)}>
            <span>{f.name.slice(f.name.lastIndexOf('/') + 1)}</span>
            <small>{f.name.includes('/') ? f.name.slice(0, f.name.lastIndexOf('/')) : ''}{f.key === activeKey ? ' · open' : ''}</small>
          </li>
        ))}
        {!results.length && <li className="quick-empty">No file matches “{query}”.</li>}
      </ul>
    </Modal>
  );
}
