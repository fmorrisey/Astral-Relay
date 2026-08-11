export class User {
  constructor(db) {
    this.db = db;
  }

  create({ username, passwordHash, displayName, email, role = 'admin' }) {
    // Defaults to admin so the setup wizard, which creates the site owner and
    // passes no role, keeps producing an admin.
    const result = this.db.prepare(`
      INSERT INTO users (username, password_hash, display_name, email, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(username, passwordHash, displayName || null, email || null, role);

    return this.findById(result.lastInsertRowid);
  }

  list() {
    const users = this.db.prepare(`
      SELECT id, username, display_name, email, role, created_at, last_login
      FROM users ORDER BY id ASC
    `).all();
    return users.map(u => this._format(u));
  }

  delete(id) {
    // Sessions cascade on user delete; posts and media do not (created_by has
    // no ON DELETE), so callers must decide what happens to their content
    // before calling this.
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  countByRole(role) {
    return this.db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get(role).count;
  }

  findById(id) {
    const user = this.db.prepare(`
      SELECT id, username, display_name, email, role, created_at, last_login
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
      role: user.role,
      email: user.email,
      createdAt: user.created_at,
      lastLogin: user.last_login
    };
  }
}
