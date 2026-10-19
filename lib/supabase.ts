/**
 * lib/supabase.ts — Shared Supabase client (server-side only)
 * Import only in app/api/** routes — never in client components.
 */
const SUPABASE_URL  = process.env.SUPABASE_URL || ''
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY || ''
const SECRET_KEY    = process.env.SUPABASE_SECRET_KEY  || ''   // new sb_secret_ format

// The server key: new sb_secret_ key, else the legacy service_role key.
// There is NO fallback to the public anon key any more — without a server
// key every database call fails with "Supabase not configured" (and the
// Vercel log says why) instead of quietly running with the wrong key.
export const SUPABASE_API_KEY =
  (SECRET_KEY  && !SECRET_KEY.includes('YOUR_'))  ? SECRET_KEY  :
  (SERVICE_KEY && !SERVICE_KEY.includes('YOUR_')) ? SERVICE_KEY :
  ''
if (!SUPABASE_API_KEY) console.error('[supabase] SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_KEY) is not set — every database call will fail.')

// ── Errors shown to users ────────────────────────────────────────────────────
// Our own database functions (df_…) raise clear messages with codes PT400 /
// PT404 / PT409 — those are passed on as they are. Any other database error
// is logged on the server with a short reference and the user sees a plain
// message with that reference (no table / constraint names).
const FRIENDLY: Record<string, string> = {
  '23505': 'This already exists (duplicate).',
  '23503': 'This is still used somewhere else, so it can\'t be changed or removed.',
  '23502': 'A required value is missing.',
  '23514': 'One of the values is not allowed here.',
  '22P02': 'One of the values has the wrong format.',
  '22007': 'A date has the wrong format.',
  '22008': 'A date is out of range.',
}
function userError(path: string, method: string, status: number, json: any): string {
  const code = String(json?.code || '')
  if (code.startsWith('PT') && json?.message) return String(json.message)
  const ref = Math.random().toString(36).slice(2, 6).toUpperCase()
  console.error(`[db] ref ${ref} · ${method} ${path} → HTTP ${status}`, json)
  const friendly = FRIENDLY[code]
  return friendly ? `${friendly} (ref ${ref})` : `Database error (ref ${ref}) — please try again, or tell the admin this ref.`
}

export { SUPABASE_URL }

