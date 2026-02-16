import { html } from 'https://esm.sh/htm/preact/standalone';
import { useState, useEffect, useRef } from 'https://esm.sh/preact/hooks';
import { api } from '../lib/api.js';

export function PostEditor({ postId }) {
  const [post, setPost] = useState({
    collection: 'blog',
    title: '',
    body: '',
    summary: '',
    tags: []
  });
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(!!postId);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const autoSaveTimer = useRef(null);
  const isNew = !postId;

  useEffect(() => {
    if (postId) {
      loadPost();
    }
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [postId]);

  async function loadPost() {
    try {
      const data = await api.getPost(postId);
      setPost(data.post);
    } catch (err) {
      showToast('Failed to load post', 'error');
    } finally {
      setLoading(false);
    }
  }

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleChange(field, value) {
    setPost(prev => ({ ...prev, [field]: value }));

    // Autosave for existing posts
    if (!isNew) {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => handleSave(true), 3000);
    }
  }

  async function handleSave(auto = false) {
    setSaving(true);
    try {
      if (isNew) {
        const data = await api.createPost({
          collection: post.collection,
          title: post.title,
          body: post.body,
          summary: post.summary,
          tags: post.tags
        });
        window.location.hash = `#/posts/${data.post.id}`;
        showToast('Post created');
      } else {
        await api.updatePost(postId, {
          title: post.title,
          body: post.body,
          summary: post.summary,
          tags: post.tags
        });
        if (!auto) showToast('Saved');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    try {
      if (isNew) {
        await handleSave();
        return;
      }
      await api.publishPost(postId);
      await loadPost();
      showToast('Published');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleUnpublish() {
    try {
      await api.unpublishPost(postId);
      await loadPost();
      showToast('Unpublished');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    try {
      await api.deletePost(postId);
      window.location.hash = '#/';
      showToast('Post deleted');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function addTag() {
    const tag = tagInput.trim();
    if (tag && !post.tags.includes(tag)) {
      setPost(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput('');
    }
  }

  function removeTag(tag) {
    setPost(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  }

  if (loading) {
    return html`<div class="loading">Loading...</div>`;
  }

  return html`
    <div class="container editor-container">
      <div style="margin-bottom: 16px">
        <a href="#/" style="font-size: 14px; color: var(--text-muted)">Back to posts</a>
      </div>

      <div class="form-group">
        <label>Collection</label>
        <select
          value=${post.collection}
          onInput=${(e) => handleChange('collection', e.target.value)}
          disabled=${!isNew}
        >
          <option value="blog">Blog</option>
          <option value="photos">Photos</option>
          <option value="adventures">Adventures</option>
          <option value="portfolio">Portfolio</option>
        </select>
      </div>

      <div class="form-group">
        <label>Title</label>
        <input
          type="text"
          value=${post.title}
          onInput=${(e) => handleChange('title', e.target.value)}
          placeholder="Post title"
        />
      </div>

      <div class="form-group">
        <label>Summary</label>
        <input
          type="text"
          value=${post.summary || ''}
          onInput=${(e) => handleChange('summary', e.target.value)}
          placeholder="Brief summary (optional)"
        />
      </div>

      <div class="form-group">
        <label>Content (Markdown)</label>
        <textarea
          value=${post.body}
          onInput=${(e) => handleChange('body', e.target.value)}
          placeholder="Write your post in Markdown..."
          style="min-height: 300px"
        ></textarea>
      </div>

      <div class="form-group">
        <label>Tags</label>
        <div style="display: flex; gap: 8px; margin-bottom: 8px">
          <input
            type="text"
            value=${tagInput}
            onInput=${(e) => setTagInput(e.target.value)}
            onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="Add tag..."
            style="flex: 1"
          />
          <button class="btn btn-outline" type="button" onClick=${addTag}>Add</button>
        </div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap">
          ${(post.tags || []).map(tag => html`
            <span key=${tag} style="background: var(--bg); padding: 4px 10px; border-radius: 12px; font-size: 13px; display: inline-flex; align-items: center; gap: 4px">
              ${tag}
              <button onClick=${() => removeTag(tag)} style="border: none; background: none; cursor: pointer; font-size: 16px; padding: 0; line-height: 1; color: var(--text-muted)">x</button>
            </span>
          `)}
        </div>
      </div>

      <div class="action-bar">
        ${!isNew && html`
          <button class="btn btn-danger btn-sm" onClick=${handleDelete}>Delete</button>
        `}
        <div style="flex: 1"></div>
        ${!isNew && post.status === 'published' && html`
          <button class="btn btn-outline" onClick=${handleUnpublish}>Unpublish</button>
        `}
        <button class="btn btn-outline" onClick=${() => handleSave(false)} disabled=${saving}>
          ${saving ? 'Saving...' : 'Save Draft'}
        </button>
        ${post.status !== 'published' && html`
          <button class="btn btn-success" onClick=${handlePublish}>Publish</button>
        `}
      </div>

      ${toast && html`
        <div class="toast toast-${toast.type}">${toast.message}</div>
      `}
    </div>
  `;
}
