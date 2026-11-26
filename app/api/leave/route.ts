/**
 * /api/leave — Leave Requests with a work cover (lib/leaveCover.ts).
 *
 * GET  → { me, mine, queue (approvers: pending), all (approvers: recent),
 *          users (to pick a cover), onLeaveToday, coveringToday }
 * POST { action }
 *   request   { from_date, to_date, reason, suggested_cover_id?, user_id? (admin: for someone else) }
 *   cancel    { id }   requester while pending · approver: pending, or approved before it starts
 *   reject    { id, note }                              approver
 *   approve   { id, cover_user_id, pages: string[], note? }   approver
 *   end_today { id }   approver — the person is back today: cover ends today
 *
 * Approver = admin, or Edit on '/leave/approve' (User Management). Nobody
 * approves their own leave except an admin. Full days, India dates.
 */
import { NextRequest, NextResponse } from 'next/server'
import { guard, hasPage, type AccessUser } from '@/lib/access'
import { dbSelect, dbInsert, dbUpdate, auditLog } from '@/lib/supabase'
import { todayIST, addDaysYMD } from '@/lib/istDate'
import { LEAVE_APPROVE_PAGE, transferable, forgetCover, type Perm } from '@/lib/leaveCover'

const COLS = 'id,user_id,username,from_date,to_date,reason,status,suggested_cover_id,cover_user_id,cover_username,pages,' +
  'requested_by,decided_by,decided_at,decision_note,cancelled_by,cancelled_at,created_at,updated_at'
const YMD = /^\d{4}-\d{2}-\d{2}$/
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status })
const isApprover = (u: AccessUser) => u.isAdmin || hasPage({ ...u, pages: u.ownPages }, [LEAVE_APPROVE_PAGE], 'edit')
const noTable = (e: string) => /leave_requests/i.test(e) && /(does not exist|not find|schema cache)/i.test(e)
  ? 'Leave Requests is not set up yet — run dyeflow-section29-leave-requests.sql in Supabase first.' : e

/** pages that can pass from this user to a cover, with the user's rights on them (admin: null = any page) */
function ownTransferable(user: any): Record<string, Perm> | null {
  if (user?.role === 'admin') return null
  const out: Record<string, Perm> = {}
  for (const [k, v] of Object.entries((user?.permissions?.pages || {}) as Record<string, Perm>)) {
    if (!v || !transferable(k) || !(v.view || v.edit || v.delete)) continue
    out[k] = { view: true, edit: !!v.edit, delete: !!v.delete }
  }
  return out
}

async function loadUsers() {
  const { data, error } = await dbSelect<any>('dyeflow_users', { order: 'username.asc' }, 'id,username,full_name,role,is_active,permissions')
  return { users: data || [], error }
}

/** approved / pending leave of `uid` overlapping from–to (except `exceptId`) */
async function overlapping(uid: string, from: string, to: string, statuses: string, exceptId?: string) {
  const q: Record<string, string> = { user_id: `eq.${uid}`, status: `in.(${statuses})`, from_date: `lte.${to}`, to_date: `gte.${from}` }
  if (exceptId) q.id = `neq.${exceptId}`
  const { data } = await dbSelect<any>('leave_requests', q, 'id,from_date,to_date,status')
  return data || []
}

