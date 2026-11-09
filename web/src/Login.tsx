import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { signIn } from './api';
import { Logo } from './Workspace';

export function Login() {
  const qc = useQueryClient();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: signIn,
    onSuccess: () => qc.invalidateQueries(),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!login.isPending) login.mutate({ username, password });
  };

  return (
    <div className="message login">
      <span className="brand"><Logo /><span>runverse</span></span>
      <h1>Sign in</h1>
      <p>Use the admin username and password shown when Runverse first started. Run <code>docker compose logs api</code> to find them, or <code>./scripts/auth.sh reset</code> for a new password.</p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Username</span>
          <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" spellCheck={false} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
        </label>
        <p className={login.error ? 'dialog-error' : 'dialog-hint'} role="status">{login.error?.message ?? ''}</p>
        <button className="btn" type="submit" disabled={login.isPending || !password}>{login.isPending ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
