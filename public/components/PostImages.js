import { html, useState, useEffect } from 'https://esm.sh/htm/preact/standalone';
import { api } from '../lib/api.js';
import { MediaPicker } from './MediaPicker.js';

/**
 * Hero, cover and gallery for one post.
 *
 * Saves on every change rather than behind a button: these are associations,
 * not text being drafted, and a half-built gallery lost to a navigation is a
 * worse failure than an extra request.
 *
 * Only rendered for a saved post -- associations need a post id to hang from.
 */
export function PostImages({ postId, onToast }) {
  const [media, setMedia] = useState({ hero: null, cover: null, gallery: [] });
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(null); // 'hero' | 'cover' | 'gallery'
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [postId]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getPostMedia(postId);
      setMedia(data.media);
    } catch (err) {
      onToast?.(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function save(next) {
    setSaving(true);
    try {
      const data = await api.setPostMedia(postId, {
        heroMediaId: next.hero?.id ?? null,
        coverMediaId: next.cover?.id ?? null,
        gallery: next.gallery.map(g => ({ mediaId: g.id, alt: g.alt || '' }))
      });
      // Take the server's version: it resolves alt fallbacks and ordering, and
      // guessing them here is how the two drift apart.
      setMedia(data.media);
    } catch (err) {
      onToast?.(err.message, 'error');
      load();
    } finally {
      setSaving(false);
    }
  }

  function handlePick(image) {
    const slot = picking;
    setPicking(null);
    if (slot === 'gallery') {
      if (media.gallery.some(g => g.id === image.id)) {
        onToast?.('Already in the gallery', 'error');
        return;
      }
      save({ ...media, gallery: [...media.gallery, { ...image, alt: image.altText || '' }] });
    } else {
      save({ ...media, [slot]: image });
    }
  }

  function moveItem(index, delta) {
    const next = [...media.gallery];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    save({ ...media, gallery: next });
  }

  function setAlt(index, alt) {
    // Local only until blur, so every keystroke is not a request.
    setMedia(m => {
      const gallery = [...m.gallery];
      gallery[index] = { ...gallery[index], alt };
      return { ...m, gallery };
    });
  }

  if (loading) return html`<div class="loading">Loading images...</div>`;

  const slot = (name, label) => html`
    <div style="flex: 1">
      <label style="display: block; font-size: 13px; margin-bottom: 4px">${label}</label>
      ${media[name] ? html`
        <div>
          <img src=${media[name].url} alt="" style="width: 100%; border-radius: var(--radius); display: block" />
          <button class="btn btn-outline btn-sm" style="width: 100%; margin-top: 4px"
            onClick=${() => save({ ...media, [name]: null })}>Remove</button>
        </div>
      ` : html`
        <button class="btn btn-outline" style="width: 100%" onClick=${() => setPicking(name)}>
          Choose
        </button>
      `}
    </div>
  `;

  return html`
    <div class="card" style="margin-top: 12px">
      <h3 style="margin-bottom: 12px">Images ${saving ? html`<span style="font-size: 13px; color: var(--text-muted)">saving...</span>` : ''}</h3>

      <div style="display: flex; gap: 12px; margin-bottom: 16px">
        ${slot('hero', 'Hero image')}
        ${slot('cover', 'Cover image')}
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px">
        <label style="font-size: 13px">Gallery (${media.gallery.length})</label>
        <button class="btn btn-outline btn-sm" onClick=${() => setPicking('gallery')}>Add image</button>
      </div>

      ${media.gallery.length === 0 ? html`
        <p style="color: var(--text-muted); font-size: 13px">
          No gallery images. Order here is the order they publish in.
        </p>
      ` : media.gallery.map((item, index) => html`
        <div key=${item.id} style="display: flex; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border)">
          <img src=${item.url} alt="" style="width: 56px; height: 56px; object-fit: cover; border-radius: 4px" />
          <input type="text" placeholder="Alt text" value=${item.alt}
            style="flex: 1"
            onInput=${e => setAlt(index, e.target.value)}
            onBlur=${() => save(media)} />
          <button class="btn btn-outline btn-sm" disabled=${index === 0}
            onClick=${() => moveItem(index, -1)} title="Move up">↑</button>
          <button class="btn btn-outline btn-sm" disabled=${index === media.gallery.length - 1}
            onClick=${() => moveItem(index, 1)} title="Move down">↓</button>
          <button class="btn btn-danger btn-sm"
            onClick=${() => save({ ...media, gallery: media.gallery.filter((_, i) => i !== index) })}>×</button>
        </div>
      `)}

      <p style="font-size: 12px; color: var(--text-muted); margin-top: 10px">
        Written to frontmatter on publish. Fields left empty are not written at all,
        so an image set by hand in the file is left alone.
      </p>

      ${picking && html`
        <${MediaPicker}
          title=${picking === 'gallery' ? 'Add to gallery' : `Choose ${picking} image`}
          onSelect=${handlePick}
          onCancel=${() => setPicking(null)} />
      `}
    </div>
  `;
}
