import { html, render, useState, useEffect } from 'https://esm.sh/htm/preact/standalone';
import { api } from './lib/api.js';
import { Header } from './components/Header.js';
import { LoginForm } from './components/LoginForm.js';
import { PostList } from './components/PostList.js';
import { PostEditor } from './components/PostEditor.js';
import { MediaUploader } from './components/MediaUploader.js';
import { Tags } from './components/Tags.js';
import { Settings } from './components/Settings.js';

function SetupForm({ onComplete }) {
  const [form, setForm] = useState({ username: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.setup({
        username: form.username,
        password: form.password,
        displayName: form.displayName || form.username
      });
      setRecoveryCode(data.recoveryCode);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (recoveryCode) {
    return html`
      <div class="login-container">
        <div class="login-form">
          <h1>Setup Complete</h1>
          <p style="text-align: center; margin-bottom: 16px">Save your recovery code:</p>
          <div style="background: var(--bg); padding: 16px; border-radius: 8px; text-align: center; font-family: monospace; font-size: 18px; margin-bottom: 16px; user-select: all">
            ${recoveryCode}
          </div>
          <button class="btn btn-primary" style="width: 100%" onClick=${() => window.location.reload()}>
            Continue
          </button>
        </div>
      </div>
    `;
  }

  return html`
    <div class="login-container">
      <form class="login-form" onSubmit=${handleSubmit}>
        <h1>Welcome to Astral Relay</h1>
        <p style="text-align: center; margin-bottom: 24px; color: var(--text-muted)">Create your admin account</p>

        ${error && html`<div class="error">${error}</div>`}

        <div class="form-group">
          <label>Username</label>
          <input type="text" value=${form.username} onInput=${(e) => setForm(f => ({...f, username: e.target.value}))} required minlength="3" autocomplete="username" />
        </div>

        <div class="form-group">
          <label>Display Name</label>
          <input type="text" value=${form.displayName} onInput=${(e) => setForm(f => ({...f, displayName: e.target.value}))} placeholder="Optional" />
        </div>

        <div class="form-group">
          <label>Password</label>
          <input type="password" value=${form.password} onInput=${(e) => setForm(f => ({...f, password: e.target.value}))} required minlength="8" autocomplete="new-password" />
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%" disabled=${loading}>
          ${loading ? 'Setting up...' : 'Create Account'}
        </button>
      </form>
    </div>
  `;
}

function App() {
  const [route, setRoute] = useState(window.location.hash || '#/');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const status = await api.setupStatus();
      if (!status.setupComplete) {
        setSetupRequired(true);
        setLoading(false);
        return;
      }

      const data = await api.me();
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(username, password) {
    const data = await api.login({ username, password });
    setUser(data.user);
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
  }

  if (loading) {
    return html`<div class="loading">Loading...</div>`;
  }

  if (setupRequired) {
    return html`<${SetupForm} onComplete=${() => window.location.reload()} />`;
  }

  if (!user) {
    return html`<${LoginForm} onLogin=${handleLogin} />`;
  }

  // Parse route
  let content;
  if (route === '#/posts/new') {
    content = html`<${PostEditor} />`;
  } else if (route.startsWith('#/posts/')) {
    const id = route.split('/')[2];
    content = html`<${PostEditor} postId=${id} key=${id} />`;
  } else if (route === '#/settings') {
    // Reached from the header rather than the tab bar: it is account
    // management, not one of the content views the tabs switch between.
    content = html`<div class="container"><${Settings} /></div>`;
  } else {
    // The list views share one tab bar. It used to render only on the Posts
    // branch, so opening Media left the tabs behind with no way back except the
    // header title -- and that branch's own '#/media' active check could never
    // be true, since reaching it meant the route was not '#/media'.
    const view = route === '#/media' ? 'media' : route === '#/tags' ? 'tags' : 'posts';
    const go = hash => () => { window.location.hash = hash; };

    content = html`
      <div class="container">
        <div class="tabs" style="margin-bottom: 0; margin-top: 8px">
          <button class="tab ${view === 'posts' ? 'active' : ''}" onClick=${go('#/')}>Posts</button>
          <button class="tab ${view === 'media' ? 'active' : ''}" onClick=${go('#/media')}>Media</button>
          <button class="tab ${view === 'tags' ? 'active' : ''}" onClick=${go('#/tags')}>Tags</button>
        </div>
        ${view === 'media'
          ? html`<${MediaUploader} />`
          : view === 'tags'
            ? html`<${Tags} />`
            : html`<${PostList} />`}
      </div>
    `;
  }

  return html`
    <div>
      <${Header} user=${user} onLogout=${handleLogout} />
      ${content}
    </div>
  `;
}

render(html`<${App} />`, document.getElementById('app'));
