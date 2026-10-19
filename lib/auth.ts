/**
 * lib/auth.ts — server-side access checks for API routes.
 *
 * proxy.ts already rejects every /api request without a valid session, so a
 * route only needs these helpers for the stricter "admin only" actions:
 *
 *   const deny = await requireAdmin(req)
 *   if (deny) return deny
 *
 * Both go through lib/access.ts: the role is read from dyeflow_users and the
 * login must still be current (session_version), so turning a user Inactive
 * or changing their role takes effect at once. Most routes use guard() from
 * lib/access.ts directly.
 */
import { NextRequest, NextResponse } from 'next/server'
import { dbSelect } from '@/lib/supabase'
import { SESSION_COOKIE, verifySessionToken, SessionData } from '@/lib/session'
import { getAccessUser } from '@/lib/access'

export function getSession(req: NextRequest): SessionData | null {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
}

export async function loadActiveUser(uid: string) {
  const { data, error } = await dbSelect('dyeflow_users',
    { id: `eq.${uid}`, limit: '1' },
    'id,username,full_name,role,permissions,scope_mode,unit,party,is_active,session_version')
  if (error) return { user: null, error }
  const user = data?.[0]
  if (!user || user.is_active === false) return { user: null, error: null }
  return { user, error: null }
}

function deny(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, {
    status,
    headers: status === 401 ? { 'x-dyeflow-auth': 'required' } : undefined,
  })
}

/** Any signed-in, active user (with an up-to-date login). Returns a response to send back, or null if allowed. */
export async function requireUser(req: NextRequest): Promise<NextResponse | null> {
  const { deny } = await getAccessUser(req)
  return deny
}

/** Admin only. Returns a response to send back, or null if allowed. */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const { user, deny: d } = await getAccessUser(req)
  if (d) return d
  if (!user?.isAdmin) return deny(403, 'Only an admin can do this.')
  return null
}

/** Shape a DB user row for the browser (never includes the password). */
export function publicUser(u: any) {
  return {
    id:          u.id,
    username:    u.username,
    full_name:   u.full_name || u.username,
    role:        u.role || 'custom',
    permissions: u.permissions || null,
    scope_mode:  u.scope_mode || 'all',
    unit:        u.unit || null,
    party:       u.party || null,
  }
}
