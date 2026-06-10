import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET — list all users from Supabase
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('dyeflow_users')
      .select('id, username, full_name, role, is_active')
      .order('id')

    if (error) throw error
    return NextResponse.json({ ok: true, users: data || [] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// POST — create / update / delete a user in Supabase
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, username, password, full_name, role, is_active, targetUsername } = body

    if (!username) {
      return NextResponse.json({ ok: false, error: 'Username is required' }, { status: 400 })
    }

    if (action === 'create') {
      if (!password || !password.trim()) {
        return NextResponse.json({ ok: false, error: 'Password is required for new users' }, { status: 400 })
      }

      // Check duplicate
      const { data: existing } = await supabase
        .from('dyeflow_users')
        .select('id')
        .eq('username', username.trim().toLowerCase())
        .maybeSingle()

      if (existing) {
        return NextResponse.json({ ok: false, error: 'Username already exists. Choose a different one.' }, { status: 409 })
      }

      const { error } = await supabase
        .from('dyeflow_users')
        .insert({
          username:  username.trim().toLowerCase(),
          password:  password.trim(),
          full_name: full_name || username,
          role:      role || 'custom',
          is_active: is_active !== false,
        })

      if (error) throw error
      return NextResponse.json({ ok: true })

    } else if (action === 'update') {
      const updateData: any = {
        full_name: full_name || username,
        role:      role || 'custom',
        is_active: is_active !== false,
      }
      if (password && password.trim()) {
        updateData.password = password.trim()
      }

      const lookupName = (targetUsername || username).trim().toLowerCase()
      const { error } = await supabase
        .from('dyeflow_users')
        .update(updateData)
        .eq('username', lookupName)

      if (error) throw error
      return NextResponse.json({ ok: true })

    } else if (action === 'delete') {
      const { error } = await supabase
        .from('dyeflow_users')
        .delete()
        .eq('username', username.trim().toLowerCase())

      if (error) throw error
      return NextResponse.json({ ok: true })

    } else {
      return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
