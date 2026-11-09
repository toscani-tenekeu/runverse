import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { languagesQuery, runCode, shareCode, type Code, type Expiry, type Language, type RunResult } from './api';
import { CodeEditor } from './CodeEditor';
import { downloadWorkspaceZip } from './export';
import { useDialog } from './Dialog';
import { Explorer, allFolders, type FileTab } from './Explorer';
import { Resizer } from './Resizer';
import { Terminal, type TerminalMode } from './Terminal';
import { EditorTabs } from './EditorTabs';
import { QuickOpen } from './QuickOpen';
import { useEditorPrefs } from './prefs';
import { load, save } from './storage';
import { ImportDialog, ImportReportDialog, SettingsDialog, ShareDialog, formatDate, type ImportKind } from './Settings';
import { MAX_FILES as IMPORT_MAX_FILES, MAX_FOLDER_BYTES, formatBytes, readPicked, readWorkspaceZip, setPendingWorkspace, type Skipped } from './import';
import { rememberLink } from './links';
import { WebPreview, buildDocument, type LogLine } from './WebPreview';

let nextKey = 0;
const toTabs = (code: Code): FileTab[] => code.files.map(f => ({ key: String(nextKey++), ...f }));
export const draftKey = (id: string) => `rv-draft-${id}`;
export const starter = (l: Language): Code => ({ language: l.id, files: l.files ?? [{ name: l.file, content: l.template }], stdin: '' });

