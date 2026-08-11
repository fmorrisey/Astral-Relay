import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { AstroExporter } from '../../../src/exporters/AstroExporter.js';

describe('AstroExporter', () => {
  let root, exporter;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'relay-export-'));
    mkdirSync(join(root, 'src/content/writing'), { recursive: true });
    exporter = new AstroExporter({ workspaceRoot: root, collections: ['writing'] });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const post = (over = {}) => ({
    title: 'Hello World',
    slug: 'hello-world',
    collection: 'writing',
    body: 'Body text.',
    summary: 'A summary.',
    status: 'published',
    published_at: '2020-09-11',
    created_at: '2020-09-11',
    ...over
  });

  function fileAt(slug = 'hello-world') {
    return join(root, 'src/content/writing', `${slug}.md`);
  }

  function frontmatterOf(slug = 'hello-world') {
    const raw = readFileSync(fileAt(slug), 'utf-8');
    return yaml.load(raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
  }

  function writeExisting(frontmatter, body = 'Old body.') {
    writeFileSync(fileAt(), `---\n${yaml.dump(frontmatter)}---\n\n${body}\n`);
  }

  it('writes the CMS-owned fields for a new file', async () => {
    await exporter.exportPost(post(), [{ name: 'Career' }]);

    const fm = frontmatterOf();
    assert.strictEqual(fm.title, 'Hello World');
    assert.deepStrictEqual(fm.tags, ['Career']);
    assert.strictEqual(fm.published, true);
    assert.strictEqual(fm.summary, 'A summary.');
  });

  describe('overwriting an existing entry', () => {
    // The real shape this is protecting: a site whose schema defines far more
    // than the CMS models, with every extra key optional -- so dropping them
    // still builds green and silently renders a degraded page.
    const rich = {
      title: 'Old Title',
      date: '2020-09-11',
      published: true,
      summary: 'Old summary.',
      tags: ['Career'],
      heroImage: '/media/hero.jpg',
      coverImage: '/media/cover.jpg',
      heroSubtitle: 'A subtitle',
      featured: true,
      ctaLabel: 'Read on',
      gallery: [{ src: '/media/a.jpg', alt: 'A' }],
      tech: ['astro', 'node'],
      links: { repo: 'https://example.com/repo' }
    };

    it('preserves every key the CMS does not model', async () => {
      writeExisting(rich);

      await exporter.exportPost(post(), [{ name: 'Career' }]);

      const fm = frontmatterOf();
      assert.strictEqual(fm.heroImage, '/media/hero.jpg');
      assert.strictEqual(fm.coverImage, '/media/cover.jpg');
      assert.strictEqual(fm.heroSubtitle, 'A subtitle');
      assert.strictEqual(fm.featured, true);
      assert.strictEqual(fm.ctaLabel, 'Read on');
      assert.deepStrictEqual(fm.gallery, [{ src: '/media/a.jpg', alt: 'A' }]);
      assert.deepStrictEqual(fm.tech, ['astro', 'node']);
      assert.deepStrictEqual(fm.links, { repo: 'https://example.com/repo' });
    });

    it('still updates the fields it does own', async () => {
      writeExisting(rich);

      await exporter.exportPost(post({ title: 'New Title', summary: 'New summary.' }), [
        { name: 'Development' }
      ]);

      const fm = frontmatterOf();
      assert.strictEqual(fm.title, 'New Title');
      assert.strictEqual(fm.summary, 'New summary.');
      assert.deepStrictEqual(fm.tags, ['Development']);
    });

    it('leaves description alone, since the CMS does not model it', async () => {
      writeExisting({ ...rich, description: 'Hand-written meta description.' });

      await exporter.exportPost(post({ summary: 'New summary.' }), []);

      const fm = frontmatterOf();
      assert.strictEqual(fm.description, 'Hand-written meta description.');
      assert.strictEqual(fm.summary, 'New summary.');
    });

    it('round-trips without drift', async () => {
      writeExisting(rich);

      await exporter.exportPost(post(), [{ name: 'Career' }]);
      const first = readFileSync(fileAt(), 'utf-8');
      await exporter.exportPost(post(), [{ name: 'Career' }]);
      const second = readFileSync(fileAt(), 'utf-8');

      assert.strictEqual(first, second);
    });

    it('replaces the body rather than appending to it', async () => {
      writeExisting(rich, 'Old body that must not survive.');

      await exporter.exportPost(post({ body: 'Fresh body.' }), []);

      const raw = readFileSync(fileAt(), 'utf-8');
      assert.ok(raw.includes('Fresh body.'));
      assert.ok(!raw.includes('Old body that must not survive.'));
    });
  });

  describe('when the existing file cannot be parsed', () => {
    it('refuses to overwrite rather than discarding its keys', async () => {
      writeFileSync(fileAt(), '---\ntitle: "unterminated\n  bad: [1, 2\n---\n\nBody.\n');

      await assert.rejects(
        () => exporter.exportPost(post(), []),
        /Refusing to overwrite/
      );

      // The original file must still be intact.
      assert.ok(readFileSync(fileAt(), 'utf-8').includes('unterminated'));
    });

    it('treats a file with no frontmatter as having none', async () => {
      writeFileSync(fileAt(), 'Just a body, no frontmatter.\n');

      await exporter.exportPost(post(), []);

      assert.strictEqual(frontmatterOf().title, 'Hello World');
    });
  });
});
