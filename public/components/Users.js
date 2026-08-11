import { html, useState, useEffect } from 'https://esm.sh/htm/preact/standalone';
import { api } from '../lib/api.js';

// Admin-only panel. Rendered only for admins by Settings, but that is a
// convenience -- every route it calls is enforced server-side, so a non-admin
// reaching it anyway gets 403s rather than access.
export function Users({ currentUserId, onToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'author' });
  const [creating, setCreating] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);

  useEffect(() => { load(); }, []);

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await api.getUsers();
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const data = await api.createUser({
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName.trim() || undefined,
        role: form.role
      });
      setUsers(prev => [...prev, data.user]);
      setForm({ username: '', password: '', displayName: '', role: 'author' });
      onToast?.(`Created ${data.user.username}`);
    } catch (err) {
      onToast?.(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(user) {
    setConfirmingId(null);
    try {
      await api.deleteUser(user.id);
      setUsers(prev => prev.filter(u => u.id !== user.id));
      onToast?.(`Deleted ${user.username}`);
    } catch (err) {
      // Refuses when the user still owns posts or media, or is the last admin.
      onToast?.(err.message, 'error');
      load({ silent: true });
    }
  }

  if (loading) return html`<div class="loading">Loading users...</div>`;

  return html`
    <div class="card">
      <h3 style="margin-bottom: 12px">Users</h3>

      ${error && html`<div class="error" style="margin-bottom: 12px">${error}</div>`}

      ${users.map(u => html`
        <div key=${u.id} style="display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border)">
          <div style="flex: 1; min-width: 0">
            <div style="font-weight: 500">
              ${u.displayName || u.username}
              ${u.id === currentUserId && html`<span style="color: var(--text-muted); font-weight: 400"> (you)</span>`}
            </div>
            <div style="color: var(--text-muted); font-size: 13px">${u.username} · ${u.role}</div>
          </div>

          ${u.id !== currentUserId && (confirmingId === u.id ? html`
            <div style="display: flex; gap: 6px; align-items: center">
              <span style="font-size: 13px; color: var(--text-muted)">Delete?</span>
              <button class="btn btn-danger btn-sm" onClick=${() => handleDelete(u)}>Yes</button>
              <button class="btn btn-outline btn-sm" onClick=${() => setConfirmingId(null)}>No</button>
            </div>
          ` : html`
            <button class="btn btn-outline btn-sm" onClick=${() => setConfirmingId(u.id)}>Delete</button>
          `)}
        </div>
      `)}

      <form onSubmit=${handleCreate} style="margin-top: 16px">
        <h4 style="margin-bottom: 8px">Add a user</h4>

        <div class="form-group">
          <label for="u-name">Username</label>
          <input id="u-name" type="text" value=${form.username} required minlength="3"
            onInput=${e => setForm(f => ({ ...f, username: e.target.value }))} autocomplete="off" />
        </div>

        <div class="form-group">
          <label for="u-display">Display name</label>
          <input id="u-display" type="text" value=${form.displayName} placeholder="Optional"
            onInput=${e => setForm(f => ({ ...f, displayName: e.target.value }))} />
        </div>

        <div class="form-group">
          <label for="u-pass">Password</label>
          <input id="u-pass" type="password" value=${form.password} required minlength="8"
            onInput=${e => setForm(f => ({ ...f, password: e.target.value }))} autocomplete="new-password" />
        </div>

        <div class="form-group">
          <label for="u-role">Role</label>
          <select id="u-role" value=${form.role}
            onChange=${e => setForm(f => ({ ...f, role: e.target.value }))}>
            <option value="author">Author — their own posts and media</option>
            <option value="admin">Admin — everything, including users</option>
          </select>
        </div>

        <button type="submit" class="btn btn-primary" disabled=${creating}>
          ${creating ? 'Creating...' : 'Create user'}
        </button>
      </form>
    </div>
  `;
}
