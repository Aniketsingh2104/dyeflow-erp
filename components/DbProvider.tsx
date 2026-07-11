'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Navigation from '@/components/Navigation'
import { createClient } from '@supabase/supabase-js'

const SESSION_KEY = 'dyeflow_session'

// Supabase realtime client — uses anon key (read-only subscriptions)
const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  || ''
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

let realtimeClient: ReturnType<typeof createClient> | null = null

function getRealtimeClient() {
  if (!realtimeClient && supabaseUrl && supabaseAnon) {
    realtimeClient = createClient(supabaseUrl, supabaseAnon)
  }
  return realtimeClient
}

function getSession(): { username: string; role: string; id: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s?.username) return null
    return s
  } catch { return null }
}

// Dispatch a global event so any component can react to DB changes
export function notifyDbChanged(table?: string) {
  window.dispatchEvent(new CustomEvent('dyeflow-db-updated', { detail: { table } }))
}

export default function DbProvider({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const isLogin  = pathname === '/login'

  const [authState, setAuthState] = useState<'checking' | 'authed' | 'login'>('authed')

  useEffect(() => {
    if (isLogin) {
      const session = getSession()
      if (session) { router.replace('/'); return }
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

    // ── Supabase Realtime — replaces 5-second polling ──────────────────────
    const client = getRealtimeClient()
    if (!client) return

    const channel = client
      .channel('dyeflow-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },
        () => notifyDbChanged('orders'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batches' },
        () => notifyDbChanged('batches'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_processes' },
        () => notifyDbChanged('batch_processes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'faulty_records' },
        () => notifyDbChanged('faulty_records'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' },
        () => notifyDbChanged('machines'))
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [pathname])

  if (authState === 'checking') {
    return (
      <div style={{
        minHeight: '100vh', background: '#0f1117',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center', color: '#5f5e5a' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="2"
            strokeLinecap="round"
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
