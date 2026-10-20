'use client'
// Sub Prod No. of a batch — shown in its own column next to Batch ID on every
// batch sheet (lib/subProd.ts). Missing → an amber "—" so it is easy to spot.
// SubProdEdit: click to type / change it (Splitted Orders, Batch page).
import { useEffect, useRef, useState } from 'react'
import { saveSubProd } from '@/lib/db'
import { SUB_PROD_MAX } from '@/lib/subProd'

export const SUB_PROD_LABEL = 'Sub Prod No.'

export function SubProdCell({ value, style }: { value?: string | null; style?: React.CSSProperties }) {
  return value
    ? <span style={{ fontWeight: 600, whiteSpace: 'nowrap', ...style }}>{value}</span>
    : <span title="No Sub Prod No. yet" style={{ color: '#B45309', fontWeight: 700, ...style }}>—</span>
}

/** "· P-5201-A" after a batch id where there is no room for a column */
export function SubProdTag({ value }: { value?: string | null }) {
  if (!value) return null
  return <span style={{ fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}> · {value}</span>
}

// Excel-like cell: always a box you can click and type in. Enter or ↓ saves and
// moves to the next row's box, ↑ to the previous, Tab moves on, Esc puts the
// old value back. Saved when you leave the box (blur) if it changed.
export function SubProdEdit({ batchId, value, canEdit = true, onSaved, style }: {
  batchId: string                       // batches.id (uuid)
  value?: string | null
  canEdit?: boolean
  onSaved?: (v: string | null) => void
  style?: React.CSSProperties
}) {
  const [text, setText] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const [shown, setShown] = useState<string | null>(value || null)
  const busy = useRef(false)
  const ref = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)             // Esc: the blur that follows must not save
  useEffect(() => { setShown(value || null); setText(value || '') }, [value])

  if (!canEdit) return <SubProdCell value={shown} style={style} />

  const save = async (): Promise<boolean> => {
    if (busy.current) return false
    const next = text.trim().toUpperCase()
    if (next === (shown || '')) return true
    busy.current = true; setSaving(true)
    const r = await saveSubProd(batchId, next)
    busy.current = false; setSaving(false)
    if (r.cancelled) { setText(shown || ''); return false }
    if (!r.ok) { alert('Sub Prod No. not saved: ' + (r.error || 'Unknown error')); setText(shown || ''); return false }
    setShown(r.value ?? null); setText(r.value ?? ''); onSaved?.(r.value ?? null)
    return true
  }
  // the next / previous Sub Prod box on the page (same column, other rows)
  const move = (dir: 1 | -1) => {
    const all = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-subprod]'))
    const i = all.indexOf(ref.current!)
    const to = all[i + dir]
    if (to) { to.focus(); to.select() }
  }
  const empty = !text
  return (
    <input ref={ref} data-subprod="1" value={text} maxLength={SUB_PROD_MAX} disabled={saving} placeholder="—"
      title="Type the Sub Prod No. · Enter / ↓ next row · ↑ previous row"
      onClick={e => e.stopPropagation()}
      onFocus={e => e.target.select()}
      onChange={e => setText(e.target.value.toUpperCase())}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); save().then(ok => { if (ok) move(1) }) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); save().then(ok => { if (ok) move(-1) }) }
        else if (e.key === 'Escape') { cancelled.current = true; setText(shown || ''); ref.current?.blur() }
      }}
      onBlur={() => { if (cancelled.current) { cancelled.current = false; setText(shown || ''); return } if (!busy.current) save() }}
      style={{ width: 110, padding: '3px 6px', fontSize: 12, fontWeight: 600, borderRadius: 4,
        border: '1px solid ' + (empty ? '#F59E0B' : 'var(--border-light)'), background: empty ? '#FFFBEB' : 'var(--bg-primary)',
        color: 'var(--text-primary)', ...style }} />
  )
}
