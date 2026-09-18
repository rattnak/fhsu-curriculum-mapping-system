import { useEffect, useRef, useState } from 'react'

export default function UserMenu({ user, theme, onThemeChange, onLogout, demoRole, onDemoRoleChange, onOpenUsers, onOpenAccess, onOpenApprovals }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const name = user.first_name || user.username || 'User'
  const initial = name.charAt(0).toUpperCase()

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
      >
        <span className="avatar" aria-hidden="true">{initial}</span>
        <span className="user-name">{name}</span>
        <svg className={`caret${open ? ' up' : ''}`} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="user-dropdown" role="menu">
          <div className="dropdown-id">
            <span className="dropdown-name">{name}{user.last_name ? ` ${user.last_name}` : ''}</span>
            <span className={`role-chip role-${user.role}`}>{user.role}</span>
          </div>

          <div className="dropdown-divider" role="separator" />

          {onOpenAccess && (
            <button className="dropdown-item" role="menuitem" onClick={() => { onOpenAccess(); setOpen(false) }}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 1.8l5.2 2.3v3.4c0 3.2-2.2 5.6-5.2 6.7-3-1.1-5.2-3.5-5.2-6.7V4.1L8 1.8z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M5.8 7.9l1.6 1.6 2.8-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              My access
            </button>
          )}
          {onOpenApprovals && (
            <button className="dropdown-item" role="menuitem" onClick={() => { onOpenApprovals(); setOpen(false) }}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5.3 8.1l1.9 1.9 3.5-3.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Pending approvals
            </button>
          )}
          {onOpenUsers && (
            <>
              <button className="dropdown-item" role="menuitem" onClick={() => { onOpenUsers(); setOpen(false) }}>
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="5.5" cy="5" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M1.6 13.5c0-2.2 1.7-3.8 3.9-3.8s3.9 1.6 3.9 3.8M11 5.4a2.1 2.1 0 1 1 1.4 3.9M11.6 9.9c1.8.3 2.9 1.6 2.9 3.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Users &amp; access
              </button>
              <div className="dropdown-divider" role="separator" />
            </>
          )}

          {onDemoRoleChange && (
            <>
              <div className="theme-row" role="group" aria-label="Demo role">
                <span className="dropdown-label">Demo role</span>
                <div className="theme-switch">
                  {['admin', 'editor', 'viewer'].map((r) => (
                    <button
                      key={r}
                      role="menuitemradio"
                      aria-checked={demoRole === r}
                      className={demoRole === r ? 'active' : ''}
                      onClick={() => { if (demoRole !== r) { onDemoRoleChange(r); setOpen(false) } }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dropdown-divider" role="separator" />
            </>
          )}

          <div className="theme-row" role="group" aria-label="Color theme">
            <span className="dropdown-label">Theme</span>
            <div className="theme-switch">
              <button
                role="menuitemradio"
                aria-checked={theme === 'light'}
                className={theme === 'light' ? 'active' : ''}
                onClick={() => onThemeChange('light')}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M8 1.2v1.8M8 13v1.8M1.2 8H3M13 8h1.8M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M12.8 3.2l-1.3 1.3M4.5 11.5l-1.3 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Light
              </button>
              <button
                role="menuitemradio"
                aria-checked={theme === 'dark'}
                className={theme === 'dark' ? 'active' : ''}
                onClick={() => onThemeChange('dark')}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                </svg>
                Dark
              </button>
            </div>
          </div>

          {onLogout && <div className="dropdown-divider" role="separator" />}

          {onLogout && <button className="dropdown-item" role="menuitem" onClick={onLogout}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 2H3.5A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14H6M10.5 11.5L14 8l-3.5-3.5M14 8H6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sign out
          </button>}
        </div>
      )}
    </div>
  )
}
