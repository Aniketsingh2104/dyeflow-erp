'use client'
// Auto-refresh for floor sheets: calls the page's (silent) load again
//   · every N seconds while the tab is visible (N = Factory Settings → Auto refresh, default 30; 0 = off)
//   · straight away when the tab becomes visible / window gets focus again
// but NOT while a modal is open or the user is typing in a field, and never
// two at once. The page's load must not show a spinner or clear its state —
// pass the "silent" version.
//
//   const { ago } = useAutoRefresh(() => load(true))
//   <RefreshStamp />   ← "Updated 12 s ago" next to the ↻ button
import { useCallback, useEffect, useRef, useState } from 'react'

export const AUTO_REFRESH_OPTIONS = [
  { value: 0, label: 'Off' }, { value: 15, label: 'Every 15 seconds' }, { value: 30, label: 'Every 30 seconds' }, { value: 60, label: 'Every 60 seconds' },
]
export const DEFAULT_AUTO_REFRESH_SEC = 30

// the setting is read once per tab and kept for 10 minutes
let cachedSec: number | null = null
let cachedAt = 0
async function refreshSeconds(): Promise<number> {
  if (cachedSec !== null && Date.now() - cachedAt < 10 * 60_000) return cachedSec
  try {
    const r = await fetch('/api/setup/settings?key=factory', { cache: 'no-store' }).then(r => r.json())
    const v = Number(r?.value?.autoRefreshSec)
    cachedSec = Number.isFinite(v) && v >= 0 ? v : DEFAULT_AUTO_REFRESH_SEC
  } catch { cachedSec = DEFAULT_AUTO_REFRESH_SEC }
  cachedAt = Date.now()
  return cachedSec
}
/** Factory Settings page calls this after saving so open tabs pick the new value up on their next tick */
export function resetAutoRefreshCache() { cachedSec = null }

/** true while the user is busy — a refresh now could close a dialog or wipe what they type */
export function userIsBusy(): boolean {
  if (typeof document === 'undefined') return true
  if (document.querySelector('.modal-overlay, .modal, [data-no-autorefresh]')) return true
  const el = document.activeElement as HTMLElement | null
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) {
    const t = (el as HTMLInputElement).type
    if (t !== 'checkbox' && t !== 'radio' && t !== 'button' && t !== 'file') return true
  }
  return false
}

// one shared "last refreshed" clock per page so RefreshStamp can show it
let listeners: Array<() => void> = []
let lastRefreshAt: number | null = null
function markRefreshed() { lastRefreshAt = Date.now(); listeners.forEach(l => l()) }

export function useAutoRefresh(load: () => Promise<unknown> | unknown, opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled !== false
  const loadRef = useRef(load); loadRef.current = load
  const running = useRef(false)
  const [sec, setSec] = useState<number>(DEFAULT_AUTO_REFRESH_SEC)

  const run = useCallback(async (force = false) => {
    if (running.current) return
    if (!force && (document.visibilityState !== 'visible' || userIsBusy())) return
    running.current = true
    try { await loadRef.current(); markRefreshed() } catch {} finally { running.current = false }
  }, [])

  useEffect(() => { lastRefreshAt = Date.now(); listeners.forEach(l => l()) }, [])   // first load done by the page itself
  useEffect(() => { refreshSeconds().then(setSec) }, [])

  useEffect(() => {
    if (!enabled || sec <= 0) return
    const timer = setInterval(() => { run() }, sec * 1000)
    // came back to the tab / window → refresh if the data is older than 5 s
    const onVisible = () => { if (document.visibilityState === 'visible' && (!lastRefreshAt || Date.now() - lastRefreshAt > 5000)) run() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); window.removeEventListener('online', onVisible) }
  }, [enabled, sec, run])

  return { refreshNow: () => run(true), seconds: sec }
}

/** small grey "Updated 12 s ago" — put it next to the ↻ button */
export function RefreshStamp({ style }: { style?: React.CSSProperties }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = () => tick(t => t + 1)
    listeners.push(l)
    const t = setInterval(l, 5000)
    return () => { listeners = listeners.filter(x => x !== l); clearInterval(t) }
  }, [])
  if (!lastRefreshAt) return null
  const s = Math.max(0, Math.round((Date.now() - lastRefreshAt) / 1000))
  const text = s < 5 ? 'Updated just now' : s < 60 ? `Updated ${s} s ago` : `Updated ${Math.floor(s / 60)} min ago`
  return <span title="Data refreshes by itself while this tab is open" style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', ...style }}>{text}</span>
}
