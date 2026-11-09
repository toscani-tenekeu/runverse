import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { customAlphabet } from 'nanoid';

// A self-hosted install asks for a username and password. They are generated when sign-in is
// switched on and printed once. Switch it on or off, or get a new password, with ./scripts/auth.sh.
// RUNVERSE_AUTH only sets the starting state the first time the API runs (default: on).
const START_ENABLED = !['false', '0', 'off', 'no'].includes((process.env.RUNVERSE_AUTH ?? 'true').toLowerCase());

const dir = process.env.DATA_DIR ?? './data';
const file = join(dir, 'auth.json');
const SESSION_MS = 7 * 86_400_000;
export const COOKIE = 'rv_session';

interface Stored { enabled: boolean; username: string; salt: string; hash: string; secret: string }

const newPassword = customAlphabet('23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', 16);
const derive = (password: string, salt: string) => scryptSync(password, salt, 32).toString('hex');

let cached: { mtime: number; stored: Stored } | null = null;
function read(): Stored | null {
  if (!existsSync(file)) return null;
  const mtime = statSync(file).mtimeMs;
  if (!cached || cached.mtime !== mtime) cached = { mtime, stored: JSON.parse(readFileSync(file, 'utf8')) as Stored };
  return cached.stored;
}

function write(stored: Stored) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(stored), { mode: 0o600 });
  cached = null;
}

// New password, same username and signing secret. Sessions are tied to the password, so the old ones end.
function withNewPassword(enabled: boolean): { stored: Stored; password: string } {
  const prev = read();
  const password = newPassword();
  const salt = randomBytes(16).toString('hex');
  const stored: Stored = {
    enabled,
    username: prev?.username ?? 'admin',
    salt,
    hash: derive(password, salt),
    secret: prev?.secret ?? randomBytes(32).toString('hex'),
  };
  write(stored);
  return { stored, password };
}

export const isEnabled = () => read()?.enabled ?? false;

export function credentialsBanner(username: string, password: string, why: string) {
  const line = '─'.repeat(58);
  return [
    '', line, ` Runverse sign-in (${why})`, '', `   Username: ${username}`, `   Password: ${password}`, '',
    ' Save it now: the password is stored hashed and is not shown again.',
    ' New password:  ./scripts/auth.sh reset      Turn off:  ./scripts/auth.sh off', line, '',
  ].join('\n');
}

// Called when the API starts. The very first run applies RUNVERSE_AUTH and, if on, prints the credentials.
export function initAuth() {
  if (read()) return;
  if (START_ENABLED) {
    const { stored, password } = withNewPassword(true);
    console.log(credentialsBanner(stored.username, password, 'generated for this install'));
  } else {
    write({ enabled: false, username: 'admin', salt: '', hash: '', secret: randomBytes(32).toString('hex') });
  }
}

// ---- Used by ./scripts/auth.sh ----
export function authStatus() {
  const s = read();
  return { enabled: s?.enabled ?? false, username: s?.username ?? 'admin' };
}

export function switchOn(): { username: string; password: string } | null {
  if (isEnabled()) return null;
  const { stored, password } = withNewPassword(true);
  return { username: stored.username, password };
}

export function switchOff() {
  const s = read();
  if (s) write({ ...s, enabled: false });
}

export function resetPassword() {
  const { stored, password } = withNewPassword(true);
  return { username: stored.username, password };
}

export function checkLogin(username: string, password: string): boolean {
  const s = read();
  if (!s?.enabled) return false;
  const a = Buffer.from(derive(password, s.salt), 'hex');
  const b = Buffer.from(s.hash, 'hex');
  // Compare the name without short-circuiting before the password work, so timing doesn't leak it.
  return timingSafeEqual(a, b) && username.trim().toLowerCase() === s.username.toLowerCase();
}

const sign = (s: Stored, payload: string) => createHmac('sha256', s.secret + s.hash).update(payload).digest('base64url');

export function newSession(): { value: string; maxAge: number } {
  const s = read()!;
  const exp = String(Date.now() + SESSION_MS);
  return { value: `${exp}.${sign(s, exp)}`, maxAge: SESSION_MS / 1000 };
}

export function username(): string {
  return read()?.username ?? 'admin';
}

export function validSession(cookieHeader: string | undefined): boolean {
  const raw = cookieHeader?.split(';').map(p => p.trim()).find(p => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return false;
  const [exp, sig] = raw.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const s = read();
  if (!s?.enabled) return false;
  const want = Buffer.from(sign(s, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
