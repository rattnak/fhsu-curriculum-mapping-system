import { useEffect, useState } from 'react'
import { api } from '../api'

const TYPE_LABELS = { course: 'Course', module: 'Module' }

export default function ApprovalsView({ onChanged }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let stale = false
    api.approvals().then((d) => { if (!stale) setItems(d.approvals) }).catch((e) => { if (!stale) setError(e.message) })
    return () => { stale = true }
  }, [])

  async function act(id, action) {
    setBusyId(id)
    setError(null)
    try {
      if (action === 'approve') await api.approveNode(id)
      else await api.rejectNode(id)
      setItems((prev) => prev.filter((i) => i.node_id !== id))
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  if (error && !items) return <p className="error" role="alert">{error}</p>
  if (!items) return <p className="muted loading-pad" role="status">Loading pending approvals…</p>

  return (
    <div className="access">
      <header className="access-head">
        <h2>Pending approvals</h2>
        <p className="muted">
          New programs, courses, and modules stay hidden from everyone but their creator until
          someone with edit access one level up approves them.
        </p>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      {items.length === 0 ? (
        <p className="muted">Nothing waiting on you right now.</p>
      ) : (
        <ul className="access-list">
          {items.map((item) => (
            <li key={item.node_id} className="access-row">
              <div className="access-row-main">
                <span className="access-name">
                  {item.name}
                  <span className="type-chip" style={{ marginLeft: '0.5rem' }}>
                    {TYPE_LABELS[item.type] || item.type}
                  </span>
                </span>
              </div>
              <p className="muted small" style={{ margin: '0.3rem 0 0.6rem' }}>
                {item.path.slice(0, -1).join(' › ') || 'Institution'}
                {item.created_by && <> · created by <strong>{item.created_by}</strong></>}
              </p>
              <div className="add-form-actions">
                <button
                  type="button"
                  className="primary-btn"
                  disabled={busyId === item.node_id}
                  onClick={() => act(item.node_id, 'approve')}
                >
                  {busyId === item.node_id ? 'Working…' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={busyId === item.node_id}
                  onClick={() => act(item.node_id, 'reject')}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
