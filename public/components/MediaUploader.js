import { html, useState, useEffect, useRef } from 'https://esm.sh/htm/preact/standalone';
import { api } from '../lib/api.js';

const PAGE_SIZE = 24;

export function MediaUploader() {
  const [media, setMedia] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [altDraft, setAltDraft] = useState('');
  const [toast, setToast] = useState(null);
  const fileInput = useRef(null);
  // Only the newest request may write to state. Without this a slow filtered
  // response can land after a cleared one and leave the grid showing results
  // that no longer match an empty search box.
  const requestId = useRef(0);

  useEffect(() => {
    // Debounced so typing a filename does not fire a request per keystroke.
    const timer = setTimeout(() => loadMedia(0, search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  async function loadMedia(nextOffset = 0, term = search) {
    const mine = ++requestId.current;
    setLoading(true);
    try {
      let data = await api.getMedia({ limit: PAGE_SIZE, offset: nextOffset, search: term });

      // Deleting the last item on the last page leaves an offset past the end,
      // which renders the empty state -- and the pagination controls live in the
      // non-empty branch, so there is no way back. Step back a page instead.
      if (data.media.length === 0 && nextOffset > 0 && data.total > 0) {
        nextOffset = Math.max(0, Math.min(nextOffset, data.total - 1) - ((data.total - 1) % PAGE_SIZE));
        data = await api.getMedia({ limit: PAGE_SIZE, offset: nextOffset, search: term });
      }

      if (mine !== requestId.current) return;
      setMedia(data.media);
      setTotal(data.total);
      setOffset(nextOffset);
    } catch (err) {
      if (mine === requestId.current) showToast(err.message, 'error');
    } finally {
      if (mine === requestId.current) setLoading(false);
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
      await loadMedia(0, search);
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
      showToast('Deleted');
      // Refetch rather than splice: the page is a window onto a larger set, and
      // dropping one row locally leaves the count and the page contents wrong.
      await loadMedia(offset, search);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function saveAlt(id) {
    try {
      const data = await api.updateMedia(id, { altText: altDraft });
      setMedia(prev => prev.map(m => (m.id === id ? data.media : m)));
      setEditingId(null);
      showToast('Alt text saved');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => showToast('URL copied'));
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return html`
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
        <h2>Media ${total > 0 && html`<span style="font-size: 14px; color: var(--text-muted)">(${total})</span>`}</h2>
        <label class="btn btn-primary" style="cursor: pointer">
          ${uploading ? 'Uploading...' : 'Upload'}
          <input ref=${fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
            multiple onChange=${handleUpload} style="display: none" disabled=${uploading} />
        </label>
      </div>

      <input type="text" value=${search} placeholder="Search filenames..."
        onInput=${e => setSearch(e.target.value)} style="width: 100%; margin-bottom: 12px" />

      ${loading ? html`<div class="loading">Loading media...</div>` : media.length === 0 ? html`
        <div class="empty-state">
          <h2>${search ? 'No matches' : 'No media yet'}</h2>
          <p>${search ? 'Try a different search.' : 'Upload images to use in your posts.'}</p>
        </div>
      ` : html`
        <div class="media-grid">
          ${media.map(m => html`
            <div class="media-item" key=${m.id}>
              ${/* Thumbnail, not the original: the grid used to pull full 2400px
                    images to draw small squares. */ ''}
              <img src=${m.thumbnailUrl} alt=${m.altText || m.originalFilename} loading="lazy" />
              <div class="media-info">
                <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                  ${m.originalFilename}
                </div>
                <div style="color: var(--text-muted); margin-top: 2px">
                  ${Math.round(m.sizeBytes / 1024)}KB${m.width ? ` · ${m.width}×${m.height}` : ''}
                </div>

                ${editingId === m.id ? html`
                  <div style="display: flex; gap: 4px; margin-top: 4px">
                    <input type="text" value=${altDraft} placeholder="Alt text"
                      onInput=${e => setAltDraft(e.target.value)}
                      onKeyDown=${e => { if (e.key === 'Enter') saveAlt(m.id); }}
                      style="flex: 1; font-size: 11px; min-height: 28px" />
                    <button class="btn btn-primary btn-sm" style="min-height: 28px; padding: 2px 6px; font-size: 11px"
                      onClick=${() => saveAlt(m.id)}>Save</button>
                  </div>
                ` : html`
                  <div style="color: ${m.altText ? 'var(--text-muted)' : 'var(--danger)'}; margin-top: 2px;
                              overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer"
                       onClick=${() => { setEditingId(m.id); setAltDraft(m.altText || ''); }}>
                    ${m.altText || 'No alt text'}
                  </div>
                `}

                <div style="display: flex; gap: 4px; margin-top: 4px">
                  <button class="btn btn-outline btn-sm" style="flex: 1; min-height: 28px; padding: 2px 6px; font-size: 11px"
                    onClick=${() => copyUrl(m.url)}>Copy URL</button>
                  <button class="btn btn-danger btn-sm" style="min-height: 28px; padding: 2px 6px; font-size: 11px"
                    onClick=${() => handleDelete(m.id)}>Delete</button>
                </div>
              </div>
            </div>
          `)}
        </div>

        ${pages > 1 && html`
          <div style="display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 16px">
            <button class="btn btn-outline btn-sm" disabled=${offset === 0}
              onClick=${() => loadMedia(offset - PAGE_SIZE)}>Previous</button>
            <span style="font-size: 13px; color: var(--text-muted)">Page ${page} of ${pages}</span>
            <button class="btn btn-outline btn-sm" disabled=${offset + PAGE_SIZE >= total}
              onClick=${() => loadMedia(offset + PAGE_SIZE)}>Next</button>
          </div>
        `}
      `}

      ${toast && html`<div class="toast toast-${toast.type}">${toast.message}</div>`}
    </div>
  `;
}
