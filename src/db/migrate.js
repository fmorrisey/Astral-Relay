import 'dotenv/config';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
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
const db = new DB(dbPath);

try {
  db.migrate();
} catch (err) {
  logger.error({ error: err.message }, 'Migration failed');
  process.exitCode = 1;
} finally {
  db.close();
}
