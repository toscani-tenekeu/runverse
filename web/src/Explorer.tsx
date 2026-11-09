export interface FileTab { key: string; name: string; content: string }

interface Props {
  files: FileTab[];
  folders: string[];
  activeKey: string;
  collapsed: Set<string>;
  onOpen: (key: string) => void;
  onToggle: (folder: string) => void;
  onNewFile: (folder: string) => void;
  onNewFolder: (folder: string) => void;
  onRenameFile: (file: FileTab) => void;
  onRenameFolder: (folder: string) => void;
  onDeleteFile: (file: FileTab) => void;
  onDeleteFolder: (folder: string) => void;
  onSetEntry: (file: FileTab) => void;
  open: boolean; // the whole panel, not a folder
  onTogglePanel: () => void;
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

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ICONS = {
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  newFile: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14h6',
  newFolder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10v6M9 13h6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  rename: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  play: 'M7 5.5v13l11-6.5z',
  chevron: 'M9 6l6 6-6 6',
  hide: 'M15 6l-6 6 6 6M5 5v14',
  show: 'M9 6l6 6-6 6M19 5v14',
};

export function Explorer(p: Props) {
  const folders = allFolders(p.files, p.folders);
  const entry = p.files[0];

  const renderFolder = (dir: string, depth: number): React.ReactNode => {
    const subfolders = folders.filter(f => parent(f) === dir);
    const files = p.files.filter(f => parent(f.name) === dir).sort((a, b) => a.name.localeCompare(b.name));
    return (
      <>
        {subfolders.map(f => {
          const open = !p.collapsed.has(f);
          return (
            <li key={'d:' + f}>
              <div className="node folder" style={{ '--depth': depth } as React.CSSProperties}>
                <button type="button" className="node-main" onClick={() => p.onToggle(f)} aria-expanded={open}>
                  <span className={`chev${open ? ' open' : ''}`}><Icon d={ICONS.chevron} /></span>
                  <Icon d={ICONS.folder} />
                  <span className="node-name">{base(f)}</span>
                </button>
                <span className="node-actions">
                  <button type="button" title="New file here" aria-label={`New file in ${f}`} onClick={() => p.onNewFile(f)}><Icon d={ICONS.newFile} /></button>
                  <button type="button" title="New folder here" aria-label={`New folder in ${f}`} onClick={() => p.onNewFolder(f)}><Icon d={ICONS.newFolder} /></button>
                  <button type="button" title="Rename or move" aria-label={`Rename ${f}`} onClick={() => p.onRenameFolder(f)}><Icon d={ICONS.rename} /></button>
                  <button type="button" title="Delete" aria-label={`Delete ${f}`} onClick={() => p.onDeleteFolder(f)}><Icon d={ICONS.trash} /></button>
                </span>
              </div>
              {open && <ul>{renderFolder(f, depth + 1)}</ul>}
            </li>
          );
        })}
        {files.map(f => (
          <li key={f.key}>
            <div className={`node file${f.key === p.activeKey ? ' on' : ''}`} style={{ '--depth': depth } as React.CSSProperties}>
              <button type="button" className="node-main" onClick={() => p.onOpen(f.key)} aria-current={f.key === p.activeKey}>
                <span className="chev" />
                {f === entry
                  ? <span className="entry" title="Entry file: runs first"><Icon d={ICONS.play} /></span>
                  : <Icon d={ICONS.file} />}
                <span className="node-name">{base(f.name)}</span>
              </button>
              <span className="node-actions">
                {f !== entry && <button type="button" title="Run this file first" aria-label={`Make ${f.name} the entry file`} onClick={() => p.onSetEntry(f)}><Icon d={ICONS.play} /></button>}
                <button type="button" title="Rename or move" aria-label={`Rename ${f.name}`} onClick={() => p.onRenameFile(f)}><Icon d={ICONS.rename} /></button>
                {p.files.length > 1 && <button type="button" title="Delete" aria-label={`Delete ${f.name}`} onClick={() => p.onDeleteFile(f)}><Icon d={ICONS.trash} /></button>}
              </span>
            </div>
          </li>
        ))}
      </>
    );
  };

  if (!p.open) {
    return (
      <nav className="explorer is-collapsed" aria-label="Files">
        <button type="button" className="explorer-rail" onClick={p.onTogglePanel} aria-expanded={false} title="Show files" aria-label="Show files">
          <Icon d={ICONS.show} />
          <span>Files</span>
        </button>
      </nav>
    );
  }

  return (
    <nav className="explorer" aria-label="Files">
      <div className="explorer-head">
        <span>Files</span>
        <button type="button" title="New file" aria-label="New file" onClick={() => p.onNewFile('')}><Icon d={ICONS.newFile} /></button>
        <button type="button" title="New folder" aria-label="New folder" onClick={() => p.onNewFolder('')}><Icon d={ICONS.newFolder} /></button>
        <button type="button" title="Hide files" aria-label="Hide files" aria-expanded={true} onClick={p.onTogglePanel}><Icon d={ICONS.hide} /></button>
      </div>
      <ul className="tree">{renderFolder('', 0)}</ul>
    </nav>
  );
}
