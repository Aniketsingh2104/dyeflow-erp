import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { loadHolidays } from '@/lib/holidays'

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'holidays', 'GET'); if (g.deny) return g.deny }
  try {
    const { searchParams } = new URL(req.url)
    const machineId = searchParams.get('machine_id')

    const data = await loadHolidays(machineId)
    if (data.error) return NextResponse.json({ ok: false, error: data.error }, { status: 500 })
    return NextResponse.json({ ok: true, data: data.rows })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
