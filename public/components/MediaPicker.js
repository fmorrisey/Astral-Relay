import { html, useState, useEffect } from 'https://esm.sh/htm/preact/standalone';
import { api } from '../lib/api.js';

/**
 * Modal image chooser. Loads the library once when opened.
 *
 * Kept separate from MediaUploader: that one manages the library, this one picks
 * from it. Sharing a component would mean a delete button inside a picker.
 */
export function MediaPicker({ onSelect, onCancel, title = 'Choose an image' }) {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.getMedia();
      setMedia(data.media);
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
      </div>
    </div>
  `;
}
