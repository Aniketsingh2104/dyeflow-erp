/**
 * lib/supabase.ts — Shared Supabase client (server-side only)
 * Import only in app/api/** routes — never in client components.
 */
const SUPABASE_URL  = process.env.SUPABASE_URL || ''
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY || ''
const SECRET_KEY    = process.env.SUPABASE_SECRET_KEY  || ''   // new sb_secret_ format
const ANON_KEY      = process.env.SUPABASE_ANON_KEY    || ''

// Prefer new sb_secret_ key, fall back to legacy service_role key, then anon
export const SUPABASE_API_KEY =
  (SECRET_KEY  && !SECRET_KEY.includes('YOUR_'))  ? SECRET_KEY  :
  (SERVICE_KEY && !SERVICE_KEY.includes('YOUR_')) ? SERVICE_KEY :
  ANON_KEY

export { SUPABASE_URL }

export async function sb<T = any>(
  path: string,
  options: RequestInit & { params?: Record<string, string> } = {}
): Promise<{ data: T | null; error: string | null; status: number }> {
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
    if (!res.ok) return { data: null, error: json?.message || `HTTP ${res.status}`, status: res.status }
    return { data: json as T, error: null, status: res.status }
  } catch (err: any) {
    return { data: null, error: err?.message || 'Network error', status: 500 }
  }
}

export async function dbSelect<T = any>(
  table: string, query: Record<string, string> = {}, select = '*'
): Promise<{ data: T[]; error: string | null }> {
  const params: Record<string, string> = { select, ...query }
  const { data, error } = await sb<T[]>(`/${table}`, { params })
  return { data: data ?? [], error }
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
  table: string, row: Record<string, any>
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await sb<T[]>(`/${table}`, {
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

export async function auditLog(entry: {
  username?: string; action: string; entity_type: string;
  entity_id?: string; field?: string; old_value?: string; new_value?: string; note?: string
}): Promise<void> {
  await sb('/audit_log', {
    method: 'POST', body: JSON.stringify(entry),
    headers: { 'Prefer': 'return=minimal' },
  })
}
