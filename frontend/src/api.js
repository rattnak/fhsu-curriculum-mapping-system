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

const TIMEOUT_MS = 15000
const RETRY_DELAY_MS = 500
const RETRYABLE_STATUS = new Set([502, 503, 504])
export const SESSION_EXPIRED_MESSAGE = 'Your session expired. Sign in again.'
const UNREACHABLE_MESSAGE = "Can't reach the server. Check your connection and try again."

let sessionExpiredHandler = null
export function onSessionExpired(fn) {
  sessionExpiredHandler = fn
  return () => { if (sessionExpiredHandler === fn) sessionExpiredHandler = null }
}

async function attempt(path, options, headers) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(`${BASE}${path}`, { ...options, headers, signal: controller.signal })
  } catch (e) {
    const err = new Error(e.name === 'AbortError'
      ? 'The server took too long to respond. Try again.'
      : UNREACHABLE_MESSAGE)
    err.retryable = true
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const isRead = !options.method || options.method === 'GET'

  let res
  try {
    res = await attempt(path, options, headers)
    if (isRead && RETRYABLE_STATUS.has(res.status)) throw Object.assign(new Error(UNREACHABLE_MESSAGE), { retryable: true })
  } catch (e) {
    if (!isRead || !e.retryable) throw e
    // reads are idempotent: retry once; writes never retry automatically
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    res = await attempt(path, options, headers)
  }

  if (res.status === 401 && token && path !== '/login') {
    setToken(null)
    if (sessionExpiredHandler) sessionExpiredHandler()
    throw new Error(SESSION_EXPIRED_MESSAGE)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (res.status >= 500) throw new Error(UNREACHABLE_MESSAGE)
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
