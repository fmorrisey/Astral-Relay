import { useState, useEffect } from 'https://esm.sh/htm/preact/standalone';
import { api } from './api.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      // Check setup status first
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

  async function login(username, password) {
    const data = await api.login({ username, password });
    setUser(data.user);
    return data;
  }

  async function logout() {
    await api.logout();
    setUser(null);
  }

  async function completeSetup(setupData) {
    const data = await api.setup(setupData);
    setSetupRequired(false);
    setUser(data.user);
    return data;
  }

  return { user, loading, setupRequired, login, logout, completeSetup, setUser };
}
