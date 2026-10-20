'use client'
/**
 * AppShell.tsx — Three nav-bar features:
 *   1. DarkModeToggle   — 🌙/☀ button, persists to localStorage
 *   2. NotificationCenter — 🔔 bell with live badge, dropdown alerts from db
 *   3. KeyboardShortcuts  — global keydown listener + ? cheat-sheet overlay
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'

// ─────────────────────────────────────────────────────────────────────────────
// 1. DARK MODE TOGGLE
// ─────────────────────────────────────────────────────────────────────────────

export function DarkModeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    // Read saved preference; fall back to OS preference
    const saved = localStorage.getItem('dyeflow_theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = saved === 'dark' || (!saved && prefersDark)
    setDark(isDark)
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('dyeflow_theme', next ? 'dark' : 'light')
  }

  return (
    <button
      onClick={toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        padding: '5px 9px',
        fontSize: 15,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        lineHeight: 1,
        color: 'var(--text-primary)',
      }}
    >
      {dark ? '☀' : '🌙'}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. NOTIFICATION CENTER
// ─────────────────────────────────────────────────────────────────────────────

interface Notification {
  id: string
  type: 'overdue' | 'capacity' | 'faulty' | 'inbox' | 'hold' | 'repair'
  title: string
  body: string
  link: string
  urgent: boolean
}

// built on the server from the database (app/api/notices)
async function fetchNotifications(): Promise<Notification[]> {
  try {
    const r = await fetch('/api/notices', { cache: 'no-store' })
    if (!r.ok) return []
    const j = await r.json()
    return j?.ok ? (j.data || []) : []
  } catch { return [] }
}

const TYPE_ICON: Record<string, string>  = { overdue: '⏰', capacity: '⚙', faulty: '⚠️', inbox: '📬', hold: '⏸', repair: '🔧' }
const TYPE_COLOR: Record<string, string> = { overdue: '#DC2626', capacity: '#D97706', faulty: '#DC2626', inbox: '#185FA5', hold: '#6B7280', repair: '#7C3AED' }

export function NotificationCenter() {
  const [open, setOpen]   = useState(false)
  const [notes, setNotes] = useState<Notification[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    if (document.visibilityState === 'hidden') return
    fetchNotifications().then(setNotes)
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 120_000)
    window.addEventListener('dyeflow-db-updated', refresh)
    return () => { clearInterval(t); window.removeEventListener('dyeflow-db-updated', refresh) }
  }, [refresh])

  // Close on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const urgentCount = notes.filter(n => n.urgent).length
  const total       = notes.length

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        style={{
          padding: '5px 9px', fontSize: 15, lineHeight: 1,
          background: open ? 'var(--accent-light)' : 'var(--bg-secondary)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          position: 'relative', color: 'var(--text-primary)',
        }}
      >
        🔔
        {total > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            background: urgentCount > 0 ? '#DC2626' : '#185FA5',
            color: '#fff', fontSize: 9, fontWeight: 700,
            borderRadius: '50%', width: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--bg-primary)',
          }}>
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          width: 320, background: 'var(--bg-primary)',
          border: '1px solid var(--border-light)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', zIndex: 1001,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Notifications {total > 0 && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)' }}>({total})</span>}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={refresh} style={{ padding: '2px 7px', fontSize: 11, border: '1px solid var(--border-light)', background: 'none', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)' }}>↻</button>
              <button onClick={() => setOpen(false)} style={{ padding: '2px 7px', fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>✕</button>
            </div>
          </div>

          {total === 0 ? (
            <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>✅</div>
              All clear — no issues detected
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {notes.map(n => (
                <Link key={n.id} href={n.link} onClick={() => setOpen(false)} style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{
                    padding: '10px 14px', borderBottom: '1px solid var(--border-light)',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    background: (n.urgent && (n.type === 'overdue' || n.type === 'faulty'))
                      ? 'rgba(220,38,38,0.04)' : 'transparent',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = (n.urgent && (n.type === 'overdue' || n.type === 'faulty')) ? 'rgba(220,38,38,0.04)' : 'transparent' }}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{TYPE_ICON[n.type]}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TYPE_COLOR[n.type] }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{n.body}</div>
                    </div>
                    {n.urgent && (
                      <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, background: '#DC2626', color: '#fff', padding: '1px 5px', borderRadius: 8, alignSelf: 'center' }}>
                        URGENT
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────────────────────

const SHORTCUTS = [
  { key: '?',    desc: 'Show / hide this overlay',          category: 'Global' },
  { key: 'Esc',  desc: 'Close modal, dropdown, or overlay', category: 'Global' },
  { key: 'S',    desc: 'Focus the search bar',              category: 'Global' },
  { key: 'R',    desc: 'Refresh page data',                 category: 'Global' },
  { key: 'N',    desc: 'New Order (on Orders page)',        category: 'Orders' },
  { key: '1–5',  desc: 'Switch tabs (Reports, AI)',         category: 'Navigation' },
  { key: 'G O',  desc: 'Go to Orders',                     category: 'Go to…' },
  { key: 'G D',  desc: 'Go to Dashboard',                  category: 'Go to…' },
  { key: 'G R',  desc: 'Go to Reports',                    category: 'Go to…' },
  { key: 'G A',  desc: 'Go to AI Assistant',               category: 'Go to…' },
  { key: 'G P',  desc: 'Go to Production Kanban',          category: 'Go to…' },
  { key: 'G T',  desc: 'Go to Timeline',                   category: 'Go to…' },
  { key: 'G S',  desc: 'Go to Setup',                      category: 'Go to…' },
] as const

export function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false)
  const gPending = useRef(false)
  const gTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      // Don't fire when typing in inputs
      if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return
      if ((e.target as HTMLElement).isContentEditable) return

      const key = e.key

      if (key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setShowHelp(s => !s)
        return
      }

      if (key === 'Escape') {
        setShowHelp(false)
        window.dispatchEvent(new CustomEvent('dyeflow-close-dropdowns'))
        return
      }

      if ((key === 's' || key === 'S') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        const el = document.querySelector<HTMLInputElement>('[data-global-search]')
        if (el) { el.focus(); el.select() }
        return
      }

      if ((key === 'r' || key === 'R') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('dyeflow-refresh'))
        return
      }

      if ((key === 'n' || key === 'N') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('dyeflow-new-order'))
        return
      }

      if (['1','2','3','4','5'].includes(key)) {
        window.dispatchEvent(new CustomEvent('dyeflow-switch-tab', { detail: { index: parseInt(key) - 1 } }))
        return
      }

      // G + letter → navigate
      if ((key === 'g' || key === 'G') && !e.ctrlKey && !e.metaKey) {
        gPending.current = true
        if (gTimer.current) clearTimeout(gTimer.current)
        gTimer.current = setTimeout(() => { gPending.current = false }, 1500)
        return
      }

      if (gPending.current) {
        gPending.current = false
        if (gTimer.current) clearTimeout(gTimer.current)
        const routes: Record<string, string> = {
          o: '/orders', d: '/', r: '/reports', a: '/ai-assistant',
          p: '/production', t: '/timeline', s: '/setup',
        }
        const dest = routes[key.toLowerCase()]
        if (dest) { e.preventDefault(); window.location.href = dest }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const categories = [...new Set(SHORTCUTS.map(s => s.category))]

  return (
    <>
      <button
        onClick={() => setShowHelp(s => !s)}
        title="Keyboard shortcuts (?)"
        style={{
          padding: '5px 8px', fontSize: 12, fontWeight: 700,
          background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          color: 'var(--text-tertiary)',
        }}
      >
        ?
      </button>

      {showHelp && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(3px)' }}
          onClick={() => setShowHelp(false)}
        >
          <div
            style={{ background: 'var(--bg-primary)', borderRadius: 14, padding: '24px 28px', width: 500, maxWidth: '92vw', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>⌨ Keyboard Shortcuts</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>Press ? anywhere to show/hide</div>
              </div>
              <button onClick={() => setShowHelp(false)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-tertiary)', padding: '2px 6px' }}>✕</button>
            </div>

            {categories.map(cat => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border-light)' }}>
                  {cat}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {SHORTCUTS.filter(s => s.category === cat).map(s => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0' }}>
                      <kbd style={{
                        flexShrink: 0, minWidth: 52, textAlign: 'center',
                        padding: '3px 8px', fontSize: 12, fontWeight: 700,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: 6, fontFamily: 'monospace',
                        color: 'var(--text-primary)',
                        boxShadow: '0 2px 0 var(--border-medium)',
                      }}>
                        {s.key}
                      </kbd>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
              Shortcuts don't trigger when typing in an input field.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
