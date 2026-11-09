import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authQuery, deleteSharedLink, signOut } from './api';
import { forgetLink, linkUrl, useSharedLinks } from './links';
import { useTheme } from './theme';

export const formatDate = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// Shared by the settings and share dialogs: a native <dialog> opened as a modal.
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === ref.current) onClose(); }}
      aria-labelledby="modal-title"
    >
      <div className="dialog-body">
        <h2 id="modal-title">{title}</h2>
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

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

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
