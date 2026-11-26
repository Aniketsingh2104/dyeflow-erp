/**
 * lib/leaveCover.ts — work cover during approved leave (server only).
 *
 * When user A's leave is approved with user B as cover, B gets the pages
 * chosen at approval (a snapshot of A's rights on them) ON TOP of B's own
 * permissions — but only on the days of the leave (India date). Nothing is
 * written into B's account: lib/access.ts (every API request) and
 * /api/auth GET (the menu) add these pages when they read the user, so the
 * cover starts and ends by itself.
 *
 * Never transferred: Setup pages (User Management, Factory Settings, masters)
 * and the "Approve Leave" right.
 */
import { dbSelect } from '@/lib/supabase'
import { todayIST } from '@/lib/istDate'

export type Perm = { view?: boolean; edit?: boolean; delete?: boolean }
export interface CoveringEntry { leave_id: string; username: string; from_date: string; to_date: string; pages: string[] }
export interface CoverInfo { pages: Record<string, Perm>; covering: CoveringEntry[] }

/** the page that lets a user approve leave (User Management checkbox) */
export const LEAVE_APPROVE_PAGE = '/leave/approve'

const NEVER = ['/setup', LEAVE_APPROVE_PAGE]
export function transferable(path: string): boolean {
  const p = String(path || '').trim()
  return !!p && !NEVER.some(n => p === n || p.startsWith(n + '/'))
}

/** union of two page maps — the higher right wins for each page */
export function mergePages(own: Record<string, Perm> = {}, extra: Record<string, Perm> = {}): Record<string, Perm> {
  const out: Record<string, Perm> = {}
  for (const [k, v] of Object.entries(own || {})) if (v) out[k] = { view: !!v.view, edit: !!v.edit, delete: !!v.delete }
  for (const [k, v] of Object.entries(extra || {})) {
    if (!v || !transferable(k)) continue
    const cur = out[k] || { view: false, edit: false, delete: false }
    out[k] = { view: !!(cur.view || v.view || v.edit || v.delete), edit: !!(cur.edit || v.edit), delete: !!(cur.delete || v.delete) }
  }
  return out
}

const TTL_MS = 10_000
const cache = new Map<string, { at: number; day: string; info: CoverInfo }>()
const EMPTY: CoverInfo = { pages: {}, covering: [] }

/** Pages user `uid` holds today as cover for someone on leave (empty when none). */
export async function coverFor(uid: string | null | undefined): Promise<CoverInfo> {
  if (!uid) return EMPTY
  const day = todayIST()
  const hit = cache.get(uid)
  if (hit && hit.day === day && Date.now() - hit.at < TTL_MS) return hit.info
  const { data, error } = await dbSelect<any>('leave_requests', {
    cover_user_id: `eq.${uid}`, status: 'eq.approved', from_date: `lte.${day}`, to_date: `gte.${day}`,
    order: 'from_date.asc',
  }, 'id,username,from_date,to_date,pages')
  // table not created yet (SQL not run) → no cover, never an error for the user
  if (error) return EMPTY
  let pages: Record<string, Perm> = {}
  const covering: CoveringEntry[] = []
  for (const l of data || []) {
    const p = (l.pages && typeof l.pages === 'object') ? l.pages as Record<string, Perm> : {}
    pages = mergePages(pages, p)
    covering.push({ leave_id: l.id, username: l.username, from_date: l.from_date, to_date: l.to_date,
      pages: Object.keys(p).filter(transferable) })
  }
  const info = { pages, covering }
  cache.set(uid, { at: Date.now(), day, info })
  return info
}

/** drop cached cover info (after a leave is approved / cancelled / ended on this server) */
export function forgetCover(uid?: string | null) { if (uid) cache.delete(uid); else cache.clear() }
