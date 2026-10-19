/**
 * lib/holidays.ts — holidays and the working-day rule on the server.
 */
import { dbSelect } from '@/lib/supabase'
import { buildHolidaySet, sundayOffFrom } from '@/lib/workdays'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Every holiday (no cap — machine dates are counted from the machine's base
 * date, which can be months back): the global ones plus this machine's own.
 */
export async function loadHolidays(machineId: string | null) {
  const query: Record<string, string> = { order: 'holiday_date.asc' }
  query.or = machineId && UUID.test(machineId) ? `(machine_id.is.null,machine_id.eq.${machineId})` : '(machine_id.is.null)'
  const { data, error } = await dbSelect('holidays', query, 'id,holiday_date,name,type,machine_id,reason')
  return { rows: data || [], error }
}

/** Factory Settings → "Sunday is a holiday" (on unless switched off). */
export async function loadSundayOff(): Promise<boolean> {
  const { data } = await dbSelect('settings', { key: 'eq.factory', limit: '1' }, 'value')
  return sundayOffFrom(data?.[0]?.value)
}

/** The non-working days for one machine (or the whole factory). */
export async function loadHolidaySet(machineId: string | null): Promise<Set<string>> {
  const [{ rows }, sundayOff] = await Promise.all([loadHolidays(machineId), loadSundayOff()])
  return buildHolidaySet(rows, sundayOff)
}
