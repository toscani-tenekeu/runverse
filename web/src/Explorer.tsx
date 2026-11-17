import type { ReactNode } from 'react';
import { ChevronRight, FilePlus2, FolderPlus, ListCollapse, Pencil, Play, Trash2 } from 'lucide-react';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FileIcon, FolderIcon } from './workbench/FileIcon';

export interface FileTab { key: string; name: string; content: string }

interface Props {
  title: string; // the workspace, shown like VS Code's folder name
  files: FileTab[];
  folders: string[];
  activeKey: string;
  collapsed: Set<string>;
  onOpen: (key: string) => void;
  onToggle: (folder: string) => void;
  onCollapseAll: () => void;
  onNewFile: (folder: string) => void;
  onNewFolder: (folder: string) => void;
  onRenameFile: (file: FileTab) => void;
  onRenameFolder: (folder: string) => void;
  onDeleteFile: (file: FileTab) => void;
  onDeleteFolder: (folder: string) => void;
  onSetEntry: (file: FileTab) => void;
}

const parent = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
const base = (path: string) => path.slice(path.lastIndexOf('/') + 1);

// Every folder that exists: the empty ones the user made plus every parent of a file.
export function allFolders(files: FileTab[], folders: string[]) {
  const set = new Set(folders);
  for (const f of files) for (let p = parent(f.name); p; p = parent(p)) set.add(p);
  for (const f of [...set]) for (let p = parent(f); p; p = parent(p)) set.add(p);
  return [...set].sort();
}

const INDENT = 12; // px per level

/** A small icon button for the explorer header and row actions. */
function Action({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button" aria-label={label}
          onClick={e => { e.stopPropagation(); onClick(); }}
          className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/50 inline-flex size-5 items-center justify-center rounded outline-none focus-visible:ring-2 [&_svg]:size-3.5"
        >{children}</button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

/** One row of the tree. Indent guides are drawn per level, like VS Code. */
function Row({ depth, active, onClick, label, icon, actions, expanded, title }: {
  depth: number; active?: boolean; onClick: () => void; label: string; icon: ReactNode; actions: ReactNode; expanded?: boolean; title: string;
}) {
  return (
    <div
      role="treeitem" aria-selected={active} aria-expanded={expanded} tabIndex={0} title={title}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={cn(
        'group/row relative flex h-[22px] cursor-pointer items-center gap-1 pr-1 outline-none select-none',
        'hover:bg-accent/60 focus-visible:ring-ring/60 focus-visible:ring-1 focus-visible:ring-inset',
        active && 'bg-accent text-accent-foreground hover:bg-accent',
      )}
      style={{ paddingLeft: 8 + depth * INDENT }}
    >
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} aria-hidden="true" className="bg-border absolute inset-y-0 w-px" style={{ left: 14 + i * INDENT }} />
      ))}
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="hidden items-center group-hover/row:flex group-focus-within/row:flex">{actions}</span>
    </div>
  );
}

export function Explorer(p: Props) {
  const folders = allFolders(p.files, p.folders);
  const entry = p.files[0];

  const renderFolder = (dir: string, depth: number): ReactNode => {
    const subfolders = folders.filter(f => parent(f) === dir);
    const files = p.files.filter(f => parent(f.name) === dir).sort((a, b) => a.name.localeCompare(b.name));
    return (
      <>
        {subfolders.map(f => {
          const open = !p.collapsed.has(f);
          return (
            <div key={'d:' + f} role="group">
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div>
                    <Row
                      depth={depth} expanded={open} onClick={() => p.onToggle(f)} label={base(f)} title={f}
                      icon={<>
                        <ChevronRight className={cn('text-muted-foreground size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
                        <FolderIcon open={open} />
                      </>}
                      actions={<>
                        <Action label="New file" onClick={() => p.onNewFile(f)}><FilePlus2 /></Action>
                        <Action label="New folder" onClick={() => p.onNewFolder(f)}><FolderPlus /></Action>
                      </>}
                    />
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  <ContextMenuItem onSelect={() => p.onNewFile(f)}><FilePlus2 />New file…</ContextMenuItem>
                  <ContextMenuItem onSelect={() => p.onNewFolder(f)}><FolderPlus />New folder…</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => p.onRenameFolder(f)}><Pencil />Rename or move…</ContextMenuItem>
                  <ContextMenuItem variant="destructive" onSelect={() => p.onDeleteFolder(f)}><Trash2 />Delete</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              {open && renderFolder(f, depth + 1)}
            </div>
          );
        })}
        {files.map(f => (
          <ContextMenu key={f.key}>
            <ContextMenuTrigger asChild>
              <div>
                <Row
                  depth={depth} active={f.key === p.activeKey} onClick={() => p.onOpen(f.key)} label={base(f.name)}
                  title={f === entry ? `${f.name} (entry file: runs first)` : f.name}
                  icon={<>
                    <span className="size-3.5 shrink-0" />
                    {f === entry
                      ? <span className="relative"><FileIcon name={f.name} /><Play className="fill-primary text-primary absolute -right-1 -bottom-1 size-2.5" /></span>
                      : <FileIcon name={f.name} />}
                  </>}
                  actions={<>
                    <Action label="Rename or move" onClick={() => p.onRenameFile(f)}><Pencil /></Action>
                    {p.files.length > 1 && <Action label="Delete" onClick={() => p.onDeleteFile(f)}><Trash2 /></Action>}
                  </>}
                />
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
              <ContextMenuItem onSelect={() => p.onOpen(f.key)}>Open</ContextMenuItem>
              {f !== entry && <ContextMenuItem onSelect={() => p.onSetEntry(f)}><Play />Run this file first</ContextMenuItem>}
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => p.onRenameFile(f)}><Pencil />Rename or move…</ContextMenuItem>
              <ContextMenuItem onSelect={() => void navigator.clipboard?.writeText(f.name).catch(() => {})}>Copy path</ContextMenuItem>
              {p.files.length > 1 && <ContextMenuItem variant="destructive" onSelect={() => p.onDeleteFile(f)}><Trash2 />Delete</ContextMenuItem>}
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </>
    );
  };

  return (
    <nav className="bg-chrome flex h-full min-h-0 flex-col" aria-label="Files">
      <div className="text-muted-foreground flex h-9 shrink-0 items-center px-3 text-[11px] font-semibold tracking-wider uppercase">Explorer</div>
      <div className="group/head flex h-[22px] shrink-0 items-center gap-1 pr-1 pl-2 text-[11px] font-bold tracking-wide uppercase">
        <span className="min-w-0 flex-1 truncate">{p.title}</span>
        <Action label="New file" onClick={() => p.onNewFile('')}><FilePlus2 /></Action>
        <Action label="New folder" onClick={() => p.onNewFolder('')}><FolderPlus /></Action>
        <Action label="Collapse folders" onClick={p.onCollapseAll}><ListCollapse /></Action>
      </div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div role="tree" aria-label="Workspace files" className="min-h-0 flex-1 overflow-y-auto pb-6 text-[13px]">
            {renderFolder('', 0)}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onSelect={() => p.onNewFile('')}><FilePlus2 />New file…</ContextMenuItem>
          <ContextMenuItem onSelect={() => p.onNewFolder('')}><FolderPlus />New folder…</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </nav>
  );
}
