import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  ChevronRight, Download, Ellipsis, Eye, Files, Focus, Loader2, Moon, PanelBottom, PanelRight, Play, RotateCcw, Search,
  Settings as SettingsIcon, Share2, Sun, Upload,
} from 'lucide-react';
import { useDefaultLayout, usePanelRef, useGroupRef } from 'react-resizable-panels';
import { toast } from 'sonner';
import { languagesQuery, runCode, shareCode, type Code, type Expiry, type Language, type RunResult } from './api';
import { CodeEditor } from './CodeEditor';
import { CommandPalette, type PaletteCommand } from './CommandPalette';
import { downloadWorkspaceZip } from './export';
import { useDialog } from './Dialog';
import { Explorer, allFolders, type FileTab } from './Explorer';
import { Breadcrumbs, EditorTabs } from './EditorTabs';
import { Terminal } from './Terminal';
import { useEditorPrefs } from './prefs';
import { load, save } from './storage';
import { useTheme } from './theme';
import { ImportDialog, ImportReportDialog, SettingsDialog, ShareDialog, formatDate, type ImportKind } from './Settings';
import { MAX_FILES as IMPORT_MAX_FILES, MAX_FOLDER_BYTES, formatBytes, readPicked, readWorkspaceZip, setPendingWorkspace, type Skipped } from './import';
import { rememberLink } from './links';
import { WebPreview, buildDocument, type LogLine } from './WebPreview';
import { buildFrameworkDocument } from './bundler';
import { modeForFile } from './modes';
import { ServerPreview, type ServerPreviewHandle } from './ServerPreview';
import { LanguagePicker } from './workbench/LanguagePicker';
import { PanelAction } from './workbench/PanelAction';
import { mod } from './workbench/keys';
import { useMobile } from './workbench/useMobile';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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

// Web pages and frameworks mix kinds of files, so their highlighting follows each file's extension.
const modeFor = (lang: Language, file: string) =>
  lang.id === 'web' || lang.group === 'framework' ? modeForFile(file, lang.mode) : lang.mode;

/** What a backend framework's terminal can do, shown when it opens. */
const TERMINAL_HINTS: Record<string, string> = {
  laravel: 'Commands run in this Laravel project, e.g. php artisan route:list',
  django: 'Commands run in this Django project, e.g. python manage.py check',
  flask: 'Commands run with Flask installed, e.g. python -c "import flask; print(flask.__version__)"',
  fastapi: 'Commands run with FastAPI installed, e.g. python -c "import fastapi; print(fastapi.__version__)"',
  express: 'Commands run with Node.js and Express installed, e.g. node -v',
};

