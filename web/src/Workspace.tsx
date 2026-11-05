import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { languagesQuery, runCode, shareCode, type Code, type Language, type RunResult } from './api';
import { CodeEditor } from './CodeEditor';
import { save } from './storage';
import { ThemeToggle } from './theme';

interface FileTab { key: string; name: string; content: string }

let nextKey = 0;
const toTabs = (code: Code): FileTab[] => code.files.map(f => ({ key: String(nextKey++), ...f }));
export const draftKey = (id: string) => `rv-draft-${id}`;
const FILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;

interface Props {
  lang: Language;
  initial: Code;
  // Drafts are kept for /editor/<lang>; a shared snippet stays untouched until it is edited.
  persist: boolean;
}

export function Workspace({ lang, initial, persist }: Props) {
  const navigate = useNavigate();
  const { data: languages = [] } = useQuery(languagesQuery);
  const [files, setFiles] = useState(() => toTabs(initial));
  const [active, setActive] = useState(files[0].key);
  const [stdin, setStdin] = useState(initial.stdin);
  const [toast, setToast] = useState('');
  const current = files.find(f => f.key === active) ?? files[0];

  const code = useMemo<Code>(() => ({
    language: lang.id,
    files: files.map(({ name, content }) => ({ name, content })),
    stdin,
  }), [lang.id, files, stdin]);

  useEffect(() => {
    if (persist) save(draftKey(lang.id), code);
  }, [persist, lang.id, code]);

  const toastTimer = useRef<number>(0);
  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  };

  const run = useMutation({ mutationFn: runCode });
  const share = useMutation({
    mutationFn: shareCode,
    onSuccess: async ({ id }) => {
      const url = `${location.origin}/s/${id}`;
      try {
        await navigator.clipboard.writeText(url);
        flash('Link copied to your clipboard');
      } catch {
        flash(url);
      }
    },
    onError: e => flash(e.message),
  });
  const doRun = () => { if (!run.isPending) run.mutate(code); };

  const updateContent = (content: string) =>
    setFiles(fs => fs.map(f => (f.key === current.key ? { ...f, content } : f)));

  const askName = (title: string, value: string) => {
    const name = window.prompt(title, value)?.trim();
    if (!name || name === value) return null;
    if (!FILE_NAME.test(name)) { flash('Use letters, numbers, dots, dashes or underscores.'); return null; }
    if (files.some(f => f.name === name)) { flash(`A file named ${name} already exists.`); return null; }
    return name;
  };

  const addFile = () => {
    if (files.length >= 10) return flash('10 files at most.');
    const ext = lang.file.includes('.') ? lang.file.slice(lang.file.lastIndexOf('.')) : '';
    const name = askName('New file name', `file${files.length + 1}${ext}`);
    if (!name) return;
    const tab = { key: String(nextKey++), name, content: '' };
    setFiles(fs => [...fs, tab]);
    setActive(tab.key);
  };

  const renameFile = (tab: FileTab) => {
    const name = askName('Rename file', tab.name);
    if (name) setFiles(fs => fs.map(f => (f.key === tab.key ? { ...f, name } : f)));
  };

  const removeFile = (tab: FileTab) => {
    if (!window.confirm(`Delete ${tab.name}?`)) return;
    const rest = files.filter(f => f.key !== tab.key);
    setFiles(rest);
    if (active === tab.key) setActive(rest[0].key);
  };

  const reset = () => {
    if (!window.confirm('Replace your code with the starter example?')) return;
    const tabs = toTabs({ language: lang.id, files: [{ name: lang.file, content: lang.template }], stdin: '' });
    setFiles(tabs);
    setActive(tabs[0].key);
    setStdin('');
    run.reset();
  };

  return (
    <div className="app">
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
                {l.name}{l.version ? ` ${l.version}` : ' (not installed)'}
              </option>
            ))}
          </select>
        </label>
        <div className="bar-actions">
          <button className="btn btn-ghost" type="button" onClick={reset}>Reset</button>
          <button className="btn btn-ghost" type="button" onClick={() => share.mutate(code)} disabled={share.isPending}>
            {share.isPending ? 'Sharing…' : 'Share'}
          </button>
          <ThemeToggle />
          <button className="btn" type="button" onClick={doRun} disabled={run.isPending} title="Run (Ctrl+Enter)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5.5v13l11-6.5z" fill="currentColor" /></svg>
            {run.isPending ? 'Running…' : 'Run'}
          </button>
        </div>
      </header>

      <main className="panes">
        <section className="pane editor-pane" aria-label="Code">
          <div className="tabs" role="tablist">
            {files.map((f, i) => (
              <div key={f.key} className={`tab${f.key === current.key ? ' on' : ''}`}>
                <button
                  type="button" role="tab" aria-selected={f.key === current.key}
                  onClick={() => setActive(f.key)} onDoubleClick={() => renameFile(f)}
                  title={i === 0 ? 'Entry file (runs first). Double-click to rename.' : 'Double-click to rename.'}
                >
                  {i === 0 && <span className="entry" aria-label="Entry file">▶</span>}
                  {f.name}
                </button>
                {files.length > 1 && (
                  <button type="button" className="tab-x" aria-label={`Delete ${f.name}`} onClick={() => removeFile(f)}>×</button>
                )}
              </div>
            ))}
            <button type="button" className="tab-add" onClick={addFile} aria-label="Add a file">+</button>
          </div>
          <CodeEditor fileKey={current.key} value={current.content} mode={lang.mode} onChange={updateContent} onRun={doRun} />
        </section>

        <section className="pane side" aria-label="Input and output">
          <label className="block stdin">
            <span className="label">Input <small>(stdin)</small></span>
            <textarea value={stdin} onChange={e => setStdin(e.target.value)} spellCheck={false} placeholder="Text your program reads from standard input" />
          </label>
          <div className="block output" aria-live="polite">
            <span className="label">Output</span>
            <Output pending={run.isPending} error={run.error?.message} result={run.data} />
          </div>
        </section>
      </main>

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
  const killed = stage.signal === 'SIGKILL';
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

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <path className="arc" d="M23.8 8.2A11 11 0 1 0 23.8 23.8" />
      <path className="play" d="M13.2 11.2 21 16l-7.8 4.8z" />
      <circle className="planet" cx="27.5" cy="16" r="3.2" />
    </svg>
  );
}
