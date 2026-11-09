// ./scripts/auth.sh on | off | reset | status
import { authStatus, credentialsBanner, resetPassword, switchOff, switchOn } from './auth.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

if (!existsSync(join(process.env.DATA_DIR ?? './data', 'auth.json'))) {
  console.log('Runverse has not started yet. Start it with "docker compose up -d", then run this again.');
  process.exit(1);
}

const cmd = process.argv[2];
const { enabled, username } = authStatus();

if (cmd === 'status') {
  console.log(enabled ? `Sign-in is ON. Username: ${username}. Password forgotten? ./scripts/auth.sh reset` : 'Sign-in is OFF: anyone who can reach the site can use the editor. Turn it on with ./scripts/auth.sh on');
} else if (cmd === 'on') {
  const creds = switchOn();
  if (creds) console.log(credentialsBanner(creds.username, creds.password, 'switched on'));
  else console.log(`Sign-in is already ON (username: ${username}). For a new password run ./scripts/auth.sh reset`);
} else if (cmd === 'off') {
  switchOff();
  console.log(enabled ? 'Sign-in is OFF. The editor is now open to anyone who can reach it.' : 'Sign-in was already OFF.');
} else if (cmd === 'reset') {
  const creds = resetPassword();
  console.log(credentialsBanner(creds.username, creds.password, 'new password'));
  console.log('Everyone signed in with the old password has been signed out.');
} else {
  console.log('Usage: ./scripts/auth.sh on | off | reset | status');
  process.exit(cmd ? 1 : 0);
}
