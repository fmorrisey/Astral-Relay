import { html } from 'https://esm.sh/htm/preact/standalone';
import { useState, useEffect, useRef } from 'https://esm.sh/preact/hooks';
import { api } from '../lib/api.js';

export function MediaUploader() {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    loadMedia();
  }, []);

  async function loadMedia() {
    try {
      const data = await api.getMedia();
      setMedia(data.media);
    } catch (err) {
      console.error('Failed to load media:', err);
    } finally {
      setLoading(false);
    }
  }

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        await api.uploadMedia(file);
      }
      showToast(`${files.length} file(s) uploaded`);
      await loadMedia();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this media file?')) return;
    try {
      await api.deleteMedia(id);
      setMedia(prev => prev.filter(m => m.id !== id));
      showToast('Deleted');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('URL copied');
    });
  }

  if (loading) {
    return html`<div class="loading">Loading media...</div>`;
  }

  return html`
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
        <h2>Media</h2>
        <label class="btn btn-primary" style="cursor: pointer">
          ${uploading ? 'Uploading...' : 'Upload'}
          <input
            ref=${fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange=${handleUpload}
            style="display: none"
            disabled=${uploading}
          />
        </label>
      </div>

      ${media.length === 0 ? html`
        <div class="empty-state">
          <h2>No media yet</h2>
          <p>Upload images to use in your posts.</p>
        </div>
      ` : html`
        <div class="media-grid">
          ${media.map(m => html`
            <div class="media-item" key=${m.id}>
              <img src=${m.url} alt=${m.altText || m.originalFilename} loading="lazy" />
              <div class="media-info">
                <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                  ${m.originalFilename}
                </div>
                <div style="color: var(--text-muted); margin-top: 2px">
                  ${Math.round(m.sizeBytes / 1024)}KB
                  ${m.width ? ` - ${m.width}x${m.height}` : ''}
                </div>
                <div style="display: flex; gap: 4px; margin-top: 4px">
                  <button class="btn btn-outline btn-sm" style="flex: 1; min-height: 28px; padding: 2px 6px; font-size: 11px" onClick=${() => copyUrl(m.url)}>
                    Copy URL
                  </button>
                  <button class="btn btn-danger btn-sm" style="min-height: 28px; padding: 2px 6px; font-size: 11px" onClick=${() => handleDelete(m.id)}>
                    Delete
                  </button>
                </div>
              </div>
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
