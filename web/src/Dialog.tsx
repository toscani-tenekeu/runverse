import { useEffect, useRef, useState, type FormEvent } from 'react';

interface Request {
  title: string;
  message?: string;
  value?: string; // present: ask for text; absent: just confirm
  hint?: string;
  confirmLabel: string;
  danger?: boolean;
  validate?: (value: string) => string | null;
  resolve: (value: string | null) => void;
}

type Options = Omit<Request, 'resolve' | 'confirmLabel'> & { confirmLabel?: string };

// In-page replacement for window.prompt / window.confirm, used through promises:
//   const name = await dialog.prompt({ title: 'New file', value: 'main.py' });
export function useDialog() {
  const [req, setReq] = useState<Request | null>(null);

  const open = (o: Options, confirmLabel: string) =>
    new Promise<string | null>(resolve => setReq({ confirmLabel, ...o, resolve }));

  return {
    prompt: (o: Options & { value: string }) => open(o, 'Create'),
    confirm: (o: Options) => open(o, 'OK').then(v => v !== null),
    element: req && (
      <DialogBox
        key={req.title + req.value}
        req={req}
        close={value => { req.resolve(value); setReq(null); }}
      />
    ),
  };
}

function DialogBox({ req, close }: { req: Request; close: (value: string | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(req.value ?? '');
  const [error, setError] = useState<string | null>(null);
  const asking = req.value !== undefined;

  useEffect(() => {
    ref.current?.showModal();
    // Select the name but not the extension, like a file manager does.
    const el = input.current;
    if (el) {
      const base = el.value.lastIndexOf('/') + 1;
      const dot = el.value.lastIndexOf('.');
      el.setSelectionRange(base, dot > base ? dot : el.value.length);
    }
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!asking) return close('');
    const v = value.trim();
    const problem = !v ? 'Enter a name.' : req.validate?.(v) ?? null;
    if (problem) { setError(problem); input.current?.focus(); return; }
    close(v);
  };

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={e => { e.preventDefault(); close(null); }}
      onClick={e => { if (e.target === ref.current) close(null); }}
      aria-labelledby="dialog-title"
    >
      <form onSubmit={submit}>
        <h2 id="dialog-title">{req.title}</h2>
        {req.message && <p className="dialog-msg">{req.message}</p>}
        {asking && (
          <>
            <input
              ref={input}
              value={value}
              onChange={e => { setValue(e.target.value); setError(null); }}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!!error}
              aria-describedby="dialog-hint"
            />
            <p id="dialog-hint" className={error ? 'dialog-error' : 'dialog-hint'}>{error ?? req.hint}</p>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={() => close(null)}>Cancel</button>
          <button type="submit" className={`btn${req.danger ? ' btn-danger' : ''}`} autoFocus={!asking}>{req.confirmLabel}</button>
        </div>
      </form>
    </dialog>
  );
}
