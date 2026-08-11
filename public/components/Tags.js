import { html, useState, useEffect } from 'https://esm.sh/htm/preact/standalone';
import { api } from '../lib/api.js';

// Matches the backend ordering so a newly created tag can be slotted into place
// without refetching. Tag.list() is ORDER BY name ASC under SQLite's default
// BINARY collation, which is case-sensitive -- localeCompare is not, and would
// put a new tag somewhere the next page load moves it away from.
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export function Tags() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadTags();
  }, []);

  // `silent` refetches without dropping into the full-page loading view, which
  // would unmount the toast that prompted the refetch before it could paint.
  async function loadTags({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await api.getTags();
      setTags(data.tags);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleCreate(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;

    setCreating(true);
    try {
      const data = await api.createTag({ name: trimmed });
      // Insert the tag the server returned rather than a locally-guessed one:
      // the slug is derived server-side, and duplicates are rejected with a 409.
      // Showing a provisional row first would mean rendering a tag that is about
      // to vanish every time someone re-adds an existing name.
      setTags(prev => [...prev, data.tag].sort(byName));
      setName('');
      showToast(`Created "${data.tag.name}"`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(tag) {
    setConfirmingId(null);
    try {
      await api.deleteTag(tag.id);
      setTags(prev => prev.filter(t => t.id !== tag.id));
      showToast(`Deleted "${tag.name}"`);
    } catch (err) {
      showToast(err.message, 'error');
      // The row may be gone server-side (404) or still there (500). Refetch so
      // the list reflects reality rather than an assumption about which --
      // silently, so the error toast above survives long enough to be read.
      loadTags({ silent: true });
    }
  }

  if (loading) {
    return html`<div class="loading">Loading tags...</div>`;
  }

  if (error) {
    return html`
      <div class="empty-state">
        <h2>Couldn't load tags</h2>
        <p>${error}</p>
        <button class="btn btn-primary" onClick=${() => loadTags()}>Retry</button>
      </div>
    `;
  }

  return html`
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
        <h2>Tags</h2>
      </div>

      <form class="card" style="margin-bottom: 16px" onSubmit=${handleCreate}>
        <div style="display: flex; gap: 8px">
          <input
            type="text"
            value=${name}
            onInput=${e => setName(e.target.value)}
            placeholder="New tag name"
            maxlength="50"
            disabled=${creating}
            style="flex: 1"
          />
          <button
            type="submit"
            class="btn btn-primary"
            disabled=${creating || !name.trim()}
          >
            ${creating ? 'Adding...' : 'Add'}
          </button>
        </div>
      </form>

      ${tags.length === 0 ? html`
        <div class="empty-state">
          <h2>No tags yet</h2>
          <p>Add one above, or tags will appear here as you use them on posts.</p>
        </div>
      ` : html`
        <div>
          ${tags.map(tag => html`
            <div class="card" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px" key=${tag.id}>
              <div style="flex: 1; min-width: 0">
                <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                  ${tag.name}
                </div>
                <div style="color: var(--text-muted); font-size: 13px; margin-top: 2px">
                  ${tag.postCount} ${tag.postCount === 1 ? 'post' : 'posts'}
                </div>
              </div>

              ${confirmingId === tag.id ? html`
                <div style="display: flex; align-items: center; gap: 6px">
                  <span style="font-size: 13px; color: var(--text-muted)">
                    ${tag.postCount > 0
                      // Deleting clears post_tags first, so the tag is stripped
                      // from posts rather than the delete being refused.
                      ? `Remove from ${tag.postCount} ${tag.postCount === 1 ? 'post' : 'posts'}?`
                      : 'Delete?'}
                  </span>
                  <button class="btn btn-danger btn-sm" onClick=${() => handleDelete(tag)}>Yes</button>
                  <button class="btn btn-outline btn-sm" onClick=${() => setConfirmingId(null)}>No</button>
                </div>
              ` : html`
                <button class="btn btn-outline btn-sm" onClick=${() => setConfirmingId(tag.id)}>Delete</button>
              `}
            </div>
          `)}
        </div>
      `}

      ${toast && html`
        <div class="toast toast-${toast.type}">${toast.message}</div>
      `}
    </div>
  `;
}
