import { execFile } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import config from '../config.js';

const execFileAsync = promisify(execFile);

// Paths this exporter is allowed to stage. Anything else in the workspace --
// site source, config, lockfiles -- belongs to whoever is editing the site, not
// to the CMS, and must never be swept into a publish commit.
const TRACKED_PATHS = ['src/content', 'public/media'];

export class GitExporter {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
  }

  // execFile, not exec: no shell is involved, so a post title containing $(...)
  // or backticks is passed to git as literal text rather than evaluated. With
  // exec + a string this was command injection through the title field.
  async _git(args) {
    const env = { ...process.env };

    // The publishing checkout pushes as a deploy key scoped to the site repo,
    // not as whoever's credentials happen to be on the host.
    if (config.gitSshKeyPath) {
      env.GIT_SSH_COMMAND =
        `ssh -i ${config.gitSshKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;
    }

    return execFileAsync('git', args, { cwd: this.workspacePath, env });
  }

  async _push() {
    // HEAD:refs/heads/<branch>, not just <branch>. `git push origin main` pushes
    // the local ref called main -- which, if the checkout is on any other
    // branch, is not the commit just made. That pushes nothing and reports
    // success.
    await this._git(['push', 'origin', `HEAD:refs/heads/${config.gitBranch}`]);
  }

  /**
   * Stage, commit and push content changes.
   *
   * Returns {synced, reason?, commit?} rather than throwing on "nothing to do",
   * so callers can tell an empty publish apart from a failed one.
   */
  async commitAndPush(message) {
    if (!config.gitSyncEnabled) return { synced: false, reason: 'git sync disabled' };

    await this._git(['add', '--', ...TRACKED_PATHS]);

    // `git commit` exits non-zero when there is nothing staged, which is a
    // normal outcome here: re-publishing an unchanged post writes an identical
    // file. Check first so that case stays distinguishable from a real failure.
    const { stdout: staged } = await this._git(['diff', '--cached', '--name-only']);
    if (!staged.trim()) {
      logger.info({ message }, 'Git sync: no content changes to commit');
      return { synced: false, reason: 'no changes' };
    }

    await this._git(['commit', '-m', message]);

    try {
      await this._push();
    } catch (error) {
      // The remote moved -- someone committed to the branch between our last
      // fetch and this push. Rebase onto it and retry once. Without this a
      // single outside commit would break every subsequent publish until
      // someone intervened on the host.
      logger.warn({ error: error.message }, 'Git push rejected; rebasing and retrying');

      await this._git(['fetch', 'origin', config.gitBranch]);
      try {
        await this._git(['rebase', `origin/${config.gitBranch}`]);
      } catch (rebaseError) {
        // Leaving a half-finished rebase behind would wedge every later publish.
        await this._git(['rebase', '--abort']).catch(() => {});
        throw new Error(`rebase onto origin/${config.gitBranch} failed: ${rebaseError.message}`);
      }
      await this._push();
    }

    const { stdout: sha } = await this._git(['rev-parse', '--short', 'HEAD']);
    const commit = sha.trim();

    logger.info({ message, commit, branch: config.gitBranch }, 'Git sync: pushed');
    return { synced: true, commit };
  }
}
