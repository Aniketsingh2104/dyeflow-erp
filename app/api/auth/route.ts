import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    if (!username || !password) {
      return NextResponse.json({ ok: false, error: 'Username and password required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('dyeflow_users')
      .select('id, username, full_name, role, is_active')
      .eq('username', username.trim().toLowerCase())
      .eq('password', password)
      .eq('is_active', true)
      .single()

    if (error || !data) {
      return NextResponse.json({ ok: false, error: 'Invalid username or password' }, { status: 401 })
    }

    return NextResponse.json({ ok: true, user: data })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
