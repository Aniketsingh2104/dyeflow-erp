/**
 * lib/access.ts — who may call which API (server only).
 *
 * Every API route calls  `const g = await guard(req, '<api>', '<action>')`
 * and returns `g.deny` when it is set. The rule for each api + action is in
 * POLICY below.
 *
 * The user's role and page permissions are read from dyeflow_users (cached
 * 10 seconds per server instance) — never from the browser.
 *
 *   admin  → everything
 *   staff  → (every non-party role) may READ factory data; may CHANGE data
 *            only where their page permission has Edit ticked
 *   party  → customer logins: only their own order sheets (allowedSheets)
 *
 * The login cookie carries session_version; when the number in the
 * database is higher (logout, deactivation, role / permission / password
 * change) the cookie is refused at once.
 */
import { NextRequest, NextResponse } from 'next/server'
import { dbSelect } from '@/lib/supabase'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'
import { sameCode } from '@/lib/processCodes'

export type Level = 'view' | 'edit' | 'delete'

export interface AccessUser {
  id: string
  username: string
  role: string
  isAdmin: boolean
  isParty: boolean
  pages: Record<string, { view?: boolean; edit?: boolean; delete?: boolean }>
  allowedSheets: string[]
  sessionVersion: number
}

// ── Rules ──────────────────────────────────────────────────────────────────
// 'public' = no login · 'any' = any signed-in user (party too) ·
// 'staff' = any non-party user · 'admin' · { edit|view|delete: [pages] } =
// that permission on at least one of the pages (prefix match: '/fms' covers
// '/fms/D', '/machines' covers every machine sheet). A page ending in '$'
// matches only itself ('/batches$' = the Batch Tracking page, not Batch Trace).
export type Rule = 'public' | 'any' | 'staff' | 'admin' | { edit?: string[]; view?: string[]; delete?: string[] }

// Pages that move batches through processes (Done / Faulty / FOB / rollback).
// On top of this the route checks canWorkProcess() for the batch's process.
const FMS_PAGES   = ['/fms', '/mobile', '/splitted-orders', '/batches$', '/machines']
const PLAN_PAGES  = ['/date-calculator', '/machines', '/first-process-batch']
const ORDER_EDIT  = ['/orders', '/pending-approvals', '/supervisor', '/ai-assistant']

