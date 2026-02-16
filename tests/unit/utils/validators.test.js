import { describe, it } from 'node:test';
import assert from 'node:assert';
import { schemas, validate } from '../../../src/utils/validators.js';

describe('validators - createPost schema', () => {
  it('validates correct post data', () => {
    const data = {
      collection: 'blog',
      title: 'Test Post',
      body: 'This is the body',
      summary: 'A summary'
    };
    const result = validate(schemas.createPost, data);
    assert.deepStrictEqual(result, data);
  });

  it('requires collection field', () => {
    const data = {
      title: 'Test Post',
      body: 'This is the body'
    };
    assert.throws(() => validate(schemas.createPost, data), {
      message: /collection.*required/i
    });
  });

  it('requires title field', () => {
    const data = {
      collection: 'blog',
      body: 'This is the body'
    };
    assert.throws(() => validate(schemas.createPost, data), {
      message: /title.*required/i
    });
  });

  it('requires body field', () => {
    const data = {
      collection: 'blog',
      title: 'Test Post'
    };
    assert.throws(() => validate(schemas.createPost, data), {
      message: /body.*required/i
    });
  });

  it('rejects collection longer than 30 characters', () => {
    const data = {
      collection: 'a'.repeat(31),
      title: 'Test Post',
      body: 'Body'
    };
    assert.throws(() => validate(schemas.createPost, data), {
      message: /collection/i
    });
  });

  it('rejects title longer than 200 characters', () => {
    const data = {
      collection: 'blog',
      title: 'a'.repeat(201),
      body: 'Body'
    };
    assert.throws(() => validate(schemas.createPost, data), {
      message: /title/i
    });
  });

  it('accepts optional summary', () => {
    const data = {
      collection: 'blog',
      title: 'Test Post',
      body: 'Body',
      summary: 'A summary'
    };
    const result = validate(schemas.createPost, data);
    assert.strictEqual(result.summary, 'A summary');
  });

  it('accepts optional tags array', () => {
    const data = {
      collection: 'blog',
      title: 'Test Post',
      body: 'Body',
      tags: ['tag1', 'tag2']
    };
    const result = validate(schemas.createPost, data);
    assert.deepStrictEqual(result.tags, ['tag1', 'tag2']);
  });

  it('rejects more than 10 tags', () => {
    const data = {
      collection: 'blog',
      title: 'Test Post',
      body: 'Body',
      tags: Array(11).fill('tag')
    };
    assert.throws(() => validate(schemas.createPost, data), {
      message: /tags/i
    });
  });
});

describe('validators - updatePost schema', () => {
  it('accepts partial updates', () => {
    const data = { title: 'Updated Title' };
    const result = validate(schemas.updatePost, data);
    assert.strictEqual(result.title, 'Updated Title');
  });

  it('accepts slug updates', () => {
    const data = { slug: 'new-slug' };
    const result = validate(schemas.updatePost, data);
    assert.strictEqual(result.slug, 'new-slug');
  });

  it('rejects empty updates', () => {
    const data = {};
    const result = validate(schemas.updatePost, data);
    assert.deepStrictEqual(result, {});
  });
});

describe('validators - login schema', () => {
  it('validates correct login data', () => {
    const data = {
      username: 'testuser',
      password: 'password123'
    };
    const result = validate(schemas.login, data);
    assert.deepStrictEqual(result, data);
  });

  it('requires username', () => {
    const data = { password: 'password123' };
    assert.throws(() => validate(schemas.login, data), {
      message: /username.*required/i
    });
  });

  it('requires password', () => {
    const data = { username: 'testuser' };
    assert.throws(() => validate(schemas.login, data), {
      message: /password.*required/i
    });
  });

  it('rejects username shorter than 3 characters', () => {
    const data = {
      username: 'ab',
      password: 'password123'
    };
    assert.throws(() => validate(schemas.login, data), {
      message: /username/i
    });
  });

  it('rejects password shorter than 8 characters', () => {
    const data = {
      username: 'testuser',
      password: 'pass'
    };
    assert.throws(() => validate(schemas.login, data), {
      message: /password/i
    });
  });

  it('rejects non-alphanumeric username', () => {
    const data = {
      username: 'test@user',
      password: 'password123'
    };
    assert.throws(() => validate(schemas.login, data), {
      message: /username/i
    });
  });
});

describe('validators - setup schema', () => {
  it('validates correct setup data', () => {
    const data = {
      username: 'admin',
      password: 'password123'
    };
    const result = validate(schemas.setup, data);
    assert.strictEqual(result.username, 'admin');
    assert.strictEqual(result.password, 'password123');
  });

  it('accepts optional displayName', () => {
    const data = {
      username: 'admin',
      password: 'password123',
      displayName: 'Administrator'
    };
    const result = validate(schemas.setup, data);
    assert.strictEqual(result.displayName, 'Administrator');
  });

  it('accepts optional collections', () => {
    const data = {
      username: 'admin',
      password: 'password123',
      collections: ['blog', 'docs']
    };
    const result = validate(schemas.setup, data);
    assert.deepStrictEqual(result.collections, ['blog', 'docs']);
  });

  it('accepts optional webhook config', () => {
    const data = {
      username: 'admin',
      password: 'password123',
      webhook: {
        enabled: true,
        url: 'https://example.com/webhook'
      }
    };
    const result = validate(schemas.setup, data);
    assert.strictEqual(result.webhook.enabled, true);
    assert.strictEqual(result.webhook.url, 'https://example.com/webhook');
  });
});

describe('validators - createTag schema', () => {
  it('validates correct tag data', () => {
    const data = { name: 'javascript' };
    const result = validate(schemas.createTag, data);
    assert.strictEqual(result.name, 'javascript');
  });

  it('requires name field', () => {
    const data = {};
    assert.throws(() => validate(schemas.createTag, data), {
      message: /name.*required/i
    });
  });

  it('rejects empty name', () => {
    const data = { name: '' };
    assert.throws(() => validate(schemas.createTag, data), {
      message: /name/i
    });
  });

  it('rejects name longer than 50 characters', () => {
    const data = { name: 'a'.repeat(51) };
    assert.throws(() => validate(schemas.createTag, data), {
      message: /name/i
    });
  });
});
