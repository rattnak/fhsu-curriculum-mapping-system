import { useState } from 'react'
import { api, setToken } from '../api'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('viewer_test')
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
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>FHSU Curriculum Mapping</h1>
        <p className="muted">Test users: admin_test / editor_test / viewer_test</p>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}
