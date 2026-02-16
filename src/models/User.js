export class User {
  constructor(db) {
    this.db = db;
  }

  create({ username, passwordHash, displayName, email }) {
    const result = this.db.prepare(`
      INSERT INTO users (username, password_hash, display_name, email)
      VALUES (?, ?, ?, ?)
    `).run(username, passwordHash, displayName || null, email || null);

    return this.findById(result.lastInsertRowid);
  }

  findById(id) {
    const user = this.db.prepare(`
      SELECT id, username, display_name, email, created_at, last_login
      FROM users WHERE id = ?
    `).get(id);
    return user ? this._format(user) : null;
  }

  findByUsername(username) {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }

  updateLastLogin(id) {
    this.db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(id);
  }

  count() {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM users').get();
    return result.count;
  }

  _format(user) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      createdAt: user.created_at,
      lastLogin: user.last_login
    };
  }
}
