import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { runTerminal, type CodeFile } from './api';
import { Resizer } from './Resizer';

export type TerminalMode = 'collapsed' | 'normal' | 'expanded';

interface Line { kind: 'cmd' | 'out' | 'err' | 'info'; text: string }

const MAX_LINES = 2000;
const MAX_OUTPUT = 64 * 1024;
const clip = (text: string) => (text.length > MAX_OUTPUT ? text.slice(0, MAX_OUTPUT) + '\n… output cut off' : text);

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

interface Props {
  mode: TerminalMode;
  onMode: (mode: TerminalMode) => void;
  height: number;
  onResize: (delta: number) => void;
  files: CodeFile[];
  folders: string[];
  available: boolean; // Bash is installed on the server
}

// A command line that runs each command in the server sandbox, with a copy of the workspace files.
export function Terminal({ mode, onMode, height, onResize, files, folders, available }: Props) {
  const [lines, setLines] = useState<Line[]>([
    { kind: 'info', text: 'Each command runs in a sandbox with a copy of your files. There is no network, and files a command creates or changes are not saved back to the editor.' },
  ]);
  const [cwd, setCwd] = useState('');
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const history = useRef<string[]>([]);
  const cursor = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const open = mode !== 'collapsed';

  const push = (add: Line[]) => setLines(l => [...l, ...add].slice(-MAX_LINES));

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [lines, running, mode]);
  useEffect(() => { if (open && available) field.current?.focus(); }, [open, available]);

  // Ctrl+` opens or closes the terminal, like in code editors.
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); onMode(open ? 'collapsed' : 'normal'); }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [open, onMode]);

  const prompt = `~${cwd ? '/' + cwd : ''}`;

  const submit = async () => {
    const command = input.trim();
    if (!command || running) return;
    setInput('');
    history.current = [...history.current.filter(h => h !== command), command].slice(-100);
    cursor.current = history.current.length;
    if (command === 'clear') return setLines([]);
    push([{ kind: 'cmd', text: `${prompt} $ ${command}` }]);
    setRunning(true);
    try {
      const r = await runTerminal({ files, folders, cwd, command });
      const add: Line[] = [];
      if (r.stdout) add.push({ kind: 'out', text: clip(r.stdout) });
      if (r.stderr) add.push({ kind: 'err', text: clip(r.stderr) });
      if (r.signal) add.push({ kind: 'info', text: `Stopped: time or memory limit reached (${r.signal})` });
      else if (r.code) add.push({ kind: 'info', text: `exit ${r.code}` });
      push(add);
      setCwd(r.cwd);
    } catch (e) {
      push([{ kind: 'err', text: e instanceof Error ? e.message : 'The command could not run.' }]);
    } finally {
      setRunning(false);
      field.current?.focus();
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor.current = Math.max(0, cursor.current - 1);
      setInput(history.current[cursor.current] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor.current = Math.min(history.current.length, cursor.current + 1);
      setInput(history.current[cursor.current] ?? '');
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); setLines([]); }
  };

  // Closed: nothing at all on screen. The status bar button and Ctrl+` bring it back.
  if (!open) return null;

  return (
    <section className={`terminal terminal-${mode}`} aria-label="Terminal" style={mode === 'normal' ? { height } : undefined}>
      {mode === 'normal' && <Resizer axis="y" label="Resize terminal" onResize={d => onResize(-d)} />}
      <div className="terminal-head">
        <button type="button" className="terminal-title" onClick={() => onMode(open ? 'collapsed' : 'normal')} aria-expanded={open}>
          <Icon d={open ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} />
          <span>Terminal</span>
        </button>
        {open && <span className="terminal-cwd">{prompt}</span>}
        <span className="terminal-spacer" />
        {open && (
          <>
            <button type="button" title="Clear (Ctrl+L)" aria-label="Clear terminal" onClick={() => setLines([])}>
              <Icon d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
            </button>
            <button
              type="button" title={mode === 'expanded' ? 'Restore size' : 'Expand'} aria-label={mode === 'expanded' ? 'Restore terminal size' : 'Expand terminal'}
              onClick={() => onMode(mode === 'expanded' ? 'normal' : 'expanded')}
            >
              <Icon d={mode === 'expanded' ? 'M5 15h4v4M19 9h-4V5M9 15l-5 5M15 9l5-5' : 'M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6'} />
            </button>
          </>
        )}
        <button
          type="button" title={open ? 'Collapse (Ctrl+`)' : 'Open (Ctrl+`)'} aria-label={open ? 'Collapse terminal' : 'Open terminal'}
          onClick={() => onMode(open ? 'collapsed' : 'normal')}
        >
          <Icon d={open ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} />
        </button>
      </div>
      {open && (
        <div className="terminal-body" ref={scroller} onClick={() => { if (!getSelection()?.toString()) field.current?.focus(); }}>
          {lines.map((l, i) => <pre key={i} className={`term-${l.kind}`}>{l.text}</pre>)}
          {available ? (
            <label className="terminal-input">
              <span>{prompt} $</span>
              <input
                ref={field} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
                disabled={running} spellCheck={false} autoComplete="off" autoCapitalize="off" aria-label="Command"
                placeholder={running ? 'Running…' : 'Type a command, e.g. ls'}
              />
            </label>
          ) : (
            <pre className="term-err">The terminal needs Bash, which is not installed on this server. Run ./scripts/languages.sh bash</pre>
          )}
        </div>
      )}
    </section>
  );
}
