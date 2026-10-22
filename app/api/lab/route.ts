import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, dbSelectAll, dbInsert, dbUpdate, dbDelete, sb, auditLog, currentUsername } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { labNoKey } from '@/lib/labNo'

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'lab', 'GET'); if (g.deny) return g.deny }
  const { searchParams } = new URL(req.url)
  const type      = searchParams.get('type')      // indents | requests | issues
  const indentId  = searchParams.get('indent_id')
  const requestId = searchParams.get('request_id')
  const recheck   = searchParams.get('recheck')

  if (type === 'indents') {
    const { data, error } = await dbSelect('lab_indents', { order: 'created_at.desc' })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (type === 'requests') {
    const query: Record<string, string> = { order: 'created_at.desc' }
    if (indentId)         query['indent_id']   = `eq.${indentId}`
    if (recheck === '1')  query['is_recheck']  = 'eq.true'
    if (recheck === '0')  query['is_recheck']  = 'eq.false'
    const { data, error } = await dbSelect('lab_requests', query)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  // Manual recipes by Lab No. (Lab → Receipe page "Add Recipe"); ?lab_no=… → that one
  if (type === 'recipes') {
    const { data, error } = await dbSelectAll<any>('lab_recipes', { order: 'updated_at.desc' })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    // ?lab_no=L1850 also finds "L-1850" (only letters and digits count — lib/labNo.ts)
    const want = labNoKey(searchParams.get('lab_no'))
    return NextResponse.json({ ok: true, data: want ? (data || []).filter((r: any) => labNoKey(r.lab_no) === want) : data })
  }

  if (type === 'issues') {
    const query: Record<string, string> = { order: 'created_at.desc' }
    if (requestId) query['request_id'] = `eq.${requestId}`
    const { data, error } = await dbSelect('lab_issues', query)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  // Global day-offset settings for FMS planned-date calculations
  // (delivery_date_days, fabric_received_days) — returned as a flat
  // { key: value } map for easy use on the client.
  if (type === 'settings') {
    const { data, error } = await dbSelect('lab_settings', {})
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    const map: Record<string, string> = {}
    for (const row of (data || []) as any[]) map[row.key] = row.value
    return NextResponse.json({ ok: true, data: map })
  }

  // Default: return all three
  const [indentsRes, requestsRes] = await Promise.all([
    dbSelect('lab_indents', { order: 'created_at.desc' }),
    dbSelect('lab_requests', { order: 'created_at.desc' }),
  ])
  return NextResponse.json({
    ok: true,
    indents:  indentsRes.data  || [],
    requests: requestsRes.data || [],
  })
}

// Lab ids (LAB-IND-001, LR-0001, ISSUE-0001) are handed out HERE: the next
// number after the highest one in the table, and if two saves pick the same
// number at once the second simply takes the next one (it used to be worked
// out in the browser — a clash failed with "duplicate" or lost the issue).
async function insertWithNextId(table: string, prefix: string, width: number, row: Record<string, any>) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: ids, error: e1 } = await dbSelectAll<any>(table, { id: `like.${prefix}*` }, 'id')
    if (e1) return { data: null, error: e1, id: '' }
    const max = Math.max(0, ...(ids || []).map((x: any) => parseInt(String(x.id).slice(prefix.length).replace(/\D/g, ''), 10) || 0))
    const id = prefix + String(max + 1).padStart(width, '0')
    const { data, error } = await dbInsert(table, { ...row, id })
    if (!error) return { data, error: null, id }
    if (!/duplicate|already exists/i.test(error)) return { data: null, error, id: '' }
    await new Promise(r => setTimeout(r, 20 + Math.random() * 80))   // someone took it — read again
  }
  return { data: null, error: 'Could not get a free number — please try again.', id: '' }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  { const g = await guard(req, 'lab', (body as any)?.action); if (g.deny) return g.deny }
  const { action, id, ...payload } = body

  // ── Indents ──────────────────────────────────────────────────────────────

  if (action === 'create_indent') {
    const { data, error, id: newId } = await insertWithNextId('lab_indents', 'LAB-IND-', 3, {
      unit:              payload.unit,
      party_name:        payload.partyName,
      quality:           payload.quality,
      num_lab_dip:       parseInt(payload.numberOfLabDip) || 1,
      request_given_by:  payload.requestGivenBy,
      order_status:      payload.orderStatus,
      branch:            payload.branch,
      light_source:      payload.lightSource,
      light_source_other: payload.lightSourceOther || null,
      remarks:           payload.remarks || null,
      request_image:     payload.requestImage || null,
      closed:            false,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data, id: newId })
  }

  if (action === 'update_indent') {
    const patch: Record<string, any> = {}
    if (payload.unit              !== undefined) patch.unit               = payload.unit
    if (payload.partyName         !== undefined) patch.party_name         = payload.partyName
    if (payload.quality           !== undefined) patch.quality            = payload.quality
    if (payload.numberOfLabDip    !== undefined) patch.num_lab_dip        = parseInt(payload.numberOfLabDip) || 1
    if (payload.requestGivenBy    !== undefined) patch.request_given_by   = payload.requestGivenBy
    if (payload.orderStatus       !== undefined) patch.order_status       = payload.orderStatus
    if (payload.branch            !== undefined) patch.branch             = payload.branch
    if (payload.lightSource       !== undefined) patch.light_source       = payload.lightSource
    if (payload.lightSourceOther  !== undefined) patch.light_source_other = payload.lightSourceOther
    if (payload.remarks           !== undefined) patch.remarks            = payload.remarks
    if (payload.requestImage      !== undefined) patch.request_image      = payload.requestImage
    if (payload.closed            !== undefined) patch.closed             = payload.closed
    const { error } = await dbUpdate('lab_indents', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Requests ──────────────────────────────────────────────────────────────

  if (action === 'create_request') {
    const { data, error, id: newId } = await insertWithNextId('lab_requests', 'LR-', 4, {
      indent_id:                payload.indentId || null,
      unit:                     payload.unit || null,
      party:                    payload.party || null,
      quality:                  payload.quality || null,
      light_source:             payload.lightSource || null,
      light_source_other:       payload.lightSourceOther || null,
      yarn_design:              payload.yarnDesign,
      shade_pantone:            payload.shadePantone,
      fastness_type:            payload.fastnessType,
      fastness_remark:          payload.fastnessRemark || null,
      other_remark:             payload.otherRemark || null,
      is_recheck:               payload.isRecheck || false,
      recheck_from_request_id:  payload.recheckFromRequestId || null,
      recheck_remark:           payload.recheckRemark || null,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data, id: newId })
  }

  // Two independent confirmations — request only moves to FMS (confirmed=true)
  // once BOTH sample_received and parameters_ok are true.
  if (action === 'mark_sample_received' || action === 'mark_parameters_ok') {
    const { data: existing } = await dbSelect('lab_requests', { id: `eq.${id}` })
    const reqRow = existing?.[0]
    if (!reqRow) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    const field = action === 'mark_sample_received' ? 'sample_received' : 'parameters_ok'
    const now = new Date().toISOString()
    const { error } = await dbUpdate('lab_requests', { id }, { [field]: true, [`${field}_at`]: now })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    // Then confirm in the database only if BOTH are ticked by now — whichever
    // of two clicks at the same moment lands last does it (a read-then-write
    // here let both clicks miss it).
    const { data: moved } = await sb<any[]>('/lab_requests', {
      method: 'PATCH',
      params: { id: `eq.${id}`, sample_received: 'is.true', parameters_ok: 'is.true', confirmed: 'not.is.true' },
      body: JSON.stringify({ confirmed: true, confirmed_at: now }),
    })
    return NextResponse.json({ ok: true, movedToFms: Array.isArray(moved) && moved.length > 0 })
  }

  // Direct confirm (Rechecked / PC Lab / Requested Unit pages) — moves the
  // request to Lab FMS. These pages called this action before it existed and
  // showed "Confirmed" even though nothing was saved.
  if (action === 'confirm_request') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const now = new Date().toISOString()
    const { error } = await dbUpdate('lab_requests', { id }, { confirmed: true, confirmed_at: now })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, movedToFms: true })
  }

  if (action === 'update_request') {
    const patch: Record<string, any> = {}
    if (payload.fmsData   !== undefined) patch.fms_data   = payload.fmsData
    if (payload.confirmed !== undefined) patch.confirmed   = payload.confirmed
    const { error } = await dbUpdate('lab_requests', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Issues ────────────────────────────────────────────────────────────────

  if (action === 'create_issue') {
    if (!payload.requestId || !String(payload.description || '').trim()) {
      return NextResponse.json({ ok: false, error: 'requestId and description required' }, { status: 400 })
    }
    const { data, error, id: newId } = await insertWithNextId('lab_issues', 'ISSUE-', 4, {
      request_id:  payload.requestId,
      description: payload.description,
      priority:    payload.priority || 'Medium',
      solved:      false,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data, id: newId })
  }

  if (action === 'toggle_issue') {
    const { data: existing } = await dbSelect('lab_issues', { id: `eq.${id}` })
    const issue = existing?.[0]
    if (!issue) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
    // the page sends the value it wants (a double click no longer flips it back)
    const solved = typeof payload.solved === 'boolean' ? payload.solved : !issue.solved
    if (solved === !!issue.solved) return NextResponse.json({ ok: true })
    const { error } = await dbUpdate('lab_issues', { id }, {
      solved,
      solved_at: solved ? new Date().toISOString() : null,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Settings ─────────────────────────────────────────────────────

  // ── Manual recipes by Lab No. ────────────────────────────────────────────
  // save_recipe: new, or replace when the Lab No. already has one (the page
  // asks "replace it?" and sends replace: true). delete_recipe: admin only.
  if (action === 'save_recipe') {
    const labNo = String(payload.labNo ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
    if (!labNo) return NextResponse.json({ ok: false, error: 'Lab No. is required.' }, { status: 400 })
    if (labNo.length > 40) return NextResponse.json({ ok: false, error: 'Lab No. can be at most 40 characters.' }, { status: 400 })
    const recipe = (Array.isArray(payload.recipe) ? payload.recipe : [])
      .map((r: any) => ({ name: String(r?.name ?? '').trim().slice(0, 120), qty: String(r?.qty ?? '').trim().slice(0, 40) }))
      .filter((r: any) => r.name)
    if (!recipe.length) return NextResponse.json({ ok: false, error: 'Add at least one colour / chemical.' }, { status: 400 })
    const text = (v: any, n = 120) => { const t = String(v ?? '').trim(); return t ? t.slice(0, n) : null }
    const who = await currentUsername()
    // the same number written differently ("L1850" vs "L-1850") counts as the same recipe
    const { data: allRec } = await dbSelectAll<any>('lab_recipes', {}, 'id,lab_no,recipe')
    const existing = (allRec || []).find((r: any) => labNoKey(r.lab_no) === labNoKey(labNo))
    if (existing && id && existing.id !== id) {
      return NextResponse.json({ ok: false, error: `${existing.lab_no} already has its own recipe — edit that one instead.` }, { status: 409 })
    }
    if (existing && !id && !payload.replace) {
      return NextResponse.json({ ok: false, exists: true, error: `${existing.lab_no} already has a recipe${existing.lab_no !== labNo ? ` (same number as ${labNo})` : ''}.` }, { status: 409 })
    }
    const row = { lab_no: labNo, party: text(payload.party), shade: text(payload.shade), article: text(payload.article),
      remarks: text(payload.remarks, 500), recipe, updated_by: who, updated_at: new Date().toISOString() }
    const target = existing?.id || id
    if (target) {
      const { error } = await dbUpdate('lab_recipes', { id: target }, row)
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      await auditLog({ action: 'recipe_update', entity_type: 'lab_recipe', entity_id: target,
        old_value: existing ? JSON.stringify(existing.recipe).slice(0, 400) : undefined,
        new_value: `${labNo}: ${recipe.map((r: any) => `${r.name} ${r.qty}`.trim()).join(', ')}`.slice(0, 400) })
      return NextResponse.json({ ok: true, id: target })
    }
    const { data, error } = await dbInsert('lab_recipes', { ...row, created_by: who })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ action: 'recipe_create', entity_type: 'lab_recipe', entity_id: (data as any)?.id,
      new_value: `${labNo}: ${recipe.map((r: any) => `${r.name} ${r.qty}`.trim()).join(', ')}`.slice(0, 400) })
    return NextResponse.json({ ok: true, id: (data as any)?.id })
  }

  if (action === 'delete_recipe') {
    const d = await requireAdmin(req); if (d) return d
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { data: ex } = await dbSelect('lab_recipes', { id: `eq.${id}`, limit: '1' }, 'lab_no,recipe')
    const { error } = await dbDelete('lab_recipes', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ action: 'recipe_delete', entity_type: 'lab_recipe', entity_id: id,
      old_value: ex?.[0] ? `${ex[0].lab_no}: ${JSON.stringify(ex[0].recipe).slice(0, 300)}` : undefined })
    return NextResponse.json({ ok: true })
  }

  if (action === 'update_setting') {
    if (!payload.key) return NextResponse.json({ ok: false, error: 'key required' }, { status: 400 })
    const { error } = await sb('/lab_settings?on_conflict=key', {
      method: 'POST',
      body: JSON.stringify({ key: payload.key, value: payload.value, updated_at: new Date().toISOString() }),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
