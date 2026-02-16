import { html } from 'https://esm.sh/htm/preact/standalone';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';
import { api } from '../lib/api.js';

export function PostList() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadPosts();
  }, [filter]);

  async function loadPosts() {
    setLoading(true);
    try {
      const params = { limit: 50 };
      if (filter !== 'all') params.status = filter;
      const data = await api.getPosts(params);
      setPosts(data.posts);
    } catch (err) {
      console.error('Failed to load posts:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return html`<div class="loading">Loading posts...</div>`;
  }

  return html`
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
        <h2>Posts</h2>
        <a href="#/posts/new" class="btn btn-primary">New Post</a>
      </div>

      <div class="tabs">
        <button class="tab ${filter === 'all' ? 'active' : ''}" onClick=${() => setFilter('all')}>All</button>
        <button class="tab ${filter === 'draft' ? 'active' : ''}" onClick=${() => setFilter('draft')}>Drafts</button>
        <button class="tab ${filter === 'published' ? 'active' : ''}" onClick=${() => setFilter('published')}>Published</button>
      </div>

      ${posts.length === 0 ? html`
        <div class="empty-state">
          <h2>No posts yet</h2>
          <p>Create your first post to get started.</p>
        </div>
      ` : html`
        <div class="post-list">
          ${posts.map(post => html`
            <a href="#/posts/${post.id}" class="post-card" key=${post.id}>
              <h3>${post.title}</h3>
              <p class="meta">
                <span class="status-badge status-${post.status}">${post.status}</span>
                ${' '} ${post.collection}
                ${' '} ${new Date(post.updatedAt).toLocaleDateString()}
              </p>
              ${post.tags?.length > 0 && html`
                <p class="meta" style="margin-top: 4px">
                  ${post.tags.join(', ')}
                </p>
              `}
            </a>
          `)}
        </div>
      `}
    </div>
  `;
}
