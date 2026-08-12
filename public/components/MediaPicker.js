import { html, useState, useEffect } from 'https://esm.sh/htm/preact/standalone';
import { api } from '../lib/api.js';

/**
 * Modal image chooser. Loads the library once when opened.
 *
 * Kept separate from MediaUploader: that one manages the library, this one picks
 * from it. Sharing a component would mean a delete button inside a picker.
 */
const PAGE_SIZE = 24;

export function MediaPicker({ onSelect, onCancel, title = 'Choose an image' }) {
  const [media, setMedia] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => load(0, search, false), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Paged and searchable. Loading one unpaginated page meant anything older
  // than the 50 most recent images could not be attached to a post at all.
  async function load(offset = 0, term = search, append = false) {
    setLoading(true);
    setError('');
    try {
      const data = await api.getMedia({ limit: PAGE_SIZE, offset, search: term });
      setMedia(prev => (append ? [...prev, ...data.media] : data.media));
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return html`
    <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100;
                display: flex; align-items: center; justify-content: center; padding: 16px"
         onClick=${onCancel}>
      <div class="card" style="max-width: 720px; width: 100%; max-height: 80vh; overflow-y: auto"
           onClick=${e => e.stopPropagation()}>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
          <h3>${title}</h3>
          <button class="btn btn-outline btn-sm" onClick=${onCancel}>Close</button>
        </div>

        <input type="text" value=${search} placeholder="Search filenames..."
          onInput=${e => setSearch(e.target.value)} style="width: 100%; margin-bottom: 12px" />

        ${loading && html`<div class="loading">Loading images...</div>`}
        ${error && html`<div class="error">${error}</div>`}

        ${!loading && !error && media.length === 0 && html`
          <div class="empty-state">
            <h2>No images yet</h2>
            <p>Upload some from the Media tab first.</p>
          </div>
        `}

        <div class="media-grid">
          ${media.map(m => html`
            <div class="media-item" key=${m.id} style="cursor: pointer"
                 onClick=${() => onSelect(m)}>
              <img src=${m.url} alt=${m.altText || m.originalFilename} loading="lazy" />
              <div class="media-info">
                <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                  ${m.originalFilename}
                </div>
                <div style="color: var(--text-muted)">${m.width}×${m.height}</div>
              </div>
            </div>
          `)}
        </div>

        ${media.length < total && html`
          <button class="btn btn-outline" style="width: 100%; margin-top: 12px" disabled=${loading}
            onClick=${() => load(media.length, search, true)}>
            Load more (${media.length} of ${total})
          </button>
        `}
      </div>
    </div>
  `;
}
