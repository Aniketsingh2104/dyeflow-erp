const fs = require('fs')
const f = 'lib/supabase.ts'
let c = fs.readFileSync(f, 'utf8')

// Fix dbUpsert to accept onConflict parameter and pass it to URL
const OLD = `export async function dbUpsert<T = any>(
  table: string, row: Record<string, any>
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await sb<T[]>(\`/\${table}\`, {
    method: 'POST', body: JSON.stringify(row),
    headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
  })
  return { data: Array.isArray(data) ? (data[0] as T) : data, error }
}`

const NEW = `export async function dbUpsert<T = any>(
  table: string, row: Record<string, any>, onConflict = 'id'
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await sb<T[]>(\`/\${table}?on_conflict=\${onConflict}\`, {
    method: 'POST', body: JSON.stringify(row),
    headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
  })
  return { data: Array.isArray(data) ? (data[0] as T) : data, error }
}`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(f, c, 'utf8')
  console.log('✓ dbUpsert now passes on_conflict to URL — upsert will work correctly')
} else {
  console.error('✗ Pattern not found')
}
