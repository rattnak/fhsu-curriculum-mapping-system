import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

const TYPE_ORDER = ['institution', 'college_dept_grouping', 'college', 'department', 'program', 'course', 'module']
const TYPE_VAR = {
  institution: '--c-institution',
  college_dept_grouping: '--c-grouping',
  college: '--c-college',
  department: '--c-department',
  program: '--c-program',
  course: '--c-course',
  module: '--c-module',
}
const TYPE_LABELS = {
  institution: 'Institution',
  college_dept_grouping: 'Grouping',
  college: 'College',
  department: 'Department',
  program: 'Program',
  course: 'Course',
  module: 'Module',
}
// what "Add child" creates under each node type
const CHILD_OF = { program: 'course', course: 'module' }

function typeVarFor(type) {
  return TYPE_VAR[type] || '--c-module'
}

function HierarchyPath({ path, pathIds, types, onNavigate }) {
  const [open, setOpen] = useState(false)
  const parent = path.length > 1 ? path[path.length - 2] : null

  return (
    <div className="hier">
      <div className="hier-head">
        <span className="hier-label" id="hier-label">Location</span>
        {path.length > 2 && (
          <button className="hier-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Hide full path' : 'Show full path'}
          </button>
        )}
      </div>

      {!open && parent && (
        <button className="hier-row hier-parent" onClick={() => onNavigate?.(pathIds[path.length - 2])}>
          <span className="hier-dot" style={{ background: `var(${typeVarFor(types[path.length - 2])})` }} aria-hidden="true" />
          <span className="hier-name">{parent}</span>
        </button>
      )}

      {open && (
        <ol className="hier-steps" aria-labelledby="hier-label">
          {path.map((name, i) => {
            const isCurrent = i === path.length - 1
            const dotVar = typeVarFor(types[i])
            return (
              <li key={i}>
                <span className="hier-dot" style={{ background: `var(${dotVar})` }} aria-hidden="true" />
                {isCurrent ? (
                  <span className="hier-row current" aria-current="true">
                    <span className="hier-name">{name}</span>
                  </span>
                ) : (
                  <button className="hier-row" onClick={() => onNavigate?.(pathIds[i])}>
                    <span className="hier-name">{name}</span>
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function AddChildForm({ detail, onCreated, openSignal }) {
  const childType = CHILD_OF[detail.type]
  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState({ code: '', title: '', credits: 3, name: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [pendingMsg, setPendingMsg] = useState(null)
  const formRef = useRef(null)

  // the canvas Create button opens this form directly
  useEffect(() => {
    if (openSignal) {
      setOpen(true)
      requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'center' }))
    }
  }, [openSignal])

  const set = (k) => (e) => setFields((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      let name = fields.name.trim()
      if (childType === 'course') {
        name = fields.code.trim()
        await api.createCourse({
          parent_node_id: detail.id,
          code: fields.code.trim(),
          title: fields.title.trim(),
          credit_hours: Number(fields.credits),
        })
      } else {
        await api.createModule({ parent_node_id: detail.id, name })
      }
      setFields({ code: '', title: '', credits: 3, name: '' })
      setOpen(false)
      setPendingMsg(`"${name}" created — pending approval from someone with edit access above this ${detail.type}.`)
      onCreated?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <>
        <button className="add-btn" onClick={() => { setOpen(true); setPendingMsg(null) }}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          Add {childType}
        </button>
        {pendingMsg && <p className="muted small" role="status" style={{ marginTop: '0.5rem' }}>{pendingMsg}</p>}
      </>
    )
  }

  return (
    <form className="add-form" onSubmit={submit} ref={formRef}>
      {childType === 'course' ? (
        <>
          <label>
            Course code
            <input value={fields.code} onChange={set('code')} placeholder="e.g. MGT 305" required autoFocus />
          </label>
          <label>
            Title
            <input value={fields.title} onChange={set('title')} placeholder="e.g. Operations Strategy" required />
          </label>
          <label>
            Credit hours
            <select value={fields.credits} onChange={set('credits')}>
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </>
      ) : (
        <label>
          Module name
          <input
            value={fields.name}
            onChange={set('name')}
            placeholder="e.g. Module 3: Applied Strategy"
            required
            autoFocus
          />
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="add-form-actions">
        <button type="submit" className="primary-btn" disabled={busy}>
          {busy ? 'Creating…' : `Create ${childType}`}
        </button>
        <button type="button" className="ghost-btn" onClick={() => { setOpen(false); setError(null) }}>Cancel</button>
      </div>
    </form>
  )
}

function EditNodeForm({ detail, onSaved, onCancel }) {
  const [name, setName] = useState(detail.name)
  const [title, setTitle] = useState(detail.course_title || '')
  const [credits, setCredits] = useState(detail.credit_hours || 3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = { name: name.trim() }
      if (detail.type === 'course') {
        body.course_title = title.trim()
        body.credit_hours = Number(credits)
      }
      await api.updateNode(detail.id, body)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="add-form edit-form" onSubmit={submit}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </label>
      {detail.type === 'course' && (
        <>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            Credit hours
            <select value={credits} onChange={(e) => setCredits(e.target.value)}>
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="add-form-actions">
        <button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="ghost-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function AdviseSection({ nodeId }) {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [resourcesByTag, setResourcesByTag] = useState(null)

  useEffect(() => { setResult(null); setError(null) }, [nodeId])

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const [adv, res] = await Promise.all([api.advise(nodeId), api.resources()])
      const byTag = {}
      res.resources.forEach((r) => r.tags.forEach((t) => (byTag[t] = byTag[t] || []).push(r)))
      setResourcesByTag(byTag)
      setResult(adv)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const issues = result?.findings.filter((f) => !f.passed) || []

  function linksFor(finding) {
    if (!resourcesByTag) return []
    const seen = new Set()
    const out = []
    for (const tag of finding.resource_tags) {
      for (const r of resourcesByTag[tag] || []) {
        if (!seen.has(r.url) && out.length < 2) {
          seen.add(r.url)
          out.push(r)
        }
      }
    }
    return out
  }

  return (
    <section>
      <h3>Recommendations</h3>
      <button className="primary-btn" onClick={run} disabled={busy} aria-busy={busy}>
        {busy ? 'Analyzing…' : 'Analyze module organization'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
      {result && (
        <div className={`check-result ${result.healthy ? 'pass' : 'fail'}`} role="status">
          <p className="check-verdict">{result.healthy ? '✓ ' : ''}{result.summary}</p>
          {issues.length > 0 && (
            <ul className="advise-list">
              {issues.map((f) => (
                <li key={f.rule}>
                  <span className={`sev sev-${f.severity}`}>{f.severity}</span>
                  <div>
                    <p>{f.detail}</p>
                    {linksFor(f).map((r) => (
                      <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="resource-link">
                        {r.title} <span className="muted">({r.source})</span>
                      </a>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

const ACTION_STATUS_LABELS = { open: 'Open', in_progress: 'In progress', done: 'Done' }

function ActionItemForm({ outcomeId, onSaved, onCancel }) {
  const [fields, setFields] = useState({ short_title: '', description: '', person_responsible: '', target_date: '', resources_needed: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setFields((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.createActionItem({ outcome_id: outcomeId, ...fields })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <label>
        Short title
        <input value={fields.short_title} onChange={set('short_title')} placeholder="e.g. Review exam alignment" required autoFocus />
      </label>
      <label>
        Description / rationale
        <input value={fields.description} onChange={set('description')} placeholder="Why this action is needed" />
      </label>
      <label>
        Person responsible
        <input value={fields.person_responsible} onChange={set('person_responsible')} placeholder="e.g. Course instructor" />
      </label>
      <label>
        Target date
        <input value={fields.target_date} onChange={set('target_date')} placeholder="e.g. Fall 2025" />
      </label>
      <label>
        Resources needed
        <input value={fields.resources_needed} onChange={set('resources_needed')} placeholder="e.g. None required" />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="add-form-actions">
        <button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Add action item'}</button>
        <button type="button" className="ghost-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function ActionItemRow({ item, canEdit, onChanged }) {
  const [busy, setBusy] = useState(false)

  async function cycleStatus() {
    const order = ['open', 'in_progress', 'done']
    const next = order[(order.indexOf(item.status) + 1) % order.length]
    setBusy(true)
    try {
      await api.updateActionItem(item.id, { status: next })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await api.deleteActionItem(item.id)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="action-item-row">
      <div className="action-item-head">
        <strong>{item.short_title}</strong>
        <button
          className={`action-status-badge status-${item.status}`}
          onClick={canEdit ? cycleStatus : undefined}
          disabled={busy || !canEdit}
          title={canEdit ? 'Click to advance status' : undefined}
        >
          {ACTION_STATUS_LABELS[item.status] || item.status}
        </button>
      </div>
      {item.description && <p className="muted small">{item.description}</p>}
      <p className="muted small">
        {item.person_responsible && `${item.person_responsible} · `}
        {item.target_date && `Target: ${item.target_date}`}
        {item.resources_needed && ` · Resources: ${item.resources_needed}`}
      </p>
      {canEdit && (
        <button className="ghost-btn small" onClick={remove} disabled={busy}>Remove</button>
      )}
    </li>
  )
}

function ProgramOutcomesSection({ programOutcomes, canEdit, onChanged }) {
  const [openForm, setOpenForm] = useState(null)
  if (!programOutcomes?.length) return null

  return (
    <section>
      <h3>Program outcomes &amp; action items</h3>
      <p className="muted small">Closing-the-loop commitments tracked against each PLO.</p>
      <ul className="plo-list">
        {programOutcomes.map((plo) => (
          <li key={plo.id} className="plo-item">
            <div className="plo-head">
              <strong>{plo.code}</strong>
              {plo.hlc_criterion_tag && <span className="muted small">HLC {plo.hlc_criterion_tag}</span>}
            </div>
            <p className="muted small">{plo.text}</p>
            {plo.action_items.length > 0 && (
              <ul className="action-item-list">
                {plo.action_items.map((item) => (
                  <ActionItemRow key={item.id} item={item} canEdit={canEdit} onChanged={onChanged} />
                ))}
              </ul>
            )}
            {canEdit && (
              openForm === plo.id ? (
                <ActionItemForm
                  outcomeId={plo.id}
                  onSaved={() => { setOpenForm(null); onChanged() }}
                  onCancel={() => setOpenForm(null)}
                />
              ) : (
                <button className="add-btn" onClick={() => setOpenForm(plo.id)}>
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  Add action item
                </button>
              )
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function Sidebar({ nodeId, onClose, onNavigate, canEdit, onTreeChanged, onHighlightOutcome, highlightedOutcomeId, headingRef, createSignal }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const [check, setCheck] = useState(null)
  const [checking, setChecking] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    setDetail(null)
    setCheck(null)
    setError(null)
    if (nodeId == null) return
    let stale = false
    api.node(nodeId).then((d) => { if (!stale) setDetail(d) }).catch((e) => { if (!stale) setError(e.message) })
    return () => { stale = true }
  }, [nodeId, refreshTick])

  const [editing, setEditing] = useState(false)

  useEffect(() => { setEditing(false) }, [nodeId])

  function handleCreated() {
    onTreeChanged?.()
    setRefreshTick((t) => t + 1)
  }

  async function runCompliance() {
    setChecking(true)
    setCheck(null)
    try {
      setCheck(await api.compliance(nodeId))
    } catch (e) {
      setError(e.message)
    } finally {
      setChecking(false)
    }
  }

  // validate automatically as soon as a course or module opens
  useEffect(() => {
    if (!detail || !['course', 'module'].includes(detail.type)) return
    let stale = false
    setChecking(true)
    setCheck(null)
    api.compliance(detail.id)
      .then((c) => { if (!stale) setCheck(c) })
      .catch(() => {})
      .finally(() => { if (!stale) setChecking(false) })
    return () => { stale = true }
  }, [detail?.id, detail?.type, refreshTick])

  const LEGEND = [
    ['institution', 'Institution'], ['college', 'College'], ['department', 'Department'],
    ['program', 'Program'], ['course', 'Course'], ['module', 'Module'],
    ['objective', 'Learning objective'], ['activity', 'Learning activity'], ['assessment', 'Assessment'],
  ]

  if (nodeId == null) {
    return (
      <>
        <div className="sidebar-head">
          <span className="sidebar-head-label">Details</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close details panel" title="Close panel">✕</button>
        </div>
        <div className="drawer-body sidebar-empty">
          <div className="empty-hint">
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
              <rect x="2" y="10" width="9" height="7" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="17" y="4" width="9" height="7" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="17" y="17" width="9" height="7" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M11 13.5h3m0 0V8.5a1 1 0 0 1 1-1h2m-3 6v5a1 1 0 0 0 1 1h2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <h2 ref={headingRef} tabIndex={-1} className="sidebar-title">Pick a node to inspect</h2>
            <p>Click the <span className="inline-info-icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M8 7v4M8 4.6v.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></span> button on any node in the graph, or pick a search result.</p>
          </div>
          <section>
            <h3>Color legend</h3>
            <ul className="legend-list">
              {LEGEND.map(([type, label]) => (
                <li key={type}>
                  <span className="hier-dot" style={{ background: `var(${TYPE_VAR[type] || `--c-${type}`})` }} aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </>
    )
  }

  const learning = detail?.activities?.filter((a) => a.type === 'learning_activity') || []
  const assessments = detail?.activities?.filter((a) => a.type === 'assessment') || []
  const checkable = detail && !['institution', 'college_dept_grouping'].includes(detail.type)
  // derive per-index types: institution, grouping, college, department, course, module
  const typesForPath = detail ? detail.path.map((_, i) => TYPE_ORDER[i]) : []

  return (
    <>
      <div className="sidebar-head">
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          <span className="type-chip" style={detail ? { color: `var(${typeVarFor(detail.type)})`, borderColor: 'currentColor' } : undefined}>
            {detail ? TYPE_LABELS[detail.type] : '…'}
          </span>
          {detail?.status === 'pending' && <span className="pending-badge" title="Not visible to others until approved">Pending approval</span>}
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Close details panel" title="Close panel">✕</button>
      </div>
      <div className="drawer-body">

      {error && <p className="error" role="alert">{error}</p>}
      {!detail && !error && <p className="muted" role="status">Loading…</p>}

      {detail && (
        <>
          <div className="sidebar-title-row">
            <h2 ref={headingRef} tabIndex={-1} className="sidebar-title">{detail.name}</h2>
            {detail.can_edit && !['institution', 'college_dept_grouping'].includes(detail.type) && (
              <button className="icon-btn" onClick={() => setEditing((e) => !e)}
                      aria-label={`Edit ${detail.name}`} aria-expanded={editing} title="Edit">
                <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M11.1 2.4l2.5 2.5L5.4 13H2.9v-2.5l8.2-8.1zM10 3.5l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
          </div>
          {detail.course_title && !editing && <p className="sidebar-subtitle">{detail.course_title}</p>}
          {detail.degree_type && !editing && <p className="sidebar-subtitle">{detail.degree_type}</p>}
          {editing && (
            <EditNodeForm
              detail={detail}
              onSaved={() => { setEditing(false); handleCreated() }}
              onCancel={() => setEditing(false)}
            />
          )}

          <HierarchyPath path={detail.path} pathIds={detail.path_ids} types={typesForPath} onNavigate={onNavigate} />

          <dl className="facts">
            {detail.credit_hours != null && (<><dt>Credit hours</dt><dd>{detail.credit_hours}</dd></>)}
            {detail.descendant_courses != null && (<><dt>Courses</dt><dd>{detail.descendant_courses}</dd></>)}
            {detail.descendant_modules != null && (<><dt>Modules</dt><dd>{detail.descendant_modules}</dd></>)}
            {detail.child_count > 0 && (<><dt>Direct children</dt><dd>{detail.child_count}</dd></>)}
          </dl>

          {detail.outcomes?.length > 0 && (
            <section>
              <h3>Outcomes</h3>
              <p className="muted small">Select an outcome to highlight every mapped node on the graph.</p>
              <ul className="outcome-list">
                {detail.outcomes.map((o) => (
                  <li key={o.code}>
                    <button
                      className={`outcome-btn${highlightedOutcomeId === o.id ? ' active' : ''}`}
                      onClick={() => onHighlightOutcome?.(highlightedOutcomeId === o.id ? null : o.id)}
                      aria-pressed={highlightedOutcomeId === o.id}
                    >
                      <span className="outcome-head">
                        <strong>{o.code}</strong>
                        <span className={`mastery mastery-${o.mastery.toLowerCase()}`}>{o.mastery}</span>
                      </span>
                      <p>{o.text}</p>
                      <p className="muted small">
                        {o.parent_outcome ? `→ ${o.parent_outcome}` : 'no parent outcome'}
                        {o.hlc_criterion_tag ? ` · HLC ${o.hlc_criterion_tag}` : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ProgramOutcomesSection
            programOutcomes={detail.program_outcomes}
            canEdit={detail.can_edit}
            onChanged={handleCreated}
          />

          {learning.length > 0 && (
            <section>
              <h3>Learning activities</h3>
              <ul>{learning.map((a, i) => <li key={i}>{a.name}</li>)}</ul>
            </section>
          )}
          {assessments.length > 0 && (
            <section>
              <h3>Assessments</h3>
              <ul>{assessments.map((a, i) => <li key={i}>{a.name}</li>)}</ul>
            </section>
          )}

          {detail.can_edit && CHILD_OF[detail.type] && (
            <section>
              <h3>{CHILD_OF[detail.type]}s</h3>
              {detail.status === 'pending' ? (
                <p className="muted small">Waiting for this {detail.type} to be approved before {CHILD_OF[detail.type]}s can be added.</p>
              ) : (
                <AddChildForm detail={detail} onCreated={handleCreated} openSignal={createSignal} />
              )}
            </section>
          )}

          {detail.type === 'course' && <AdviseSection nodeId={detail.id} />}

          {checkable && (
            <section>
              <h3>Taxonomy compliance</h3>
              {['course', 'module'].includes(detail.type) ? (
                checking && <p className="muted" role="status">Validating…</p>
              ) : (
                <button className="primary-btn" onClick={runCompliance} disabled={checking} aria-busy={checking}>
                  {checking ? 'Checking…' : 'Run compliance check'}
                </button>
              )}
              {check && (
                <div className={`check-result ${check.compliant ? 'pass' : 'fail'}`} role="status">
                  <p className="check-verdict">
                    {check.compliant ? '✓ Complies with university taxonomy format' : '✗ Does not comply'}
                  </p>
                  {check.checks && (
                    <ul className="check-list">
                      {check.checks.filter((c) => !c.passed).map((c) => (
                        <li key={c.rule}>{c.detail}</li>
                      ))}
                      {check.compliant && <li>All {check.checks.length} checks passed.</li>}
                    </ul>
                  )}
                  {check.courses_checked != null && (
                    <>
                      <p>{check.courses_checked - (check.courses_failing?.length || 0)} of {check.courses_checked} courses compliant.</p>
                      {check.courses_failing?.length > 0 && (
                        <ul className="check-list">
                          {check.courses_failing.slice(0, 10).map((c) => (
                            <li key={c.node_id}><strong>{c.node_name}</strong>: {c.failed_rules.join(', ')}</li>
                          ))}
                          {check.courses_failing.length > 10 && <li>…and {check.courses_failing.length - 10} more.</li>}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}
      </div>
    </>
  )
}
