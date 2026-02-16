import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TestDB } from '../../helpers/db.js';
import { Tag } from '../../../src/models/Tag.js';

describe('Tag model', () => {
  let db, tagModel;

  beforeEach(async () => {
    db = new TestDB();
    tagModel = new Tag(db);
  });

  describe('create', () => {
    it('creates a new tag', () => {
      const tag = tagModel.create({ name: 'JavaScript' });

      assert.ok(tag.id);
      assert.strictEqual(tag.name, 'JavaScript');
      assert.strictEqual(tag.slug, 'javascript');
      assert.ok(tag.createdAt);
      assert.strictEqual(tag.postCount, 0);
    });

    it('creates tag with special characters', () => {
      const tag = tagModel.create({ name: 'Node.js' });

      assert.strictEqual(tag.name, 'Node.js');
      assert.strictEqual(tag.slug, 'nodejs');
    });

    it('throws error for duplicate slug', () => {
      tagModel.create({ name: 'JavaScript' });

      assert.throws(
        () => tagModel.create({ name: 'javascript' }),
        { message: /already exists/i }
      );
    });

    it('throws error with 409 status code for duplicate', () => {
      tagModel.create({ name: 'test' });

      try {
        tagModel.create({ name: 'Test' });
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.strictEqual(err.statusCode, 409);
      }
    });
  });

  describe('findById', () => {
    it('finds tag by id', () => {
      const created = tagModel.create({ name: 'React' });
      const found = tagModel.findById(created.id);

      assert.strictEqual(found.id, created.id);
      assert.strictEqual(found.name, 'React');
    });

    it('returns null for non-existent tag', () => {
      const found = tagModel.findById(99999);
      assert.strictEqual(found, null);
    });
  });

  describe('findBySlug', () => {
    it('finds tag by slug', () => {
      tagModel.create({ name: 'TypeScript' });
      const found = tagModel.findBySlug('typescript');

      assert.ok(found);
      assert.strictEqual(found.name, 'TypeScript');
      assert.strictEqual(found.slug, 'typescript');
    });

    it('returns null for non-existent slug', () => {
      const found = tagModel.findBySlug('nonexistent');
      assert.strictEqual(found, null);
    });
  });

  describe('list', () => {
    it('returns empty array when no tags exist', () => {
      const tags = tagModel.list();
      assert.strictEqual(tags.length, 0);
    });

    it('lists all tags', () => {
      tagModel.create({ name: 'JavaScript' });
      tagModel.create({ name: 'Python' });
      tagModel.create({ name: 'Go' });

      const tags = tagModel.list();
      assert.strictEqual(tags.length, 3);
    });

    it('sorts tags alphabetically by name', () => {
      tagModel.create({ name: 'Zebra' });
      tagModel.create({ name: 'Apple' });
      tagModel.create({ name: 'Mango' });

      const tags = tagModel.list();
      assert.strictEqual(tags[0].name, 'Apple');
      assert.strictEqual(tags[1].name, 'Mango');
      assert.strictEqual(tags[2].name, 'Zebra');
    });

    it('includes post count', () => {
      tagModel.create({ name: 'Test' });
      const tags = tagModel.list();

      assert.strictEqual(tags[0].postCount, 0);
    });
  });

  describe('delete', () => {
    it('deletes a tag', () => {
      const tag = tagModel.create({ name: 'ToDelete' });
      tagModel.delete(tag.id);

      const found = tagModel.findById(tag.id);
      assert.strictEqual(found, null);
    });

    it('removes tag associations when deleted', () => {
      // Create a user and post first (needed for foreign key constraint)
      const userResult = db.prepare(`
        INSERT INTO users (username, password_hash)
        VALUES (?, ?)
      `).run('testuser', 'hash');

      const postResult = db.prepare(`
        INSERT INTO posts (id, collection, slug, title, body, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('test-post-id', 'blog', 'test', 'Test', 'Body', userResult.lastInsertRowid);

      const tag = tagModel.create({ name: 'Test' });

      // Create a post-tag association
      db.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)').run('test-post-id', tag.id);

      tagModel.delete(tag.id);

      // Verify association is removed
      const associations = db.prepare('SELECT * FROM post_tags WHERE tag_id = ?').all(tag.id);
      assert.strictEqual(associations.length, 0);
    });
  });
});
