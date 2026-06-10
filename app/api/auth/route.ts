import { NextRequest, NextResponse } from 'next/server'

// Auth route — checks users stored inside dyeflow_db blob
// Falls back to Supabase dyeflow_users table if env keys are set (legacy)

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ ok: false, error: 'User ID and password are required' }, { status: 400 })
    }

    const uname = username.trim().toLowerCase()

    // ── PRIMARY: check users inside dyeflow_db blob ───────────────────────
    // This works even without SUPABASE_SERVICE_KEY
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseAnon = process.env.SUPABASE_ANON_KEY

    if (supabaseUrl && supabaseAnon) {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/dyeflow_db?id=eq.main&select=data`,
          {
            headers: {
              'apikey': supabaseAnon,
              'Authorization': `Bearer ${supabaseAnon}`,
            },
            cache: 'no-store',
          }
        )

        if (res.ok) {
          const rows = await res.json()
          const db = rows?.[0]?.data || {}
          const users: any[] = db.users || []

          const found = users.find(
            u =>
              (u.username || '').toLowerCase() === uname &&
              u.password === password
          )

          if (found) {
            return NextResponse.json({
              ok: true,
              user: {
                id:        found.id || found.username,
                username:  found.username,
                full_name: found.fullName || found.username,
                role:      found.role || 'custom',
              },
            })
          }

          // If we found users in the db but none matched, reject immediately
          if (users.length > 0) {
            return NextResponse.json({ ok: false, error: 'Invalid User ID or password' }, { status: 401 })
          }
        }
      } catch {
        // Supabase unreachable — fall through to legacy check
      }
    }

    // ── LEGACY FALLBACK: check dyeflow_users table (requires SERVICE_KEY) ─
    const serviceKey = process.env.SUPABASE_SERVICE_KEY
    if (supabaseUrl && serviceKey && serviceKey !== 'YOUR_SERVICE_ROLE_KEY_HERE') {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/dyeflow_users?username=eq.${encodeURIComponent(uname)}&password=eq.${encodeURIComponent(password)}&is_active=eq.true&select=id,username,full_name,role`,
          {
            headers: {
              'apikey': serviceKey,
              'Authorization': `Bearer ${serviceKey}`,
            },
            cache: 'no-store',
          }
        )

        if (res.ok) {
          const rows = await res.json()
          if (rows && rows.length > 0) {
            return NextResponse.json({ ok: true, user: rows[0] })
          }
        }
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ ok: false, error: 'Invalid User ID or password' }, { status: 401 })

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'Server error' }, { status: 500 })
  }
}
