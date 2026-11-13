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
