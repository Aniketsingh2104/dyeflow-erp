import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ ok: false, error: 'User ID and password are required' }, { status: 400 })
    }

    const uname = username.trim().toLowerCase()
    const supabaseUrl  = process.env.SUPABASE_URL
    const supabaseAnon = process.env.SUPABASE_ANON_KEY
    const serviceKey   = process.env.SUPABASE_SERVICE_KEY

    // Pick best key available — service key bypasses RLS
    const apiKey = (serviceKey && serviceKey !== 'YOUR_SERVICE_ROLE_KEY_HERE')
      ? serviceKey
      : supabaseAnon

    // ── Read dyeflow_db blob from Supabase ────────────────────────────────
    if (supabaseUrl && apiKey) {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/dyeflow_db?id=eq.main&select=data`,
          {
            headers: {
              'apikey':        apiKey,
              'Authorization': `Bearer ${apiKey}`,
            },
            cache: 'no-store',
          }
        )

        if (res.ok) {
          const rows = await res.json()
          const db   = rows?.[0]?.data || {}
          const users: any[] = db.users || []

          if (users.length > 0) {
            const found = users.find(u =>
              (u.username || '').trim().toLowerCase() === uname &&
              (u.password || '') === password
            )

            if (found) {
              return NextResponse.json({
                ok:   true,
                user: {
                  id:          found.id       || found.username,
                  username:    found.username,
                  full_name:   found.fullName || found.username,
                  role:        found.role     || 'custom',
                  permissions: found.permissions || null,
                },
              })
            }

            // Users exist but none matched — reject now, don't fall through
            return NextResponse.json(
              { ok: false, error: 'Invalid User ID or password' },
              { status: 401 }
            )
          }
        }
      } catch {
        // Supabase unreachable — fall through to default admin below
      }
    }

    // ── Last resort: hardcoded default admin ─────────────────────────────
    // Only works if NO users have been set up yet (Supabase empty/down)
    if (uname === 'admin' && password === 'dyeflow123') {
      return NextResponse.json({
        ok:   true,
        user: {
          id:        'USR-001',
          username:  'admin',
          full_name: 'Admin',
          role:      'admin',
          permissions: null,
        },
      })
    }

    return NextResponse.json(
      { ok: false, error: 'Invalid User ID or password' },
      { status: 401 }
    )

  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Server error' },
      { status: 500 }
    )
  }
}