// Same rule as the API: up to 5 folder levels, names of letters, digits, dot, dash, underscore.
const PATH = /^([A-Za-z0-9_][A-Za-z0-9_.-]{0,63}\/){0,4}[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
const MAX_FILES = IMPORT_MAX_FILES;

const EXPIRIES: { id: Expiry; label: string }[] = [
  { id: '1h', label: '1 hour' }, { id: '1d', label: '1 day' }, { id: '7d', label: '7 days' },
  { id: '15d', label: '15 days' }, { id: '20d', label: '20 days' }, { id: '30d', label: '30 days' },
];

// Pane sizes in pixels, remembered between visits.
interface Layout { explorer: number; side: number; top: number; editor: number }
const LAYOUT_KEY = 'rv-layout';
const FILES_OPEN_KEY = 'rv-files-open';
const SIDE_OPEN_KEY = 'rv-side-open';
const TERMINAL_KEY = 'rv-terminal';
const TERMINAL_HEIGHT_KEY = 'rv-terminal-height';
const RAIL_WIDTH = 44;
const DEFAULT_LAYOUT: Layout = { explorer: 210, side: 400, top: 130, editor: 440 };
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const WEB_MODES: Record<string, string> = { html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript' };
const modeFor = (lang: Language, file: string) =>
  lang.id === 'web' ? WEB_MODES[file.slice(file.lastIndexOf('.') + 1).toLowerCase()] ?? '' : lang.mode;

interface Props {
  lang: Language;
  initial: Code;
  // Drafts are kept for /editor/<lang>; a shared snippet stays untouched until it is edited.
  persist: boolean;
  expiresAt?: number;
}

export function Workspace({ lang, initial, persist, expiresAt }: Props) {
  const navigate = useNavigate();
  const dialog = useDialog();
  const { data: languages = [] } = useQuery(languagesQuery);
  const isWeb = lang.id === 'web';

  const [files, setFiles] = useState(() => toTabs(initial));
  const [folders, setFolders] = useState<string[]>(initial.folders ?? []);
  const [active, setActive] = useState(files[0].key);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [stdin, setStdin] = useState(initial.stdin);
  const [toast, setToast] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [report, setReport] = useState<{ added: number; replaced: number; skipped: Skipped[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const [termMode, setTermMode] = useState<TerminalMode>(() => {
    const m = load<{ mode?: string }>(TERMINAL_KEY)?.mode;
    return m === 'normal' || m === 'expanded' ? m : 'collapsed';
  });
  const [termHeight, setTermHeight] = useState(() => clamp(load<number>(TERMINAL_HEIGHT_KEY) ?? 220, 120, 700));
  const changeTermMode = (m: TerminalMode) => { setTermMode(m); save(TERMINAL_KEY, { mode: m }); };
  const resizeTerm = (d: number) => setTermHeight(h => { const next = clamp(h + d, 120, 700); save(TERMINAL_HEIGHT_KEY, next); return next; });
  // A one-file program does not need the file list, so it starts out of the way (until the person chooses otherwise).
  const [filesOpen, setFilesOpen] = useState(() => load<boolean>(FILES_OPEN_KEY) ?? initial.files.length > 1);
  const toggleFiles = () => setFilesOpen(o => { save(FILES_OPEN_KEY, !o); return !o; });
  const [sideOpen, setSideOpen] = useState(() => load<boolean>(SIDE_OPEN_KEY) !== false);
  const toggleSide = () => setSideOpen(o => { save(SIDE_OPEN_KEY, !o); return !o; });
  const [stdinOpen, setStdinOpen] = useState(() => initial.stdin.length > 0);
  const [focus, setFocus] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const prefs = useEditorPrefs();
  const [shared, setShared] = useState<{ id: string; expiresAt: number } | null>(null);
  const [layout, setLayout] = useState<Layout>(() => ({ ...DEFAULT_LAYOUT, ...load<Partial<Layout>>(LAYOUT_KEY) }));
  const current = files.find(f => f.key === active) ?? files[0];

  // Tabs: the files that are open. Whatever becomes the active file gets a tab; deleted files lose theirs.
  const [openKeys, setOpenKeys] = useState<string[]>(() => [files[0].key]);
  useEffect(() => {
    setOpenKeys(keys => {
      const alive = keys.filter(k => files.some(f => f.key === k));
      return alive.includes(current.key) ? (alive.length === keys.length ? keys : alive) : [...alive, current.key];
    });
  }, [files, current.key]);
  const closeTab = (key: string) => {
    if (openKeys.length < 2) return;
    const at = openKeys.indexOf(key);
    const rest = openKeys.filter(k => k !== key);
    if (key === current.key) setActive(rest[Math.max(0, at - 1)]);
    setOpenKeys(rest);
  };

  const code = useMemo<Code>(() => ({
    language: lang.id,
    files: files.map(({ name, content }) => ({ name, content })),
    folders,
    stdin,
  }), [lang.id, files, folders, stdin]);

  // Drafts live in localStorage (about 5 MB), so big imported workspaces are not kept as drafts.
  useEffect(() => {
    if (!persist) return;
    const size = code.files.reduce((n, f) => n + f.content.length, 0);
    save(draftKey(lang.id), size > 1_000_000 ? null : code);
  }, [persist, lang.id, code]);
  useEffect(() => { save(LAYOUT_KEY, layout); }, [layout]);

  const toastTimer = useRef(0);
  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  };

  // ---- Running ----
  const run = useMutation({ mutationFn: runCode });
  // Web projects run in the browser: rebuild the preview shortly after each edit.
  const [webDoc, setWebDoc] = useState(() => (isWeb ? buildDocument(code.files) : ''));
  const [webVersion, setWebVersion] = useState(0);
  const [logs, setLogs] = useState<LogLine[]>([]);
  useEffect(() => {
    if (!isWeb) return;
    const t = setTimeout(() => { setLogs([]); setWebDoc(buildDocument(code.files)); }, 500);
    return () => clearTimeout(t);
  }, [isWeb, code.files]);

  const doRun = () => {
    // The result appears in the output panel, so make sure it is visible.
    setSideOpen(true);
    save(SIDE_OPEN_KEY, true);
    if (isWeb) { setLogs([]); setWebDoc(buildDocument(code.files)); setWebVersion(v => v + 1); return; }
    if (!run.isPending) run.mutate(code);
  };

  // ---- Sharing ----
  const share = useMutation({
    mutationFn: shareCode,
    onSuccess: ({ id, expiresAt: until, deleteToken }) => {
      rememberLink({ id, language: lang.name, expiresAt: until, token: deleteToken });
      setShared({ id, expiresAt: until });
    },
    onError: e => flash(e.message),
  });
  const shareRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shareOpen) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !shareRef.current?.contains(e.target as Node)) setShareOpen(false);
    };
    addEventListener('pointerdown', close);
    addEventListener('keydown', close);
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', close); };
  }, [shareOpen]);

  // ---- Files and folders ----
  const existing = (extra: string[] = []) => new Set([...files.map(f => f.name), ...allFolders(files, folders), ...extra]);

  const validPath = (path: string, ignore?: string) => {
    if (!PATH.test(path)) return 'Use letters, numbers, dots, dashes or underscores, and "/" between folders (5 levels max).';
    const taken = existing();
    if (ignore) taken.delete(ignore);
    if (taken.has(path)) return `“${path}” already exists.`;
    for (let p = path; p.includes('/');) {
      p = p.slice(0, p.lastIndexOf('/'));
      if (files.some(f => f.name === p)) return `“${p}” is a file, so it can't hold other files.`;
    }
    return null;
  };

  const extOf = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.')) : '');
  const freeName = (folder: string, stem: string, ext: string) => {
    const taken = existing();
    for (let i = 1; ; i++) {
      const path = (folder ? folder + '/' : '') + (i === 1 ? stem : stem + i) + ext;
      if (!taken.has(path)) return path;
    }
  };

  const newFile = async (folder: string) => {
    if (files.length >= MAX_FILES) return flash(`${MAX_FILES} files at most.`);
    const name = await dialog.prompt({
      title: folder ? `New file in ${folder}` : 'New file',
      value: freeName(folder, 'file', isWeb ? '.js' : extOf(lang.file)),
      hint: 'Use "/" to put it in a folder, like lib/utils' + (isWeb ? '.js' : extOf(lang.file)),
      validate: p => validPath(p),
    });
    if (!name) return;
    const tab = { key: String(nextKey++), name, content: '' };
    setFiles(fs => [...fs, tab]);
    setActive(tab.key);
    setCollapsed(c => new Set([...c].filter(f => !name.startsWith(f + '/'))));
  };

  const newFolder = async (folder: string) => {
    const name = await dialog.prompt({
      title: folder ? `New folder in ${folder}` : 'New folder',
      value: freeName(folder, 'folder', ''),
      validate: p => validPath(p),
    });
    if (name) setFolders(fs => [...fs, name]);
  };

  const renameFile = async (tab: FileTab) => {
    const name = await dialog.prompt({
      title: 'Rename or move file',
      value: tab.name,
      hint: 'Change the folder part to move it, like src/' + tab.name.slice(tab.name.lastIndexOf('/') + 1),
      confirmLabel: 'Rename',
      validate: p => (p === tab.name ? null : validPath(p, tab.name)),
    });
    if (name && name !== tab.name) setFiles(fs => fs.map(f => (f.key === tab.key ? { ...f, name } : f)));
  };

  const renameFolder = async (folder: string) => {
    const name = await dialog.prompt({
      title: 'Rename or move folder',
      value: folder,
      confirmLabel: 'Rename',
      validate: p => (p === folder ? null : p.startsWith(folder + '/') ? "A folder can't go inside itself." : validPath(p, folder)),
    });
    if (!name || name === folder) return;
    const move = (path: string) => (path === folder || path.startsWith(folder + '/') ? name + path.slice(folder.length) : path);
    setFiles(fs => fs.map(f => ({ ...f, name: move(f.name) })));
    setFolders(fs => fs.map(move));
    setCollapsed(c => new Set([...c].map(move)));
  };

  const deleteFile = async (tab: FileTab) => {
    const ok = await dialog.confirm({ title: `Delete ${tab.name}?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    const rest = files.filter(f => f.key !== tab.key);
    setFiles(rest);
    if (active === tab.key) setActive(rest[0].key);
  };

  const deleteFolder = async (folder: string) => {
    const inside = (p: string) => p === folder || p.startsWith(folder + '/');
    const rest = files.filter(f => !inside(f.name));
    if (!rest.length) return flash('Keep at least one file outside this folder.');
    const count = files.length - rest.length;
    const ok = await dialog.confirm({
      title: `Delete ${folder}?`,
      message: count ? `The ${count} file${count > 1 ? 's' : ''} inside will be deleted too. This cannot be undone.` : 'This folder is empty.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setFiles(rest);
    setFolders(fs => fs.filter(f => !inside(f)));
    if (!rest.some(f => f.key === active)) setActive(rest[0].key);
  };

  const setEntry = (tab: FileTab) => setFiles(fs => [tab, ...fs.filter(f => f.key !== tab.key)]);

  const toggleFolder = (folder: string) => setCollapsed(c => {
    const next = new Set(c);
    if (!next.delete(folder)) next.add(folder);
    return next;
  });

  const updateContent = (content: string) =>
    setFiles(fs => fs.map(f => (f.key === current.key ? { ...f, content } : f)));

  const reset = async () => {
    const ok = await dialog.confirm({
      title: 'Start over?',
      message: 'Your files will be replaced with the starter example.',
      confirmLabel: 'Start over',
      danger: true,
    });
    if (!ok) return;
    const tabs = toTabs(starter(lang));
    setFiles(tabs);
    setFolders([]);
    setActive(tabs[0].key);
    setStdin('');
    run.reset();
  };

  // ---- Import ----
  const chooseImport = (kind: ImportKind) => {
    setImportOpen(false);
    (kind === 'files' ? fileInput : kind === 'folder' ? folderInput : zipInput).current?.click();
  };

  const addPicked = async (list: FileList | null, kind: 'files' | 'folder') => {
    if (!list?.length) return;
    try {
      const { files: picked, skipped } = await readPicked(list, kind);
      const names = new Set(picked.map(f => f.name));
      const replaced = files.filter(f => names.has(f.name)).length;
      const keep = files.filter(f => !names.has(f.name));
      if (keep.length + picked.length > MAX_FILES) return flash(`A workspace holds ${MAX_FILES} files at most.`);
      const total = [...keep, ...picked].reduce((n, f) => n + f.content.length, 0);
      if (total > MAX_FOLDER_BYTES) return flash(`That would make the workspace bigger than ${formatBytes(MAX_FOLDER_BYTES)}.`);
      if (!picked.length) return setReport({ added: 0, replaced: 0, skipped });
      const tabs = picked.map(f => ({ key: String(nextKey++), ...f }));
      setFiles([...keep, ...tabs]);
      setActive(tabs[0].key);
      if (skipped.length) setReport({ added: picked.length, replaced, skipped });
      else flash(`Imported ${picked.length} file${picked.length === 1 ? '' : 's'}${replaced ? `, replaced ${replaced}` : ''}.`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not import that.');
    }
  };

  const importWorkspace = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    try {
      const imported = await readWorkspaceZip(file);
      if (!languages.some(l => l.id === imported.language && l.installed)) return flash(`This workspace uses “${imported.language}”, which this server doesn't have.`);
      const ok = await dialog.confirm({
        title: 'Replace your workspace?',
        message: `Your current files will be replaced by the ${imported.files.length} file${imported.files.length === 1 ? '' : 's'} in ${file.name}.`,
        confirmLabel: 'Import',
        danger: true,
      });
      if (!ok) return;
      if (imported.language !== lang.id) {
        // A different language is a different editor page: open it with this workspace.
        setPendingWorkspace(imported);
        navigate({ to: '/editor/$lang', params: { lang: imported.language } });
        return;
      }
      const tabs = toTabs(imported);
      setFiles(tabs);
      setFolders(imported.folders ?? []);
      setActive(tabs[0].key);
      setStdin(imported.stdin);
      setCollapsed(new Set());
      run.reset();
      flash('Workspace imported.');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not import that workspace.');
    }
  };

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (document.querySelector('dialog[open]')) return; // a dialog has the keyboard
      const act = (fn: () => void) => { e.preventDefault(); fn(); };
      switch (e.key) {
        case 'p': return act(() => setQuickOpen(true));
        case 'b': return act(toggleFiles);
        case '\\': return act(toggleSide);
        case '.': return act(() => setFocus(f => !f));
        case ',': return act(() => setSettingsOpen(true));
      }
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, []);

  // ---- Layout ----
  const resize = (key: keyof Layout, min: number, max: number) => (delta: number) =>
    setLayout(l => ({ ...l, [key]: clamp(l[key] + delta, min, max) }));
  const style = {
    '--explorer-w': focus ? '0px' : `${filesOpen ? layout.explorer : RAIL_WIDTH}px`,
    '--rz-a': focus ? '0px' : '8px',
    '--side-w': sideOpen ? `${layout.side}px` : '0px',
    '--rz-b': sideOpen ? '8px' : '0px',
    '--top-h': `${layout.top}px`,
    '--editor-h': `${layout.editor}px`,
  } as CSSProperties;

  return (
    <div className={`app${focus ? ' is-focus' : ''}${sideOpen ? '' : ' no-side'}`}>
      <header className="bar">
        <a className="brand" href="/" aria-label="Runverse home">
          <Logo />
          <span>runverse</span>
        </a>
        <label className="picker">
          <span className="sr-only">Language</span>
          <select value={lang.id} onChange={e => navigate({ to: '/editor/$lang', params: { lang: e.target.value } })}>
            {languages.map(l => (
              <option key={l.id} value={l.id} disabled={!l.installed}>
                {l.name}{l.version ? ` ${l.version}` : l.installed ? '' : ' (not installed)'}
              </option>
            ))}
          </select>
        </label>
        {expiresAt && <span className="expires">Shared link, works until {formatDate(expiresAt)}</span>}
        <div className="bar-actions">
          <button className="icon-btn" type="button" onClick={reset} title="Reset to the starter example" aria-label="Reset">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
          <button className="icon-btn" type="button" title="Import files, a folder or a workspace" aria-label="Import" onClick={() => setImportOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /><path d="M12 3v12" /><path d="m8 11 4 4 4-4" /></svg>
          </button>
          <button
            className="icon-btn" type="button" title="Export workspace as .zip" aria-label="Export workspace as .zip"
            onClick={() => downloadWorkspaceZip(code, `runverse-${lang.id}`)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /><path d="M12 15V3" /><path d="m8 7 4-4 4 4" /></svg>
          </button>
          <div className="share" ref={shareRef}>
            <button
              className="icon-btn" type="button" aria-haspopup="menu" aria-expanded={shareOpen}
              title={share.isPending ? 'Sharing…' : 'Share a link'} aria-label="Share"
              onClick={() => setShareOpen(o => !o)} disabled={share.isPending}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>
            </button>
            {shareOpen && (
              <div className="menu" role="menu">
                <p className="menu-title">Share this workspace</p>
                <p className="menu-hint">Choose how long the link stays available.</p>
                {EXPIRIES.map(x => (
                  <button key={x.id} type="button" role="menuitem" onClick={() => { setShareOpen(false); share.mutate({ code, expiresIn: x.id }); }}>
                    {x.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn" type="button" onClick={doRun} disabled={run.isPending} title="Run (Ctrl+Enter)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5.5v13l11-6.5z" fill="currentColor" /></svg>
            {run.isPending ? 'Running…' : isWeb ? 'Reload' : 'Run'}
          </button>
        </div>
      </header>

      <main className="panes" style={style}>
        <Explorer
          files={files} folders={folders} activeKey={current.key} collapsed={collapsed}
          onOpen={setActive} onToggle={toggleFolder}
          onNewFile={newFile} onNewFolder={newFolder}
          onRenameFile={renameFile} onRenameFolder={renameFolder}
          onDeleteFile={deleteFile} onDeleteFolder={deleteFolder}
          onSetEntry={setEntry}
          open={filesOpen} onTogglePanel={toggleFiles}
        />
        {filesOpen
          ? <Resizer axis="x" className="desktop-only" label="Resize file list" onResize={resize('explorer', 140, 480)} />
          : <div className="desktop-only" aria-hidden="true" />}

        <section className="pane editor-pane" aria-label="Code">
          <EditorTabs
            files={files} openKeys={openKeys} activeKey={current.key}
            onSelect={setActive} onClose={closeTab} onNew={() => newFile('')}
          />
          <CodeEditor
            fileKey={current.key} value={current.content} mode={modeFor(lang, current.name)} onChange={updateContent} onRun={doRun}
            fontSize={prefs.fontSize} wrap={prefs.wrap} onCursor={setCursor}
          />
        </section>
        <Resizer axis="x" className="desktop-only" label="Resize output panel" onResize={d => resize('side', 260, innerWidth * 0.65)(-d)} />
        <Resizer axis="y" className="mobile-only" label="Resize editor" onResize={resize('editor', 200, 1400)} />

        <section className="side" aria-hidden={!sideOpen} aria-label={isWeb ? 'Preview and console' : 'Input and output'}>
          {isWeb ? (
            <>
              <div className="block preview">
                <span className="label">Preview</span>
                <WebPreview doc={webDoc} version={webVersion} onLog={line => setLogs(l => [...l.slice(-199), line])} />
              </div>
              <Resizer axis="y" label="Resize console" onResize={d => resize('top', 60, 900)(-d)} />
              <div className="block console" style={{ height: 'var(--top-h)' }}>
                <span className="label">Console {logs.length > 0 && <button type="button" className="linkish" onClick={() => setLogs([])}>Clear</button>}</span>
                <pre className="out">
                  {logs.length ? logs.map((l, i) => <span key={i} className={l.level === 'error' ? 'err' : l.level === 'warn' ? 'warn' : ''}>{l.text}{'\n'}</span>)
                    : <span className="muted">console.log() output shows up here.</span>}
                </pre>
              </div>
            </>
          ) : (
            <>
              <div className={`block stdin${stdinOpen ? '' : ' is-closed'}`} style={stdinOpen ? { height: 'var(--top-h)' } : undefined}>
                <button type="button" className="label label-btn" aria-expanded={stdinOpen} onClick={() => setStdinOpen(o => !o)}>
                  <svg className={`label-chev${stdinOpen ? ' open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                  Input <small>(stdin){!stdinOpen && stdin ? ' · has text' : ''}</small>
                </button>
                {stdinOpen && <textarea autoFocus value={stdin} onChange={e => setStdin(e.target.value)} spellCheck={false} placeholder="Text your program reads from standard input" />}
              </div>
              {stdinOpen && <Resizer axis="y" label="Resize input box" onResize={resize('top', 60, 900)} />}
              <div className="block output" aria-live="polite">
                <span className="label">Output</span>
                <Output pending={run.isPending} error={run.error?.message} result={run.data} />
              </div>
            </>
          )}
        </section>
      </main>

      <Terminal
        mode={termMode} onMode={changeTermMode} height={termHeight} onResize={resizeTerm}
        files={code.files} folders={folders} available={languages.some(l => l.id === 'bash' && l.installed)}
      />

      <footer className="statusbar">
        <button className="statusbar-btn" type="button" onClick={toggleFiles} aria-pressed={filesOpen && !focus} aria-label="Files" title={`Files (${modKey}+B)`}>
          <Ico d="M4 5h16v14H4zM9 5v14" /><span className="sb-label">Files</span>
        </button>
        <button className="statusbar-btn" type="button" onClick={toggleSide} aria-pressed={sideOpen} aria-label="Output" title={`Output (${modKey}+\\)`}>
          <Ico d="M4 5h16v14H4zM15 5v14" /><span className="sb-label">Output</span>
        </button>
        <button className="statusbar-btn" type="button" onClick={() => changeTermMode(termMode === 'collapsed' ? 'normal' : 'collapsed')} aria-pressed={termMode !== 'collapsed'} aria-label="Terminal" title="Terminal (Ctrl+`)">
          <Ico d="m5 8 4 4-4 4M12 17h7" /><span className="sb-label">Terminal</span>
        </button>
        <span className="statusbar-spacer" />
        {focus && (
          <button className="statusbar-btn statusbar-run" type="button" onClick={doRun} disabled={run.isPending} aria-label="Run" title="Run (Ctrl+Enter)">
            <Ico d="M7 5.5v13l11-6.5z" /><span className="sb-label">{run.isPending ? 'Running…' : 'Run'}</span>
          </button>
        )}
        <span className="statusbar-info" aria-label="Cursor position">Ln {cursor.line}, Col {cursor.col}</span>
        <span className="statusbar-info sb-lang">{lang.name}{lang.version ? ` ${lang.version}` : ''}</span>
        <button className="statusbar-btn" type="button" onClick={() => setFocus(f => !f)} aria-pressed={focus} aria-label={focus ? 'Leave focus mode' : 'Focus mode'} title={`${focus ? 'Leave focus mode' : 'Focus mode: just the code'} (${modKey}+.)`}>
          <Ico d={focus ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'} />
        </button>
        <button className="statusbar-btn" type="button" onClick={() => setSettingsOpen(true)} aria-label="Settings" title={`Settings (${modKey}+,)`}>
          <Ico d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          <span className="sb-label">Settings</span>
        </button>
      </footer>

      <input ref={fileInput} type="file" multiple hidden onChange={e => { addPicked(e.target.files, 'files'); e.target.value = ''; }} />
      <input ref={folderInput} type="file" hidden {...{ webkitdirectory: '', directory: '' }} onChange={e => { addPicked(e.target.files, 'folder'); e.target.value = ''; }} />
      <input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={e => { importWorkspace(e.target.files); e.target.value = ''; }} />
      {quickOpen && <QuickOpen files={files} activeKey={current.key} onPick={setActive} onClose={() => setQuickOpen(false)} />}
      {importOpen && <ImportDialog onChoose={chooseImport} onClose={() => setImportOpen(false)} />}
      {report && <ImportReportDialog report={report} onClose={() => setReport(null)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onError={flash} />}
      {shared && <ShareDialog id={shared.id} expiresAt={shared.expiresAt} onClose={() => setShared(null)} />}
      {dialog.element}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Output({ pending, error, result }: { pending: boolean; error?: string; result?: RunResult }) {
  if (pending) return <pre className="out muted">Running…</pre>;
  if (error) return <pre className="out err">{error}</pre>;
  if (!result) return <pre className="out muted">Press Run or Ctrl+Enter to see the output here.</pre>;

  const { compile, run } = result;
  const compileFailed = compile && compile.code !== 0;
  const stage = compileFailed ? compile : run;
  const killed = stage.signal === 'SIGKILL' || stage.code === 137; // 137: killed by the memory limit
  const status = compileFailed ? 'Compilation failed'
    : killed ? 'Stopped: time or memory limit reached'
    : stage.signal ? `Stopped by ${stage.signal}`
    : `Exited with code ${stage.code}`;
  const ok = !compileFailed && !stage.signal && stage.code === 0;

  return (
    <>
      <pre className="out">
        {!compileFailed && compile?.stderr && <span className="warn">{compile.stderr}</span>}
        {stage.stdout}
        {stage.stderr && <span className="err">{stage.stderr}</span>}
        {!stage.stdout && !stage.stderr && <span className="muted">(no output)</span>}
      </pre>
      <p className={`status ${ok ? 'ok' : 'bad'}`}>{status} · {result.durationMs} ms</p>
    </>
  );
}

const modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

const Ico = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <path className="arc" d="M23.8 8.2A11 11 0 1 0 23.8 23.8" />
      <path className="play" d="M13.2 11.2 21 16l-7.8 4.8z" />
      <circle className="planet" cx="27.5" cy="16" r="3.2" />
    </svg>
  );
}
