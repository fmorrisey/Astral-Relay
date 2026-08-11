import 'dotenv/config';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import DB from './index.js';
import config from '../config.js';
import logger from '../utils/logger.js';

// CLI entry for `npm run migrate`. Separate from migrations.js because that
// module is imported by db/index.js; importing db/index.js back from it would
// create a cycle, and a top-level await across that cycle deadlocks.

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');
const dbPath = config.dbPath.startsWith('/') ? config.dbPath : join(projectRoot, config.dbPath);

// Same resolution as server.js, so `npm run migrate` and boot always act on the
// same file. DB.migrate() initialises a fresh database from schema.sql + seed.sql
// and then applies any pending migrations, so this is safe on both.
let db;

try {
  // server.js creates this before opening the database; without it a fresh
  // clone fails with a bare SQLITE_CANTOPEN rather than anything actionable.
  const dataDir = dirname(dbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Inside the try: opening the database can fail too, and doing it outside
  // meant that failure escaped as an unhandled stack trace.
  db = new DB(dbPath);
  db.migrate();
} catch (err) {
  logger.error({ error: err.message }, 'Migration failed');
  process.exitCode = 1;
} finally {
  db?.close();
}
