import { useEffect, useRef, useState } from 'react'
import { api, getToken, setToken } from './api'
import Login from './components/Login.jsx'
import Graph from './components/Graph.jsx'
import Sidebar from './components/Sidebar.jsx'
import Reports from './components/Reports.jsx'
import AccessView from './components/AccessView.jsx'
import UserMenu from './components/UserMenu.jsx'
import UsersView from './components/UsersView.jsx'
import ApprovalsView from './components/ApprovalsView.jsx'
import AcceptInvite from './components/AcceptInvite.jsx'

function GlobalSearch({ onPick }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const boxRef = useRef(null)
  const debounce = useRef(null)

  useEffect(() => {
    clearTimeout(debounce.current)
    if (q.trim().length < 2) { setResults(null); setOpen(false); return }
    debounce.current = setTimeout(() => {
      api.search(q, 12).then((r) => { setResults(r.results); setOpen(true); setActiveIdx(-1) }).catch(() => {})
    }, 200)
    return () => clearTimeout(debounce.current)
  }, [q])

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocClick)
    return () => document.removeEventListener('pointerdown', onDocClick)
  }, [])

  function pick(r) {
    onPick(r)
    setOpen(false)
    setQ('')
  }

  function onKeyDown(e) {
    if (!open || !results?.length) {
      if (e.key === 'Escape') setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      pick(results[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="global-search" ref={boxRef} role="search">
      <input
        type="search"
        placeholder="Search courses, modules, departments…"
        aria-label="Search the whole curriculum"
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
        aria-activedescendant={activeIdx >= 0 ? `search-opt-${activeIdx}` : undefined}
        aria-autocomplete="list"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => results && setOpen(true)}
      />
      <div className="sr-only" role="status">{open && results ? (results.length ? `${results.length} result${results.length === 1 ? '' : 's'} found` : 'No matches') : ''}</div>
      {open && results && (
        <ul className="search-results" id="global-search-results" role="listbox" aria-label="Search results">
          {results.length === 0 && <li className="muted no-hit">No matches.</li>}
          {results.map((r, i) => (
            <li key={r.id}>
              <button
                id={`search-opt-${i}`}
                role="option"
                aria-selected={i === activeIdx}
                className={i === activeIdx ? 'kb-active' : ''}
                onClick={() => pick(r)}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <span className="hit-name">{r.name}{r.course_title ? ` · ${r.course_title}` : ''}</span>
                <span className="hit-path">{r.path.slice(2, -1).join(' › ') || r.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// DEMO MODE: bypasses the login screen and adds a role switcher in the user
// menu. Off unless VITE_DEMO_MODE=true (see frontend/.env.development).
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
const DEMO_USERS = {
  admin: { username: 'admin_test', password: 'admin123' },
  editor: { username: 'editor_test', password: 'editor123' },
  viewer: { username: 'viewer_test', password: 'viewer123' },
}

function findNode(tree, id) {
  if (!tree || id == null) return null
  if (tree.id === id) return tree
  for (const c of tree.children || []) {
    const hit = findNode(c, id)
    if (hit) return hit
  }
  return null
}

const CREATE_KINDS = [
  { child: 'course', parent: 'program', parentLabel: 'program' },
  { child: 'module', parent: 'course', parentLabel: 'course' },
]

function CreateFab({ selectedNode, canEditAnywhere, onCreate, drawerOpen }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!canEditAnywhere) return null
  const editableHere = selectedNode && (selectedNode.access === 'edit')

  return (
    <div className={`create-fab-wrap${drawerOpen ? ' drawer-open' : ''}`} ref={boxRef}>
      {open && (
        <div className="create-menu" role="menu" aria-label="Create">
          {CREATE_KINDS.map((k) => {
            const enabled = editableHere && selectedNode.type === k.parent
            return (
              <button
                key={k.child}
                role="menuitem"
                disabled={!enabled}
                onClick={() => { setOpen(false); onCreate() }}
              >
                <span className="create-menu-title">New {k.child}</span>
                <span className="create-menu-hint">
                  {enabled
                    ? `under ${selectedNode.name}`
                    : `select a ${k.parentLabel} you can edit first`}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <button
        className="create-fab"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.8v10.4M1.8 7h10.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        Create
      </button>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [tree, setTree] = useState(null)
  const [canEdit, setCanEdit] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState('graph')
  const [error, setError] = useState(null)
  const [focusRequest, setFocusRequest] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [highlightedOutcomeId, setHighlightedOutcomeId] = useState(null)
  const [createSignal, setCreateSignal] = useState(0)
  const [highlightIds, setHighlightIds] = useState(null)
  const drawerHeadingRef = useRef(null)
  const drawerToggleRef = useRef(null)
  const openedViaKeyboard = useRef(false)
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('cms_theme') || 'dark' } catch { return 'dark' }
  })
  const [inviteToken, setInviteToken] = useState(
    () => new URLSearchParams(window.location.search).get('invite'))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('cms_theme', theme) } catch {}
  }, [theme])

  async function loginAs(role) {
    if (role !== 'admin') setView((v) => (v === 'users' ? 'graph' : v))
    const creds = DEMO_USERS[role]
    const res = await api.login(creds.username, creds.password)
    setToken(res.token)
    setUser({ role: res.role, username: res.username, first_name: res.first_name })
    setTree(null)
    setSelectedId(null)
    setHighlightedOutcomeId(null)
    setError(null)
  }

  useEffect(() => {
    if (user) return
    if (inviteToken) return // an invite link is being presented; don't race it with demo auto-login
    if (getToken()) {
      api.curriculum()
        .then((res) => {
          setUser({ role: res.role, username: res.username, first_name: res.first_name })
          setTree(res.tree)
          setCanEdit(res.can_edit)
        })
        .catch(() => {
          setToken(null)
          if (DEMO_MODE) loginAs('admin').catch((e) => setError(e.message))
        })
    } else if (DEMO_MODE) {
      loginAs('admin').catch((e) => setError(e.message))
    }
  }, [])

  useEffect(() => {
    if (user && !tree) {
      api.curriculum()
        .then((res) => { setTree(res.tree); setCanEdit(res.can_edit) })
        .catch((e) => setError(e.message))
    }
  }, [user])

  // Escape closes the details drawer; focus returns to the toggle
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false)
        drawerToggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sidebarOpen])

  // move focus into the drawer when it opens from a keyboard interaction
  useEffect(() => {
    if (sidebarOpen && openedViaKeyboard.current) {
      openedViaKeyboard.current = false
      requestAnimationFrame(() => drawerHeadingRef.current?.focus())
    }
  }, [sidebarOpen, selectedId])

  // outcome highlight: fetch mapped node ids
  useEffect(() => {
    if (highlightedOutcomeId == null) { setHighlightIds(null); return }
    let stale = false
    api.outcomeNodes(highlightedOutcomeId)
      .then((r) => { if (!stale) setHighlightIds(new Set(r.node_ids)) })
      .catch(() => {})
    return () => { stale = true }
  }, [highlightedOutcomeId])

  function logout() {
    setToken(null)
    setUser(null)
    setTree(null)
    setSelectedId(null)
    setHighlightedOutcomeId(null)
  }

  function selectNode(id, viaKeyboard = false) {
    setSelectedId(id)
    setHighlightedOutcomeId(null)
    openedViaKeyboard.current = viaKeyboard
    setSidebarOpen(true)
  }

  function handleSearchPick(result) {
    setView('graph')
    selectNode(result.id)
    setFocusRequest({ pathIds: result.path_ids, nodeId: result.id, ts: Date.now() })
  }

  function refetchTree() {
    api.curriculum()
      .then((res) => { setTree(res.tree); setCanEdit(res.can_edit) })
      .catch((e) => setError(e.message))
  }

  if (inviteToken) {
    return (
      <AcceptInvite
        token={inviteToken}
        onActivated={(userPayload, tok) => {
          setToken(tok)
          setUser(userPayload)
          setInviteToken(null)
          const url = new URL(window.location.href)
          url.searchParams.delete('invite')
          window.history.replaceState({}, '', url)
        }}
      />
    )
  }

  if (!user) {
    return DEMO_MODE
      ? <div className="login-wrap"><p className="muted" role="status">Starting demo session…</p></div>
      : <Login onLogin={setUser} />
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="topbar no-print">
        <h1>
          <span className="topbar-title-full">FHSU Curriculum Map</span>
          <span className="topbar-title-short">FHSU CMS</span>
        </h1>
        <nav aria-label="Views">
          <button className={view === 'graph' ? 'active' : ''} onClick={() => setView('graph')}>Graph</button>
          <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>Reports</button>
        </nav>
        <GlobalSearch onPick={handleSearchPick} />
        <UserMenu
          user={user}
          theme={theme}
          onThemeChange={setTheme}
          onLogout={DEMO_MODE ? null : logout}
          demoRole={DEMO_MODE ? user.role : null}
          onDemoRoleChange={DEMO_MODE ? ((r) => loginAs(r).catch((e) => setError(e.message))) : null}
          onOpenUsers={user.role !== 'viewer' ? () => setView('users') : null}
          onOpenAccess={() => setView('access')}
          onOpenApprovals={user.role !== 'viewer' ? () => setView('approvals') : null}
        />
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      {view === 'graph' && (
        <main id="main-content" className="graph-layout">
          {tree ? (
            <Graph
              tree={tree}
              selectedId={selectedId}
              onSelect={(n) => selectNode(n.id)}
              focusRequest={focusRequest}
              highlightIds={highlightIds}
              showAccess={user.role !== 'admin'}
              detailsOpen={sidebarOpen}
            />
          ) : (
            <p className="muted loading-pad" role="status">Loading curriculum…</p>
          )}
          {!sidebarOpen && (
            <button
              ref={drawerToggleRef}
              className="canvas-details-btn"
              onClick={() => setSidebarOpen(true)}
              aria-expanded={false}
              aria-controls="details-drawer"
              aria-label="Show details panel"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
              Details
            </button>
          )}
          <CreateFab
            selectedNode={findNode(tree, selectedId)}
            canEditAnywhere={canEdit}
            onCreate={() => { setSidebarOpen(true); setCreateSignal((s) => s + 1) }}
            drawerOpen={sidebarOpen}
          />
          {highlightIds && (
            <div className="highlight-banner" role="status">
              Highlighting {highlightIds.size} mapped node{highlightIds.size !== 1 ? 's' : ''}
              <button onClick={() => setHighlightedOutcomeId(null)}>Clear</button>
            </div>
          )}
          <aside
            id="details-drawer"
            className={`drawer${sidebarOpen ? ' open' : ''}`}
            aria-label="Node details"
            aria-hidden={!sidebarOpen}
            {...(!sidebarOpen ? { inert: '' } : {})}
          >
            <Sidebar
              nodeId={selectedId}
              onClose={() => { setSidebarOpen(false); drawerToggleRef.current?.focus() }}
              onNavigate={(id) => selectNode(id)}
              canEdit={canEdit}
              onTreeChanged={refetchTree}
              onHighlightOutcome={setHighlightedOutcomeId}
              highlightedOutcomeId={highlightedOutcomeId}
              createSignal={createSignal}
              headingRef={drawerHeadingRef}
            />
          </aside>
        </main>
      )}

      {view === 'reports' && <main id="main-content" className="reports-scroll"><Reports key={user.username} tree={tree} /></main>}
      {view === 'access' && <main id="main-content" className="access-scroll"><AccessView key={user.username} /></main>}
      {view === 'users' && user.role !== 'viewer' && <main id="main-content" className="access-scroll"><UsersView user={user} /></main>}
      {view === 'approvals' && user.role !== 'viewer' && <main id="main-content" className="access-scroll"><ApprovalsView onChanged={refetchTree} /></main>}
    </div>
  )
}
