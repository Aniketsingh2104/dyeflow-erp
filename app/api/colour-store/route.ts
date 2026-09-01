import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbSelectAll, sb } from '@/lib/supabase'

// ── app/api/colour-store ── Colour Store IMS ─────────────────────────────
// GET  -> { chemicals: colour_chemicals[], stock: colour_store_stock[] }
//         (client computes "latest per name" from the stock array — kept
//         simple since history matters too, not just the latest snapshot)
// POST { action: 'upload_stock', stockDate, rows: [{name, group, qty, rate}] }
//   -> All-or-nothing: every name in the file must already exist in the
//      Colour Chemical Master, checked BEFORE anything is saved. If even one
//      name doesn't match, nothing is saved and the response lists exactly
//      which names are missing (ok:false, error:'not_in_master', unmatched:[]).
//      Add the missing item(s) to the master, then re-upload.
//   -> On success: upserts one row per name for that date (name+stock_date
//      is unique, so re-uploading the same date corrects rather than
//      duplicates). qty is stored exactly as uploaded (grams, from the real
//      report format — Balance Qty column) — conversion to Kg happens at
//      display time only.

export async function GET() {
  const [chemRes, stockRes] = await Promise.all([
    dbSelect('colour_chemicals', { order: 'name.asc', limit: '5000' }, 'id,name,lead_time,safety_factor,avg_daily_consumption,created_at'),
    dbSelectAll('colour_store_stock', { order: 'stock_date.desc' }, 'id,chemical_id,name,group_name,stock_qty,stock_date,rate,created_at'),
  ])
  if (chemRes.error) return NextResponse.json({ ok: false, error: chemRes.error }, { status: 500 })
  if (stockRes.error) return NextResponse.json({ ok: false, error: stockRes.error }, { status: 500 })
  return NextResponse.json({ ok: true, chemicals: chemRes.data || [], stock: stockRes.data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'upload_stock') {
    const { stockDate, rows } = body
    if (!stockDate) return NextResponse.json({ ok: false, error: 'stockDate required' }, { status: 400 })
    if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ ok: false, error: 'rows[] required' }, { status: 400 })

    // Resolve each row's name against the colour_chemicals master (case-
    // insensitive, trimmed) so chemical_id links correctly when it matches.
    const { data: chemicals } = await dbSelect('colour_chemicals', { limit: '5000' }, 'id,name')
    const byNameLower: Record<string, string> = {}
    for (const c of (chemicals || []) as any[]) byNameLower[String(c.name).trim().toLowerCase()] = c.id

    const cleanedRows = rows
      .map((r: any) => ({ name: String(r.name || '').trim(), group: r.group, qty: r.qty, rate: r.rate }))
      .filter((r: any) => r.name)

    // Validate EVERY name before saving ANYTHING.
    const unmatchedNames = Array.from(new Set(
      cleanedRows.filter((r: any) => !byNameLower[r.name.toLowerCase()]).map((r: any) => r.name)
    ))
    if (unmatchedNames.length > 0) {
      return NextResponse.json({
        ok: false,
        error: 'not_in_master',
        unmatched: unmatchedNames,
        message: `${unmatchedNames.length} item(s) in this file are not in the Colour Chemical Master. Nothing was saved. Add them to the master first, then re-upload.`,
      }, { status: 400 })
    }

    const upsertRows = cleanedRows.map((r: any) => ({
      chemical_id: byNameLower[r.name.toLowerCase()],
      name: r.name,
      group_name: r.group ? String(r.group).trim() : null,
      stock_qty: parseFloat(r.qty) || 0,
      rate: r.rate != null && r.rate !== '' ? parseFloat(r.rate) : null,
      stock_date: stockDate,
    }))

    const { error } = await sb('/colour_store_stock', {
      method: 'POST',
      body: JSON.stringify(upsertRows),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    return NextResponse.json({ ok: true, saved: upsertRows.length })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
