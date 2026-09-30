import { useEffect, useState } from 'react'
import { api } from '../api'

const MASTERY_RANK = { Introduced: 1, Reinforced: 2, Mastered: 3 }

function CoverageMatrix({ scope }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let stale = false
    setData(null)
    api.coverage(scope)
      .then((d) => { if (!stale) setData(d) })
      .catch((e) => { if (!stale) setError(e.message) })
    return () => { stale = true }
  }, [scope])
  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const cell = (o, course) => {
    const levels = o.courses[course]
    if (!levels) return <td key={course} className="cm-cell" />
    const top = levels.reduce((a, b) => (MASTERY_RANK[b] > MASTERY_RANK[a] ? b : a))
    return (
      <td key={course} className="cm-cell">
        <span
          className={`cm-chip cm-${top.toLowerCase()}`}
          title={`${course} → ${o.outcome_code}: ${levels.join(', ')}`}
        >
          {top[0]}
        </span>
      </td>
    )
  }

  return (
    <div>
      <div className="cm-head">
        <h2>Coverage Matrix</h2>
        <div className="cm-legend" aria-label="Legend">
          <span><span className="cm-chip cm-introduced">I</span> Introduced</span>
          <span><span className="cm-chip cm-reinforced">R</span> Reinforced</span>
          <span><span className="cm-chip cm-mastered">M</span> Mastered</span>
          <span><span className="cm-chip cm-none" /> No mapping</span>
        </div>
      </div>
      {data.gaps.length > 0 && (
        <p className="flag">⚠ {data.gaps.length} outcome{data.gaps.length !== 1 ? 's have' : ' has'} zero coverage: {data.gaps.join(', ')}</p>
      )}
      <div className="table-scroll cm-scroll">
        <table className="cm-table">
          <thead>
            <tr>
              <th className="cm-outcome-col">Outcome</th>
              {data.courses.map((c) => (
                <th key={c} className="cm-course-col" title={data.course_titles?.[c] || c}>
                  <span className="cm-course-label">{c}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.outcomes.map((o) => (
              <tr key={o.outcome_code} className={o.zero_coverage ? 'gap-row' : ''}>
                <th scope="row" className="cm-outcome-col">
                  <span className="cm-outcome-code">
                    {o.zero_coverage && <span className="cm-gap-mark" title="No course covers this outcome">⚠</span>}
                    {o.outcome_code}
                    {o.hlc_criterion_tag && <span className="cm-hlc">HLC {o.hlc_criterion_tag}</span>}
                  </span>
                  <span className="cm-outcome-text" title={o.outcome_text}>{o.outcome_text}</span>
                </th>
                {data.courses.map((c) => cell(o, c))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RigidityAudit({ scope }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let stale = false
    setData(null)
    api.rigidity(scope)
      .then((d) => { if (!stale) setData(d) })
      .catch((e) => { if (!stale) setError(e.message) })
    return () => { stale = true }
  }, [scope])
  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>
  const levels = ['Introduced', 'Reinforced', 'Mastered']
  return (
    <div>
      <h2>Scaffold / Rigidity Audit</h2>
      {data.flags.map((f) => <p key={f} className="flag">⚠ {f}</p>)}
      {data.flags.length === 0 && <p className="ok">✓ Mastery distribution looks healthy.</p>}
      <div className="table-scroll">
        <table>
          <thead><tr><th>Mastery Level</th><th>Mappings</th><th>%</th></tr></thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l}>
                <td>{l}</td>
                <td>{data.distribution[l] || 0}</td>
                <td>{data.percentages[l] || 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Per course</h3>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Course</th>{levels.map((l) => <th key={l}>{l}</th>)}</tr></thead>
          <tbody>
            {Object.entries(data.per_course).map(([course, dist]) => (
              <tr key={course}>
                <td title={data.course_titles?.[course] || course}>{course}</td>
                {levels.map((l) => <td key={l}>{dist[l] || 0}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OrphanReport({ scope }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let stale = false
    setData(null)
    api.orphans(scope)
      .then((d) => { if (!stale) setData(d) })
      .catch((e) => { if (!stale) setError(e.message) })
    return () => { stale = true }
  }, [scope])
  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>
  return (
    <div>
      <h2>Orphan / Dead-End Report</h2>
      <h3>Orphaned course outcomes (no parent program outcome)</h3>
      {data.orphans.length ? (
        <ul>{data.orphans.map((o) => <li key={o.outcome_code}><strong>{o.outcome_code}</strong>: {o.outcome_text}</li>)}</ul>
      ) : <p className="ok">✓ None found.</p>}
      <h3>Dead-end program outcomes (no courses feeding them)</h3>
      {data.dead_ends.length ? (
        <ul>{data.dead_ends.map((o) => <li key={o.outcome_code}><strong>{o.outcome_code}</strong>: {o.outcome_text}</li>)}</ul>
      ) : <p className="ok">✓ None found.</p>}
    </div>
  )
}

function ModuleStructure({ tree }) {
  if (!tree) return <p className="muted">Load the tree view first.</p>
  const courses = []
  ;(function walk(n) {
    if (n.type === 'course') courses.push(n)
    n.children?.forEach(walk)
  })(tree)
  if (!courses.length) return <p className="muted">No courses in this scope.</p>

  return (
    <div className="ms-report">
      {courses.map((c) => (
        <section key={c.id} className="ms-course">
          <header className="ms-course-head">
            <div>
              <h3>{c.name}</h3>
              {c.course_title && <p className="ms-course-title">{c.course_title}</p>}
            </div>
            {c.credit_hours != null && <span className="ms-credits">{c.credit_hours} cr</span>}
          </header>
          {(c.children || []).map((m) => {
            const learning = (m.activities || []).filter((a) => a.type === 'learning_activity')
            const assessments = (m.activities || []).filter((a) => a.type === 'assessment')
            return (
              <div key={m.id} className="ms-module">
                <div className="ms-module-head">
                  <h4>{m.name}</h4>
                  {m.outcomes && (
                    <span className="ms-outcomes">
                      {m.outcomes.map((o) => <span key={o} className="ms-outcome-chip">{o}</span>)}
                    </span>
                  )}
                </div>
                {(learning.length > 0 || assessments.length > 0) && (
                  <div className="ms-activities">
                    {learning.length > 0 && (
                      <div>
                        <span className="ms-act-label">Learning activities</span>
                        <ul>{learning.map((a, i) => <li key={i}>{a.name}</li>)}</ul>
                      </div>
                    )}
                    {assessments.length > 0 && (
                      <div>
                        <span className="ms-act-label">Assessments</span>
                        <ul>{assessments.map((a, i) => <li key={i}>{a.name}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {!c.children?.length && <p className="muted">No modules yet.</p>}
        </section>
      ))}
    </div>
  )
}

const REPORTS = [
  { id: 'coverage', label: 'Coverage Matrix' },
  { id: 'rigidity', label: 'Rigidity Audit' },
  { id: 'orphans', label: 'Orphans / Dead-Ends' },
  { id: 'structure', label: 'Module Structure' },
]

function collectScopes(tree) {
  const out = []
  ;(function walk(n, deptName) {
    if (n.type === 'department') {
      out.push({ id: n.id, name: n.name, group: null })
      n.children?.forEach((c) => walk(c, n.name))
    } else if (n.type === 'program') {
      out.push({ id: n.id, name: n.name, group: deptName })
    } else {
      n.children?.forEach((c) => walk(c, deptName))
    }
  })(tree, null)
  return out
}

function findSubtree(tree, id) {
  if (tree.id === id) return tree
  for (const c of tree.children || []) {
    const hit = findSubtree(c, id)
    if (hit) return hit
  }
  return null
}

export default function Reports({ tree }) {
  const [report, setReport] = useState('coverage')
  const [scope, setScope] = useState('') // '' = everything within my role's scope
  const scopes = tree ? collectScopes(tree) : []
  const scopeId = scope ? Number(scope) : undefined
  const structureTree = tree && scopeId ? findSubtree(tree, scopeId) : tree

  const reportLabel = REPORTS.find((r) => r.id === report)?.label || ''
  const scopeLabel = scopeId
    ? scopes.find((d) => d.id === scopeId)?.name
    : (tree ? tree.name : 'All in my scope')

  return (
    <div className="reports">
      <div className="report-filters no-print">
        <div className="report-filters-fields">
          <label>
            Report
            <select value={report} onChange={(e) => setReport(e.target.value)}>
              {REPORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <label>
            Department / Program
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">All in my scope</option>
              {scopes.map((d) => (
                <option key={d.id} value={d.id}>{d.group ? `${d.group} — ${d.name}` : d.name}</option>
              ))}
            </select>
          </label>
        </div>
        <button className="print-btn" onClick={() => window.print()}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 6V2.5h8V6M4 12H2.5V7A1 1 0 0 1 3.5 6h9A1 1 0 0 1 13.5 7v5H12M4 10h8v3.5H4z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Print
        </button>
      </div>
      <div className="print-header print-only">
        <strong>FHSU Curriculum Mapping · {reportLabel}</strong>
        <span>{scopeLabel} · Generated {new Date().toLocaleDateString()}</span>
      </div>
      {report === 'coverage' && <CoverageMatrix scope={scopeId} />}
      {report === 'rigidity' && <RigidityAudit scope={scopeId} />}
      {report === 'orphans' && <OrphanReport scope={scopeId} />}
      {report === 'structure' && <ModuleStructure tree={structureTree} />}
    </div>
  )
}