// Panel sizes are remembered per layout (desktop and phone differ).
const storage = { getItem: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, setItem: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* not kept */ } } };
const FILES_OPEN_KEY = 'rv-files-open';

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
  const mobile = useMobile();
  const { dark, setTheme } = useTheme();
  const { data: languages = [] } = useQuery(languagesQuery);
  // Pages and frontend frameworks run in the browser; backend frameworks answer requests from the sandbox.
  const isWeb = lang.id === 'web' || lang.kind === 'browser';
  const isServer = lang.kind === 'server';
  const usesPreview = isWeb || isServer;
  const serverPreview = useRef<ServerPreviewHandle>(null);

  const [files, setFiles] = useState(() => toTabs(initial));
  const [folders, setFolders] = useState<string[]>(initial.folders ?? []);
  // A framework project opens on the file people edit first (App.vue, routes/web.php…), not index.html.
  const [active, setActive] = useState(() => (files.find(f => f.name === lang.file) ?? files[0]).key);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [stdin, setStdin] = useState(initial.stdin);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [report, setReport] = useState<{ added: number; replaced: number; skipped: Skipped[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const [focus, setFocus] = useState(false);
  const [palette, setPalette] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const prefs = useEditorPrefs();
  const [shared, setShared] = useState<{ id: string; expiresAt: number } | null>(null);
  const current = files.find(f => f.key === active) ?? files[0];

  // ---- Panels: files | editor over terminal | output. Each can be hidden, resized, and is remembered. ----
  const filesPanel = usePanelRef();
  const sidePanel = usePanelRef();
  const termPanel = usePanelRef();
  const inputPanel = usePanelRef();
  const centerGroup = useGroupRef();
  const mainId = mobile ? 'rv-main-phone' : 'rv-main';
  const mainLayout = useDefaultLayout({ id: mainId, storage });
  const centerLayout = useDefaultLayout({ id: 'rv-center', storage });
  // The explorer is shown unless the person chose to hide it (that choice is remembered on its own,
  // so a one-file program closing it doesn't hide it for a multi-file project, and vice versa for sizes).
  const filesWanted = useRef(load<boolean>(FILES_OPEN_KEY) ?? true);
  const [filesOpen, setFilesOpen] = useState(filesWanted.current);
  const [sideOpen, setSideOpen] = useState(true);
  const [termOpen, setTermOpen] = useState(!!centerLayout.defaultLayout && (centerLayout.defaultLayout.terminal ?? 0) > 0);
  const [termMax, setTermMax] = useState(false);
  const [mobileFiles, setMobileFiles] = useState(false);
  const [stdinOpen, setStdinOpen] = useState(() => initial.stdin.length > 0);
  const beforeMax = useRef<Record<string, number> | null>(null);
  const beforeFocus = useRef<{ files: boolean; side: boolean; term: boolean } | null>(null);

  const toggle = (panel: typeof filesPanel, open?: boolean) => {
    const p = panel.current;
    if (!p) return;
    const want = open ?? p.isCollapsed();
    if (want) p.expand(); else p.collapse();
  };
  const toggleFiles = () => {
    if (mobile) return setMobileFiles(o => !o);
    const open = !!filesPanel.current?.isCollapsed();
    save(FILES_OPEN_KEY, open);
    toggle(filesPanel, open);
  };
  const toggleSide = () => toggle(sidePanel);
  const toggleTerminal = () => toggle(termPanel);
  const maximizeTerminal = () => {
    const g = centerGroup.current;
    if (!g) return;
    if (termMax && beforeMax.current) { g.setLayout(beforeMax.current); beforeMax.current = null; setTermMax(false); return; }
    beforeMax.current = g.getLayout();
    termPanel.current?.expand();
    g.setLayout({ editor: 0, terminal: 100 });
    setTermMax(true);
  };
  const toggleFocus = () => setFocus(f => {
    if (!f) {
      beforeFocus.current = { files: filesOpen, side: sideOpen, term: termOpen };
      filesPanel.current?.collapse(); sidePanel.current?.collapse(); termPanel.current?.collapse();
    } else if (beforeFocus.current) {
      const b = beforeFocus.current;
      if (b.files) filesPanel.current?.expand();
      if (b.side) sidePanel.current?.expand();
      if (b.term) termPanel.current?.expand();
    }
    return !f;
  });

  // Tabs: the files that are open. Whatever becomes the active file gets a tab; deleted files lose theirs.
  const [openKeys, setOpenKeys] = useState<string[]>(() => [active]);
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
  const openFile = (key: string) => { setActive(key); setMobileFiles(false); };

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

  const flash = (msg: string) => toast(msg);

  // ---- Running ----
  const run = useMutation({ mutationFn: runCode });
  // Web projects run in the browser: rebuild the preview shortly after each edit.
  const isFramework = lang.kind === 'browser';
  const [webDoc, setWebDoc] = useState(() => (lang.id === 'web' ? buildDocument(code.files) : ''));
  const [webVersion, setWebVersion] = useState(0);
  const [logs, setLogs] = useState<LogLine[]>([]);
  // Frameworks are compiled, which is asynchronous; a newer build wins over an older one.
  const buildCount = useRef(0);
  const rebuild = (reload = false) => {
    const id = ++buildCount.current;
    if (!isFramework) {
      setLogs([]);
      setWebDoc(buildDocument(code.files));
      if (reload) setWebVersion(v => v + 1);
      return;
    }
    buildFrameworkDocument(code.files, lang.id).then(result => {
      if (id !== buildCount.current) return;
      setLogs(result.errors.map(text => ({ level: 'error' as const, text })));
      setWebDoc(result.doc);
      if (reload) setWebVersion(v => v + 1);
    });
  };
  useEffect(() => {
    if (!isWeb) return;
    const t = setTimeout(() => rebuild(), isFramework ? 700 : 500);
    return () => clearTimeout(t);
  }, [isWeb, code.files]);

  const doRun = () => {
    // The result appears in the output panel, so make sure it is visible.
    sidePanel.current?.expand();
    if (isWeb) return rebuild(true);
    if (isServer) return serverPreview.current?.reload();
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
      value: freeName(folder, 'file', lang.id === 'web' ? '.js' : extOf(lang.file)),
      hint: 'Use "/" to put it in a folder, like lib/utils' + (lang.id === 'web' ? '.js' : extOf(lang.file)),
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
      filesPanel.current?.expand();
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

  const exportZip = () => downloadWorkspaceZip(code, `runverse-${lang.id}`);

  // ---- Keyboard shortcuts ----
  const keys = useRef({ toggleFiles, toggleSide, toggleTerminal, toggleFocus });
  keys.current = { toggleFiles, toggleSide, toggleTerminal, toggleFocus };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === '`') { e.preventDefault(); keys.current.toggleTerminal(); return; }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return; // a dialog has the keyboard
      const act = (fn: () => void) => { e.preventDefault(); fn(); };
      if (e.shiftKey) { if (e.key.toLowerCase() === 'p') act(() => setPalette(true)); return; }
      switch (e.key) {
        case 'p': return act(() => setPalette(true));
        case 'b': return act(keys.current.toggleFiles);
        case '\\': return act(keys.current.toggleSide);
        case '.': return act(keys.current.toggleFocus);
        case ',': return act(() => setSettingsOpen(true));
      }
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, []);

  const runLabel = run.isPending ? 'Running…' : usesPreview ? 'Reload' : 'Run';
  const sideLabel = usesPreview ? 'Preview' : 'Output';

  const commands: PaletteCommand[] = [
    { id: 'run', label: usesPreview ? 'Reload preview' : 'Run', icon: <Play />, shortcut: `${mod}+Enter`, run: doRun },
    { id: 'new-file', label: 'New file…', icon: <Files />, run: () => newFile('') },
    { id: 'new-folder', label: 'New folder…', icon: <Files />, run: () => newFolder('') },
    { id: 'files', label: 'Toggle file explorer', icon: <Files />, shortcut: `${mod}+B`, run: toggleFiles },
    { id: 'side', label: `Toggle ${sideLabel.toLowerCase()} panel`, icon: <PanelRight />, shortcut: `${mod}+\\`, run: toggleSide },
    { id: 'terminal', label: 'Toggle terminal', icon: <PanelBottom />, shortcut: 'Ctrl+`', run: toggleTerminal },
    { id: 'focus', label: focus ? 'Leave focus mode' : 'Focus mode', icon: <Focus />, shortcut: `${mod}+.`, run: toggleFocus },
    { id: 'theme', label: dark ? 'Light theme' : 'Dark theme', icon: dark ? <Sun /> : <Moon />, run: () => setTheme(dark ? 'light' : 'dark') },
    { id: 'import', label: 'Import files, a folder or a workspace…', icon: <Upload />, run: () => setImportOpen(true) },
    { id: 'export', label: 'Export workspace as .zip', icon: <Download />, run: exportZip },
    ...EXPIRIES.map(x => ({ id: `share-${x.id}`, label: `Share a link for ${x.label}`, icon: <Share2 />, run: () => share.mutate({ code, expiresIn: x.id }) })),
    { id: 'reset', label: 'Start over from the example', icon: <RotateCcw />, run: reset },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon />, shortcut: `${mod}+,`, run: () => setSettingsOpen(true) },
  ];

  const explorer = (
    <Explorer
      title={lang.name} files={files} folders={folders} activeKey={current.key} collapsed={collapsed}
      onOpen={openFile} onToggle={toggleFolder}
      onCollapseAll={() => setCollapsed(new Set(allFolders(files, folders)))}
      onNewFile={newFile} onNewFolder={newFolder}
      onRenameFile={renameFile} onRenameFolder={renameFolder}
      onDeleteFile={deleteFile} onDeleteFolder={deleteFolder}
      onSetEntry={setEntry}
    />
  );

  const editor = (
    <section className="bg-background flex h-full min-h-0 flex-col" aria-label="Code">
      <EditorTabs files={files} openKeys={openKeys} activeKey={current.key} onSelect={setActive} onClose={closeTab} onNew={() => newFile('')} />
      <Breadcrumbs path={current.name} />
      <div className="min-h-0 flex-1">
        <CodeEditor
          fileKey={current.key} value={current.content} mode={modeFor(lang, current.name)} onChange={updateContent} onRun={doRun}
          fontSize={prefs.fontSize} wrap={prefs.wrap} onCursor={setCursor}
        />
      </div>
    </section>
  );

  const terminal = (
    <Terminal
      visible={termOpen} maximized={termMax} onMaximize={maximizeTerminal} onClose={() => termPanel.current?.collapse()}
      files={code.files} folders={folders}
      available={isServer ? lang.installed : languages.some(l => l.id === 'bash' && l.installed)}
      framework={isServer ? { id: lang.id, hint: TERMINAL_HINTS[lang.id] ?? '' } : undefined}
    />
  );

  const center = (
    <ResizablePanelGroup
      orientation="vertical" id="rv-center" groupRef={centerGroup}
      defaultLayout={centerLayout.defaultLayout ?? { editor: 100, terminal: 0 }} onLayoutChanged={centerLayout.onLayoutChanged}
    >
      <ResizablePanel id="editor" minSize={0}>{editor}</ResizablePanel>
      <ResizableHandle className={cn(!termOpen && 'pointer-events-none opacity-0')} />
      <ResizablePanel
        id="terminal" panelRef={termPanel} collapsible collapsedSize={0} minSize={100}
        onResize={s => { setTermOpen(s.inPixels > 0); if (termMax && s.asPercentage < 95) setTermMax(false); }}
      >{terminal}</ResizablePanel>
    </ResizablePanelGroup>
  );

  // ---- Output side: preview + console, or input + output. ----
  const sectionHead = (label: string, extra?: ReactNode, onToggle?: () => void, open?: boolean) => (
    <div className="flex h-7 shrink-0 items-center gap-1 px-3">
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-expanded={open} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase">
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />{label}
        </button>
      ) : (
        <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">{label}</span>
      )}
      <span className="flex-1" />
      {extra}
    </div>
  );

  const consoleLines = (
    <pre className="min-h-0 flex-1 overflow-auto px-3 pb-2 font-mono text-[12.5px] leading-[1.55] break-words whitespace-pre-wrap">
      {logs.length
        ? logs.map((l, i) => <span key={i} className={l.level === 'error' ? 'text-destructive' : l.level === 'warn' ? 'text-warn' : l.level === 'info' ? 'text-muted-foreground' : ''}>{l.text}{'\n'}</span>)
        : <span className="text-muted-foreground">{isServer ? 'Requests, and what your app prints, show up here.' : 'console.log() output shows up here.'}</span>}
    </pre>
  );

  const side = usesPreview ? (
    <ResizablePanelGroup orientation="vertical" id="rv-preview">
      <ResizablePanel id="preview" minSize={80}>
        <div className="flex h-full min-h-0 flex-col">
          {sectionHead('Preview', isServer
            ? <span className="text-muted-foreground truncate text-[11px]">runs your app for each page</span>
            : <PanelAction label={`Reload (${mod}+Enter)`} onClick={doRun}><RotateCcw /></PanelAction>)}
          <div className="min-h-0 flex-1 bg-white">
            {isServer
              ? <ServerPreview ref={serverPreview} code={code} onLog={line => setLogs(l => [...l.slice(-299), line])} />
              : <WebPreview doc={webDoc} version={webVersion} onLog={line => setLogs(l => [...l.slice(-199), line])} />}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="console" defaultSize={150} minSize={28} collapsible collapsedSize={28}>
        <div className="flex h-full min-h-0 flex-col">
          {sectionHead('Console', logs.length > 0 && <button type="button" className="text-muted-foreground hover:text-foreground text-[11px]" onClick={() => setLogs([])}>Clear</button>)}
          {consoleLines}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    <ResizablePanelGroup orientation="vertical" id="rv-io">
      <ResizablePanel
        id="stdin" panelRef={inputPanel} minSize={80} collapsible collapsedSize={28}
        defaultSize={stdinOpen ? 140 : 28} onResize={s => setStdinOpen(s.inPixels > 30)}
      >
        <div className="flex h-full min-h-0 flex-col">
          {sectionHead('Input', !stdinOpen && stdin ? <span className="text-muted-foreground text-[11px]">has text</span> : <span className="text-muted-foreground text-[11px]">stdin</span>, () => toggle(inputPanel), stdinOpen)}
          {stdinOpen && (
            <Textarea
              value={stdin} onChange={e => setStdin(e.target.value)} spellCheck={false}
              placeholder="Text your program reads from standard input"
              className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-1 font-mono text-[12.5px] shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          )}
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="output" minSize={80}>
        <div className="flex h-full min-h-0 flex-col" aria-live="polite">
          {sectionHead('Output', run.data && !run.isPending && <span className="text-muted-foreground text-[11px]">{run.data.durationMs} ms</span>)}
          <Output pending={run.isPending} error={run.error?.message} result={run.data} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  const sideBox = <aside className="bg-chrome flex h-full min-h-0 flex-col" aria-label={usesPreview ? 'Preview and console' : 'Input and output'}>{side}</aside>;

  // Apply the remembered explorer choice once the panels exist (saved sizes may come from another project).
  useEffect(() => {
    if (filesWanted.current) filesPanel.current?.expand(); else filesPanel.current?.collapse();
  }, [mobile]);

  return (
    <div className="bg-background flex h-svh flex-col">
      {!focus && (
        <header className="bg-chrome-2 flex h-9 shrink-0 items-center gap-1 border-b pr-1.5 pl-2">
          <a href="/" className="mr-1 flex items-center gap-1.5 rounded px-1 py-0.5" aria-label="Runverse home">
            <Logo className="size-5" />
            <span className="hidden text-[13px] font-semibold tracking-tight sm:inline">runverse</span>
          </a>
          <LanguagePicker current={lang} languages={languages} onPick={id => navigate({ to: '/editor/$lang', params: { lang: id } })} />
          {expiresAt && <span className="text-muted-foreground hidden truncate text-[11px] lg:inline">Shared link, works until {formatDate(expiresAt)}</span>}

          {/* The command centre, like VS Code: one click to find a file or a command. */}
          <button
            type="button" onClick={() => setPalette(true)}
            className="bg-background/60 hover:bg-background text-muted-foreground mx-auto hidden h-6 w-full max-w-80 items-center gap-2 rounded-md border px-2 text-[12px] md:flex"
          >
            <Search className="size-3.5" />
            <span className="truncate">Search files and commands</span>
            <Kbd className="ml-auto h-4 text-[10px]">{mod} P</Kbd>
          </button>
          <span className="flex-1 md:hidden" />

          <div className="hidden items-center md:flex">
            <TitleAction label="Start over from the example" onClick={reset}><RotateCcw /></TitleAction>
            <TitleAction label="Import" onClick={() => setImportOpen(true)}><Upload /></TitleAction>
            <TitleAction label="Export workspace as .zip" onClick={exportZip}><Download /></TitleAction>
            <ShareMenu pending={share.isPending} onShare={id => share.mutate({ code, expiresIn: id })} />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="md:hidden" aria-label="More"><Ellipsis /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setImportOpen(true)}><Upload />Import…</DropdownMenuItem>
              <DropdownMenuItem onSelect={exportZip}><Download />Export as .zip</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><Share2 />Share a link</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {EXPIRIES.map(x => <DropdownMenuItem key={x.id} onSelect={() => share.mutate({ code, expiresIn: x.id })}>{x.label}</DropdownMenuItem>)}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={reset}><RotateCcw />Start over</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}><SettingsIcon />Settings</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="xs" className="ml-1 gap-1 px-2.5 text-[12px] font-semibold" onClick={doRun} disabled={run.isPending} title={`${runLabel} (${mod}+Enter)`}>
            {run.isPending ? <Loader2 className="animate-spin" /> : usesPreview ? <RotateCcw /> : <Play className="fill-current" />}
            {runLabel}
          </Button>
        </header>
      )}

      <div className="flex min-h-0 flex-1">
        {!focus && !mobile && (
          <nav className="bg-chrome-2 flex w-11 shrink-0 flex-col items-center gap-0.5 border-r py-1" aria-label="Views">
            <ActivityButton label={`Explorer (${mod}+B)`} active={filesOpen} onClick={toggleFiles}><Files /></ActivityButton>
            <ActivityButton label={`Go to file (${mod}+P)`} onClick={() => setPalette(true)}><Search /></ActivityButton>
            <ActivityButton label={`${sideLabel} (${mod}+\\)`} active={sideOpen} onClick={toggleSide}>{usesPreview ? <Eye /> : <PanelRight />}</ActivityButton>
            <ActivityButton label="Terminal (Ctrl+`)" active={termOpen} onClick={toggleTerminal}><PanelBottom /></ActivityButton>
            <span className="flex-1" />
            <ActivityButton label={dark ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(dark ? 'light' : 'dark')}>{dark ? <Sun /> : <Moon />}</ActivityButton>
            <ActivityButton label={`Settings (${mod}+,)`} onClick={() => setSettingsOpen(true)}><SettingsIcon /></ActivityButton>
          </nav>
        )}

        <ResizablePanelGroup
          key={mainId} orientation={mobile ? 'vertical' : 'horizontal'} id={mainId}
          defaultLayout={mainLayout.defaultLayout} onLayoutChanged={mainLayout.onLayoutChanged}
          className="min-w-0"
        >
          {!mobile && (
            <>
              <ResizablePanel
                id="files" panelRef={filesPanel} collapsible collapsedSize={0} minSize={150} maxSize={520} defaultSize={filesOpen ? 230 : 0}
                onResize={s => setFilesOpen(s.inPixels > 0)}
              >{explorer}</ResizablePanel>
              <ResizableHandle className={cn(!filesOpen && 'pointer-events-none opacity-0')} />
            </>
          )}
          <ResizablePanel id="center" minSize={mobile ? 160 : 280}>{center}</ResizablePanel>
          <ResizableHandle className={cn(!sideOpen && 'pointer-events-none opacity-0')} />
          <ResizablePanel
            id="side" panelRef={sidePanel} collapsible collapsedSize={0} minSize={mobile ? 120 : 240} defaultSize={mobile ? '40%' : 420}
            onResize={s => setSideOpen(s.inPixels > 0)}
          >{sideBox}</ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <footer className="bg-chrome-2 text-muted-foreground flex h-6 shrink-0 items-center gap-0.5 border-t px-1 text-[11px]">
        {(mobile || focus) && (
          <>
            <StatusButton label="Files" onClick={toggleFiles} active={mobile ? mobileFiles : filesOpen}><Files /></StatusButton>
            <StatusButton label={sideLabel} onClick={toggleSide} active={sideOpen}><PanelRight /></StatusButton>
            <StatusButton label="Terminal" onClick={toggleTerminal} active={termOpen}><PanelBottom /></StatusButton>
          </>
        )}
        {focus && (
          <StatusButton label={runLabel} onClick={doRun} disabled={run.isPending}><Play /></StatusButton>
        )}
        <span className="flex-1" />
        <span className="px-1.5 tabular-nums" aria-label="Cursor position">Ln {cursor.line}, Col {cursor.col}</span>
        <span className="hidden px-1.5 sm:inline">{files.length} file{files.length === 1 ? '' : 's'}</span>
        <span className="px-1.5">{lang.name}{lang.version ? ` ${lang.version}` : ''}</span>
        <StatusButton label={focus ? 'Leave focus mode' : 'Focus mode'} onClick={toggleFocus} active={focus}><Focus /></StatusButton>
      </footer>

      {mobile && (
        <Sheet open={mobileFiles} onOpenChange={setMobileFiles}>
          <SheetContent side="left" className="w-72 gap-0 p-0" onOpenAutoFocus={e => e.preventDefault()}>
            <SheetTitle className="sr-only">Files</SheetTitle>
            <SheetDescription className="sr-only">The files in this workspace.</SheetDescription>
            {explorer}
          </SheetContent>
        </Sheet>
      )}

      <input ref={fileInput} type="file" multiple hidden onChange={e => { addPicked(e.target.files, 'files'); e.target.value = ''; }} />
      <input ref={folderInput} type="file" hidden {...{ webkitdirectory: '', directory: '' }} onChange={e => { addPicked(e.target.files, 'folder'); e.target.value = ''; }} />
      <input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={e => { importWorkspace(e.target.files); e.target.value = ''; }} />
      {palette && <CommandPalette files={files} activeKey={current.key} commands={commands} onPick={openFile} onClose={() => setPalette(false)} />}
      {importOpen && <ImportDialog onChoose={chooseImport} onClose={() => setImportOpen(false)} />}
      {report && <ImportReportDialog report={report} onClose={() => setReport(null)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onError={flash} />}
      {shared && <ShareDialog id={shared.id} expiresAt={shared.expiresAt} onClose={() => setShared(null)} />}
      {dialog.element}
    </div>
  );
}

function TitleAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground size-7 [&_svg]:size-3.5" aria-label={label} onClick={onClick}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

function ShareMenu({ pending, onShare }: { pending: boolean; onShare: (id: Expiry) => void }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground size-7 [&_svg]:size-3.5" aria-label="Share" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Share2 />}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Share a link</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-muted-foreground text-[11px] font-normal">Link stays available for</DropdownMenuLabel>
        {EXPIRIES.map(x => <DropdownMenuItem key={x.id} className="text-[13px]" onSelect={() => onShare(x.id)}>{x.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActivityButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button" aria-label={label} aria-pressed={active} onClick={onClick}
          className={cn(
            'relative inline-flex size-10 items-center justify-center rounded-md outline-none [&_svg]:size-[18px]',
            'text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-2',
            active && 'text-foreground before:bg-primary before:absolute before:inset-y-2 before:-left-0.5 before:w-0.5 before:rounded-full',
          )}
        >{children}</button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

function StatusButton({ label, onClick, active, disabled, children }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-pressed={active} aria-label={label} title={label}
      className={cn('hover:bg-accent hover:text-foreground inline-flex h-5 items-center gap-1 rounded px-1.5 disabled:opacity-50 [&_svg]:size-3', active && 'text-foreground')}
    >{children}<span className="hidden sm:inline">{label}</span></button>
  );
}

function Output({ pending, error, result }: { pending: boolean; error?: string; result?: RunResult }) {
  const box = 'min-h-0 flex-1 overflow-auto px-3 pb-2 font-mono text-[12.5px] leading-[1.55] break-words whitespace-pre-wrap';
  if (pending) return <pre className={cn(box, 'text-muted-foreground')}>Running…</pre>;
  if (error) return <pre className={cn(box, 'text-destructive')}>{error}</pre>;
  if (!result) return <pre className={cn(box, 'text-muted-foreground')}>Press Run or {mod}+Enter to see the output here.</pre>;

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
      <pre className={box}>
        {!compileFailed && compile?.stderr && <span className="text-warn">{compile.stderr}</span>}
        {stage.stdout}
        {stage.stderr && <span className="text-destructive">{stage.stderr}</span>}
        {!stage.stdout && !stage.stderr && <span className="text-muted-foreground">(no output)</span>}
      </pre>
      <p className={cn('flex h-6 shrink-0 items-center gap-1.5 border-t px-3 text-[11px]', ok ? 'text-ok' : 'text-destructive')}>
        <span className={cn('size-1.5 rounded-full', ok ? 'bg-ok' : 'bg-destructive')} />{status}
      </p>
    </>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg className={cn('size-6 shrink-0 overflow-visible', className)} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M23.8 8.2A11 11 0 1 0 23.8 23.8" fill="none" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M13.2 11.2 21 16l-7.8 4.8z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="27.5" cy="16" r="3.2" fill="var(--primary)" />
    </svg>
  );
}
