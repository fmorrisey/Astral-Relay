import { AstroExporter } from '../exporters/AstroExporter.js';
import { GitExporter } from '../exporters/GitExporter.js';
import logger from '../utils/logger.js';
import config from '../config.js';

export class ExportService {
  constructor({ workspacePath, collections }) {
    this.astroExporter = new AstroExporter({ workspaceRoot: workspacePath, collections });
    this.gitExporter = config.gitSyncEnabled ? new GitExporter(workspacePath) : null;
  }

  async publishPost(post, tags = [], media = []) {
    const result = await this.astroExporter.exportPost(post, tags, media);

    // Trigger webhook (non-blocking)
    if (config.webhookUrl) {
      this._triggerWebhook(post).catch(err => {
        logger.error({ error: err.message }, 'Webhook failed');
      });
    }

    // Git commit (non-blocking)
    if (this.gitExporter) {
      this.gitExporter.commitAndPush(`publish: ${post.title}`).catch(err => {
        logger.error({ error: err.message }, 'Git sync failed');
      });
    }

    return result;
  }

  async deletePost(post) {
    await this.astroExporter.deletePost(post);
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
