import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, sb } from '@/lib/supabase'

// ── app/api/colour-store ── Colour Store IMS ─────────────────────────────
// GET  -> { chemicals: colour_chemicals[], stock: colour_store_stock[] }
//         (client computes "latest per name" from the stock array — kept
//         simple since history matters too, not just the latest snapshot)
// POST { action: 'upload_stock', stockDate, rows: [{name, qty}] }
//   -> upserts one row per name for that date (name+stock_date is unique,
//      so re-uploading the same date corrects rather than duplicates)

export async function GET() {
  const [chemRes, stockRes] = await Promise.all([
    dbSelect('colour_chemicals', { order: 'name.asc', limit: '5000' }, 'id,name,created_at'),
    dbSelect('colour_store_stock', { order: 'stock_date.desc', limit: '20000' }, 'id,chemical_id,name,stock_qty,stock_date,created_at'),
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

    const upsertRows = rows.map((r: any) => {
      const name = String(r.name || '').trim()
      return {
        chemical_id: byNameLower[name.toLowerCase()] || null,
        name,
        stock_qty: parseFloat(r.qty) || 0,
        stock_date: stockDate,
      }
    }).filter((r: any) => r.name)

    const { error } = await sb('/colour_store_stock', {
      method: 'POST',
      body: JSON.stringify(upsertRows),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    const matched = upsertRows.filter((r: any) => r.chemical_id).length
    const unmatched = upsertRows.filter((r: any) => !r.chemical_id).map((r: any) => r.name)
    return NextResponse.json({ ok: true, saved: upsertRows.length, matched, unmatched })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
