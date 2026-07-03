import { NextResponse } from 'next/server'

// Keep-alive ping for Supabase free tier
// Prevents the project from pausing due to inactivity (pauses after 7 days)
// Called by Vercel Cron every 4 days

export const runtime = 'edge'

export async function GET() {
  const supabaseUrl  = process.env.SUPABASE_URL
  const supabaseAnon = process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/dyeflow_db?id=eq.main&select=id`,
      {
        headers: {
          'apikey':        supabaseAnon,
          'Authorization': `Bearer ${supabaseAnon}`,
        },
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status }, { status: 500 })
    }

    return NextResponse.json({
      ok:      true,
      pinged:  new Date().toISOString(),
      message: 'Supabase keep-alive ping successful',
    })

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
