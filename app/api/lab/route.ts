import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, sb } from '@/lib/supabase'

export async function GET(req: NextRequest) {
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

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, id, ...payload } = body

  // ── Indents ──────────────────────────────────────────────────────────────

  if (action === 'create_indent') {
    const { data, error } = await dbInsert('lab_indents', {
      id,
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
    return NextResponse.json({ ok: true, data })
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
    const { data, error } = await dbInsert('lab_requests', {
      id,
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
    return NextResponse.json({ ok: true, data })
  }

  // Two independent confirmations — request only moves to FMS (confirmed=true)
  // once BOTH sample_received and parameters_ok are true.
  if (action === 'mark_sample_received' || action === 'mark_parameters_ok') {
    const { data: existing } = await dbSelect('lab_requests', { id: `eq.${id}` })
    const reqRow = existing?.[0]
    if (!reqRow) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })

    const field = action === 'mark_sample_received' ? 'sample_received' : 'parameters_ok'
    const otherField = field === 'sample_received' ? 'parameters_ok' : 'sample_received'
    const patch: Record<string, any> = { [field]: true, [`${field}_at`]: new Date().toISOString() }
    if (reqRow[otherField]) {
      patch.confirmed = true
      patch.confirmed_at = new Date().toISOString()
    }
    const { error } = await dbUpdate('lab_requests', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, movedToFms: !!patch.confirmed })
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
    const { data, error } = await dbInsert('lab_issues', {
      id,
      request_id:  payload.requestId,
      description: payload.description,
      priority:    payload.priority || 'Medium',
      solved:      false,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'toggle_issue') {
    const { data: existing } = await dbSelect('lab_issues', { id: `eq.${id}` })
    const issue = existing?.[0]
    if (!issue) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
    const { error } = await dbUpdate('lab_issues', { id }, {
      solved:    !issue.solved,
      solved_at: !issue.solved ? new Date().toISOString() : null,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Settings ─────────────────────────────────────────────────────

  if (action === 'update_setting') {
    if (!payload.key) return NextResponse.json({ ok: false, error: 'key required' }, { status: 400 })
    const { error } = await sb('/lab_settings', {
      method: 'POST',
      body: JSON.stringify({ key: payload.key, value: payload.value, updated_at: new Date().toISOString() }),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
