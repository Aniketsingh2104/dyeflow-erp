/**
 * Keep only the LAST row for each key (trimmed, same case as the database's
 * unique constraints) — a bulk upsert fails
 * with "ON CONFLICT DO UPDATE command cannot affect row a second time" when
 * the same name appears twice in one file.
 */
export function lastByKey<T extends Record<string, any>>(rows: T[], ...keys: string[]): T[] {
  const map = new Map<string, T>()
  for (const r of rows) {
    const k = keys.map(key => String(r[key] ?? '').trim()).join('\u0001')
    map.delete(k)          // re-insert so the order follows the last occurrence
    map.set(k, r)
  }
  return [...map.values()]
}
