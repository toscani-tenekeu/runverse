import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, FileArchive, FilePlus2, FolderInput, Minus, Moon, Plus, Sun, Trash2 } from 'lucide-react';
import { authQuery, deleteSharedLink, signOut } from './api';
import { forgetLink, linkUrl, useSharedLinks } from './links';
import { useTheme } from './theme';
import { FONT_MAX, FONT_MIN, setPrefs, useEditorPrefs } from './prefs';
import { mod } from './workbench/keys';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export const formatDate = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A compact dialog shell shared by the settings, share and import dialogs. */
function Modal({ title, description, onClose, children, footer, className }: {
  title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; className?: string;
}) {
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className={cn('max-h-[85svh] gap-4 overflow-y-auto p-5 sm:max-w-lg', className)}>
        <DialogHeader className="gap-1">
          <DialogTitle className="text-sm">{title}</DialogTitle>
          <DialogDescription className={description ? 'text-xs' : 'sr-only'}>{description ?? title}</DialogDescription>
        </DialogHeader>
        {children}
        {footer && <DialogFooter className="gap-2">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  return (
    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={copy}>
      {copied ? <Check /> : <Copy />}{copied ? 'Copied' : label}
    </Button>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="grid gap-2">
    <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">{title}</h3>
    {children}
  </section>
);

const Row = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <div className="flex min-h-8 items-center justify-between gap-4 text-[13px]">{label}{children}</div>
);

export function SettingsDialog({ onClose, onError }: { onClose: () => void; onError: (message: string) => void }) {
  const { dark, setTheme } = useTheme();
  const links = useSharedLinks();
  const prefs = useEditorPrefs();
  const qc = useQueryClient();
  const auth = useQuery(authQuery).data;
  const leave = useMutation({ mutationFn: signOut, onSuccess: () => qc.invalidateQueries({ queryKey: ['auth'] }) });
  const remove = useMutation({
    mutationFn: (l: { id: string; token: string }) => deleteSharedLink(l.id, l.token),
    onSuccess: (_d, l) => forgetLink(l.id),
    // Already gone on the server (expired or deleted elsewhere): drop it from the list as well.
    onError: (e, l) => { forgetLink(l.id); onError(e.message); },
  });

  return (
    <Modal title="Settings" onClose={onClose} footer={<Button size="sm" onClick={onClose}>Done</Button>}>
      <Section title="Appearance">
        <Row label="Theme">
          <div className="bg-muted inline-flex rounded-md p-0.5" role="radiogroup" aria-label="Theme">
            {([['light', Sun], ['dark', Moon]] as const).map(([t, Icon]) => (
              <button
                key={t} type="button" role="radio" aria-checked={dark === (t === 'dark')} onClick={() => setTheme(t)}
                className="aria-checked:bg-background aria-checked:text-foreground text-muted-foreground inline-flex h-6 items-center gap-1.5 rounded px-2.5 text-xs capitalize aria-checked:shadow-sm"
              ><Icon className="size-3.5" />{t}</button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Editor">
        <Row label="Font size">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-xs" aria-label="Smaller text" disabled={prefs.fontSize <= FONT_MIN} onClick={() => setPrefs({ fontSize: prefs.fontSize - 1 })}><Minus /></Button>
            <output className="w-12 text-center font-mono text-xs" aria-live="polite">{prefs.fontSize} px</output>
            <Button variant="outline" size="icon-xs" aria-label="Larger text" disabled={prefs.fontSize >= FONT_MAX} onClick={() => setPrefs({ fontSize: prefs.fontSize + 1 })}><Plus /></Button>
          </div>
        </Row>
        <Row label={<label htmlFor="pref-wrap">Wrap long lines</label>}>
          <Switch id="pref-wrap" checked={prefs.wrap} onCheckedChange={wrap => setPrefs({ wrap })} />
        </Row>
      </Section>

      <Section title="Active share links">
        {links.length ? (
          <ul className="divide-y rounded-md border">
            {links.map(l => (
              <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <a className="block truncate font-mono text-xs hover:underline" href={linkUrl(l.id)} target="_blank" rel="noreferrer">{linkUrl(l.id)}</a>
                  <span className="text-muted-foreground text-[11px]">{l.language}, available until {formatDate(l.expiresAt)}</span>
                </div>
                <CopyButton text={linkUrl(l.id)} />
                <Button
                  variant="ghost" size="icon-xs" className="text-destructive" aria-label="Delete link" title="Delete link"
                  disabled={remove.isPending} onClick={() => remove.mutate({ id: l.id, token: l.token })}
                ><Trash2 /></Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">No active links. Links you create with Share appear here until they expire.</p>
        )}
      </Section>

      {auth?.authEnabled && (
        <Section title="Account">
          <Row label={<span>Signed in as <strong>{auth.username}</strong></span>}>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={leave.isPending} onClick={() => leave.mutate()}>Sign out</Button>
          </Row>
        </Section>
      )}

      <Section title="Keyboard shortcuts">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-xs">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={what} className="contents">
              <dt className="flex gap-1">{keys.split('+').map(k => <Kbd key={k}>{k}</Kbd>)}</dt>
              <dd className="text-muted-foreground">{what}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </Modal>
  );
}

export const SHORTCUTS: [string, string][] = [
  [`${mod}+Enter`, 'Run'],
  [`${mod}+P`, 'Go to file or run a command'],
  [`${mod}+B`, 'Show or hide the file explorer'],
  [`${mod}+\\`, 'Show or hide the output panel'],
  ['Ctrl+`', 'Show or hide the terminal'],
  [`${mod}+.`, 'Focus mode (code only)'],
  [`${mod}+,`, 'Settings'],
];

export function ShareDialog({ id, expiresAt, onClose }: { id: string; expiresAt: number; onClose: () => void }) {
  const url = linkUrl(id);
  return (
    <Modal
      title="Your link is ready" description={`Anyone with this link can open a copy of your workspace until ${formatDate(expiresAt)}.`}
      onClose={onClose} footer={<Button size="sm" onClick={onClose}>Done</Button>}
    >
      <div className="flex gap-2">
        <Input readOnly value={url} aria-label="Share link" className="h-8 font-mono text-xs" onFocus={e => e.currentTarget.select()} />
        <CopyButton text={url} />
      </div>
    </Modal>
  );
}

// "What do you want to import?": each choice opens the matching file picker.
export type ImportKind = 'files' | 'folder' | 'workspace';

export function ImportDialog({ onChoose, onClose }: { onChoose: (kind: ImportKind) => void; onClose: () => void }) {
  const options = [
    { kind: 'files', title: 'Files', icon: FilePlus2, hint: 'One or more text files, up to 1 MB each. Compressed files are not accepted.' },
    { kind: 'folder', title: 'Folder', icon: FolderInput, hint: 'A whole folder with its subfolders, up to 100 MB. Compressed and non-text files are skipped.' },
    { kind: 'workspace', title: 'Workspace', icon: FileArchive, hint: 'A .zip you exported from Runverse. It replaces everything in the editor.' },
  ] as const;
  return (
    <Modal title="Import" description="What do you want to bring in?" onClose={onClose}>
      <div className="grid gap-2">
        {options.map(o => (
          <button
            key={o.kind} type="button" onClick={() => onChoose(o.kind)}
            className="hover:bg-accent focus-visible:ring-ring/50 flex items-start gap-3 rounded-md border p-3 text-left outline-none focus-visible:ring-2"
          >
            <o.icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <span className="grid gap-0.5">
              <strong className="text-[13px] font-medium">{o.title}</strong>
              <span className="text-muted-foreground text-xs">{o.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function ImportReportDialog({ report, onClose }: { report: { added: number; replaced: number; skipped: { name: string; reason: string }[] }; onClose: () => void }) {
  return (
    <Modal
      title="Import finished"
      description={`Added ${report.added} file${report.added === 1 ? '' : 's'}${report.replaced ? `, replaced ${report.replaced}` : ''}. ${report.skipped.length} skipped:`}
      onClose={onClose} footer={<Button size="sm" onClick={onClose}>Done</Button>}
    >
      <ul className="divide-y rounded-md border text-xs">
        {report.skipped.slice(0, 12).map(s => (
          <li key={s.name} className="flex justify-between gap-3 px-3 py-1.5">
            <code className="truncate font-mono">{s.name}</code>
            <span className="text-muted-foreground shrink-0">{s.reason}</span>
          </li>
        ))}
      </ul>
      {report.skipped.length > 12 && <p className="text-muted-foreground text-xs">and {report.skipped.length - 12} more.</p>}
    </Modal>
  );
}
