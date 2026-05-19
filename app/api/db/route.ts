import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('dyeflow_db')
      .select('data, updated_at')
      .eq('id', 'main')
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, data: data?.data ?? {}, updated_at: data?.updated_at })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
    }

    const { error } = await supabase
      .from('dyeflow_db')
      .upsert({ id: 'main', data: body }, { onConflict: 'id' })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
