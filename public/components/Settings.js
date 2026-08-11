import { html, useState } from 'https://esm.sh/htm/preact/standalone';
import { api } from '../lib/api.js';
import { Users } from './Users.js';

export function Settings({ user }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Recovery codes are shown once and only their hash is kept, so this is held
  // in state until the user navigates away rather than being re-fetchable.
  const [recoveryCode, setRecoveryCode] = useState('');
  const [issuing, setIssuing] = useState(false);

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = current && next.length >= 8 && next === confirm && !saving;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setSaving(true);
    try {
      const data = await api.changePassword({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      showToast(
        data.sessionsRevoked > 0
          ? `Password changed. Signed out ${data.sessionsRevoked} other session${data.sessionsRevoked === 1 ? '' : 's'}.`
          : 'Password changed.'
      );
    } catch (err) {
      // Inline rather than a toast: this one is about a field on this form, and
      // the user needs it still on screen while they retype.
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleIssueCode() {
    setIssuing(true);
    try {
      const data = await api.issueRecoveryCode();
      setRecoveryCode(data.recoveryCode);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIssuing(false);
    }
  }

  return html`
    <div>
      <h2 style="margin-bottom: 16px">Settings</h2>

      <form class="card" style="margin-bottom: 16px" onSubmit=${handleSubmit}>
        <h3 style="margin-bottom: 12px">Change password</h3>

        ${error && html`<div class="error" style="margin-bottom: 12px">${error}</div>`}

        <div class="form-group">
          <label for="current">Current password</label>
          <input id="current" type="password" value=${current}
            onInput=${e => setCurrent(e.target.value)} autocomplete="current-password" required />
        </div>

        <div class="form-group">
          <label for="next">New password</label>
          <input id="next" type="password" value=${next}
            onInput=${e => setNext(e.target.value)} autocomplete="new-password" minlength="8" required />
        </div>

        <div class="form-group">
          <label for="confirm">Confirm new password</label>
          <input id="confirm" type="password" value=${confirm}
            onInput=${e => setConfirm(e.target.value)} autocomplete="new-password" required />
          ${mismatch && html`
            <div style="color: var(--danger); font-size: 13px; margin-top: 4px">
              Passwords do not match
            </div>
          `}
        </div>

        <button type="submit" class="btn btn-primary" disabled=${!canSubmit}>
          ${saving ? 'Changing...' : 'Change password'}
        </button>

        <p style="font-size: 13px; color: var(--text-muted); margin-top: 10px">
          Signs out every other device. This one stays signed in.
        </p>
      </form>

      <div class="card">
        <h3 style="margin-bottom: 12px">Recovery code</h3>

        ${recoveryCode ? html`
          <div style="background: var(--bg); padding: 16px; border-radius: 8px; text-align: center;
                      font-family: monospace; font-size: 18px; user-select: all; margin-bottom: 10px">
            ${recoveryCode}
          </div>
          <p style="font-size: 13px; color: var(--danger)">
            Save this now — only its hash is stored, so it cannot be shown again.
          </p>
        ` : html`
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 10px">
            Lets you reset your password from the sign-in screen if you forget it.
            Generating one replaces any previous code.
          </p>
          <button class="btn btn-outline" onClick=${handleIssueCode} disabled=${issuing}>
            ${issuing ? 'Generating...' : 'Generate a recovery code'}
          </button>
        `}
      </div>

      ${user?.role === 'admin' && html`
        <div style="margin-top: 16px">
          <${Users} currentUserId=${user.id} onToast=${showToast} />
        </div>
      `}

      ${toast && html`<div class="toast toast-${toast.type}">${toast.message}</div>`}
    </div>
  `;
}
