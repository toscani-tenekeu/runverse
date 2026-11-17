import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { runTerminal, type CodeFile } from './api';
import { PanelAction } from './workbench/PanelAction';
import { cn } from '@/lib/utils';

interface Line { kind: 'cmd' | 'out' | 'err' | 'info'; text: string }

const MAX_LINES = 2000;
const MAX_OUTPUT = 64 * 1024;
const clip = (text: string) => (text.length > MAX_OUTPUT ? text.slice(0, MAX_OUTPUT) + '\n… output cut off' : text);

const LINE_CLASS: Record<Line['kind'], string> = {
  cmd: 'text-foreground font-medium',
  out: 'text-foreground/90',
  err: 'text-destructive',
  info: 'text-muted-foreground',
};

interface Props {
  visible: boolean;
  maximized: boolean;
  onMaximize: () => void;
  onClose: () => void;
  files: CodeFile[];
  folders: string[];
  available: boolean; // Bash, or the backend framework, is installed on the server
  // A backend framework's commands (php artisan, python manage.py…) run in its own package.
  framework?: { id: string; hint: string };
}

// A command line that runs each command in the server sandbox, with a copy of the workspace files.
export function Terminal({ visible, maximized, onMaximize, onClose, files, folders, available, framework }: Props) {
  const [lines, setLines] = useState<Line[]>([
    { kind: 'info', text: 'Each command runs in a sandbox with a copy of your files. There is no network, and files a command creates or changes are not saved back to the editor.' },
    ...(framework ? [{ kind: 'info' as const, text: framework.hint }] : []),
  ]);
  const [cwd, setCwd] = useState('');
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const history = useRef<string[]>([]);
  const cursor = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const push = (add: Line[]) => setLines(l => [...l, ...add].slice(-MAX_LINES));

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [lines, running, visible]);
  useEffect(() => { if (visible && available) field.current?.focus(); }, [visible, available]);

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
      const r = await runTerminal({ files, folders, cwd, command, language: framework?.id });
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

  return (
    <section className="bg-background flex h-full min-h-0 flex-col" aria-label="Terminal">
      <div className="flex h-8 shrink-0 items-center gap-2 px-3">
        <span className="border-primary text-foreground border-b text-[11px] font-semibold tracking-wider uppercase">Terminal</span>
        <span className="text-muted-foreground truncate font-mono text-[11px]">{prompt}</span>
        <span className="flex-1" />
        <PanelAction label="Clear (Ctrl+L)" onClick={() => setLines([])}><Trash2 /></PanelAction>
        <PanelAction label={maximized ? 'Restore panel size' : 'Maximize panel'} onClick={onMaximize}>{maximized ? <Minimize2 /> : <Maximize2 />}</PanelAction>
        <PanelAction label="Hide terminal (Ctrl+`)" onClick={onClose}><ChevronDown /></PanelAction>
      </div>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 font-mono text-[12.5px] leading-[1.55]"
        onClick={() => { if (!getSelection()?.toString()) field.current?.focus(); }}
      >
        {lines.map((l, i) => <pre key={i} className={cn('break-words whitespace-pre-wrap', LINE_CLASS[l.kind])}>{l.text}</pre>)}
        {available ? (
          <label className="flex items-center gap-2">
            <span className="text-ok shrink-0">{prompt} $</span>
            <input
              ref={field} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
              disabled={running} spellCheck={false} autoComplete="off" autoCapitalize="off" aria-label="Command"
              placeholder={running ? 'Running…' : 'Type a command, e.g. ls'}
              className="placeholder:text-muted-foreground/60 min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
        ) : (
          <pre className="text-destructive whitespace-pre-wrap">The terminal needs Bash, which is not installed on this server. Run ./scripts/languages.sh bash</pre>
        )}
      </div>
    </section>
  );
}
