import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

const NODE_W = 260
const PITCH = 360 // horizontal distance between columns
const Y_GAP = 14
const BASE_H = 66
const SEARCH_H = 42
const SEARCH_THRESHOLD = 7 // children count at which a node gets its own filter bar
const DRAWER_W = 380 // matches .drawer's width in styles.css — subtracted from the
                     // usable viewport when the details sidebar is open, so
                     // centering targets the space actually left for the graph

const TYPE_META = {
  institution: { label: 'Institution', varName: '--c-institution' },
  college_dept_grouping: { label: 'Grouping', varName: '--c-grouping' },
  college: { label: 'College', varName: '--c-college' },
  department: { label: 'Department', varName: '--c-department' },
  program: { label: 'Program', varName: '--c-program' },
  course: { label: 'Course', varName: '--c-course' },
  module: { label: 'Module', varName: '--c-module' },
  objective: { label: 'Objective', varName: '--c-objective' },
  learning_activity: { label: 'Activity', varName: '--c-activity' },
  assessment: { label: 'Assessment', varName: '--c-assessment' },
}
const LEAF_TYPES = new Set(['objective', 'learning_activity', 'assessment'])

// modules expand into synthesized leaf nodes: learning objectives + activities
function childrenOf(n) {
  if (n.type !== 'module') return n.children || []
  const kids = []
  ;(n.objectives || []).forEach((o, i) =>
    kids.push({ id: `${n.id}:obj:${i}`, name: o.text, code: o.code, mastery: o.mastery, type: 'objective' }))
  ;(n.activities || []).forEach((a, i) =>
    kids.push({ id: `${n.id}:act:${i}`, name: a.name, type: a.type }))
  return kids
}

function hasSearchBar(node, expanded) {
  return expanded.has(node.id) && childrenOf(node).length >= SEARCH_THRESHOLD && !LEAF_TYPES.has(node.type)
}

function computeLayout(root, expanded, filters) {
  const placed = []
  const edges = []

  const visibleChildren = (n) => {
    const kids = childrenOf(n)
    if (!expanded.has(n.id) || !kids.length) return []
    const f = (filters[n.id] || '').trim().toLowerCase()
    if (!f) return kids
    return kids.filter(
      (c) =>
        c.name.toLowerCase().includes(f) ||
        (c.course_title || '').toLowerCase().includes(f),
    )
  }

  const nodeHeight = (n) =>
    LEAF_TYPES.has(n.type) ? 44 : BASE_H + (hasSearchBar(n, expanded) ? SEARCH_H : 0)

  function measure(n) {
    const kids = visibleChildren(n).map(measure)
    const h = nodeHeight(n)
    const kidsTotal = kids.reduce((s, k) => s + k.subtree, 0) + Y_GAP * Math.max(0, kids.length - 1)
    return { n, h, kids, subtree: Math.max(h, kidsTotal), kidsTotal }
  }

  function place(m, depth, top) {
    const cy = top + m.subtree / 2
    placed.push({ node: m.n, x: depth * PITCH, y: cy - m.h / 2, h: m.h, cy })
    let childTop = top + (m.subtree - m.kidsTotal) / 2
    for (const k of m.kids) {
      edges.push({
        from: { x: depth * PITCH + NODE_W, y: cy },
        to: { x: (depth + 1) * PITCH, y: childTop + k.subtree / 2 },
        key: `${m.n.id}-${k.n.id}`,
      })
      place(k, depth + 1, childTop)
      childTop += k.subtree + Y_GAP
    }
  }

  const measured = measure(root)
  place(measured, 0, 0)
  return { placed, edges, totalHeight: measured.subtree }
}

// hover-marquee: slide the name sideways so long names can be read in place
function marqueeEnter(e) {
  const clip = e.currentTarget
  const inner = clip.firstChild
  const overflow = inner.scrollWidth - clip.clientWidth
  if (overflow > 4) {
    inner.style.transitionDuration = `${Math.max(600, overflow * 22)}ms`
    inner.style.transform = `translateX(-${overflow}px)`
  }
}
function marqueeLeave(e) {
  const inner = e.currentTarget.firstChild
  inner.style.transitionDuration = '350ms'
  inner.style.transform = 'translateX(0)'
}

const ACCESS_ICONS = {
  edit: { title: 'You can edit here', cls: 'access-edit',
    d: 'M11.1 2.4l2.5 2.5L5.4 13H2.9v-2.5l8.2-8.1zM10 3.5l2.5 2.5' },
  view: { title: 'View only', cls: 'access-view',
    d: 'M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8zm6.5 1.9a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8z' },
  context: { title: 'No access at this level (structure shown for context)', cls: 'access-context',
    d: 'M4.5 7V5.2a3.5 3.5 0 0 1 7 0V7m-8 0h9a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z' },
}

