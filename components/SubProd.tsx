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

export function SubProdEdit({ batchId, value, canEdit = true, onSaved, style }: {
  batchId: string                       // batches.id (uuid)
  value?: string | null
  canEdit?: boolean
  onSaved?: (v: string | null) => void
  style?: React.CSSProperties
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const [shown, setShown] = useState<string | null>(value || null)
  const busy = useRef(false)
  useEffect(() => { setShown(value || null); if (!editing) setText(value || '') }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!canEdit) return <SubProdCell value={shown} style={style} />
  if (!editing) {
    return (
      <span onClick={e => { e.stopPropagation(); setText(shown || ''); setEditing(true) }}
        title="Click to change the Sub Prod No." style={{ cursor: 'pointer', borderBottom: '1px dashed var(--border-medium)', ...style }}>
        <SubProdCell value={shown} />
      </span>
    )
  }
  const save = async () => {
    if (busy.current) return
    const next = text.trim().toUpperCase()
    if (next === (shown || '')) { setEditing(false); return }
    busy.current = true; setSaving(true)
    const r = await saveSubProd(batchId, next)
    busy.current = false; setSaving(false)
    if (r.cancelled) return                       // stay in the box, the user can change it
    if (!r.ok) { alert('Sub Prod No. not saved: ' + (r.error || 'Unknown error')); return }
    setShown(r.value ?? null); setEditing(false); onSaved?.(r.value ?? null)
  }
  return (
    <input autoFocus value={text} maxLength={SUB_PROD_MAX} disabled={saving} placeholder="e.g. P-5201-A"
      onClick={e => e.stopPropagation()}
      onChange={e => setText(e.target.value.toUpperCase())}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } if (e.key === 'Escape') { setEditing(false); setText(shown || '') } }}
      onBlur={() => { if (!busy.current) save() }}
      style={{ width: 110, padding: '3px 6px', fontSize: 12, border: '1px solid var(--accent)', borderRadius: 4,
        background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
  )
}
