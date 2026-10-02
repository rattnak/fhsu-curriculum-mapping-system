import { useEffect, useState } from 'react'
import { api } from '../api'

export default function AccessView() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [openDept, setOpenDept] = useState(null)

  useEffect(() => {
    let stale = false
    api.access().then((d) => { if (!stale) setData(d) }).catch((e) => { if (!stale) setError(e.message) })
    return () => { stale = true }
  }, [])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!data) return <p className="muted loading-pad" role="status">Loading access map…</p>

  const sharedCount = data.colleges.reduce(
    (n, c) => n + c.departments.filter((d) => d.shared).length, 0)
  const totalCount = data.colleges.reduce((n, c) => n + c.departments.length, 0)

  return (
    <div className="access">
      <header className="access-head">
        <h2>Department access</h2>
        <p className="muted">
          Signed in as <strong>{data.username}</strong> ({data.role}). {sharedCount} of {totalCount} departments
          are shared with you. Shared departments list their courses; module detail stays in the graph.
        </p>
      </header>

      {data.colleges.map((college) => (
        <section key={college.id} className="access-college">
          <h3>{college.name}</h3>
          <ul className="access-list">
            {college.departments.map((dept) => (
              <li key={dept.id} className={`access-row${dept.shared ? '' : ' unshared'}`}>
                <div className="access-row-main">
                  <span className="access-name">{dept.name}</span>
                  {dept.shared && dept.courses?.length > 0 && (
                    <button
                      className="access-toggle"
                      onClick={() => setOpenDept(openDept === dept.id ? null : dept.id)}
                      aria-expanded={openDept === dept.id}
                    >
                      {openDept === dept.id ? 'Hide' : 'Show'} {dept.courses.length} course{dept.courses.length !== 1 ? 's' : ''}
                    </button>
                  )}
                  <span className={`access-badge badge-${dept.access || 'none'}`}>
                    {dept.access === 'edit' && (
                      <><svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path d="M11.1 2.4l2.5 2.5L5.4 13H2.9v-2.5l8.2-8.1z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg> Edit access</>
                    )}
                    {dept.access === 'view' && (
                      <><svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8zm6.5 1.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z" fill="none" stroke="currentColor" strokeWidth="1.3"/></svg> View access</>
                    )}
                    {!dept.access && (
                      <><svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="5" width="7" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M4 5V3.8a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg> Not shared</>
                    )}
                  </span>
                </div>
                {dept.shared && openDept === dept.id && (
                  <ul className="access-courses">
                    {dept.courses.map((c) => (
                      <li key={c.id}>
                        <strong>{c.name}</strong>
                        {c.title && <span className="muted"> · {c.title}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
