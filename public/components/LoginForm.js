import { html, useState } from 'https://esm.sh/htm/preact/standalone';
import { api } from '../lib/api.js';

export function LoginForm({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Recovery lives on the login screen because being locked out is exactly when
  // no authenticated screen is reachable.
  const [recovering, setRecovering] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState('');

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

  const handleRecover = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.recover({ username, recoveryCode, newPassword });
      // Deliberately no auto-login: sign in with the new password so it is
      // confirmed working before the recovery code is gone.
      setRecovering(false);
      setRecoveryCode('');
      setPassword('');
      setNewPassword('');
      setNotice('Password reset. Sign in with your new password.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (recovering) {
    return html`
      <div class="login-container">
        <form class="login-form" onSubmit=${handleRecover}>
          <h1>Use a recovery code</h1>

          ${error && html`<div class="error">${error}</div>`}

          <div class="form-group">
            <label for="r-username">Username</label>
            <input id="r-username" type="text" value=${username}
              onInput=${(e) => setUsername(e.target.value)} required autocomplete="username" />
          </div>

          <div class="form-group">
            <label for="r-code">Recovery code</label>
            <input id="r-code" type="text" value=${recoveryCode}
              onInput=${(e) => setRecoveryCode(e.target.value)} required
              placeholder="RELAY-XXXX-XXXX-XXXX" autocomplete="off" />
          </div>

          <div class="form-group">
            <label for="r-new">New password</label>
            <input id="r-new" type="password" value=${newPassword}
              onInput=${(e) => setNewPassword(e.target.value)} required minlength="8"
              autocomplete="new-password" />
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%" disabled=${loading}>
            ${loading ? 'Resetting...' : 'Reset password'}
          </button>

          <button type="button" class="btn btn-outline" style="width: 100%; margin-top: 8px"
            onClick=${() => { setRecovering(false); setError(''); }}>
            Back to sign in
          </button>

          <p style="font-size: 13px; color: var(--text-muted); margin-top: 12px; text-align: center">
            A code can only be used once. No code, or lost it? An administrator can run
            <code>npm run reset-password</code> on the server.
          </p>
        </form>
      </div>
    `;
  }

  return html`
    <div class="login-container">
      <form class="login-form" onSubmit=${handleSubmit}>
        <h1>Astral Relay</h1>

        ${error && html`<div class="error">${error}</div>`}
        ${notice && html`<div class="notice">${notice}</div>`}

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

        <button type="button" class="btn btn-outline" style="width: 100%; margin-top: 8px"
          onClick=${() => { setRecovering(true); setError(''); setNotice(''); }}>
          Use a recovery code
        </button>
      </form>
    </div>
  `;
}
