import { useState, useEffect } from 'https://esm.sh/htm/preact/standalone';

export function useRouter() {
  const [route, setRoute] = useState(window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (hash) => {
    window.location.hash = hash;
  };

  return { route, navigate };
}

export function parseRoute(route) {
  const parts = route.replace('#/', '').split('/').filter(Boolean);
  return {
    path: parts[0] || '',
    id: parts[1] || null,
    action: parts[2] || null
  };
}
