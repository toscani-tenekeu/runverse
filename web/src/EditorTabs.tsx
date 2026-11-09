import { useEffect, useRef } from 'react';
import type { FileTab } from './Explorer';

interface Props {
  files: FileTab[]; // every file, to know the entry file and to tell same-named tabs apart
  openKeys: string[];
  activeKey: string;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  onNew: () => void;
  right?: React.ReactNode;
}

const base = (name: string) => name.slice(name.lastIndexOf('/') + 1);
const folderOf = (name: string) => (name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '');

// The files that are open, as tabs above the editor: one click to switch, middle-click or x to close.
export function EditorTabs({ files, openKeys, activeKey, onSelect, onClose, onNew, right }: Props) {
  const open = openKeys.map(k => files.find(f => f.key === k)).filter((f): f is FileTab => !!f);
  const strip = useRef<HTMLDivElement>(null);
  const entry = files[0];

  // Keep the active tab in view when there are many.
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeKey, openKeys.length]);

  return (
    <div className="tabs-bar">
      <div className="tabs" role="tablist" aria-label="Open files" ref={strip}>
        {open.map(f => {
          const dup = open.some(o => o !== f && base(o.name) === base(f.name));
          const selected = f.key === activeKey;
          return (
            <div
              key={f.key} className={`tab${selected ? ' on' : ''}`} role="presentation"
              onMouseDown={e => { if (e.button === 1) { e.preventDefault(); if (open.length > 1) onClose(f.key); } }}
            >
              <button type="button" role="tab" aria-selected={selected} className="tab-main" title={f.name} onClick={() => onSelect(f.key)}>
                {f === entry && <span className="tab-entry" title="Entry file: runs first" aria-label="Entry file">▶</span>}
                <span className="tab-name">{base(f.name)}</span>
                {dup && <span className="tab-dir">{folderOf(f.name)}</span>}
              </button>
              {open.length > 1 && (
                <button type="button" className="tab-close" aria-label={`Close ${f.name}`} onClick={() => onClose(f.key)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              )}
            </div>
          );
        })}
        <button type="button" className="tab-new" title="New file" aria-label="New file" onClick={onNew}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
      {right && <div className="tabs-right">{right}</div>}
    </div>
  );
}
