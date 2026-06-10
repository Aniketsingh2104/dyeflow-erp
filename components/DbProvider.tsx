'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Navigation from '@/components/Navigation'

const DB_KEY      = 'dyeflow_db'
const SESSION_KEY = 'dyeflow_session'
let pollTimer: any = null
let saveTimer: any = null

function saveToServer(jsonStr: string) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonStr,
      })
    } catch { /* offline */ }
  }, 400)
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
    const serverData = json.data
    if (!serverData || Object.keys(serverData).length === 0) return
    const serverStr = JSON.stringify(serverData)
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

/** Validate session — returns true if a valid session exists */
function hasValidSession(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return false
    const session = JSON.parse(raw)
    if (!session?.username) return false
    return true
  } catch {
    return false
  }
}

export default function DbProvider({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const isLogin  = pathname === '/login'
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isLogin) {
      // On login page — just mark ready, no auth check needed
      setReady(true)
      return
    }

    // On any other page — check for valid session
    if (!hasValidSession()) {
      router.replace('/login')
      return
    }

    setReady(true)
    patchStorage()
    loadFromServer()
    startPolling()

    return () => {
      if (pollTimer) clearInterval(pollTimer)
      if (saveTimer) clearTimeout(saveTimer)
    }
  }, [pathname])

  // Don't flash nav while redirecting
  if (!ready && !isLogin) return null

  return (
    <>
      {/* Hide navigation on the login page */}
      {!isLogin && <Navigation />}
      <div style={isLogin ? {} : { flex: 1, overflow: 'auto', minHeight: 0 }}>
        {children}
      </div>
    </>
  )
}
