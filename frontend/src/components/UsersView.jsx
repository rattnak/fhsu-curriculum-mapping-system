import { useEffect, useState } from 'react'
import { api } from '../api'

function GrantAdder({ user, org, onChanged }) {
  const [nodeId, setNodeId] = useState('')
  const [access, setAccess] = useState('view')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function add() {
    if (!nodeId) return
    setBusy(true)
    setError(null)
    try {
      await api.grantScope(user.user_id, { scope_node_id: Number(nodeId), access })
      setNodeId('')
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grant-adder">
      <label className="visually-hidden" htmlFor={`grant-node-${user.user_id}`}>Grant scope</label>
      <select id={`grant-node-${user.user_id}`} value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
        <option value="">Add access to…</option>
        {org.colleges.map((c) => (
          <optgroup key={c.id} label={c.name}>
            <option value={c.id}>Entire {c.name}</option>
            {c.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </optgroup>
        ))}
      </select>
      <label className="visually-hidden" htmlFor={`grant-access-${user.user_id}`}>Access level</label>
      <select id={`grant-access-${user.user_id}`} value={access} onChange={(e) => setAccess(e.target.value)}>
        <option value="view">View</option>
        <option value="edit">Edit</option>
      </select>
      <button className="primary-btn" onClick={add} disabled={busy || !nodeId}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}

function AccessChip({ access }) {
  return access === 'edit' ? (
    <span className="grant-access grant-edit">
      <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true"><path d="M11.1 2.4l2.5 2.5L5.4 13H2.9v-2.5l8.2-8.1z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
      edit
    </span>
  ) : (
    <span className="grant-access grant-view">
      <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8zm6.5 1.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z" fill="none" stroke="currentColor" strokeWidth="1.3"/></svg>
      view
    </span>
  )
}

function InviteCreator({ isAdmin, org, onCreated }) {
  const roleOptions = isAdmin ? ['viewer', 'editor', 'admin'] : ['viewer', 'editor']
  const [role, setRole] = useState('viewer')
  const [scopeId, setScopeId] = useState('')
  const [access, setAccess] = useState('view')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [link, setLink] = useState(null)
  const [copied, setCopied] = useState(false)

  async function create(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const body = { role, scope_node_id: scopeId ? Number(scopeId) : null, access }
      const inv = await api.createInvite(body)
      setLink(`${window.location.origin}${window.location.pathname}?invite=${inv.token}`)
      onCreated()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable (insecure context); the link stays visible to copy by hand */ }
  }

  return (
    <form className="user-create" onSubmit={create} aria-label="Invite someone">
      <label>
        Role
        <select value={role} onChange={(e) => { setRole(e.target.value); setScopeId('') }}>
          {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      {role !== 'admin' && (
        <>
          <label>
            Scope (optional)
            <select value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
              <option value="">No scope yet (grant later)</option>
              {org.colleges.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {c.grantable_whole !== false && <option value={c.id}>Entire {c.name}</option>}
                  {c.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          {scopeId && role === 'editor' && (
            <label>
              Access
              <select value={access} onChange={(e) => setAccess(e.target.value)}>
                <option value="view">View</option>
                <option value="edit">Edit</option>
              </select>
            </label>
          )}
        </>
      )}
      <button type="submit" className="primary-btn" disabled={busy}>
        {busy ? 'Generating…' : 'Generate invite link'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
      {link && (
        <div className="invite-link-result">
          <input readOnly value={link} onFocus={(e) => e.target.select()} />
          <button type="button" className="ghost-btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      )}
    </form>
  )
}

function PendingInvites({ invites, isAdmin, onChanged }) {
  const [revokeError, setRevokeError] = useState('')
  async function revoke(id) {
    setRevokeError('')
    try { await api.revokeInvite(id); onChanged() } catch (e) { setRevokeError(e.message) }
  }

  const pending = invites.filter((i) => !i.used_at)
  if (pending.length === 0) return <p className="muted small">No pending invites.</p>

  return (
    <>
    {revokeError && <p className="error" role="alert">{revokeError}</p>}
    <ul className="user-list">
      {pending.map((inv) => (
        <li key={inv.invite_id} className="user-card">
          <div className="user-card-head">
            <div>
              <span className={`role-chip role-${inv.role}`}>{inv.role}</span>
              {inv.scope_node_name && <span className="muted small"> · {inv.scope_node_name} ({inv.access})</span>}
            </div>
            <button className="icon-btn" onClick={() => revoke(inv.invite_id)} aria-label={`Revoke invite for ${inv.role}`}>✕</button>
          </div>
          {isAdmin && inv.created_by && <p className="muted small">Created by {inv.created_by}</p>}
        </li>
      ))}
    </ul>
    </>
  )
}

export default function UsersView({ user }) {
  const isAdmin = user.role === 'admin'
  const [users, setUsers] = useState(null)
  const [org, setOrg] = useState(null)
  const [invites, setInvites] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ username: '', password: '', first_name: '', last_name: '' })
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState(null)

  function load() {
    if (isAdmin) api.users().then((d) => setUsers(d.users)).catch((e) => setError(e.message))
    api.listInvites().then((d) => setInvites(d.invites)).catch((e) => setError(e.message))
  }

  useEffect(() => {
    load()
    api.orgNodes().then(setOrg).catch((e) => setError(e.message))
  }, [])

  async function createUser(e) {
    e.preventDefault()
    setCreating(true)
    setFormError(null)
    try {
      await api.createUser(form)
      setForm({ username: '', password: '', first_name: '', last_name: '' })
      load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function revoke(userId, scopeId) {
    try {
      await api.revokeScope(userId, scopeId)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  if (error) return <p className="error" role="alert">{error}</p>
  if (!org || !invites || (isAdmin && !users)) return <p className="muted loading-pad" role="status">Loading…</p>

  return (
    <div className="users">
      <header className="access-head">
        <h2>{isAdmin ? 'Users & access' : 'Invite people'}</h2>
        <p className="muted">
          {isAdmin
            ? 'Invite people with a one-time confirmation link, or grant existing users access directly. Admins can access everything.'
            : 'Invite editors or viewers into departments and colleges you control. They finish setting up their own account from the link.'}
        </p>
      </header>

      <h3>New invite</h3>
      <InviteCreator isAdmin={isAdmin} org={org} onCreated={load} />

      <h3 style={{ marginTop: '1.4rem' }}>Pending invites</h3>
      <PendingInvites invites={invites} isAdmin={isAdmin} onChanged={load} />

      {isAdmin && (
        <>
          <details className="advanced-create" style={{ margin: '1.4rem 0' }}>
            <summary>Advanced: create a user directly</summary>
            <form className="user-create" onSubmit={createUser} aria-label="Add a user">
              <label>Username<input value={form.username} onChange={set('username')} required autoComplete="off" /></label>
              <label>Password<input type="password" value={form.password} onChange={set('password')} required autoComplete="new-password" /></label>
              <label>First name<input value={form.first_name} onChange={set('first_name')} /></label>
              <label>Last name<input value={form.last_name} onChange={set('last_name')} /></label>
              <button type="submit" className="primary-btn" disabled={creating}>
                {creating ? 'Adding…' : 'Add user'}
              </button>
            </form>
            {formError && <p className="error" role="alert">{formError}</p>}
            <p className="muted small">Creates a viewer account with a password you set now, no invite link needed.</p>
          </details>

          <h3>All users</h3>
          <ul className="user-list">
            {users.map((u) => (
              <li key={u.user_id} className="user-card">
                <div className="user-card-head">
                  <div>
                    <strong>{[u.first_name, u.last_name].filter(Boolean).join(' ') || u.username}</strong>
                    <span className="muted small"> · {u.username}</span>
                  </div>
                  <span className={`role-chip role-${u.role}`}>{u.role}</span>
                </div>
                {u.role === 'admin' ? (
                  <p className="muted small">Full access to everything.</p>
                ) : (
                  <>
                    <ul className="grant-list">
                      {u.grants.length === 0 && <li className="muted small">No access granted yet.</li>}
                      {u.grants.map((g) => (
                        <li key={g.id ?? 'primary'} className="grant-chip">
                          <span className="grant-name">{g.node_name}</span>
                          <AccessChip access={g.access} />
                          {g.primary ? (
                            <span className="muted small">primary</span>
                          ) : (
                            <button
                              className="icon-btn"
                              onClick={() => revoke(u.user_id, g.id)}
                              aria-label={`Remove ${g.access} access to ${g.node_name} for ${u.username}`}
                            >✕</button>
                          )}
                        </li>
                      ))}
                    </ul>
                    <GrantAdder user={u} org={org} onChanged={load} />
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
