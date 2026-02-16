import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

class DB {
  constructor(dbPath) {
    this.db = new Database(dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    logger.info(`Database connected: ${dbPath}`);
  }

  migrate() {
    const schemaPath = join(__dirname, 'schema.sql');
    const seedPath = join(__dirname, 'seed.sql');

    const hasMigrations = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'")
      .get();

    if (!hasMigrations) {
      const schema = readFileSync(schemaPath, 'utf-8');
      this.db.exec(schema);

      const seed = readFileSync(seedPath, 'utf-8');
      this.db.exec(seed);

      logger.info('Database initialized with schema and seed data');
    } else {
      logger.info('Database schema up to date');
    }
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
    logger.info('Database connection closed');
  }
}

export default DB;