export async function sb<T = any>(
  path: string,
  options: RequestInit & { params?: Record<string, string> } = {}
): Promise<{ data: T | null; error: string | null; status: number; rawError?: string }> {
  if (!SUPABASE_URL || !SUPABASE_API_KEY) {
    return { data: null, error: 'Supabase not configured', status: 503 }
  }
  const url = new URL(`${SUPABASE_URL}/rest/v1${path}`)
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  try {
    const res = await fetch(url.toString(), {
      ...options,
      headers: {
        'apikey': SUPABASE_API_KEY,
        'Authorization': `Bearer ${SUPABASE_API_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...(options.headers || {}),
      },
      cache: 'no-store',
    })
    if (res.status === 204) return { data: null, error: null, status: 204 }
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      return { data: null, error: userError(path, String(options.method || 'GET'), res.status, json),
               status: res.status, rawError: json?.message || `HTTP ${res.status}` }
    }
    return { data: json as T, error: null, status: res.status }
  } catch (err: any) {
    console.error(`[db] network error · ${path}:`, err?.message || err)
    return { data: null, error: 'Database unreachable — try again in a moment.', status: 500, rawError: err?.message }
  }
}

/**
 * Read rows. Supabase returns at most ~1000 rows per request no matter what
 * `limit` asks for, so this pages automatically until it has `limit` rows
 * (or every row, when no limit is given). `limit: '1'` is still one request.
 */
const PAGE_SIZE = 1000
const PARALLEL_PAGES = 6
export async function dbSelect<T = any>(
  table: string, query: Record<string, string> = {}, select = '*'
): Promise<{ data: T[]; error: string | null }> {
  const { limit: limitStr, offset: offsetStr, ...rest } = query
  const wanted = limitStr ? Math.max(0, parseInt(limitStr, 10) || 0) : Infinity
  const start  = offsetStr ? Math.max(0, parseInt(offsetStr, 10) || 0) : 0
  if (wanted === 0) return { data: [], error: null }

  // Paging needs a stable order; add one when the caller didn't give any
  const mayPage = wanted > PAGE_SIZE
  const base: Record<string, string> = { select, ...rest }
  if (mayPage && !base.order) base.order = 'id.asc'

  const fetchPage = (offset: number, limit: number) =>
    sb<T[]>(`/${table}`, { params: { ...base, limit: String(limit), offset: String(offset) } })

  // First page
  let first = await fetchPage(start, Math.min(PAGE_SIZE, wanted))
  if (first.error && mayPage && !rest.order && /column|id/i.test(first.rawError || '')) {
    delete base.order                               // table has no "id" column
    first = await fetchPage(start, Math.min(PAGE_SIZE, wanted))
  }
  if (first.error) return { data: [], error: first.error }
  const all: T[] = [...((first.data as T[]) || [])]
  if (all.length < Math.min(PAGE_SIZE, wanted)) return { data: all, error: null }

  // Remaining pages, several at a time
  let offset = start + all.length
  while (all.length < wanted) {
    const jobs: { offset: number; limit: number }[] = []
    let o = offset, got = all.length
    for (let i = 0; i < PARALLEL_PAGES && got < wanted; i++) {
      const lim = Math.min(PAGE_SIZE, wanted - got)
      jobs.push({ offset: o, limit: lim }); o += lim; got += lim
    }
    const results = await Promise.all(jobs.map(j => fetchPage(j.offset, j.limit)))
    let done = false
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.error) return { data: all, error: r.error }
      const page = (r.data as T[]) || []
      all.push(...page)
      if (page.length < jobs[i].limit) { done = true; break }   // reached the end
    }
    if (done) break
    offset = o
  }
  return { data: all, error: null }
}

// Supabase/PostgREST caps every single request at a server-configured max
// row count (commonly 1000) REGARDLESS of any `limit` query param the
// client sends — a `limit: '20000'` request silently truncates once the
// table crosses that cap. This pages through with the Range header,
// accumulating every row, for tables that can realistically grow past it
// (e.g. colour_store_stock, which gains ~480 rows per day of uploads).
export async function dbSelectAll<T = any>(
  table: string, query: Record<string, string> = {}, select = '*', pageSize = 1000
): Promise<{ data: T[]; error: string | null }> {
  const all: T[] = []
  let offset = 0
  while (true) {
    const params: Record<string, string> = { select, ...query }
    const { data, error } = await sb<T[]>(`/${table}`, {
      params,
      headers: { 'Range-Unit': 'items', 'Range': `${offset}-${offset + pageSize - 1}` },
    })
    if (error) return { data: all, error }
    const batch = (data as T[]) || []
    all.push(...batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }
  return { data: all, error: null }
}

export async function dbInsert<T = any>(
  table: string, row: Record<string, any>
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await sb<T[]>(`/${table}`, {
    method: 'POST', body: JSON.stringify(row),
    headers: { 'Prefer': 'return=representation' },
  })
  return { data: Array.isArray(data) ? (data[0] as T) : data, error }
}

export async function dbUpsert<T = any>(
  table: string, row: Record<string, any>, onConflict = 'id'
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await sb<T[]>(`/${table}?on_conflict=${onConflict}`, {
    method: 'POST', body: JSON.stringify(row),
    headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
  })
  return { data: Array.isArray(data) ? (data[0] as T) : data, error }
}

export async function dbUpdate(
  table: string, filter: Record<string, string>, patch: Record<string, any>
): Promise<{ error: string | null }> {
  const params: Record<string, string> = {}
  Object.entries(filter).forEach(([k, v]) => { params[k] = `eq.${v}` })
  const { error } = await sb(`/${table}`, {
    method: 'PATCH', body: JSON.stringify(patch), params,
    headers: { 'Prefer': 'return=minimal' },
  })
  return { error }
}

export async function dbDelete(
  table: string, filter: Record<string, string>
): Promise<{ error: string | null }> {
  const params: Record<string, string> = {}
  Object.entries(filter).forEach(([k, v]) => { params[k] = `eq.${v}` })
  const { error } = await sb(`/${table}`, { method: 'DELETE', params })
  return { error }
}

/** Signed-in username for the current API request (set by proxy.ts), or null. */
export async function currentUsername(): Promise<string | null> {
  try {
    const { headers } = await import('next/headers')
    const h = await headers()
    return h.get('x-dyeflow-username')
  } catch {
    return null   // not inside a request (scripts, build)
  }
}

export async function auditLog(entry: {
  username?: string; action: string; entity_type: string;
  entity_id?: string; field?: string; old_value?: string; new_value?: string; note?: string
}): Promise<void> {
  // Always record the real signed-in user. If the caller passed a label
  // (e.g. 'AI Actions Agent') keep it alongside: "aniket1 (AI Actions Agent)".
  const who = await currentUsername()
  const username = entry.username
    ? (who && who !== entry.username ? `${who} (${entry.username})` : entry.username)
    : (who || null)
  await sb('/audit_log', {
    method: 'POST', body: JSON.stringify({ ...entry, username }),
    headers: { 'Prefer': 'return=minimal' },
  })
}

/**
 * Read rows whose `column` is one of many ids. Long `in.(…)` lists make the
 * request URL too long (a few hundred UUIDs), so this asks in chunks.
 */
export async function dbSelectIn<T = any>(
  table: string, column: string, ids: string[], select = '*', extra: Record<string, string> = {}, chunk = 150
): Promise<{ data: T[]; error: string | null }> {
  const uniq = [...new Set(ids.filter(Boolean))]
  const all: T[] = []
  for (let i = 0; i < uniq.length; i += chunk) {
    const part = uniq.slice(i, i + chunk)
    const { data, error } = await dbSelect<T>(table, { ...extra, [column]: `in.(${part.join(',')})` }, select)
    if (error) return { data: all, error }
    all.push(...data)
  }
  return { data: all, error: null }
}
