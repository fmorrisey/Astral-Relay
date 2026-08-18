import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GitExporter } from '../../../src/exporters/GitExporter.js';
import config from '../../../src/config.js';

// Exercised against real repositories with a bare repo standing in for origin.
// The behaviour worth protecting here -- which ref gets pushed, what happens
// when the remote moved, what a post title is allowed to do -- only exists in
// git's actual responses, so stubbing it would test nothing.
describe('GitExporter', () => {
  let root, work, originPath, exporter, saved;

  const git = (args, cwd) =>
    execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();

  beforeEach(() => {
    saved = {
      gitSyncEnabled: config.gitSyncEnabled,
      gitBranch: config.gitBranch,
      gitSshKeyPath: config.gitSshKeyPath
    };
    config.gitSyncEnabled = true;
    config.gitBranch = 'production';
    config.gitSshKeyPath = '';

    root = mkdtempSync(join(tmpdir(), 'relay-git-'));
    originPath = join(root, 'origin.git');
    work = join(root, 'work');

    git(['init', '--bare', '-b', 'production', originPath], root);
    git(['clone', originPath, work], root);
    git(['config', 'user.email', 'test@example.com'], work);
    git(['config', 'user.name', 'Test'], work);

    mkdirSync(join(work, 'src/content/writing'), { recursive: true });
    mkdirSync(join(work, 'public/media'), { recursive: true });
    writeFileSync(join(work, 'README.md'), 'seed\n');
    git(['add', '-A'], work);
    git(['commit', '-m', 'seed'], work);
    git(['push', 'origin', 'HEAD:refs/heads/production'], work);

    exporter = new GitExporter(work);
  });

  afterEach(() => {
    Object.assign(config, saved);
    rmSync(root, { recursive: true, force: true });
  });

  const writePost = (slug = 'a-post') =>
    writeFileSync(join(work, 'src/content/writing', `${slug}.md`), `# ${slug}\n`);

  const originLog = () =>
    git(['log', '--format=%s', 'production'], originPath).split('\n').filter(Boolean);

  it('does nothing when git sync is disabled', async () => {
    config.gitSyncEnabled = false;
    writePost();

    const result = await exporter.commitAndPush('publish: A Post');

    assert.equal(result.synced, false);
    assert.equal(result.reason, 'git sync disabled');
    assert.deepEqual(originLog(), ['seed']);
  });

  it('reports no changes rather than failing when nothing was written', async () => {
    const result = await exporter.commitAndPush('publish: unchanged');

    assert.equal(result.synced, false);
    assert.equal(result.reason, 'no changes');
    assert.deepEqual(originLog(), ['seed']);
  });

  it('commits and pushes content to the configured branch', async () => {
    writePost();

    const result = await exporter.commitAndPush('publish: A Post');

    assert.equal(result.synced, true);
    assert.match(result.commit, /^[0-9a-f]{7,}$/);
    assert.deepEqual(originLog(), ['publish: A Post', 'seed']);
  });

  // The original pushed `config.gitBranch` as a ref name, which pushes the
  // local branch of that name -- not the commit just made. On a checkout sitting
  // on any other branch that silently published nothing.
  it('pushes the current commit even when HEAD is a differently named branch', async () => {
    git(['checkout', '-b', 'some-feature'], work);
    writePost();

    const result = await exporter.commitAndPush('publish: from a feature branch');

    assert.equal(result.synced, true);
    assert.deepEqual(originLog(), ['publish: from a feature branch', 'seed']);
  });

  // The commit message carries a user-supplied post title. Built into a shell
  // string, `$(...)` in a title would have been executed by the shell.
  it('treats shell metacharacters in the message as literal text', async () => {
    const marker = join(root, 'pwned');
    writePost();

    const result = await exporter.commitAndPush(`publish: $(touch ${marker}) \`id\``);

    assert.equal(result.synced, true);
    assert.equal(existsSync(marker), false, 'command substitution must not execute');
    assert.equal(originLog()[0], `publish: $(touch ${marker}) \`id\``);
  });

  it('stages only content and media, leaving other working-tree changes alone', async () => {
    writePost();
    writeFileSync(join(work, 'README.md'), 'edited by someone else\n');
    writeFileSync(join(work, 'astro.config.mjs'), '// not ours\n');

    await exporter.commitAndPush('publish: A Post');

    const changed = git(['show', '--name-only', '--format=', 'HEAD'], work)
      .split('\n').filter(Boolean);
    assert.deepEqual(changed, ['src/content/writing/a-post.md']);
    assert.match(git(['status', '--porcelain'], work), /README\.md/);
  });

  it('stages deletions so unpublishing reaches the branch', async () => {
    writePost();
    await exporter.commitAndPush('publish: A Post');

    rmSync(join(work, 'src/content/writing/a-post.md'));
    const result = await exporter.commitAndPush('unpublish: writing/a-post');

    assert.equal(result.synced, true);
    assert.equal(originLog()[0], 'unpublish: writing/a-post');
    assert.equal(
      git(['ls-tree', '--name-only', 'production', 'src/content/writing/'], originPath),
      ''
    );
  });

  // Without the retry, one commit made anywhere else on the branch would break
  // every subsequent publish until someone intervened on the host.
  it('rebases and retries when the remote has moved on', async () => {
    const other = join(root, 'other');
    git(['clone', originPath, other], root);
    git(['config', 'user.email', 'other@example.com'], other);
    git(['config', 'user.name', 'Other'], other);
    writeFileSync(join(other, 'outside.md'), 'from elsewhere\n');
    git(['add', '-A'], other);
    git(['commit', '-m', 'outside commit'], other);
    git(['push', 'origin', 'HEAD:refs/heads/production'], other);

    writePost();
    const result = await exporter.commitAndPush('publish: A Post');

    assert.equal(result.synced, true);
    assert.deepEqual(originLog(), ['publish: A Post', 'outside commit', 'seed']);
  });
});
