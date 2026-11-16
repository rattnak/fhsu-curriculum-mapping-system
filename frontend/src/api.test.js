import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, getToken, setToken } from './api'

function mockFetch(status, body) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  setToken(null)
  vi.unstubAllGlobals()
})

describe('api client', () => {
  it('stores and clears the session token', () => {
    setToken('abc')
    expect(getToken()).toBe('abc')
    expect(sessionStorage.getItem('cms_token')).toBe('abc')
    setToken(null)
    expect(getToken()).toBeNull()
    expect(sessionStorage.getItem('cms_token')).toBeNull()
  })

  it('sends the bearer token on authenticated requests', async () => {
    setToken('tok')
    const fetchFn = mockFetch(200, [])
    await api.curriculum()
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('surfaces the server detail message on failure', async () => {
    mockFetch(403, { detail: 'Admin role required' })
    await expect(api.users()).rejects.toThrow('Admin role required')
  })

  it('appends the scope to report requests', async () => {
    const fetchFn = mockFetch(200, {})
    await api.coverage(7)
    expect(fetchFn.mock.calls[0][0]).toMatch(/\/reports\/coverage\?scope=7$/)
  })
})

describe('error handling', () => {
  it('ends the session on 401 and notifies the app', async () => {
    const { onSessionExpired } = await import('./api')
    const handler = vi.fn()
    const off = onSessionExpired(handler)
    setToken('stale')
    mockFetch(401, { detail: 'Invalid or expired token' })
    await expect(api.curriculum()).rejects.toThrow('Your session expired. Sign in again.')
    expect(getToken()).toBeNull()
    expect(handler).toHaveBeenCalledOnce()
    off()
  })

  it('treats a 401 from /login as wrong credentials, not an expiry', async () => {
    setToken('tok')
    mockFetch(401, { detail: 'Invalid credentials' })
    await expect(api.login('a', 'b')).rejects.toThrow('Invalid credentials')
    expect(getToken()).toBe('tok')
  })

  it('maps 5xx on writes to a plain message without retrying', async () => {
    const fetchFn = mockFetch(500, { detail: 'psycopg trace...' })
    await expect(api.createCourse({})).rejects.toThrow("Can't reach the server")
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('retries a read once on network failure', async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: 1 }) })
    vi.stubGlobal('fetch', fetchFn)
    await expect(api.curriculum()).resolves.toEqual({ ok: 1 })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
