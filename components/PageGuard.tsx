'use client'
// PageGuard — one "no access" screen for every page, using the SAME rules as
// the server (lib/pageAccess.ts ↔ lib/access.ts). Before this only the machine
// and supervisor pages checked; everywhere else a user without access saw the
// whole page and then a row of "permission" errors.
//
//   • admin → everything
//   • a page listed in User Management (or under one, e.g. /fms/D) → needs View
//   • a page that can't be granted there → open to every signed-in user
//   • machine sheets check themselves (they also accept the machine's name slug)
//   • View without Edit → the page opens read-only: a banner shows, and
//     controls marked className="edit-only" are hidden (the server refuses
//     those changes anyway)
import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { STATIC_PAGES, getActiveUserRecord, isAdminUser } from '@/lib/permissions'
import { pageAccess } from '@/lib/pageAccess'
import { AccessDenied } from '@/lib/AccessDenied'
import { sameCode } from '@/lib/processCodes'

const KNOWN = STATIC_PAGES.map(p => p.path).filter(p => p !== '/')
const DYNAMIC = ['/fms/', '/supervisor/']
const SELF_CHECKED = ['/machines/']                       // the page checks its own aliases
const OPEN = ['/login', '/order-sheets', '/sheet', '/mobile']   // party / floor pages decide themselves

const PageEditCtx = createContext<{ canEdit: boolean; canDelete: boolean }>({ canEdit: true, canDelete: true })
/** Edit / Delete on the CURRENT page (from PageGuard) */
export const usePageEdit = () => useContext(PageEditCtx)

function guardedPath(pathname: string): string | null {
  if (pathname === '/') return null      // the dashboard is every signed-in user's landing page
  if (OPEN.some(p => pathname === p || pathname.startsWith(p + '/'))) return null
  if (SELF_CHECKED.some(p => pathname.startsWith(p))) return null
  if (DYNAMIC.some(p => pathname.startsWith(p))) return pathname
  // a listed page, or a page under one
  if (KNOWN.some(k => pathname === k || pathname.startsWith(k + '/'))) return pathname
  return null
}

type Access = { view: boolean; edit: boolean; del: boolean; party: boolean }
const ALL: Access = { view: true, edit: true, del: true, party: false }

// An FMS process page follows the server's canWorkProcess(): the process
// code is compared in its standard spelling ('QA' = 'Qa'), and Edit on FMS as
// a whole or on a cross-process page (Mobile, Machine sheets, Splitted
// Orders, Batch Tracking) also lets the user work the batches there.
function fmsAccess(pages: Record<string, any>, code: string): Access {
  const out: Access = { view: false, edit: false, del: false, party: false }
  for (const [key, perm] of Object.entries(pages || {})) {
    if (!perm) continue
    const k = key.replace(/\/+$/, '')
    const hit = k === '/fms' || (k.startsWith('/fms/') && sameCode(k.slice(5).split('/')[0], code))
    const cross = k === '/mobile' || k.startsWith('/mobile/') || k === '/machines' || k.startsWith('/machines/')
      || k === '/splitted-orders' || k === '/batches'
    if (hit) {
      if (perm.view || perm.edit || perm.delete) out.view = true
      if (perm.edit) out.edit = true
      if (perm.delete) out.del = true
    } else if (cross && perm.edit) {
      out.view = true; out.edit = true
    }
  }
  return out
}

function accessFor(pathname: string): Access {
  const user = getActiveUserRecord()
  if (!user) return ALL                      // DbProvider sends to login
  if (isAdminUser(user)) return ALL
  if (user.role === 'party') {
    const ok = pathname.startsWith('/order-sheets') || pathname.startsWith('/sheet')
    return { view: ok, edit: ok, del: false, party: true }
  }
  const path = guardedPath(pathname)
  if (!path) return ALL
  const pages = user.permissions?.pages || {}
  const fms = path.match(/^\/fms\/([^/]+)/)
  if (fms) return fmsAccess(pages, decodeURIComponent(fms[1]))
  const a = pageAccess(pages, path, false)
  return { view: a.view, edit: a.edit, del: a.delete, party: false }
}

export default function PageGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/'
  // worked out while rendering (not one render late in an effect), after the
  // first browser render — the signed-in user lives in browser storage
  const [mounted, setMounted] = useState(false)
  const [, setVer] = useState(0)
  useEffect(() => {
    setMounted(true)
    const bump = () => setVer(v => v + 1)
    window.addEventListener('storage', bump)
    return () => window.removeEventListener('storage', bump)
  }, [])

  if (!mounted) return null
  const state = accessFor(pathname)
  if (!state.view) {
    if (state.party) return null      // DbProvider moves a party login to its order sheets
    const label = STATIC_PAGES.find(p => p.path === pathname)?.label
    return <AccessDenied pageName={label} />
  }
  const readOnly = !state.edit && guardedPath(pathname) !== null
  return (
    <PageEditCtx.Provider value={{ canEdit: state.edit, canDelete: state.del }}>
      <div className={readOnly ? 'dyeflow-readonly' : undefined} style={{ display: 'contents' }}>
        {readOnly && (
          <div style={{ background: '#FEF3C7', color: '#92400E', fontSize: 12, fontWeight: 600, padding: '6px 16px',
            borderBottom: '1px solid #FCD34D' }}>
            👁 View only — you can look at this page but not change it. Ask an admin for Edit permission.
          </div>
        )}
        {children}
      </div>
    </PageEditCtx.Provider>
  )
}
