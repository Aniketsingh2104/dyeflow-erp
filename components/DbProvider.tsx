'use client'

/**
 * DbProvider — app shell around every page.
 *
 * Sign-in is enforced on the server (proxy.ts + signed HttpOnly cookie).
 * This component only:
 *   1. Refreshes the UI copy of the user (name / menu permissions) from
 *      /api/auth, so role or permission changes show up without re-login.
 *   2. Sends the user to /login if the server says the session is gone
 *      (expired after 12 h, signed out elsewhere, or account deactivated).
 *   3. Watches for data changes every 30 s via /api/changes and fires the
 *      'dyeflow-db-updated' event that pages already listen to.
 *      (Replaces Supabase Realtime, which needed the public key to be able
 *       to read the tables directly from the browser.)
 */
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Navigation from '@/components/Navigation'
import { saveUiSession, clearUiSession } from '@/lib/clientSession'

const POLL_MS = 30_000

// Dispatch a global event so any component can react to DB changes
export function notifyDbChanged(table?: string) {
  window.dispatchEvent(new CustomEvent('dyeflow-db-updated', { detail: { table } }))
}

function goToLogin() {
  if (window.location.pathname === '/login') return
  clearUiSession()
  const next = window.location.pathname + window.location.search
  window.location.replace('/login' + (next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''))
}

// Any API call answered with "not signed in" → back to the login page
let fetchPatched = false
function patchFetchOnce() {
  if (fetchPatched || typeof window === 'undefined') return
  fetchPatched = true
  const original = window.fetch.bind(window)
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await original(...args)
    if (res.status === 401 && res.headers.get('x-dyeflow-auth') === 'required') goToLogin()
    return res
  }
}

export default function DbProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLogin  = pathname === '/login'
  const lastSig  = useRef<string | null>(null)

  useEffect(() => { patchFetchOnce() }, [])

  // Refresh the UI copy of the signed-in user on every page change
  useEffect(() => {
    if (isLogin) return
    let cancelled = false
    fetch('/api/auth', { cache: 'no-store' })
      .then(r => r.json().then(j => ({ status: r.status, j })))
      .then(({ status, j }) => {
        if (cancelled) return
        if (j?.ok && j.user) {
          saveUiSession(j.user)
          window.dispatchEvent(new Event('storage'))   // Navigation / permission hooks re-read it
        } else if (status === 401) {
          goToLogin()
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [pathname, isLogin])

  // Light change-watch instead of Realtime
  useEffect(() => {
    if (isLogin) return
    let stopped = false
    const check = async () => {
      if (stopped || document.visibilityState === 'hidden') return
      try {
        const r = await fetch('/api/changes', { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (!j?.ok || !j.sig) return
        if (lastSig.current !== null && lastSig.current !== j.sig) notifyDbChanged()
        lastSig.current = j.sig
      } catch {}
    }
    check()
    const t = setInterval(check, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { stopped = true; clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [isLogin])

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
