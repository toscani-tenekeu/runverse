import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

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
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(req.value ?? '');
  const [error, setError] = useState<string | null>(null);
  const asking = req.value !== undefined;

  // Select the name but not the folder or the extension, like a file manager does. The dialog's focus trap
  // selects the whole field whenever it (re)focuses it, so apply this on every focus until the person types.
  const touched = useRef(false);
  const selectName = () => requestAnimationFrame(() => {
    const el = input.current;
    if (!el || touched.current) return;
    const base = el.value.lastIndexOf('/') + 1;
    const dot = el.value.lastIndexOf('.');
    el.setSelectionRange(base, dot > base ? dot : el.value.length);
  });
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 30);
    return () => clearTimeout(t);
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
    <Dialog open onOpenChange={o => { if (!o) close(null); }}>
      <DialogContent className="gap-3 p-4 sm:max-w-md" showCloseButton={false} onOpenAutoFocus={e => { if (asking) e.preventDefault(); }}>
        <form onSubmit={submit} className="grid gap-3">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-sm">{req.title}</DialogTitle>
            {req.message
              ? <DialogDescription className="text-xs">{req.message}</DialogDescription>
              : <DialogDescription className="sr-only">{req.title}</DialogDescription>}
          </DialogHeader>
          {asking && (
            <div className="grid gap-1.5">
              <Input
                ref={input} value={value} className="h-8 font-mono text-[13px]"
                onChange={e => { touched.current = true; setValue(e.target.value); setError(null); }}
                onFocus={selectName}
                spellCheck={false} autoComplete="off" aria-invalid={!!error} aria-describedby="dialog-hint"
              />
              <p id="dialog-hint" className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{error ?? req.hint}</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => close(null)}>Cancel</Button>
            <Button type="submit" size="sm" variant={req.danger ? 'destructive' : 'default'} autoFocus={!asking}>{req.confirmLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