function AccessIcon({ access }) {
  const icon = ACCESS_ICONS[access]
  if (!icon) return null
  return (
    <span className={`access-icon ${icon.cls}`} title={icon.title} role="img" aria-label={icon.title}>
      <svg width="12" height="12" viewBox="0 0 16 16"><path d={icon.d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </span>
  )
}

function NodeCard({ entry, expanded, filters, onToggle, onSelect, onFilter, selectedId, highlighted, showAccess, detailsOpen }) {
  const { node, h } = entry
  const meta = TYPE_META[node.type] || { label: node.type, varName: '--c-module' }
  const childCount = childrenOf(node).length
  const isOpen = expanded.has(node.id)
  const searchable = hasSearchBar(node, expanded)
  const isSelected = selectedId === node.id

  if (LEAF_TYPES.has(node.type)) {
    return (
      <foreignObject x={entry.x} y={entry.y} width={NODE_W} height={h} style={{ overflow: 'visible' }}>
        <div className="gnode gnode-leaf" style={{ height: h }} title={node.name}>
          <span className="gnode-dot" style={{ background: `var(${meta.varName})` }} aria-hidden="true" />
          <span className="gnode-leaf-body">
            <span className="gnode-leaf-type">{meta.label}{node.mastery ? ` · ${node.mastery}` : ''}</span>
            <span className="gnode-name-clip" onMouseEnter={marqueeEnter} onMouseLeave={marqueeLeave}>
              <span className="gnode-name gnode-leaf-name">{node.name}</span>
            </span>
          </span>
        </div>
      </foreignObject>
    )
  }

  return (
    <foreignObject x={entry.x} y={entry.y} width={NODE_W} height={h} style={{ overflow: 'visible' }}>
      <div className={`gnode${isSelected ? ' selected' : ''}${highlighted ? ' highlighted' : ''}${node.status === 'pending' ? ' pending' : ''}`} style={{ height: h }}>
        <div className="gnode-type-row">
          <span className="gnode-dot" style={{ background: `var(${meta.varName})` }} aria-hidden="true" />
          <span className="gnode-type">{meta.label}</span>
          {childCount > 0 && <span className="gnode-count">{childCount}</span>}
          {node.status === 'pending' && <span className="pending-badge" title="Not visible to others until approved">Pending</span>}
          {showAccess && <AccessIcon access={node.access} />}
          {node.access !== 'context' && <button
            className="gnode-info"
            onClick={() => onSelect(node)}
            aria-label={`Details for ${node.name}`}
            title="Details"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M8 7v4M8 4.6v.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>}
        </div>
        <button
          className="gnode-main"
          onClick={() => (childCount && !detailsOpen ? onToggle(node.id) : onSelect(node))}
          aria-expanded={childCount ? isOpen : undefined}
          aria-label={detailsOpen ? `Details for ${node.name}` : node.name}
        >
          <span className="gnode-name-clip" onMouseEnter={marqueeEnter} onMouseLeave={marqueeLeave}>
            <span className="gnode-name">{node.name}</span>
          </span>
          {childCount > 0 && (
            detailsOpen ? (
              <span
                className={`gnode-chevron${isOpen ? ' open' : ''}`}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.name}`}
                onClick={(e) => { e.stopPropagation(); onToggle(node.id) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggle(node.id) } }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
            ) : (
              <span className={`gnode-chevron${isOpen ? ' open' : ''}`} aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
            )
          )}
        </button>
        {searchable && (
          <input
            className="gnode-search"
            type="search"
            placeholder={`Filter ${childCount} items…`}
            aria-label={`Filter children of ${node.name}`}
            value={filters[node.id] || ''}
            onChange={(e) => onFilter(node.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </foreignObject>
  )
}

function initialExpanded(tree) {
  const initial = new Set([tree.id])
  if (tree.children?.length === 1) initial.add(tree.children[0].id)
  // context nodes are just the skeleton path to granted areas: open them
  ;(function walk(n) {
    if (n.access === 'context') {
      initial.add(n.id)
      n.children?.forEach(walk)
    }
  })(tree)
  return initial
}

export default function Graph({ tree, selectedId, onSelect, focusRequest, highlightIds, showAccess, detailsOpen }) {
  const [expanded, setExpanded] = useState(() => new Set())
  const [filters, setFilters] = useState({})
  const svgRef = useRef(null)
  const gRef = useRef(null)
  const view = useRef({ x: 60, y: 0, k: 1 })
  const drag = useRef(null)
  const didInit = useRef(false)
  const anchorId = useRef(null) // node to keep visually fixed across a re-layout
  const anchorExpanding = useRef(false) // pan to reveal children after an expand
  const resetPending = useRef(false) // recenter after a reset
  const pendingFocus = useRef(null) // node to pan to once it exists in the layout
  const prevPositions = useRef(new Map())
  const didCenterInitial = useRef(false)

  // start with root + grouping expanded
  useEffect(() => {
    if (tree && !didInit.current) {
      didInit.current = true
      setExpanded(initialExpanded(tree))
    }
  }, [tree])

  const { placed, edges, totalHeight } = useMemo(
    () => (tree ? computeLayout(tree, expanded, filters) : { placed: [], edges: [], totalHeight: 0 }),
    [tree, expanded, filters],
  )

  const applyView = () => {
    const { x, y, k } = view.current
    if (gRef.current) gRef.current.setAttribute('transform', `translate(${x},${y}) scale(${k})`)
  }

  // the graph's usable width is the viewport minus the details drawer when
  // it's open, so centering targets the space actually left for the canvas
  // rather than running the math against the full window and ending up
  // behind the drawer
  const usableWidth = (rectWidth) => Math.max(200, rectWidth - (detailsOpen ? DRAWER_W : 0))

  // centers the layout within the usable width when it fits at scale k;
  // otherwise anchors near the left edge so nothing scrolls off-screen
  const centeredOrLeftX = (rectWidth, contentWidth, k = 1) => {
    const w = usableWidth(rectWidth)
    return contentWidth * k <= w ? (w - contentWidth * k) / 2 : 60
  }

  // center on first layout (both axes, when the graph fits). Runs once expanded
  // actually reflects initialExpanded (more than just the bare root) — the very
  // first render fires before that async setExpanded lands, and centering
  // against that transient single-node layout would freeze the view off-center
  // once the real (wider) initial layout appears a moment later.
  useLayoutEffect(() => {
    if (placed.length && expanded.size > 1 && svgRef.current && !didCenterInitial.current) {
      didCenterInitial.current = true
      const rect = svgRef.current.getBoundingClientRect()
      const maxX = Math.max(...placed.map((p) => p.x)) + NODE_W
      view.current.x = centeredOrLeftX(rect.width, maxX)
      view.current.y = rect.height / 2 - totalHeight / 2
      applyView()
    }
  }, [placed.length, expanded.size])

  // keep the toggled/filtered node fixed on screen when the layout reflows
  useLayoutEffect(() => {
    if (resetPending.current && svgRef.current) {
      resetPending.current = false
      const rect = svgRef.current.getBoundingClientRect()
      const maxX = placed.length ? Math.max(...placed.map((p) => p.x)) + NODE_W : 0
      view.current = { x: centeredOrLeftX(rect.width, maxX), y: rect.height / 2 - totalHeight / 2, k: 1 }
      applyView()
      anchorId.current = null
      anchorExpanding.current = false
      prevPositions.current = new Map(placed.map((p) => [p.node.id, { x: p.x, cy: p.cy }]))
      return
    }
    if (pendingFocus.current != null && svgRef.current) {
      const entry = placed.find((p) => p.node.id === pendingFocus.current)
      if (entry) {
        pendingFocus.current = null
        const rect = svgRef.current.getBoundingClientRect()
        const k = view.current.k
        view.current.x = usableWidth(rect.width) * 0.4 - entry.x * k
        view.current.y = rect.height / 2 - entry.cy * k
        applyView()
        anchorId.current = null
        anchorExpanding.current = false
        prevPositions.current = new Map(placed.map((p) => [p.node.id, { x: p.x, cy: p.cy }]))
        return
      }
    }
    const id = anchorId.current
    if (id != null) {
      const prev = prevPositions.current.get(id)
      const next = placed.find((p) => p.node.id === id)
      if (prev && next) {
        const k = view.current.k
        view.current.x -= (next.x - prev.x) * k
        view.current.y -= (next.cy - prev.cy) * k
      }
      if (next && anchorExpanding.current && svgRef.current) {
        // re-center the whole (now-wider) layout within the usable width so
        // expanding keeps the graph centered rather than just nudging the
        // new children barely into view
        const rect = svgRef.current.getBoundingClientRect()
        const k = view.current.k
        const maxX = Math.max(...placed.map((p) => p.x)) + NODE_W
        const centeredX = centeredOrLeftX(rect.width, maxX, k)
        if (centeredX !== 60) {
          // fits at this scale: recenter outright
          view.current.x = centeredX
        } else {
          // doesn't fit: fall back to the old "keep new children on screen,
          // don't push the expanded node off the left edge" nudge
          const w = usableWidth(rect.width)
          const childRight = (next.x + PITCH + NODE_W) * k + view.current.x
          if (childRight > w - 24) {
            view.current.x -= childRight - (w - 24)
          }
          const anchorLeft = next.x * k + view.current.x
          if (anchorLeft < 24) view.current.x += 24 - anchorLeft
        }
      }
      applyView()
      anchorId.current = null
      anchorExpanding.current = false
    }
    prevPositions.current = new Map(placed.map((p) => [p.node.id, { x: p.x, cy: p.cy }]))
  }, [placed])

  // external focus (global search): expand path; the layout effect pans once the node exists
  useEffect(() => {
    if (!focusRequest) return
    const { pathIds, nodeId } = focusRequest
    pendingFocus.current = nodeId
    setExpanded((prev) => {
      const next = new Set(prev)
      pathIds.forEach((id) => { if (id !== nodeId) next.add(id) })
      return next
    })
    setFilters({})
  }, [focusRequest])

  const layoutCache = useRef({ placed, edges })
  layoutCache.current = { placed, edges }

  useEffect(applyView)

  function onWheel(e) {
    e.preventDefault()
    const rect = svgRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const { x, y, k } = view.current
    const nk = Math.min(2.5, Math.max(0.15, k * Math.exp(-e.deltaY * 0.0015)))
    view.current = { k: nk, x: px - ((px - x) / k) * nk, y: py - ((py - y) / k) * nk }
    applyView()
  }

  function onPointerDown(e) {
    if (e.target.closest('.gnode')) return
    drag.current = { sx: e.clientX, sy: e.clientY, ox: view.current.x, oy: view.current.y }
    svgRef.current.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e) {
    if (!drag.current) return
    view.current.x = drag.current.ox + (e.clientX - drag.current.sx)
    view.current.y = drag.current.oy + (e.clientY - drag.current.sy)
    applyView()
  }
  function onPointerUp() { drag.current = null }

  function zoomBy(f) {
    const rect = svgRef.current.getBoundingClientRect()
    const px = rect.width / 2, py = rect.height / 2
    const { x, y, k } = view.current
    const nk = Math.min(2.5, Math.max(0.15, k * f))
    view.current = { k: nk, x: px - ((px - x) / k) * nk, y: py - ((py - y) / k) * nk }
    applyView()
  }

  function fit() {
    const rect = svgRef.current.getBoundingClientRect()
    const w = usableWidth(rect.width)
    const maxX = Math.max(...placed.map((p) => p.x)) + NODE_W
    const k = Math.min(1, w / (maxX + 120), rect.height / (totalHeight + 120))
    view.current = { k, x: (w - maxX * k) / 2, y: rect.height / 2 - (totalHeight * k) / 2 }
    applyView()
  }

  function reset() {
    resetPending.current = true
    setFilters({})
    setExpanded(initialExpanded(tree))
  }

  function toggle(id) {
    anchorId.current = id
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        anchorExpanding.current = true
      }
      return next
    })
  }

  return (
    <div className="graph-wrap">
      <svg
        ref={svgRef}
        className="graph-svg"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="application"
        aria-label="Curriculum graph. Click a node to expand it; use the info button on a node for details."
      >
        <defs>
          <pattern id="dotgrid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="var(--grid-dot)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotgrid)" />
        <g ref={gRef}>
          {edges.map((e) => (
            <path
              key={e.key}
              className="graph-edge"
              d={`M ${e.from.x} ${e.from.y} C ${e.from.x + 55} ${e.from.y}, ${e.to.x - 55} ${e.to.y}, ${e.to.x} ${e.to.y}`}
            />
          ))}
          {placed.map((entry) => (
            <NodeCard
              key={entry.node.id}
              entry={entry}
              expanded={expanded}
              filters={filters}
              onToggle={toggle}
              onSelect={onSelect}
              onFilter={(id, v) => { anchorId.current = id; setFilters((f) => ({ ...f, [id]: v })) }}
              selectedId={selectedId}
              highlighted={highlightIds?.has(entry.node.id)}
              showAccess={showAccess}
              detailsOpen={detailsOpen}
            />
          ))}
        </g>
      </svg>
      <div className="graph-toolbar" role="group" aria-label="View controls">
        <button onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <button onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
        <button onClick={fit} aria-label="Fit graph to screen">Fit</button>
        <button onClick={reset} aria-label="Reset graph to the default view">Reset</button>
      </div>
    </div>
  )
}
