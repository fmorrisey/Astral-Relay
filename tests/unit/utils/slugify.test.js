import { describe, it } from 'node:test';
import assert from 'node:assert';
import { slugify } from '../../../src/utils/slugify.js';

describe('slugify', () => {
  it('converts basic text to slug', () => {
    assert.strictEqual(slugify('Hello World'), 'hello-world');
  });

  it('converts multiple spaces to single dash', () => {
    assert.strictEqual(slugify('Hello    World'), 'hello-world');
  });

  it('removes special characters', () => {
    assert.strictEqual(slugify('Hello@World!'), 'helloworld');
  });

  it('handles mixed special characters and spaces', () => {
    assert.strictEqual(slugify('Hello @ World!'), 'hello-world');
  });

  it('trims leading and trailing spaces', () => {
    assert.strictEqual(slugify('  Hello World  '), 'hello-world');
  });

  it('removes leading dashes', () => {
    assert.strictEqual(slugify('---Hello World'), 'hello-world');
  });

  it('removes trailing dashes', () => {
    assert.strictEqual(slugify('Hello World---'), 'hello-world');
  });

  it('handles empty string', () => {
    assert.strictEqual(slugify(''), '');
  });

  it('handles numbers', () => {
    assert.strictEqual(slugify('Post 123'), 'post-123');
  });

  it('handles underscores', () => {
    assert.strictEqual(slugify('hello_world'), 'hello_world');
  });

  it('handles dashes in input', () => {
    assert.strictEqual(slugify('hello-world'), 'hello-world');
  });

  it('collapses multiple dashes', () => {
    assert.strictEqual(slugify('hello--world'), 'hello-world');
  });

  it('handles unicode characters by removing them', () => {
    assert.strictEqual(slugify('hello 世界'), 'hello');
  });

  it('handles mixed case', () => {
    assert.strictEqual(slugify('HeLLo WoRLd'), 'hello-world');
  });
});
