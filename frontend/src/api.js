const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

let token = sessionStorage.getItem('cms_token') || null

export function setToken(t) {
  token = t
  if (t) sessionStorage.setItem('cms_token', t)
  else sessionStorage.removeItem('cms_token')
}

export function getToken() {
  return token
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${res.status})`)
  }
  return res.json()
}

export const api = {
  login: (username, password) =>
    request('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  curriculum: (scope) => request(`/curriculum${scope ? `?scope=${scope}` : ''}`),
  coverage: (scope) => request(`/reports/coverage${scope ? `?scope=${scope}` : ''}`),
  rigidity: (scope) => request(`/reports/rigidity${scope ? `?scope=${scope}` : ''}`),
  orphans: (scope) => request(`/reports/orphans${scope ? `?scope=${scope}` : ''}`),
  search: (q, limit = 25) => request(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  node: (id) => request(`/node/${id}`),
  compliance: (id) => request(`/compliance/${id}`),
  createCourse: (body) => request('/courses', { method: 'POST', body: JSON.stringify(body) }),
  createModule: (body) => request('/modules', { method: 'POST', body: JSON.stringify(body) }),
  advise: (id) => request(`/advise/${id}`),
  resources: (q = '', tag = '') => request(`/resources?q=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}`),
  outcomeNodes: (id) => request(`/outcome-nodes/${id}`),
  createActionItem: (body) => request('/action-items', { method: 'POST', body: JSON.stringify(body) }),
  updateActionItem: (id, body) => request(`/action-items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteActionItem: (id) => request(`/action-items/${id}`, { method: 'DELETE' }),
  access: () => request('/access'),
  updateNode: (id, body) => request(`/nodes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  users: () => request('/users'),
  createUser: (body) => request('/users', { method: 'POST', body: JSON.stringify(body) }),
  grantScope: (userId, body) => request(`/users/${userId}/scopes`, { method: 'POST', body: JSON.stringify(body) }),
  revokeScope: (userId, scopeId) => request(`/users/${userId}/scopes/${scopeId}`, { method: 'DELETE' }),
  orgNodes: () => request('/org-nodes'),
  approvals: () => request('/approvals'),
  approveNode: (id) => request(`/nodes/${id}/approve`, { method: 'POST' }),
  rejectNode: (id) => request(`/nodes/${id}/reject`, { method: 'POST' }),
  createInvite: (body) => request('/invites', { method: 'POST', body: JSON.stringify(body) }),
  listInvites: () => request('/invites'),
  revokeInvite: (id) => request(`/invites/${id}`, { method: 'DELETE' }),
  previewInvite: (token) => request(`/invites/${token}/preview`),
  acceptInvite: (token, body) => request(`/invites/${token}/accept`, { method: 'POST', body: JSON.stringify(body) }),
}
