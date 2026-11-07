import { useEffect, useState } from 'react'
import { api, setToken } from '../api'

export default function AcceptInvite({ token, onActivated }) {
  const [preview, setPreview] = useState(null) // null = loading
  const [previewError, setPreviewError] = useState(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', username: '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    let stale = false
    api.previewInvite(token)
      .then((d) => { if (!stale) setPreview(d) })
      .catch((e) => { if (!stale) setPreviewError(e.message) })
    return () => { stale = true }
  }, [token])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (form.password !== form.confirm) {
      setFormError('Passwords do not match')
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      const res = await api.acceptInvite(token, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        username: form.username.trim(),
        password: form.password,
      })
      setToken(res.token)
      onActivated({
        username: res.username, first_name: res.first_name,
        last_name: res.last_name, role: res.role, scope_node_id: res.scope_node_id,
      }, res.token)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (previewError) {
    return (
      <main className="login-wrap">
        <div className="login-card">
          <h1>FHSU Curriculum Mapping</h1>
          <p className="error" role="alert">{previewError}</p>
          <p className="muted">Ask whoever sent you this link to generate a new one.</p>
        </div>
      </main>
    )
  }

  if (!preview) {
    return <main className="login-wrap"><p className="muted" role="status">Checking invite…</p></main>
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>You're invited</h1>
        <p className="muted">
          {preview.invited_by ? `${preview.invited_by} invited you` : "You've been invited"} as a{' '}
          <strong>{preview.role}</strong>
          {preview.scope_node_name ? <> with {preview.access} access to <strong>{preview.scope_node_name}</strong></> : null}.
        </p>
        <label>
          First name
          <input value={form.first_name} onChange={set('first_name')} required autoComplete="given-name" autoFocus />
        </label>
        <label>
          Last name
          <input value={form.last_name} onChange={set('last_name')} required autoComplete="family-name" />
        </label>
        <label>
          Choose a username
          <input value={form.username} onChange={set('username')} required autoComplete="username" />
        </label>
        <label>
          Choose a password
          <input type="password" value={form.password} onChange={set('password')} required autoComplete="new-password" />
        </label>
        <label>
          Confirm password
          <input type="password" value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" />
        </label>
        {formError && <p className="error" role="alert">{formError}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Activating…' : 'Activate account'}</button>
      </form>
    </main>
  )
}
