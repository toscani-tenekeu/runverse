import { useEffect, useRef } from 'react';
import { ChevronRight, Play, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileTab } from './Explorer';
import { FileIcon } from './workbench/FileIcon';

interface Props {
  files: FileTab[]; // every file, to know the entry file and to tell same-named tabs apart
  openKeys: string[];
  activeKey: string;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  onNew: () => void;
}

const base = (name: string) => name.slice(name.lastIndexOf('/') + 1);
const folderOf = (name: string) => (name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '');

// The open files as VS Code-style tabs: click to switch, middle-click or × to close.
export function EditorTabs({ files, openKeys, activeKey, onSelect, onClose, onNew }: Props) {
  const open = openKeys.map(k => files.find(f => f.key === k)).filter((f): f is FileTab => !!f);
  const strip = useRef<HTMLDivElement>(null);
  const entry = files[0];

  // Keep the active tab in view when there are many.
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeKey, openKeys.length]);

  return (
    <div className="bg-chrome flex h-9 shrink-0 items-stretch border-b">
      <div
        ref={strip} role="tablist" aria-label="Open files"
        className="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]"
        onWheel={e => { if (e.deltaY && strip.current) strip.current.scrollLeft += e.deltaY; }}
      >
        {open.map(f => {
          const dup = open.some(o => o !== f && base(o.name) === base(f.name));
          const selected = f.key === activeKey;
          return (
            <div
              key={f.key} role="presentation"
              onMouseDown={e => { if (e.button === 1) { e.preventDefault(); if (open.length > 1) onClose(f.key); } }}
              className={cn(
                'group/tab relative flex shrink-0 items-center border-r text-[13px]',
                selected
                  ? 'bg-background text-foreground before:bg-primary before:absolute before:inset-x-0 before:top-0 before:h-px after:bg-background after:absolute after:inset-x-0 after:-bottom-px after:h-px'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <button
                type="button" role="tab" aria-selected={selected} title={f.name} onClick={() => onSelect(f.key)}
                className="flex h-full items-center gap-1.5 pr-1 pl-3 outline-none focus-visible:underline"
              >
                <span className="relative">
                  <FileIcon name={f.name} />
                  {f === entry && <Play aria-label="Entry file" className="fill-primary text-primary absolute -right-1 -bottom-1 size-2.5" />}
                </span>
                <span className="max-w-48 truncate">{base(f.name)}</span>
                {dup && <span className="text-muted-foreground max-w-28 truncate text-xs">{folderOf(f.name)}</span>}
              </button>
              <button
                type="button" aria-label={`Close ${f.name}`} title="Close" disabled={open.length < 2} onClick={() => onClose(f.key)}
                className={cn(
                  'hover:bg-accent mr-1.5 inline-flex size-5 items-center justify-center rounded disabled:invisible',
                  selected ? 'opacity-80' : 'opacity-0 group-hover/tab:opacity-80 focus-visible:opacity-100',
                )}
              ><X className="size-3.5" /></button>
            </div>
          );
        })}
      </div>
      <button
        type="button" title="New file" aria-label="New file" onClick={onNew}
        className="text-muted-foreground hover:text-foreground hover:bg-accent my-auto ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded"
      ><Plus className="size-4" /></button>
    </div>
  );
}

/** The path of the open file above the code, like VS Code's breadcrumbs. */
export function Breadcrumbs({ path }: { path: string }) {
  const parts = path.split('/');
  return (
    <div className="text-muted-foreground flex h-[22px] shrink-0 items-center gap-0.5 overflow-hidden px-3 text-xs whitespace-nowrap" aria-label="File path">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && <ChevronRight className="size-3 opacity-60" />}
          {i === parts.length - 1
            ? <span className="text-foreground/80 flex items-center gap-1"><FileIcon name={part} className="size-3.5" />{part}</span>
            : <span>{part}</span>}
        </span>
      ))}
    </div>
  );
}
