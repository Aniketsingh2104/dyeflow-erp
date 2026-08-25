import type { CSSProperties } from 'react'

/**
 * lib/dateUrgency.ts — Shared "is this date coming up / already passed"
 * classification, used to highlight planned-date cells across DyeFlow
 * (First Process Batch page, every FMS process page).
 *
 * Four states: overdue (red), due_soon (amber, within DUE_SOON_DAYS),
 * on_track (green), no_date (red-light, nothing to compare against).
 */

// How many days out still counts as "due soon" rather than "on track".
export const DUE_SOON_DAYS = 3

export interface UrgencyResult {
  status: 'overdue' | 'due_soon' | 'on_track' | 'no_date'
  daysDiff: number | null
  label: string
}

/**
 * Urgency of a raw ISO date (YYYY-MM-DD, optionally with a time part —
 * only the date portion is used) relative to today. Pass the *raw* value,
 * not a localized display string, so the day-difference math is
 * unambiguous regardless of DD/MM vs MM/DD formatting elsewhere.
 */
export function getUrgency(rawDate: string | null | undefined): UrgencyResult {
  if (!rawDate) return { status: 'no_date', daysDiff: null, label: '⚠ No Date' }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(rawDate.slice(0, 10) + 'T00:00:00')
  if (isNaN(target.getTime())) return { status: 'no_date', daysDiff: null, label: '⚠ No Date' }
  const daysDiff = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (daysDiff < 0) return { status: 'overdue', daysDiff, label: `${Math.abs(daysDiff)}d overdue` }
  if (daysDiff === 0) return { status: 'due_soon', daysDiff, label: 'Due today' }
  if (daysDiff <= DUE_SOON_DAYS) return { status: 'due_soon', daysDiff, label: `Due in ${daysDiff}d` }
  return { status: 'on_track', daysDiff, label: '' }
}

/** Shared cell styling per urgency status — same visual language everywhere it's used. */
export const URGENCY_CELL_STYLE: Record<UrgencyResult['status'], CSSProperties> = {
  overdue: { color: '#fff', background: 'var(--danger)' },
  due_soon: { color: '#7C2D12', background: '#FEF3C7' },
  on_track: { color: 'var(--success)', background: '' },
  no_date: { color: 'var(--danger)', background: 'var(--danger-light)' },
}
