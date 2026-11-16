import { useState } from 'react'
import { api, setToken } from '../api'

export default function Login({ onLogin, notice }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.login(username, password)
      setToken(res.token)
      onLogin({ username: res.username, first_name: res.first_name, last_name: res.last_name, role: res.role, scope_node_id: res.scope_node_id })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>FHSU Curriculum Mapping</h1>
        {import.meta.env.VITE_DEMO_MODE === 'true' && <p className="muted">Test users: admin_test / editor_test / viewer_test</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  )
}
