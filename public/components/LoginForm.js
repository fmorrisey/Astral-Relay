import { html, useState } from 'https://esm.sh/htm/preact/standalone';

export function LoginForm({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return html`
    <div class="login-container">
      <form class="login-form" onSubmit=${handleSubmit}>
        <h1>Astral Relay</h1>

        ${error && html`<div class="error">${error}</div>`}

        <div class="form-group">
          <label for="username">Username</label>
          <input
            id="username"
            type="text"
            value=${username}
            onInput=${(e) => setUsername(e.target.value)}
            required
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            value=${password}
            onInput=${(e) => setPassword(e.target.value)}
            required
            autocomplete="current-password"
          />
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%" disabled=${loading}>
          ${loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  `;
}