export async function GET(req: NextRequest) {
  const g = await guard(req, 'leave', 'GET'); if (g.deny || !g.user) return g.deny!
  const me = g.user
  const approver = isApprover(me)
  const today = todayIST()
  const [mine, queue, all, today1, usersRes] = await Promise.all([
    dbSelect<any>('leave_requests', { user_id: `eq.${me.id}`, order: 'from_date.desc', limit: '100' }, COLS),
    approver ? dbSelect<any>('leave_requests', { status: 'eq.pending', order: 'from_date.asc', limit: '200' }, COLS) : Promise.resolve({ data: [], error: null }),
    approver ? dbSelect<any>('leave_requests', { order: 'created_at.desc', limit: '300' }, COLS) : Promise.resolve({ data: [], error: null }),
    dbSelect<any>('leave_requests', { status: 'eq.approved', from_date: `lte.${today}`, to_date: `gte.${today}`, order: 'to_date.asc' },
      'id,username,from_date,to_date,cover_username,cover_user_id'),
    loadUsers(),
  ])
  const err = mine.error || queue.error || all.error || today1.error || usersRes.error
  if (err) return bad(noTable(err), 500)
  const byId = new Map(usersRes.users.map((u: any) => [u.id, u]))
  // approvers see what each pending request would hand over
  const withPages = (rows: any[]) => rows.map(r => {
    const u = byId.get(r.user_id)
    return { ...r, requester_is_admin: u?.role === 'admin', requester_pages: ownTransferable(u) }
  })
  return NextResponse.json({
    ok: true,
    me: { id: me.id, username: me.username, isAdmin: me.isAdmin, isApprover: approver },
    today,
    mine: mine.data,
    queue: approver ? withPages(queue.data) : [],
    all: approver ? all.data : [],
    onLeaveToday: today1.data,
    coveringToday: me.covering || [],
    users: usersRes.users
      .filter((u: any) => u.is_active !== false && u.role !== 'party')
      .map((u: any) => ({ id: u.id, username: u.username, full_name: u.full_name || u.username, role: u.role })),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const g = await guard(req, 'leave', body.action); if (g.deny || !g.user) return g.deny!
  const me = g.user
  const approver = isApprover(me)
  const today = todayIST()
  const now = new Date().toISOString()

  // ── ask for leave ───────────────────────────────────────────────────────
  if (body.action === 'request') {
    const from = String(body.from_date || ''), to = String(body.to_date || '')
    if (!YMD.test(from) || !YMD.test(to)) return bad('Pick the From and To dates.')
    if (to < from) return bad('"To" date is before "From" date.')
    if (from < today && !me.isAdmin) return bad('The leave can\'t start in the past.')
    const reason = String(body.reason || '').trim()
    if (!reason) return bad('Write a reason.')
    let uid = me.id, uname = me.username
    if (body.user_id && body.user_id !== me.id) {
      if (!approver) return bad('Only an approver can ask leave for someone else.', 403)
      const { data } = await dbSelect<any>('dyeflow_users', { id: `eq.${body.user_id}`, limit: '1' }, 'id,username,role,is_active')
      const u = data?.[0]
      if (!u || u.is_active === false || u.role === 'party') return bad('That user can\'t take leave here.')
      uid = u.id; uname = u.username
    }
    const clash = await overlapping(uid, from, to, 'pending,approved')
    if (clash.length) return bad(`${uname} already has leave ${clash[0].status} for ${clash[0].from_date} – ${clash[0].to_date}.`, 409)
    let sug: string | null = null
    if (body.suggested_cover_id) {
      if (body.suggested_cover_id === uid) return bad('The cover must be someone else.')
      sug = String(body.suggested_cover_id)
    }
    const { data, error } = await dbInsert('leave_requests', {
      user_id: uid, username: uname, from_date: from, to_date: to, reason, status: 'pending',
      suggested_cover_id: sug, requested_by: me.username,
    })
    if (error) return bad(noTable(error), 500)
    await auditLog({ action: 'leave_request', entity_type: 'leave', entity_id: (data as any)?.id, new_value: `${uname} ${from} – ${to}`, note: reason })
    return NextResponse.json({ ok: true, data })
  }

  // every other action works on one request
  const id = String(body.id || '')
  if (!id) return bad('id required')
  const { data: rows, error: lErr } = await dbSelect<any>('leave_requests', { id: `eq.${id}`, limit: '1' }, COLS)
  if (lErr) return bad(noTable(lErr), 500)
  const l = rows?.[0]
  if (!l) return bad('Leave request not found.', 404)
  const stale = (msg: string) => NextResponse.json({ ok: false, stale: true, error: msg + ' Refresh the page.' }, { status: 409 })
  const patch = async (p: Record<string, any>, expect: string) => {
    const { error } = await dbUpdate('leave_requests', { id, status: expect }, { ...p, updated_at: now })
    return error
  }

  if (body.action === 'cancel') {
    const own = l.user_id === me.id
    const okPending = l.status === 'pending' && (own || approver)
    const okApproved = l.status === 'approved' && approver && l.from_date > today
    if (!okPending && !okApproved) {
      return l.status === 'approved' ? bad('This leave has already started — use "End leave today".', 409) : stale(`This request is already ${l.status}.`)
    }
    const e = await patch({ status: 'cancelled', cancelled_by: me.username, cancelled_at: now }, l.status)
    if (e) return bad(e, 500)
    forgetCover(l.cover_user_id)
    await auditLog({ action: 'leave_cancel', entity_type: 'leave', entity_id: id, old_value: l.status, new_value: 'cancelled', note: `${l.username} ${l.from_date} – ${l.to_date}` })
    return NextResponse.json({ ok: true })
  }

  if (!approver) return bad('You don\'t have permission to approve leave (User Management → "Approve Leave Requests").', 403)
  if (l.user_id === me.id && !me.isAdmin) return bad('You can\'t decide your own leave — another approver has to.', 403)

  if (body.action === 'reject') {
    if (l.status !== 'pending') return stale(`This request is already ${l.status}.`)
    const e = await patch({ status: 'rejected', decided_by: me.username, decided_at: now, decision_note: String(body.note || '').trim() || null }, 'pending')
    if (e) return bad(e, 500)
    await auditLog({ action: 'leave_reject', entity_type: 'leave', entity_id: id, new_value: 'rejected', note: `${l.username} ${l.from_date} – ${l.to_date}` })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'approve') {
    if (l.status !== 'pending') return stale(`This request is already ${l.status}.`)
    if (l.to_date < today) return bad('This leave is already over — it can only be rejected.')
    const coverId = String(body.cover_user_id || '')
    if (!coverId) return bad('Pick the cover person.')
    if (coverId === l.user_id) return bad('The cover must be someone else.')
    const { users } = await loadUsers()
    const cover = users.find((u: any) => u.id === coverId)
    const requester = users.find((u: any) => u.id === l.user_id)
    if (!cover || cover.is_active === false || cover.role === 'party') return bad('That cover user is not active.')
    const coverAway = await overlapping(coverId, l.from_date, l.to_date, 'approved')
    if (coverAway.length) return bad(`${cover.username} is on leave ${coverAway[0].from_date} – ${coverAway[0].to_date} — pick another cover.`, 409)
    // pages: the ones ticked, with the requester's OWN rights on them (an admin's = full)
    const chosen: string[] = Array.isArray(body.pages) ? body.pages.map(String).filter(transferable) : []
    const own = ownTransferable(requester)
    const pages: Record<string, Perm> = {}
    for (const p of chosen) {
      if (own === null) pages[p] = { view: true, edit: true, delete: true }
      else if (own[p]) pages[p] = own[p]
    }
    if (!Object.keys(pages).length) return bad('Tick at least one page for the cover.')
    const e = await patch({
      status: 'approved', cover_user_id: coverId, cover_username: cover.username, pages,
      decided_by: me.username, decided_at: now, decision_note: String(body.note || '').trim() || null,
    }, 'pending')
    if (e) return bad(e, 500)
    forgetCover(coverId)
    await auditLog({ action: 'leave_approve', entity_type: 'leave', entity_id: id, new_value: `cover ${cover.username}`,
      note: `${l.username} ${l.from_date} – ${l.to_date} · pages: ${Object.keys(pages).join(', ')}` })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'end_today') {
    if (l.status !== 'approved') return stale(`This leave is ${l.status}.`)
    if (l.from_date > today) return bad('This leave hasn\'t started — use Cancel.')
    if (l.to_date < today) return bad('This leave is already over.')
    const yesterday = addDaysYMD(today, -1)
    const p = yesterday < l.from_date
      ? { status: 'cancelled', cancelled_by: me.username, cancelled_at: now }
      : { to_date: yesterday, decision_note: [l.decision_note, `Ended early by ${me.username} (back ${today})`].filter(Boolean).join(' · ') }
    const e = await patch(p, 'approved')
    if (e) return bad(e, 500)
    forgetCover(l.cover_user_id)
    await auditLog({ action: 'leave_end', entity_type: 'leave', entity_id: id, old_value: l.to_date, new_value: yesterday, note: `${l.username} back ${today}` })
    return NextResponse.json({ ok: true })
  }

  return bad('Unknown action')
}
