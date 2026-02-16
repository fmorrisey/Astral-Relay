export const api = {
  async request(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      credentials: 'include'
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  },

  // Auth
  login: (data) => api.request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => api.request('/auth/logout', { method: 'POST' }),
  me: () => api.request('/auth/me'),
  setup: (data) => api.request('/auth/setup', { method: 'POST', body: JSON.stringify(data) }),
  setupStatus: () => api.request('/setup/status'),
  getCollections: () => api.request('/setup/collections'),

  // Posts
  getPosts: (params = {}) => api.request(`/posts?${new URLSearchParams(params)}`),
  getPost: (id) => api.request(`/posts/${id}`),
  createPost: (data) => api.request('/posts', { method: 'POST', body: JSON.stringify(data) }),
  updatePost: (id, data) => api.request(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePost: (id) => api.request(`/posts/${id}`, { method: 'DELETE' }),
  publishPost: (id, data) => api.request(`/posts/${id}/publish`, { method: 'POST', body: JSON.stringify(data || {}) }),
  unpublishPost: (id) => api.request(`/posts/${id}/unpublish`, { method: 'POST', body: JSON.stringify({}) }),
  getVersions: (id) => api.request(`/posts/${id}/versions`),

  // Media
  getMedia: (params = {}) => api.request(`/media?${new URLSearchParams(params)}`),
  deleteMedia: (id) => api.request(`/media/${id}`, { method: 'DELETE' }),
  async uploadMedia(file, alt = '') {
    const formData = new FormData();
    formData.append('file', file);
    if (alt) formData.append('alt', alt);

    const response = await fetch('/api/media/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Upload failed');
    }

    return response.json();
  },

  // Tags
  getTags: () => api.request('/tags'),
  createTag: (data) => api.request('/tags', { method: 'POST', body: JSON.stringify(data) }),
  deleteTag: (id) => api.request(`/tags/${id}`, { method: 'DELETE' })
};
