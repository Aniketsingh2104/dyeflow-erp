// GET /api/search?q=… — the 🔍 search box in the menu bar (Ctrl+K).
// Searched in the database (it used to read an old browser copy that is no
// longer filled, so it always found nothing). Staff only.
import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'search', 'GET'); if (g.deny) return g.deny }
  // characters that mean something inside a PostgREST filter are dropped
  const q = (new URL(req.url).searchParams.get('q') || '').replace(/[,()*"\\:%]/g, ' ').trim().slice(0, 40)
  if (q.length < 2) return NextResponse.json({ ok: true, data: { orders: [], batches: [], machines: [], supervisors: [] } })
  const like = `*${q}*`
  const orFields = ['order_number', 'party', 'article', 'color', 'challan_no', 'lot_no', 'lab_no']
    .map(f => `${f}.ilike.${like}`).join(',')

  const [o, b, m, s] = await Promise.all([
    dbSelect('orders', { or: `(${orFields})`, order: 'created_at.desc', limit: '8' },
      'id,order_number,party,article,color,qty_kg,status,supervisors(name)'),
    dbSelect('batches', { or: `(batch_id.ilike.${like},sub_prod_no.ilike.${like})`, order: 'created_at.desc', limit: '6' },
      'id,batch_id,sub_prod_no,kg,status,current_process,order_id'),
    dbSelect('machines', { name: `ilike.${like}`, order: 'name.asc', limit: '5' }, 'id,name,capacity,machine_type'),
    dbSelect('supervisors', { name: `ilike.${like}`, order: 'name.asc', limit: '5' }, 'id,name'),
  ])
  const err = o.error || b.error || m.error || s.error
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })
  return NextResponse.json({ ok: true, data: { orders: o.data || [], batches: b.data || [], machines: m.data || [], supervisors: s.data || [] } })
}
