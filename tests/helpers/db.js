import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from '../../src/db/migrations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create an in-memory test database with schema applied
 */
export function createTestDB() {
  const db = new Database(':memory:');

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Load and apply schema
  const schemaPath = join(__dirname, '../../src/db/schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Then apply migrations, the same order DB.migrate() uses on a real database.
  // Without this the tests run against schema.sql alone, so any column added by
  // a migration is missing and every test touching it fails for a reason that
  // has nothing to do with what it is testing.
  db.prepare("INSERT INTO migrations (name) VALUES ('001_initial_schema')").run();
  runMigrations(
    { prepare: s => db.prepare(s), exec: s => db.exec(s), transaction: f => db.transaction(f) },
    { log: { info: () => {}, error: () => {} } }
  );

  return db;
}

/**
 * Wrapper around Database that implements the DB interface
 */
export class TestDB {
  constructor() {
    this.db = createTestDB();
  }

  prepare(sql) {
    return this.db.prepare(sql);
  }

  transaction(fn) {
    return this.db.transaction(fn);
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  close() {
    this.db.close();
  }
}