export const POLICY: Record<string, Record<string, Rule>> = {
  orders: {
    GET: 'staff',
    create: { edit: ['/orders', '/pending-approvals', '/import'] },
    update: { edit: ORDER_EDIT },
    update_planned_dates: { edit: ['/date-calculator', '/orders'] },
    assign_supervisor: { edit: ['/orders', '/supervisor', '/ai-assistant'] },
    update_status: { edit: ['/orders', '/ai-assistant'] },
    bulk_update: { edit: ['/orders', '/ai-assistant'] },
    reorder: { edit: ['/orders'] },
    delete: 'admin',
  },
  batches: {
    GET: 'staff',
    create_splits: { edit: ['/orders', '/supervisor', '/split-order'] },
    auto_split_preview: { edit: ['/orders', '/supervisor', '/split-order'] },
    full_split: { edit: ['/orders', '/supervisor'] },
    update: { edit: [...PLAN_PAGES, '/fms', '/supervisor', '/repairing-order', '/splitted-orders'] },
    process_done: { edit: FMS_PAGES },
    mark_faulty: { edit: FMS_PAGES },
    rollback: { edit: FMS_PAGES },
    send_first: { edit: ['/first-process-batch'] },
    plan_numbers: { edit: ['/machines'] },
    clear_dc_plan: { edit: PLAN_PAGES },
    reset_process: 'admin',
    delete_batch: 'admin',
    create: 'admin',
  },
  faulty:  { GET: 'staff', mark_ok: { edit: ['/faulty'] }, reprocess: { edit: ['/faulty'] }, update: { edit: ['/faulty'] }, delete: 'admin' },
  fob: {
    GET: 'staff',
    create: { edit: [...FMS_PAGES, '/fob'] },
    mark_sent: { edit: ['/fob'] }, fob_approved: { edit: ['/fob'] }, reprocess: { edit: ['/fob'] }, update: { edit: ['/fob'] },
    delete: 'admin',
  },
  'repairing-orders': {
    GET: 'staff',
    create: 'admin', update: { edit: ['/repairing-order', '/supervisor'] },
    split: { edit: ['/repairing-order', '/supervisor'] }, full_split: { edit: ['/repairing-order', '/supervisor'] },
    delete: 'admin',
  },
  'repair-assign': { GET: 'staff', POST: { edit: ['/supervisor', '/repairing-order'] } },
  greige:  { GET: 'staff', POST: { edit: ['/greige'] } },
  lab:     { GET: 'staff', POST: { edit: ['/lab'] } },
  'colour-store': { GET: 'staff', POST: { edit: ['/inventory'] } },
  'colour-chemicals': { GET: 'staff', update_planning: { edit: ['/inventory', '/setup/colour-chemical-master'] }, POST: 'admin' },
  'date-plans': { GET: 'staff', POST: { edit: PLAN_PAGES } },
  shifts:  { GET: 'staff', create: { edit: ['/shifts'] }, delete: 'admin' },
  settings: { GET: 'staff', processDurations: { edit: ['/date-calculator'] }, POST: 'admin' },
  // setup masters: everyone reads, admin changes
  machines: { GET: 'staff', POST: 'admin' }, processes: { GET: 'staff', POST: 'admin' },
  supervisors: { GET: 'staff', POST: 'admin' }, customers: { GET: 'staff', POST: 'admin' },
  'article-routes': { GET: 'staff', POST: 'admin' }, 'route-suggest': { POST: 'staff' }, 'article-supervisor-map': { GET: 'staff', POST: 'admin' },
  'shade-master': { GET: 'staff', POST: 'admin' }, 'route-templates': { GET: 'staff', POST: 'admin' },
  'setup-holidays': { GET: 'staff', POST: 'admin' }, holidays: { GET: 'staff' },
  users: { GET: 'admin', POST: 'admin' },
  // reading / AI
  predict: { GET: 'staff', POST: 'staff' },
  context: { GET: 'staff' },
  snapshot: { GET: { view: ['/report-agent'] } },
  ai:      { POST: { view: ['/ai-assistant', '/report-agent', '/'] } },
  'ai-rag': { POST: { view: ['/ai-assistant'] } },
  'ai-embed': { GET: 'admin', POST: 'admin' },
  'ai-seed': { GET: 'admin', POST: 'admin' },
  audit:   { GET: 'staff', clear: 'admin' },   // GET narrowed in the route (admin or one entity)
  changes: { GET: 'any' },
  // order sheets — party users allowed, the route also checks the sheet
  'order-sheets': { GET: 'any', create: 'admin', update_rows: 'admin', toggle_status: 'admin', delete: 'admin' },
  'sheet-rows': { GET: 'any', upsert_row: 'any', add_row: 'any', delete_row: 'any', bulk_upsert: 'any',
                  approve_row: { edit: ['/pending-approvals'] } },
}

// ── User lookup (30 s cache) ───────────────────────────────────────────────
const TTL_MS = 10_000   // a logout / role change takes effect everywhere within 10 s
const cache = new Map<string, { at: number; row: any }>()

async function loadUserRow(uid: string): Promise<{ row: any; error: string | null }> {
  const hit = cache.get(uid)
  if (hit && Date.now() - hit.at < TTL_MS) return { row: hit.row, error: null }
  const { data, error } = await dbSelect('dyeflow_users', { id: `eq.${uid}`, limit: '1' },
    'id,username,role,permissions,is_active,session_version')
  if (error) return { row: null, error }
  const row = data?.[0] || null
  cache.set(uid, { at: Date.now(), row })
  return { row, error: null }
}

/** Drop the cached copy after the user's row is changed on this server. */
export function forgetUser(uid: string) { cache.delete(uid) }

function deny(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, {
    status,
    headers: status === 401 ? { 'x-dyeflow-auth': 'required' } : undefined,
  })
}

export async function getAccessUser(req: NextRequest): Promise<{ user: AccessUser | null; deny: NextResponse | null }> {
  const s = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (!s) return { user: null, deny: deny(401, 'Not signed in — please sign in again.') }
  const { row, error } = await loadUserRow(s.uid)
  if (error) return { user: null, deny: deny(503, 'Could not check your account — try again shortly.') }
  if (!row || row.is_active === false) {
    return { user: null, deny: deny(401, 'Your account is inactive or no longer exists.') }
  }
  if ((row.session_version || 0) !== (s.sv || 0)) {
    return { user: null, deny: deny(401, 'You were signed out (your account was changed or you signed out elsewhere). Please sign in again.') }
  }
  const perms = row.permissions || {}
  const user: AccessUser = {
    id: row.id,
    username: row.username,
    role: row.role || 'custom',
    isAdmin: row.role === 'admin',
    isParty: row.role === 'party',
    pages: perms.pages || {},
    allowedSheets: Array.isArray(perms.allowedSheets) ? perms.allowedSheets.map(String) : [],
    sessionVersion: row.session_version || 0,
  }
  return { user, deny: null }
}

