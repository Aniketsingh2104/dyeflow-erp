'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Navigation from '@/components/Navigation'

const DB_KEY        = 'dyeflow_db'
const SESSION_KEY   = 'dyeflow_session'
const LAST_SAVE_KEY = 'dyeflow_last_local_save' // timestamp of last local write

let pollTimer:    ReturnType<typeof setInterval> | null = null
let saveTimer:    ReturnType<typeof setTimeout>  | null = null
let isSaving      = false   // true while a POST to /api/db is in flight
let lastSavedToServer = 0   // epoch ms of last successful server save

// ── Save local → server ────────────────────────────────────────────────────────

async function saveToServerNow(jsonStr: string) {
  isSaving = true
  try {
    const res = await fetch('/api/db', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    jsonStr,
    })
    if (res.ok) {
      lastSavedToServer = Date.now()
    }
  } catch { /* offline */ } finally {
    isSaving = false
  }
}

function saveToServer(jsonStr: string) {
  if (saveTimer) clearTimeout(saveTimer)
  // Record the time of this local change
  localStorage.setItem(LAST_SAVE_KEY, String(Date.now()))
  saveTimer = setTimeout(() => saveToServerNow(jsonStr), 600)
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

// ── Load server → local (only if server is newer) ─────────────────────────────

async function loadFromServer() {
  // Never pull from server while a local save is pending/in-flight
  if (isSaving || saveTimer) return

  try {
    const res = await fetch('/api/db?_t=' + Date.now(), { cache: 'no-store' })
    if (!res.ok) return
    const json = await res.json()
    if (!json.ok || !json.data || Object.keys(json.data).length === 0) return

    const serverStr    = JSON.stringify(json.data)
    const localStr     = localStorage.getItem(DB_KEY) || ''
    const serverTime   = json.updated_at ? new Date(json.updated_at).getTime() : 0
    const lastLocalSave = parseInt(localStorage.getItem(LAST_SAVE_KEY) || '0', 10)

    // Only overwrite local if:
    // 1. Server has different data AND
    // 2. Server updated_at is newer than our last local save
    //    (meaning the change came from another device, not from us)
    if (serverStr !== localStr && serverTime > lastLocalSave) {
      const session = localStorage.getItem(SESSION_KEY)
      // Use the raw localStorage.setItem so we don't re-trigger saveToServer
      ;(window as any).__origSetItem
        ? (window as any).__origSetItem(DB_KEY, serverStr)
        : localStorage.setItem(DB_KEY, serverStr)
      if (session) localStorage.setItem(SESSION_KEY, session)
      window.dispatchEvent(new Event('dyeflow-db-updated'))
    }
  } catch { /* offline */ }
}

function patchStorageWithOrigRef() {
  if (typeof window === 'undefined') return
  if ((window as any).__dyeflowPatched) return
  ;(window as any).__dyeflowPatched = true
  // Keep a reference to the original setItem BEFORE patching
  const orig = localStorage.setItem.bind(localStorage)
  ;(window as any).__origSetItem = orig
  localStorage.setItem = function (key: string, value: string) {
    orig(key, value)
    if (key === DB_KEY) saveToServer(value)
  }
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

  const [authState, setAuthState] = useState<'checking' | 'authed' | 'login'>('checking')

  useEffect(() => {
    if (isLogin) {
      const session = getSession()
      if (session) {
        router.replace('/')
        return
      }
      setAuthState('login')
      return
    }

    const session = getSession()
    if (!session) {
      document.cookie = 'dyeflow_session=; path=/; max-age=0'
      setAuthState('login')
      router.replace('/login')
      return
    }

    setAuthState('authed')
    patchStorageWithOrigRef()
    loadFromServer()
    startPolling()

    return () => {
      if (pollTimer) clearInterval(pollTimer)
      if (saveTimer)  clearTimeout(saveTimer)
    }
  }, [pathname])

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

  if (isLogin) return <>{children}</>

  return (
    <>
      <Navigation />
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {children}
      </div>
    </>
  )
}
