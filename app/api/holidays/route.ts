import { NextRequest, NextResponse } from 'next/server'
import { dbSelect } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const machineId = searchParams.get('machine_id')

    const query: Record<string, string> = { order: 'holiday_date.asc', limit: '1000' }

    // Fetch global holidays (machine_id IS NULL) + machine-specific holidays
    // We fetch all and filter client side since PostgREST OR needs special syntax
    const { data, error } = await dbSelect('holidays', query, 'id,holiday_date,name,type,machine_id,reason')
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    // Filter: global (machine_id null) OR matches this machine
    const filtered = (data || []).filter((h: any) =>
      !h.machine_id || (machineId && h.machine_id === machineId)
    )

    return NextResponse.json({ ok: true, data: filtered })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
