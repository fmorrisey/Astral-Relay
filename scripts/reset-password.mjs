// Reset an account password from the server.
//
// This exists because there is no in-app recovery path: the code shown at setup
// is generated, displayed, and discarded -- never stored, never accepted by any
// endpoint -- so a forgotten password is otherwise unrecoverable.
//
// The password is read from stdin rather than argv, so it stays out of the
// process table and shell history:
//
//   npm run reset-password -- <username>        (prompts)
//
// Hashing parameters match src/services/auth.js.

// Loaded so DB_PATH from .env is honoured, matching the server and the other
// scripts. Without it this would silently fall back to ./data/relay.db and
// better-sqlite3 would create an empty database there, reporting no such user
// while the real account sat untouched elsewhere.
import 'dotenv/config';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import argon2 from 'argon2';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const username = process.argv[2];
if (!username) {
  console.error('usage: npm run reset-password -- <username>');
  process.exit(1);
}

// Same resolution as server.js, so this always acts on the database the app uses
// regardless of the directory it is invoked from.
const configured = process.env.DB_PATH || './data/relay.db';
const dbPath = configured.startsWith('/') ? configured : join(projectRoot, configured);

async function readPassword() {
  // A TTY gets a hidden prompt; a pipe is read straight through, so this works
  // both interactively and in `printf ... | npm run reset-password`.
  if (!process.stdin.isTTY) {
    return new Promise(resolve => {
      let buf = '';
      process.stdin.on('data', d => { buf += d; });
      process.stdin.on('end', () => resolve(buf.replace(/\r?\n$/, '')));
    });
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  process.stdout.write('New password: ');

  // Suppress the echo of typed characters. rl.output IS process.stdout, so this
  // must be restored -- leaving it stubbed silently discards every later write,
  // including the success message, which reads as a failed run and invites
  // someone to reset the password a second time.
  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    const answer = await new Promise(resolve => rl.question('', resolve));
    return answer;
  } finally {
    process.stdout.write = originalWrite;
    rl.close();
    process.stdout.write('\n');
  }
}

const password = await readPassword();

// Matches the minimum in src/utils/validators.js.
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const db = new Database(dbPath);
const user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);

if (!user) {
  const known = db.prepare('SELECT username FROM users').all().map(u => u.username);
  console.error(`No user "${username}" in ${dbPath}. Known users: ${known.join(', ') || '(none)'}`);
  db.close();
  process.exit(1);
}

const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
});

db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);

// Existing sessions were established against the old credential. Dropping them
// makes a reset actually revoke access instead of leaving old logins alive.
const dropped = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id).changes;

db.close();
console.log(`Password updated for "${user.username}". Sessions invalidated: ${dropped}.`);
console.log('No restart needed - the hash is read from the database on each login.');