/** Does the user have `level` on any of these pages? (admin always) */
export function hasPage(u: AccessUser, pages: string[], level: Level): boolean {
  if (u.isAdmin) return true
  if (u.isParty) return false
  for (const w of pages) {
    const exact = w.endsWith('$')
    const want = exact ? w.slice(0, -1) : w
    for (const [key, perm] of Object.entries(u.pages)) {
      const match = key === want || (!exact && (key.startsWith(want + '/') || want.startsWith(key + '/')))
      if (!match || !perm) continue
      if (level === 'view' && (perm.view || perm.edit || perm.delete)) return true
      if (level === 'edit' && perm.edit) return true
      if (level === 'delete' && perm.delete) return true
    }
  }
  return false
}

export function allows(u: AccessUser, rule: Rule): boolean {
  if (rule === 'public' || rule === 'any') return true
  if (u.isAdmin) return true
  if (rule === 'admin') return false
  if (u.isParty) return false
  if (rule === 'staff') return true
  if (rule.edit && hasPage(u, rule.edit, 'edit')) return true
  if (rule.view && hasPage(u, rule.view, 'view')) return true
  if (rule.delete && hasPage(u, rule.delete, 'delete')) return true
  return false
}

function describe(rule: Rule): string {
  if (rule === 'admin') return 'Only an admin can do this.'
  if (typeof rule === 'object') {
    const [level, pages] = Object.entries(rule)[0] || ['edit', []]
    return `You don't have ${level === 'view' ? 'access to' : level === 'delete' ? 'Delete permission on' : 'Edit permission on'} ${
      (pages as string[]).map(p => p.replace(/\$$/, '')).join(' / ')}. Ask an admin to give it to you in User Management.`
  }
  return "You don't have permission to do this."
}

/**
 * The one check every API calls:
 *   const g = await guard(req, 'orders', action)   // or 'GET'
 *   if (g.deny) return g.deny
 * Unknown actions fall back to the api's 'POST' rule, then to admin-only.
 */
export async function guard(req: NextRequest, api: string, action: string | undefined | null) {
  const rules = POLICY[api] || {}
  const method = req.method.toUpperCase()
  const rule: Rule = (action && rules[action]) || rules[method] || (method === 'GET' ? 'staff' : 'admin')
  if (rule === 'public') return { user: null as AccessUser | null, deny: null as NextResponse | null }
  const { user, deny: d } = await getAccessUser(req)
  if (d || !user) return { user: null, deny: d }
  if (!allows(user, rule)) return { user, deny: deny(403, describe(rule)) }
  return { user, deny: null }
}

/**
 * May this user move a batch at this process? Edit on that process's FMS
 * page (or on FMS as a whole), or on a page that works across processes
 * (Mobile floor view, Splitted Orders, Batch Tracking, Machine sheets).
 */
export function canWorkProcess(u: AccessUser, code: string | null | undefined): boolean {
  if (u.isAdmin) return true
  if (u.isParty || !code) return false
  if (hasPage(u, ['/fms$', '/mobile', '/splitted-orders', '/batches$', '/machines'], 'edit')) return true
  // '/fms/<code>' — compared with the standard spelling ('QA' = 'Qa', 'LEVEL' = 'Lev')
  return Object.entries(u.pages).some(([key, perm]) =>
    !!perm?.edit && key.startsWith('/fms/') && sameCode(key.slice(5).split('/')[0], code))
}

/** May this user open / change this order sheet? */
export function canUseSheet(u: AccessUser, sheetId: string | null | undefined): boolean {
  if (!sheetId) return false
  if (u.isAdmin) return true
  if (u.allowedSheets.includes(String(sheetId))) return true
  // office staff who approve sheets can open every sheet
  return !u.isParty && hasPage(u, ['/pending-approvals', '/order-sheets'], 'edit')
}

/** Office = may approve / reject / edit office-only fields of sheet rows. */
export function isSheetOffice(u: AccessUser): boolean {
  return u.isAdmin || (!u.isParty && hasPage(u, ['/pending-approvals'], 'edit'))
}

/** Keep only allowed keys of an object (drops anything else the browser sent). */
export function pick<T extends Record<string, any>>(obj: T, keys: readonly string[]): Partial<T> {
  const out: Record<string, any> = {}
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k]
  return out as Partial<T>
}
