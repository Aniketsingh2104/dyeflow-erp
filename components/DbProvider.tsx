'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Navigation from '@/components/Navigation'

const DB_KEY      = 'dyeflow_db'
const SESSION_KEY = 'dyeflow_session'

let pollTimer: ReturnType<typeof setInterval> | null = null
let saveTimer: ReturnType<typeof setTimeout>  | null = null

// ── Supabase sync helpers ──────────────────────────────────────────────────────

function saveToServer(jsonStr: string) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      await fetch('/api/db', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    jsonStr,
      })
    } catch { /* offline — data stays in localStorage */ }
  }, 600)
}

function patchStorage() {
  if (typeof window === 'undefined') return
  if ((window as any).__dyeflowPatched) return
  ;(window as any).__dyeflowPatched = true
  const orig = localStorage.setItem.bind(localStorage)
  localStorage.setItem = function (key: string, value: string) {
    orig(key, value)
    if (key === DB_KEY) saveToServer(value)
  }
}

async function loadFromServer() {
  try {
    const res = await fetch('/api/db?_t=' + Date.now(), { cache: 'no-store' })
    if (!res.ok) return
    const json = await res.json()
    if (!json.ok || !json.data || Object.keys(json.data).length === 0) return
    const serverStr = JSON.stringify(json.data)
    const localStr  = localStorage.getItem(DB_KEY) || ''
    if (serverStr !== localStr) {
      const session = localStorage.getItem(SESSION_KEY)
      localStorage.setItem(DB_KEY, serverStr)
      if (session) localStorage.setItem(SESSION_KEY, session)
      window.dispatchEvent(new Event('dyeflow-db-updated'))
    }
  } catch { /* offline */ }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(loadFromServer, 5000)
}

// ── Session helpers ────────────────────────────────────────────────────────────

function getSession(): { username: string; role: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s?.username) return null
    return s
  } catch {
    return null
  }
}

// ── DbProvider ─────────────────────────────────────────────────────────────────

export default function DbProvider({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const isLogin  = pathname === '/login'

  // 'checking' — haven't verified session yet (avoids flash of protected content)
  // 'authed'   — session valid, show app
  // 'login'    — no session, show login page
  const [authState, setAuthState] = useState<'checking' | 'authed' | 'login'>('checking')

  useEffect(() => {
    if (isLogin) {
      // If already logged in and user visits /login, send to dashboard
      const session = getSession()
      if (session) {
        router.replace('/')
        return
      }
      setAuthState('login')
      return
    }

    // Protected page — check session
    const session = getSession()
    if (!session) {
      // Clear any stale cookie
      document.cookie = 'dyeflow_session=; path=/; max-age=0'
      setAuthState('login')
      router.replace('/login')
      return
    }

    // Session valid — start syncing
    setAuthState('authed')
    patchStorage()
    loadFromServer()
    startPolling()

    return () => {
      if (pollTimer) clearInterval(pollTimer)
      if (saveTimer)  clearTimeout(saveTimer)
    }
  }, [pathname])

  // Block render until we know auth state — prevents flashing protected content
  if (authState === 'checking') {
    return (
      <div style={{
        minHeight: '100vh', background: '#0f1117',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center', color: '#5f5e5a' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="2" strokeLinecap="round"
            style={{ animation: 'spin 0.8s linear infinite', display: 'block', margin: '0 auto 12px' }}>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          <span style={{ fontSize: 13 }}>Loading…</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // Login page — no nav, full screen
  if (isLogin) {
    return <>{children}</>
  }

  // App — nav + content
  return (
    <>
      <Navigation />
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {children}
      </div>
    </>
  )
}
