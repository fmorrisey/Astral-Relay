import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TestDB } from '../../helpers/db.js';
import { Post } from '../../../src/models/Post.js';
import { User } from '../../../src/models/User.js';

describe('Post model', () => {
  let db, postModel, userModel, testUserId;

  beforeEach(async () => {
    db = new TestDB();
    postModel = new Post(db);
    userModel = new User(db);

    // Create a test user
    const user = userModel.create({
      username: 'testuser',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$testhash'
    });
    testUserId = user.id;
  });

  describe('create', () => {
    it('creates a new post', () => {
      const post = postModel.create({
        collection: 'blog',
        title: 'Test Post',
        body: 'This is a test post',
        summary: 'Test summary',
        userId: testUserId
      });

      assert.ok(post.id);
      assert.strictEqual(post.title, 'Test Post');
      assert.strictEqual(post.body, 'This is a test post');
      assert.strictEqual(post.summary, 'Test summary');
      assert.strictEqual(post.collection, 'blog');
      assert.strictEqual(post.slug, 'test-post');
      assert.strictEqual(post.status, 'draft');
      assert.strictEqual(post.createdBy, testUserId);
    });

    it('creates post with tags', () => {
      const post = postModel.create({
        collection: 'blog',
        title: 'Tagged Post',
        body: 'Post with tags',
        userId: testUserId,
        tags: ['javascript', 'nodejs']
      });

      assert.ok(post.id);
      assert.strictEqual(post.tags.length, 2);
      assert.ok(post.tags.includes('javascript'));
      assert.ok(post.tags.includes('nodejs'));
    });

    it('creates a version on post creation', () => {
      const post = postModel.create({
        collection: 'blog',
        title: 'Test Post',
        body: 'Body',
        userId: testUserId
      });

      const versions = postModel.getVersions(post.id);
      assert.strictEqual(versions.length, 1);
      assert.strictEqual(versions[0].version_number, 1);
      assert.strictEqual(versions[0].title, 'Test Post');
    });
  });

  describe('findById', () => {
    it('finds post by id', () => {
      const created = postModel.create({
        collection: 'blog',
        title: 'Find Me',
        body: 'Body',
        userId: testUserId
      });

      const found = postModel.findById(created.id);
      assert.strictEqual(found.id, created.id);
      assert.strictEqual(found.title, 'Find Me');
    });

    it('returns null for non-existent post', () => {
      const found = postModel.findById('non-existent-id');
      assert.strictEqual(found, null);
    });
  });

  describe('list', () => {
    beforeEach(() => {
      postModel.create({
        collection: 'blog',
        title: 'Post 1',
        body: 'Body 1',
        userId: testUserId
      });
      postModel.create({
        collection: 'blog',
        title: 'Post 2',
        body: 'Body 2',
        userId: testUserId
      });
      postModel.create({
        collection: 'docs',
        title: 'Doc 1',
        body: 'Doc Body',
        userId: testUserId
      });
    });

    it('lists all posts', () => {
      const result = postModel.list();
      assert.strictEqual(result.posts.length, 3);
      assert.strictEqual(result.total, 3);
    });

    it('filters by collection', () => {
      const result = postModel.list({ collection: 'blog' });
      assert.strictEqual(result.posts.length, 2);
      assert.strictEqual(result.total, 2);
    });

    it('filters by status', () => {
      const result = postModel.list({ status: 'draft' });
      assert.strictEqual(result.posts.length, 3);
    });

    it('respects limit and offset', () => {
      const result = postModel.list({ limit: 1, offset: 1 });
      assert.strictEqual(result.posts.length, 1);
      assert.strictEqual(result.total, 3);
      assert.strictEqual(result.limit, 1);
      assert.strictEqual(result.offset, 1);
    });
  });

  describe('update', () => {
    it('updates post fields', () => {
      const post = postModel.create({
        collection: 'blog',
        title: 'Original',
        body: 'Original body',
        userId: testUserId
      });

      const updated = postModel.update(post.id, {
        title: 'Updated',
        body: 'Updated body'
      });

      assert.strictEqual(updated.title, 'Updated');
      assert.strictEqual(updated.body, 'Updated body');
    });

    it('creates new version on update', () => {
      const post = postModel.create({
        collection: 'blog',
        title: 'Original',
        body: 'Original body',
        userId: testUserId
      });

      postModel.update(post.id, { title: 'Updated' });

      const versions = postModel.getVersions(post.id);
      assert.strictEqual(versions.length, 2);
      assert.strictEqual(versions[0].version_number, 2);
      assert.strictEqual(versions[1].version_number, 1);
    });

    it('updates tags', () => {
      const post = postModel.create({
        collection: 'blog',
        title: 'Post',
        body: 'Body',
        userId: testUserId,
        tags: ['tag1']
      });

      const updated = postModel.update(post.id, {
        tags: ['tag2', 'tag3']
      });

      assert.strictEqual(updated.tags.length, 2);
      assert.ok(updated.tags.includes('tag2'));
      assert.ok(updated.tags.includes('tag3'));
    });

    it('throws error for non-existent post', () => {
      assert.throws(
        () => postModel.update('non-existent', { title: 'New' }),
        { message: /not found/i }
      );
    });
  });

  describe('publish', () => {
    it('publishes a post', () => {
      const post = postModel.create({
        collection: 'blog',
        title: 'Draft',
        body: 'Body',
        userId: testUserId
      });

      const published = postModel.publish(post.id);
      assert.strictEqual(published.status, 'published');
      assert.ok(published.publishedAt);
    });

    it('accepts custom publish timestamp', () => {
      const post = postModel.create({
        collection: 'blog',
        title: 'Draft',
        body: 'Body',
        userId: testUserId
      });

      const customDate = '2024-01-01T00:00:00.000Z';
      const published = postModel.publish(post.id, customDate);
      assert.strictEqual(published.publishedAt, customDate);
    });
  });

  describe('unpublish', () => {
    it('unpublishes a post', () => {
      const post = postModel.create({
        collection: 'blog',
        title: 'Published',
        body: 'Body',
        userId: testUserId
      });

      postModel.publish(post.id);
      const unpublished = postModel.unpublish(post.id);
      assert.strictEqual(unpublished.status, 'draft');
    });
  });

  describe('delete', () => {
    it('deletes a post', () => {
      const post = postModel.create({
        collection: 'blog',
        title: 'Delete Me',
        body: 'Body',
        userId: testUserId
      });

      postModel.delete(post.id);
      const found = postModel.findById(post.id);
      assert.strictEqual(found, null);
    });
  });
});
