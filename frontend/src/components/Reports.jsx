import { useEffect, useState } from 'react'
import { api } from '../api'

const MASTERY_RANK = { Introduced: 1, Reinforced: 2, Mastered: 3 }

// one fetch-per-scope lifecycle shared by the API-backed reports; resets both
// data and error when the scope changes so a failed scope doesn't stick
function useReport(fetcher, scope) {
  const [state, setState] = useState({ data: null, error: null })
  useEffect(() => {
    let stale = false
    setState({ data: null, error: null })
    fetcher(scope)
      .then((data) => { if (!stale) setState({ data, error: null }) })
      .catch((e) => { if (!stale) setState({ data: null, error: e.message }) })
    return () => { stale = true }
  }, [scope])
  return state
}

function Stats({ items }) {
  return (
    <dl className="rp-stats">
      {items.map((s) => (
        <div key={s.label} className={`rp-stat${s.tone ? ` rp-stat-${s.tone}` : ''}`}>
          <dt>{s.label}</dt>
          <dd>
            {s.tone === 'bad' && <span aria-hidden="true">⚠ </span>}
            {s.tone === 'ok' && <span aria-hidden="true">✓ </span>}
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

const LEVELS = ['Introduced', 'Reinforced', 'Mastered']

// proportional I / R / M strip; segments are sized by count and separated by a
// 2px gap so adjacent shades stay distinguishable
function MasteryBar({ dist, label, compact }) {
  const total = LEVELS.reduce((n, l) => n + (dist[l] || 0), 0)
  if (!total) return <span className="muted small">—</span>
  return (
    <span className={`rp-bar${compact ? ' rp-bar-compact' : ''}`} role="img" aria-label={label}>
      {LEVELS.filter((l) => dist[l]).map((l) => (
        <span
          key={l}
          className={`rp-seg cm-${l.toLowerCase()}`}
          style={{ flexGrow: dist[l] }}
          title={`${l}: ${dist[l]} (${Math.round((dist[l] / total) * 100)}%)`}
        />
      ))}
    </span>
  )
}

function CoverageMatrix({ scope }) {
  const { data, error } = useReport(api.coverage, scope)
  const [gapsOnly, setGapsOnly] = useState(false)
  if (error) return <p className="error" role="alert">{error}</p>
  if (!data) return <p className="muted" role="status">Loading…</p>

  const gapCount = data.gaps.length
  const showGapsOnly = gapsOnly && gapCount > 0
  const rows = showGapsOnly ? data.outcomes.filter((o) => o.zero_coverage) : data.outcomes

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
      <Stats items={[
        { label: 'Outcomes', value: data.outcomes.length },
        { label: 'Courses', value: data.courses.length },
        { label: 'Zero coverage', value: gapCount, tone: gapCount ? 'bad' : 'ok' },
      ]} />
      {gapCount > 0 && (
        <p className="rp-callout rp-callout-bad">
          <span aria-hidden="true">⚠</span>
          <span>No course covers {gapCount === 1 ? 'this outcome' : 'these outcomes'}: <strong>{data.gaps.join(', ')}</strong></span>
        </p>
      )}
      <div className="cm-head">
        <div className="cm-legend" aria-label="Legend">
          <span><span className="cm-chip cm-introduced">I</span> Introduced</span>
          <span><span className="cm-chip cm-reinforced">R</span> Reinforced</span>
          <span><span className="cm-chip cm-mastered">M</span> Mastered</span>
        </div>
        {gapCount > 0 && (
          <label className="rp-check no-print">
            <input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} />
            Show gaps only
          </label>
        )}
      </div>
      {data.outcomes.length === 0 ? (
        <p className="muted">No outcomes in this scope yet.</p>
      ) : (
        <>
          <div className="table-scroll cm-scroll" tabIndex={0} role="region" aria-label="Course coverage matrix (scrollable)">
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
                {rows.map((o) => (
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
          {data.courses.length > 6 && <p className="muted small rp-scroll-hint no-print">Scroll the table sideways to see all {data.courses.length} courses.</p>}
        </>
      )}
    </div>
  )
}

function RigidityAudit({ scope }) {
  const { data, error } = useReport(api.rigidity, scope)
  const [q, setQ] = useState('')
  if (error) return <p className="error" role="alert">{error}</p>
  if (!data) return <p className="muted" role="status">Loading…</p>

  const total = LEVELS.reduce((n, l) => n + (data.distribution[l] || 0), 0)
  const courses = Object.entries(data.per_course)
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? courses.filter(([c]) => c.toLowerCase().includes(needle) || (data.course_titles?.[c] || '').toLowerCase().includes(needle))
    : courses

  return (
    <div>
      {data.flags.map((f) => (
        <p key={f} className="rp-callout rp-callout-bad"><span aria-hidden="true">⚠</span><span>{f}</span></p>
      ))}
      {data.flags.length === 0 && (
        <p className="rp-callout rp-callout-ok"><span aria-hidden="true">✓</span><span>Mastery distribution looks healthy.</span></p>
      )}

      <section className="rp-card" aria-label="Mastery level distribution">
        <div className="rp-card-head">
          <h3>Mastery distribution</h3>
          <span className="muted small">{total} mapping{total !== 1 ? 's' : ''}</span>
        </div>
        <MasteryBar dist={data.distribution} label={LEVELS.map((l) => `${l} ${data.percentages[l] || 0}%`).join(', ')} />
        <dl className="rp-dist">
          {LEVELS.map((l) => (
            <div key={l}>
              <dt><span className={`cm-chip cm-${l.toLowerCase()}`} aria-hidden="true">{l[0]}</span>{l}</dt>
              <dd><strong>{data.percentages[l] || 0}%</strong> <span className="muted">· {data.distribution[l] || 0}</span></dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="rp-section-head">
        <h3>Per course <span className="muted">({shown.length}{needle ? ` of ${courses.length}` : ''})</span></h3>
        {courses.length > 8 && (
          <input
            className="rp-filter no-print"
            type="search"
            placeholder="Filter courses…"
            aria-label="Filter courses"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        )}
      </div>
      {shown.length === 0 ? (
        <p className="muted">{courses.length ? 'No courses match that filter.' : 'No mapped courses in this scope yet.'}</p>
      ) : (
        <div className="table-scroll rp-table-wrap" tabIndex={0} role="region" aria-label="Mastery levels per course (scrollable)">
          <table className="rp-table">
            <thead>
              <tr>
                <th>Course</th>
                {LEVELS.map((l) => (
                  <th key={l} className="rp-num" title={l}>
                    <span className={`cm-chip cm-${l.toLowerCase()}`} aria-hidden="true">{l[0]}</span>
                    <span className="sr-only">{l}</span>
                  </th>
                ))}
                <th className="rp-mix-col">Mix</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(([course, dist]) => (
                <tr key={course}>
                  <th scope="row" className="rp-course">
                    <span className="rp-course-code">{course}</span>
                    {data.course_titles?.[course] && <span className="rp-course-title">{data.course_titles[course]}</span>}
                  </th>
                  {LEVELS.map((l) => <td key={l} className={`rp-num${dist[l] ? '' : ' rp-zero'}`}>{dist[l] || 0}</td>)}
                  <td className="rp-mix-col">
                    <MasteryBar compact dist={dist} label={LEVELS.map((l) => `${l} ${dist[l] || 0}`).join(', ')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function OutcomeList({ title, hint, items }) {
  return (
    <section className="rp-card">
      <div className="rp-card-head">
        <h3>{title}</h3>
        <span className={`rp-count${items.length ? ' rp-count-bad' : ''}`}>{items.length}</span>
      </div>
      <p className="muted small rp-card-hint">{hint}</p>
      {items.length ? (
        <ul className="rp-outcomes">
          {items.map((o) => (
            <li key={o.outcome_code}>
              <strong>{o.outcome_code}</strong>
              <span>{o.outcome_text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ok rp-none"><span aria-hidden="true">✓</span> None found.</p>
      )}
    </section>
  )
}

function OrphanReport({ scope }) {
  const { data, error } = useReport(api.orphans, scope)
  if (error) return <p className="error" role="alert">{error}</p>
  if (!data) return <p className="muted" role="status">Loading…</p>
  return (
    <div className="rp-two-col">
      <OutcomeList
        title="Orphaned course outcomes"
        hint="Course outcomes with no parent program outcome."
        items={data.orphans}
      />
      <OutcomeList
        title="Dead-end program outcomes"
        hint="Program outcomes that no course feeds into."
        items={data.dead_ends}
      />
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

  const moduleCount = courses.reduce((n, c) => n + (c.children?.length || 0), 0)

  return (
    <div className="ms-report">
      <Stats items={[
        { label: 'Courses', value: courses.length },
        { label: 'Modules', value: moduleCount },
      ]} />
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
  { id: 'coverage', label: 'Coverage Matrix', hint: 'Which courses address each outcome, and at what level?' },
  { id: 'rigidity', label: 'Rigidity Audit', hint: 'Is mastery scaffolded from introduced to mastered?' },
  { id: 'orphans', label: 'Orphans / Dead-Ends', hint: 'Which outcomes are not connected to anything?' },
  { id: 'structure', label: 'Module Structure', hint: 'What modules, activities and assessments does each course have?' },
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

  const active = REPORTS.find((r) => r.id === report)
  const reportLabel = active?.label || ''
  const scopeLabel = scopeId
    ? scopes.find((d) => d.id === scopeId)?.name
    : (tree ? tree.name : 'All in my scope')

  return (
    <div className="reports">
      <header className="rp-header no-print">
        <h2 className="rp-title">Reports</h2>
        <div className="rp-controls">
          <label className="rp-scope">
            <span>Department / Program</span>
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">All in my scope</option>
              {scopes.map((d) => (
                <option key={d.id} value={d.id}>{d.group ? `${d.group} — ${d.name}` : d.name}</option>
              ))}
            </select>
          </label>
          <button className="print-btn" onClick={() => window.print()} aria-label="Print this report">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 6V2.5h8V6M4 12H2.5V7A1 1 0 0 1 3.5 6h9A1 1 0 0 1 13.5 7v5H12M4 10h8v3.5H4z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Print</span>
          </button>
        </div>
      </header>

      <nav className="rp-tabs no-print" aria-label="Report type">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            className={`rp-tab${r.id === report ? ' active' : ''}`}
            aria-current={r.id === report ? 'page' : undefined}
            onClick={() => setReport(r.id)}
          >
            <span className="rp-tab-label">{r.label}</span>
            <span className="rp-tab-hint">{r.hint}</span>
          </button>
        ))}
      </nav>

      <div className="print-header print-only">
        <strong>FHSU Curriculum Mapping · {reportLabel}</strong>
        <span>{scopeLabel} · Generated {new Date().toLocaleDateString()}</span>
      </div>

      <div className="rp-panel-head no-print">
        <h2>{reportLabel}</h2>
        <p className="muted">{active?.hint} <span className="rp-scope-note">Showing <strong>{scopeLabel}</strong>.</span></p>
      </div>

      {report === 'coverage' && <CoverageMatrix scope={scopeId} />}
      {report === 'rigidity' && <RigidityAudit scope={scopeId} />}
      {report === 'orphans' && <OrphanReport scope={scopeId} />}
      {report === 'structure' && <ModuleStructure tree={structureTree} />}
    </div>
  )
}
