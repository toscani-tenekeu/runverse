import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { signIn } from './api';
import { Logo } from './Workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    <div className="bg-chrome flex h-svh items-center justify-center overflow-y-auto p-6">
      <div className="bg-background grid w-full max-w-sm gap-5 rounded-lg border p-6 shadow-sm">
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"><Logo /><span>runverse</span></span>
        <div className="grid gap-1.5">
          <h1 className="text-base font-semibold">Sign in</h1>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Use the admin username and password shown when Runverse first started. Run <code className="font-mono">docker compose logs api</code> to
            find them, or <code className="font-mono">./scripts/auth.sh reset</code> for a new password.
          </p>
        </div>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="login-user" className="text-xs">Username</Label>
            <Input id="login-user" className="h-8" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" spellCheck={false} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="login-pass" className="text-xs">Password</Label>
            <Input id="login-pass" className="h-8" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
          </div>
          <p className="text-destructive min-h-4 text-xs" role="status">{login.error?.message ?? ''}</p>
          <Button type="submit" size="sm" disabled={login.isPending || !password}>
            {login.isPending && <Loader2 className="animate-spin" />}
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
