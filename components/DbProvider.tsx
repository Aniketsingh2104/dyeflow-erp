'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const DB_KEY = 'dyeflow_db'
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
    } catch { /* offline — data stays in localStorage */ }
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
    const localStr = localStorage.getItem(DB_KEY) || ''
    if (serverStr !== localStr) {
      // Preserve session info when merging server data
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

export default function DbProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Check auth — redirect to login if no session
    if (pathname !== '/login') {
      const session = localStorage.getItem(SESSION_KEY)
      if (!session) {
        router.push('/login')
        return
      }
    }

    patchStorage()
    loadFromServer()
    startPolling()

    return () => {
      if (pollTimer) clearInterval(pollTimer)
      if (saveTimer) clearTimeout(saveTimer)
    }
  }, [pathname])

  return <>{children}</>
}
