import { NextRequest, NextResponse } from 'next/server'
import { dbSelect } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { username, password, action } = await req.json()

    if (action === 'logout') return NextResponse.json({ ok: true })

    if (!username || !password) {
      return NextResponse.json({ ok: false, error: 'Username and password required' }, { status: 400 })
    }

    const uname = username.trim().toLowerCase()

    const { data: users, error } = await dbSelect(
      'dyeflow_users',
      { username: `eq.${uname}`, is_active: 'eq.true' },
      'id,username,full_name,role,permissions,password,scope_mode,unit,party,notes'
    )

    if (error) {
      // DB unavailable — allow fallback admin
      if (uname === 'admin' && (password === 'dyeflow123' || password === 'admin123')) {
        return NextResponse.json({ ok: true, user: {
          id: 'fallback-admin', username: 'admin', full_name: 'Admin',
          role: 'admin', permissions: null, scope_mode: 'all', unit: null, party: null,
        }})
      }
      return NextResponse.json({ ok: false, error: 'Database unavailable' }, { status: 503 })
    }

    const user = users?.[0]

    if (!user) {
      if (uname === 'admin' && (password === 'dyeflow123' || password === 'admin123') && (!users || users.length === 0)) {
        return NextResponse.json({ ok: true, user: {
          id: 'fallback-admin', username: 'admin', full_name: 'Admin',
          role: 'admin', permissions: null, scope_mode: 'all', unit: null, party: null,
        }})
      }
      return NextResponse.json({ ok: false, error: 'Invalid username or password' }, { status: 401 })
    }

    if ((user.password || '').trim() !== password.trim()) {
      return NextResponse.json({ ok: false, error: 'Invalid username or password' }, { status: 401 })
    }

    return NextResponse.json({ ok: true, user: {
      id:          user.id,
      username:    user.username,
      full_name:   user.full_name || user.username,
      role:        user.role || 'custom',
      permissions: user.permissions || null,
      scope_mode:  user.scope_mode || 'all',
      unit:        user.unit || null,
      party:       user.party || null,
    }})

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'Server error' }, { status: 500 })
  }
}
