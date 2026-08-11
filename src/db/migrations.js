import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const MIGRATIONS_DIR = join(__dirname, 'migrations');

// schema.sql is the fresh-install path, and seed.sql records '001_initial_schema'
// as applied. Existing databases already carry that same row, so both start from
// the same baseline and neither re-runs the initial schema. Migration files
// therefore begin at 002.
const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export function appliedMigrations(db) {
  ensureMigrationsTable(db);
  return new Set(db.prepare('SELECT name FROM migrations').all().map(r => r.name));
}

/**
 * Migration files in filename order. Sorted lexically, which is why the numeric
 * prefix is zero-padded -- '010' must sort after '009', not between '001' and '002'.
 */
export function migrationFiles(dir = MIGRATIONS_DIR) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .map(f => {
      if (!MIGRATION_FILE.test(f)) {
        // Refuse rather than skip. A typo'd name that is silently ignored is a
        // migration everyone believes ran.
        throw new Error(
          `Bad migration filename "${f}". Expected NNN_lower_snake_case.sql, e.g. 002_add_user_role.sql`
        );
      }
      return f;
    })
    .sort();
}

export function pendingMigrations(db, dir = MIGRATIONS_DIR) {
  const applied = appliedMigrations(db);
  return migrationFiles(dir).filter(f => !applied.has(f.replace(/\.sql$/, '')));
}

/**
 * Apply every migration not yet recorded, in order. Each runs inside its own
 * transaction together with its bookkeeping row, so a migration cannot end up
 * applied-but-unrecorded (or recorded-but-unapplied) if it fails partway.
 * SQLite gives us transactional DDL, so a failed ALTER rolls back cleanly.
 *
 * Migration SQL must not contain its own BEGIN/COMMIT -- the runner owns the
 * transaction and nested transaction control would break the rollback guarantee.
 *
 * @returns {string[]} names of migrations applied by this call
 */
export function runMigrations(db, { dir = MIGRATIONS_DIR, log = logger } = {}) {
  const pending = pendingMigrations(db, dir);
  const applied = [];

  for (const file of pending) {
    const name = file.replace(/\.sql$/, '');
    const sql = readFileSync(join(dir, file), 'utf-8');

    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/im.test(sql)) {
      throw new Error(
        `Migration ${file} contains its own transaction control; the runner manages transactions`
      );
    }

    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(name);
    });

    try {
      apply();
    } catch (err) {
      // Surface which migration failed. Without the name, a stack trace from
      // deep inside SQLite says nothing about which file to fix.
      throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err });
    }

    applied.push(name);
    log.info(`Applied migration: ${name}`);
  }

  return applied;
}

// The `npm run migrate` entry point lives in ./migrate.js, not here. This module
// is imported by db/index.js, so running a CLI from it would mean importing
// db/index.js back -- and a top-level await across that cycle deadlocks: each
// module waits for the other to finish evaluating.
