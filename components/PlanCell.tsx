'use client'
// Excel-like number cell for master tables (Colour Chemical Master planning
// values). Always an input: click, type, Enter / ↓ saves and moves to the same
// column in the next row, ↑ previous row, Tab across, Esc puts the old value
// back. Saved on blur if changed. Empty = amber so gaps are easy to see.
import { useEffect, useRef, useState } from 'react'

export function PlanCell({ value, col, onSave, canEdit = true, step = 'any', width = 90, placeholder = '—' }: {
  value: number | null | undefined
  col: string                                     // column key, for ↑ / ↓ navigation
  onSave: (v: number | null) => Promise<boolean>  // false = not saved (old value restored)
  canEdit?: boolean
  step?: string
  width?: number
  placeholder?: string
}) {
  const shown = value == null ? '' : String(value)
  const [text, setText] = useState(shown)
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const cancelled = useRef(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setText(shown) }, [shown])

  if (!canEdit) return value == null
    ? <span title="Not set" style={{ color: '#B45309', fontWeight: 700 }}>—</span>
    : <span style={{ fontWeight: 600 }}>{value}</span>

  const save = async (): Promise<boolean> => {
    if (busy.current) return false
    const t = text.trim()
    if (t === shown) return true
    const n = t === '' ? null : Number(t)
    if (n !== null && !isFinite(n)) { setText(shown); return false }
    busy.current = true; setSaving(true)
    const ok = await onSave(n)
    busy.current = false; setSaving(false)
    if (!ok) setText(shown)
    return ok
  }
  const move = (dir: 1 | -1) => {
    const all = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-plancell="${col}"]`))
    const to = all[all.indexOf(ref.current!) + dir]
    if (to) { to.focus(); to.select() }
  }
  const empty = !text
  return (
    <input ref={ref} data-plancell={col} type="number" step={step} value={text} disabled={saving} placeholder={placeholder}
      title="Type a value · Enter / ↓ next row · ↑ previous row · Esc cancel"
      onClick={e => e.stopPropagation()}
      onFocus={e => e.target.select()}
      onChange={e => setText(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); save().then(ok => { if (ok) move(1) }) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); save().then(ok => { if (ok) move(-1) }) }
        else if (e.key === 'Escape') { cancelled.current = true; setText(shown); ref.current?.blur() }
      }}
      onBlur={() => { if (cancelled.current) { cancelled.current = false; setText(shown); return } if (!busy.current) save() }}
      style={{ width, padding: '5px 8px', fontSize: 13, fontWeight: 600, borderRadius: 6, textAlign: 'right',
        border: '1px solid ' + (empty ? '#F59E0B' : 'var(--border-light)'), background: empty ? '#FFFBEB' : 'var(--bg-primary)',
        color: 'var(--text-primary)' }} />
  )
}
