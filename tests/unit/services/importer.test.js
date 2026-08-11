import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestDB } from '../../helpers/db.js';
import { createTestUser } from '../../helpers/fixtures.js';
import { Post } from '../../../src/models/Post.js';
import { ImportService } from '../../../src/services/importer.js';

describe('ImportService', () => {
  let db, root, importer, userId;

  beforeEach(() => {
    db = new TestDB();
    userId = createTestUser(db, { username: 'owner' }).id;
    root = mkdtempSync(join(tmpdir(), 'relay-import-'));
    mkdirSync(join(root, 'src/content/writing'), { recursive: true });
    importer = new ImportService({ workspacePath: root, postModel: new Post(db), db });
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  function write(collection, filename, content) {
    const dir = join(root, 'src/content', collection);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), content);
  }

  const entry = (fm, body = 'Body text.') => `---\n${fm}\n---\n\n${body}\n`;

  function run(opts = {}) {
    return importer.importAll({ userId, ...opts });
  }

  it('imports an entry with its fields and tags', () => {
    write('writing', 'hello.md', entry('title: Hello\ndate: 2020-09-11\nsummary: A summary.\ntags:\n  - Career\n  - Dev'));

    const results = run();

    assert.deepStrictEqual(results.map(r => r.action), ['created']);
    const post = db.prepare("SELECT * FROM posts WHERE slug = 'hello'").get();
    assert.strictEqual(post.title, 'Hello');
    assert.strictEqual(post.summary, 'A summary.');
    assert.strictEqual(post.body.trim(), 'Body text.');
    assert.strictEqual(post.status, 'published');
    assert.ok(post.published_at.startsWith('2020-09-11'));
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM tags').get().c, 2);
  });

  // The slug is the page's URL. Deriving it from the title would move the page
  // and, on the next publish, write a new file and orphan the original.
  it('takes the slug from the filename, not the title', () => {
    write('writing', 'hello-world.md', entry('title: \'print("Hello World")\'\ndate: 2020-09-11'));

    run();

    const post = db.prepare('SELECT slug, title FROM posts').get();
    assert.strictEqual(post.slug, 'hello-world');
    assert.strictEqual(post.title, 'print("Hello World")');
  });

  // Two real entries share a title that slugifies identically; filename slugs
  // keep them distinct instead of colliding on UNIQUE(collection, slug).
  it('keeps entries distinct when their titles slugify the same', () => {
    write('writing', 'hello-world.md', entry('title: \'print("Hello World")\'\ndate: 2020-09-11'));
    write('writing', 'print-hello-world.md', entry('title: \'print("Hello World")\'\ndate: 2020-09-12'));

    const results = run();

    assert.strictEqual(results.filter(r => r.action === 'created').length, 2);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM posts').get().c, 2);
  });

  it('is idempotent: a second run updates rather than duplicating', () => {
    write('writing', 'hello.md', entry('title: Hello\ndate: 2020-09-11'));

    run();
    const second = run();

    assert.deepStrictEqual(second.map(r => r.action), ['updated']);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM posts').get().c, 1);
  });

  it('picks up edits made to the file since the last run', () => {
    write('writing', 'hello.md', entry('title: Hello\ndate: 2020-09-11'));
    run();

    write('writing', 'hello.md', entry('title: Hello Again\ndate: 2020-09-11', 'New body.'));
    run();

    const post = db.prepare("SELECT title, body FROM posts WHERE slug = 'hello'").get();
    assert.strictEqual(post.title, 'Hello Again');
    assert.strictEqual(post.body.trim(), 'New body.');
  });

  describe('published state', () => {
    it('treats a missing published key as published, matching Astro schema defaults', () => {
      write('writing', 'hello.md', entry('title: Hello\ndate: 2020-09-11'));
      run();
      assert.strictEqual(db.prepare('SELECT status FROM posts').get().status, 'published');
    });

    it('imports published: false as a draft', () => {
      write('writing', 'draft.md', entry('title: Draft\ndate: 2020-09-11\npublished: false'));
      run();
      assert.strictEqual(db.prepare('SELECT status FROM posts').get().status, 'draft');
    });
  });

  it('falls back to description when summary is absent', () => {
    write('writing', 'hello.md', entry('title: Hello\ndate: 2020-09-11\ndescription: From description.'));
    run();
    assert.strictEqual(db.prepare('SELECT summary FROM posts').get().summary, 'From description.');
  });

  describe('entries it cannot map', () => {
    it('reports them rather than importing them silently', () => {
      write('writing', 'good.md', entry('title: Good\ndate: 2020-09-11'));
      write('writing', 'no-frontmatter.md', 'Just a body.\n');
      write('writing', 'no-title.md', entry('date: 2020-09-11'));
      write('writing', 'broken.md', '---\ntitle: "unterminated\n  bad: [1,2\n---\n\nBody.\n');

      const results = run();

      const skipped = results.filter(r => r.action === 'skipped');
      assert.strictEqual(skipped.length, 3);
      assert.ok(skipped.every(s => s.reason));
      assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM posts').get().c, 1);
    });
  });

  it('writes nothing to the workspace', () => {
    const file = join(root, 'src/content/writing/hello.md');
    write('writing', 'hello.md', entry('title: Hello\ndate: 2020-09-11'));
    const before = readFileSync(file, 'utf-8');

    run();

    assert.strictEqual(readFileSync(file, 'utf-8'), before);
  });

  it('makes no changes on a dry run', () => {
    write('writing', 'hello.md', entry('title: Hello\ndate: 2020-09-11'));

    const results = run({ dryRun: true });

    assert.deepStrictEqual(results.map(r => r.action), ['created']);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM posts').get().c, 0);
  });

  it('can be limited to one collection', () => {
    write('writing', 'a.md', entry('title: A\ndate: 2020-09-11'));
    write('photography', 'b.md', entry('title: B\ndate: 2020-09-11'));

    run({ collections: ['writing'] });

    assert.deepStrictEqual(
      db.prepare('SELECT collection FROM posts').all().map(r => r.collection),
      ['writing']
    );
  });

  it('fails clearly when the workspace has no content directory', () => {
    const empty = new ImportService({ workspacePath: '/nonexistent', postModel: new Post(db), db });
    assert.throws(() => empty.importAll({ userId }), /Is the workspace mounted/);
  });
});
