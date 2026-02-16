import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TestDB } from '../../helpers/db.js';
import { User } from '../../../src/models/User.js';

describe('User model', () => {
  let db, userModel;

  beforeEach(async () => {
    db = new TestDB();
    userModel = new User(db);
  });

  describe('create', () => {
    it('creates a new user', () => {
      const user = userModel.create({
        username: 'testuser',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$testhash',
        displayName: 'Test User',
        email: 'test@example.com'
      });

      assert.ok(user.id);
      assert.strictEqual(user.username, 'testuser');
      assert.strictEqual(user.displayName, 'Test User');
      assert.strictEqual(user.email, 'test@example.com');
      assert.ok(user.createdAt);
    });

    it('creates user without optional fields', () => {
      const user = userModel.create({
        username: 'minimal',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$testhash'
      });

      assert.ok(user.id);
      assert.strictEqual(user.username, 'minimal');
      assert.strictEqual(user.displayName, null);
      assert.strictEqual(user.email, null);
    });

    it('does not expose password hash in returned user', () => {
      const user = userModel.create({
        username: 'testuser',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$testhash'
      });

      assert.strictEqual(user.passwordHash, undefined);
      assert.strictEqual(user.password_hash, undefined);
    });
  });

  describe('findById', () => {
    it('finds user by id', () => {
      const created = userModel.create({
        username: 'findme',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$testhash'
      });

      const found = userModel.findById(created.id);
      assert.strictEqual(found.id, created.id);
      assert.strictEqual(found.username, 'findme');
    });

    it('returns null for non-existent user', () => {
      const found = userModel.findById(99999);
      assert.strictEqual(found, null);
    });

    it('does not expose password hash', () => {
      const created = userModel.create({
        username: 'testuser',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$testhash'
      });

      const found = userModel.findById(created.id);
      assert.strictEqual(found.passwordHash, undefined);
      assert.strictEqual(found.password_hash, undefined);
    });
  });

  describe('findByUsername', () => {
    it('finds user by username', () => {
      userModel.create({
        username: 'john',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$testhash'
      });

      const found = userModel.findByUsername('john');
      assert.ok(found);
      assert.strictEqual(found.username, 'john');
    });

    it('returns undefined for non-existent username', () => {
      const found = userModel.findByUsername('nonexistent');
      assert.strictEqual(found, undefined);
    });

    it('exposes password hash for authentication', () => {
      userModel.create({
        username: 'testuser',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$testhash'
      });

      const found = userModel.findByUsername('testuser');
      assert.ok(found.password_hash);
    });
  });

  describe('updateLastLogin', () => {
    it('updates last login timestamp', () => {
      const user = userModel.create({
        username: 'testuser',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$testhash'
      });

      assert.strictEqual(user.lastLogin, null);

      userModel.updateLastLogin(user.id);
      const updated = userModel.findById(user.id);
      assert.ok(updated.lastLogin);
    });
  });

  describe('count', () => {
    it('returns 0 when no users exist', () => {
      assert.strictEqual(userModel.count(), 0);
    });

    it('returns correct count', () => {
      userModel.create({
        username: 'user1',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$testhash'
      });
      userModel.create({
        username: 'user2',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$testhash'
      });

      assert.strictEqual(userModel.count(), 2);
    });
  });
});
