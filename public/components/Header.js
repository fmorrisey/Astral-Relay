import { html } from 'https://esm.sh/htm/preact/standalone';

export function Header({ user, onLogout }) {
  return html`
    <header class="header">
      <h1><a href="#/" style="color: inherit; text-decoration: none;">Astral Relay</a></h1>
      <div class="header-actions">
        <span style="font-size: 14px; opacity: 0.8">${user?.displayName || user?.username}</span>
        <button class="btn btn-outline" style="color: white; border-color: rgba(255,255,255,0.3);" onClick=${onLogout}>
          Logout
        </button>
      </div>
    </header>
  `;
}
