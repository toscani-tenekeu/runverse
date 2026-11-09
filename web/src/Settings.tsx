import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authQuery, deleteSharedLink, signOut } from './api';
import { forgetLink, linkUrl, useSharedLinks } from './links';
import { useTheme } from './theme';
import { FONT_MAX, FONT_MIN, setPrefs, useEditorPrefs } from './prefs';

export const formatDate = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// Shared by the settings and share dialogs: a native <dialog> opened as a modal.
export function Modal({ title, onClose, children, compact }: { title: string; onClose: () => void; children: React.ReactNode; compact?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog${compact ? ' dialog-compact' : ''}`}
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === ref.current) onClose(); }}
      aria-labelledby="modal-title"
    >
      <div className="dialog-body">
        <h2 id="modal-title" className={compact ? 'sr-only' : undefined}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  return <button type="button" className="btn btn-ghost btn-small" onClick={copy}>{copied ? 'Copied' : label}</button>;
}

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
    <Modal title="Settings" onClose={onClose}>
      <section className="settings-section">
        <h3>Appearance</h3>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          <button type="button" role="radio" aria-checked={!dark} onClick={() => setTheme('light')}>Light</button>
          <button type="button" role="radio" aria-checked={dark} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Editor</h3>
        <div className="pref-row">
          <span>Font size</span>
          <div className="stepper">
            <button type="button" aria-label="Smaller text" disabled={prefs.fontSize <= FONT_MIN} onClick={() => setPrefs({ fontSize: prefs.fontSize - 1 })}>−</button>
            <output aria-live="polite">{prefs.fontSize} px</output>
            <button type="button" aria-label="Larger text" disabled={prefs.fontSize >= FONT_MAX} onClick={() => setPrefs({ fontSize: prefs.fontSize + 1 })}>+</button>
          </div>
        </div>
        <label className="pref-row">
          <span>Wrap long lines</span>
          <input type="checkbox" role="switch" checked={prefs.wrap} onChange={e => setPrefs({ wrap: e.target.checked })} />
        </label>
      </section>

      <section className="settings-section">
        <h3>Active share links</h3>
        {links.length ? (
          <ul className="link-list">
            {links.map(l => (
              <li key={l.id}>
                <div className="link-info">
                  <a href={linkUrl(l.id)} target="_blank" rel="noreferrer">{linkUrl(l.id)}</a>
                  <span>{l.language} · available until {formatDate(l.expiresAt)}</span>
                </div>
                <CopyButton text={linkUrl(l.id)} />
                <button
                  type="button" className="btn btn-ghost btn-small btn-danger-text"
                  disabled={remove.isPending} onClick={() => remove.mutate({ id: l.id, token: l.token })}
                >Delete</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dialog-hint">No active links. Links you create with Share appear here until they expire.</p>
        )}
      </section>

      {auth?.authEnabled && (
        <section className="settings-section">
          <h3>Account</h3>
          <div className="account-row">
            <span>Signed in as <strong>{auth.username}</strong></span>
            <button type="button" className="btn btn-ghost btn-small" disabled={leave.isPending} onClick={() => leave.mutate()}>Sign out</button>
          </div>
        </section>
      )}

      <section className="settings-section">
        <h3>Keyboard shortcuts</h3>
        <dl className="shortcuts">
          {SHORTCUTS.map(([keys, what]) => (<div key={what}><dt>{keys}</dt><dd>{what}</dd></div>))}
        </dl>
      </section>

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
const SHORTCUTS: [string, string][] = [
  [`${mod}+Enter`, 'Run'],
  [`${mod}+P`, 'Go to file'],
  [`${mod}+B`, 'Show or hide the file list'],
  [`${mod}+\\`, 'Show or hide the output'],
  ['Ctrl+`', 'Show or hide the terminal'],
  [`${mod}+.`, 'Focus mode (code only)'],
  [`${mod}+,`, 'Settings'],
];

export function ShareDialog({ id, expiresAt, onClose }: { id: string; expiresAt: number; onClose: () => void }) {
  const url = linkUrl(id);
  return (
    <Modal title="Your link is ready" onClose={onClose}>
      <p className="dialog-msg">Anyone with this link can open a copy of your workspace until {formatDate(expiresAt)}.</p>
      <div className="copy-row">
        <input readOnly value={url} aria-label="Share link" onFocus={e => e.currentTarget.select()} />
        <CopyButton text={url} />
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

// "What do you want to import?": each choice opens the matching file picker.
export type ImportKind = 'files' | 'folder' | 'workspace';

export function ImportDialog({ onChoose, onClose }: { onChoose: (kind: ImportKind) => void; onClose: () => void }) {
  const options: { kind: ImportKind; title: string; hint: string }[] = [
    { kind: 'files', title: 'Files', hint: 'One or more text files, up to 1 MB each. Compressed files are not accepted.' },
    { kind: 'folder', title: 'Folder', hint: 'A whole folder with its subfolders, up to 100 MB. Compressed and non-text files are skipped.' },
    { kind: 'workspace', title: 'Workspace', hint: 'A .zip you exported from Runverse. It replaces everything in the editor.' },
  ];
  return (
    <Modal title="What do you want to import?" onClose={onClose}>
      <div className="choice-list">
        {options.map(o => (
          <button key={o.kind} type="button" className="choice" onClick={() => onChoose(o.kind)}>
            <strong>{o.title}</strong>
            <span>{o.hint}</span>
          </button>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

export function ImportReportDialog({ report, onClose }: { report: { added: number; replaced: number; skipped: { name: string; reason: string }[] }; onClose: () => void }) {
  return (
    <Modal title="Import finished" onClose={onClose}>
      <p className="dialog-msg">
        Added {report.added} file{report.added === 1 ? '' : 's'}{report.replaced ? `, replaced ${report.replaced}` : ''}.
        {' '}{report.skipped.length} skipped:
      </p>
      <ul className="skip-list">
        {report.skipped.slice(0, 12).map(s => <li key={s.name}><code>{s.name}</code><span>{s.reason}</span></li>)}
      </ul>
      {report.skipped.length > 12 && <p className="dialog-hint">and {report.skipped.length - 12} more.</p>}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
