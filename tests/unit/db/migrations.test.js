import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestDB } from '../../helpers/db.js';
import {
  runMigrations,
  pendingMigrations,
  appliedMigrations,
  migrationFiles
} from '../../../src/db/migrations.js';

// The runner logs each applied migration; keep test output readable.
const silent = { info: () => {}, error: () => {} };

describe('migration runner', () => {
  let db, dir;

  beforeEach(() => {
    db = new TestDB();
    dir = mkdtempSync(join(tmpdir(), 'relay-migrations-'));
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function write(name, sql) {
    writeFileSync(join(dir, name), sql);
  }

  // schema.sql + seed.sql are the baseline. TestDB already records it (and then
  // applies the real migrations), so this is OR IGNORE rather than a plain
  // insert -- it documents the precondition these tests rely on without
  // colliding with the harness on migrations.name.
  function baseline() {
    db.prepare("INSERT OR IGNORE INTO migrations (name) VALUES ('001_initial_schema')").run();
  }

  it('applies a pending migration', () => {
    baseline();
    // A column no real migration adds: the harness now applies the real ones,
    // so reusing a shipped column name would collide with it rather than test
    // anything.
    write('900_add_nickname.sql', 'ALTER TABLE users ADD COLUMN nickname TEXT;');

    const applied = runMigrations(db, { dir, log: silent });

    assert.deepStrictEqual(applied, ['900_add_nickname']);
    const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    assert.ok(cols.includes('nickname'));
  });

  it('records the migration so a second run is a no-op', () => {
    baseline();
    write('900_add_nickname.sql', 'ALTER TABLE users ADD COLUMN nickname TEXT;');

    runMigrations(db, { dir, log: silent });
    const second = runMigrations(db, { dir, log: silent });

    assert.deepStrictEqual(second, []);
    // Re-running the ALTER would throw "duplicate column name", so an empty
    // result here is the whole point: it was skipped, not retried.
    assert.ok(appliedMigrations(db).has('900_add_nickname'));
  });

  it('never re-runs the baseline recorded by seed.sql', () => {
    baseline();
    write('001_initial_schema.sql', 'SELECT RAISE_MISUSE_IF_THIS_RUNS;');

    const applied = runMigrations(db, { dir, log: silent });

    assert.deepStrictEqual(applied, []);
  });

  it('applies migrations in filename order, not directory order', () => {
    baseline();
    // Written out of order on purpose; 010 must land after 009.
    write('010_third.sql', 'CREATE TABLE third (id INTEGER);');
    write('002_first.sql', 'CREATE TABLE first (id INTEGER);');
    write('009_second.sql', 'CREATE TABLE second (id INTEGER);');

    const applied = runMigrations(db, { dir, log: silent });

    assert.deepStrictEqual(applied, ['002_first', '009_second', '010_third']);
  });

  describe('when a migration fails', () => {
    beforeEach(() => {
      baseline();
      write(
        '002_partly_valid.sql',
        `CREATE TABLE should_not_survive (id INTEGER);
         ALTER TABLE users ADD COLUMN username TEXT;`  // duplicate column -> throws
      );
    });

    it('rolls back the whole file, including statements that already succeeded', () => {
      assert.throws(() => runMigrations(db, { dir, log: silent }), /002_partly_valid\.sql failed/);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='should_not_survive'")
        .all();
      assert.strictEqual(tables.length, 0);
    });

    it('does not record it as applied, so it is retried after a fix', () => {
      assert.throws(() => runMigrations(db, { dir, log: silent }));

      assert.ok(!appliedMigrations(db).has('002_partly_valid'));
      assert.deepStrictEqual(pendingMigrations(db, dir), ['002_partly_valid.sql']);
    });

    it('stops rather than applying later migrations over a broken state', () => {
      write('003_later.sql', 'CREATE TABLE later (id INTEGER);');

      assert.throws(() => runMigrations(db, { dir, log: silent }));

      assert.ok(!appliedMigrations(db).has('003_later'));
    });
  });

  it('rejects a migration that manages its own transaction', () => {
    baseline();
    write('002_own_transaction.sql', 'BEGIN; CREATE TABLE t (id INTEGER); COMMIT;');

    // SQLite rejects the nested BEGIN; the runner adds the explanation.
    assert.throws(
      () => runMigrations(db, { dir, log: silent }),
      /must not contain BEGIN\/COMMIT/
    );
  });

  // `BEGIN` also opens a CREATE TRIGGER body. Rejecting those by pattern would
  // refuse a legitimate migration -- and fatally, since DB.migrate() runs on
  // boot, so the server would not start after the deploy.
  it('applies a migration containing a trigger', () => {
    baseline();
    write(
      '002_add_trigger.sql',
      `CREATE TRIGGER posts_touch AFTER UPDATE ON posts
       BEGIN
         UPDATE posts SET updated_at = datetime('now') WHERE id = NEW.id;
       END;`
    );

    const applied = runMigrations(db, { dir, log: silent });

    assert.deepStrictEqual(applied, ['002_add_trigger']);
    const trigger = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='posts_touch'")
      .get();
    assert.ok(trigger);
  });

  it('rejects a misnamed file instead of silently skipping it', () => {
    baseline();
    write('add_role.sql', 'CREATE TABLE t (id INTEGER);');

    assert.throws(() => migrationFiles(dir), /Bad migration filename/);
  });

  it('treats a missing migrations directory as nothing to do', () => {
    baseline();

    assert.deepStrictEqual(migrationFiles(join(dir, 'nope')), []);
    assert.deepStrictEqual(runMigrations(db, { dir: join(dir, 'nope'), log: silent }), []);
  });
});
