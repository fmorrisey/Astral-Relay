import { AstroExporter } from '../exporters/AstroExporter.js';
import { GitExporter } from '../exporters/GitExporter.js';
import logger from '../utils/logger.js';
import config from '../config.js';

export class ExportService {
  constructor({ workspacePath, collections }) {
    this.astroExporter = new AstroExporter({ workspaceRoot: workspacePath, collections });
    this.gitExporter = config.gitSyncEnabled ? new GitExporter(workspacePath) : null;
  }

  async publishPost(post, tags = [], media = null) {
    const result = await this.astroExporter.exportPost(post, tags, media);

    // Trigger webhook (non-blocking)
    if (config.webhookUrl) {
      this._triggerWebhook(post).catch(err => {
        logger.error({ error: err.message }, 'Webhook failed');
      });
    }

    const sync = await this._sync(`publish: ${post.title}`);

    return { ...result, sync };
  }

  async deletePost(post) {
    await this.astroExporter.deletePost(post);

    // Deleting used to stop at the filesystem. With the site built from the
    // branch this pushes to, that left the post live: the file was gone here
    // and still present in the last commit anyone deployed.
    const sync = await this._sync(`unpublish: ${post.collection}/${post.slug}`);

    return { sync };
  }

  /**
   * Push content to the branch the site is built from.
   *
   * Awaited rather than fire-and-forget, and the outcome is returned rather
   * than only logged. A publish that writes the file but fails to push has not
   * reached the site, and reporting that as success is how a post comes to say
   * "published" while nobody can read it.
   *
   * It still does not throw: the post is genuinely published as far as this
   * application's own state goes, so the caller decides how loud to be.
   */
  async _sync(message) {
    if (!this.gitExporter) return { synced: false, reason: 'git sync disabled' };

    try {
      return await this.gitExporter.commitAndPush(message);
    } catch (err) {
      logger.error({ error: err.message, message }, 'Git sync failed');
      return { synced: false, error: err.message };
    }
  }

  async _triggerWebhook(post) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.webhookTimeout);

    try {
      await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'post.published',
          post: { id: post.id, title: post.title, collection: post.collection, slug: post.slug }
        }),
        signal: controller.signal
      });
      logger.info({ postId: post.id }, 'Webhook triggered');
    } finally {
      clearTimeout(timeout);
    }
  }
}
