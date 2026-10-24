'use client'
// Excel-like text cell for a batch field on the machine sheets (Book No. /
// Planning No.). Same keys as the Sub Prod No. cell: click, type, Enter / ↓
// saves and moves to the same column in the next row, ↑ previous row, Tab
// across, Esc puts the old value back. Saved on blur if changed.
import { useEffect, useRef, useState } from 'react'

export const BATCH_TEXT_MAX = 30
export type BatchTextField = 'book_no' | 'planning_no'
export const BATCH_TEXT_LABEL: Record<BatchTextField, string> = { book_no: 'Book No.', planning_no: 'Planning No.' }

export async function saveBatchText(batchUuid: string, field: BatchTextField, value: string): Promise<{ ok: boolean; value?: string | null; error?: string }> {
  try {
    const r = await fetch('/api/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_batch_text', id: batchUuid, field, value }) }).then(x => x.json())
    return r.ok ? { ok: true, value: r.data?.value ?? null } : { ok: false, error: r.error || 'Unknown error' }
  } catch { return { ok: false, error: 'Network error' } }
}

export function BatchTextCell({ batchId, field, value, canEdit = true, onSaved, width = 110 }: {
  batchId: string; field: BatchTextField; value?: string | null; canEdit?: boolean
  onSaved?: (v: string | null) => void; width?: number
}) {
  const [text, setText] = useState(value || '')
  const [shown, setShown] = useState<string | null>(value || null)
  const [saving, setSaving] = useState(false)
  const busy = useRef(false), cancelled = useRef(false), ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setShown(value || null); setText(value || '') }, [value])

  if (!canEdit) return shown
    ? <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{shown}</span>
    : <span style={{ color: 'var(--text-tertiary)' }}>—</span>

  const save = async (): Promise<boolean> => {
    if (busy.current) return false
    const next = text.trim()
    if (next === (shown || '')) return true
    busy.current = true; setSaving(true)
    const r = await saveBatchText(batchId, field, next)
    busy.current = false; setSaving(false)
    if (!r.ok) { alert(`${BATCH_TEXT_LABEL[field]} not saved: ${r.error}`); setText(shown || ''); return false }
    setShown(r.value ?? null); setText(r.value ?? ''); onSaved?.(r.value ?? null)
    return true
  }
  const move = (dir: 1 | -1) => {
    const all = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-batchtext="${field}"]`))
    const to = all[all.indexOf(ref.current!) + dir]
    if (to) { to.focus(); to.select() }
  }
  const empty = !text
  return (
    <input ref={ref} data-batchtext={field} value={text} maxLength={BATCH_TEXT_MAX} disabled={saving} placeholder="—"
      title={`Type the ${BATCH_TEXT_LABEL[field]} · Enter / ↓ next row · ↑ previous row · Esc cancel`}
      onClick={e => e.stopPropagation()} onFocus={e => e.target.select()}
      onChange={e => setText(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); save().then(ok => { if (ok) move(1) }) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); save().then(ok => { if (ok) move(-1) }) }
        else if (e.key === 'Escape') { cancelled.current = true; setText(shown || ''); ref.current?.blur() }
        e.stopPropagation()
      }}
      onBlur={() => { if (cancelled.current) { cancelled.current = false; setText(shown || ''); return } if (!busy.current) save() }}
      style={{ width, padding: '3px 6px', fontSize: 12, fontWeight: 600, borderRadius: 4,
        border: '1px solid ' + (empty ? '#F59E0B' : 'var(--border-light)'), background: empty ? '#FFFBEB' : 'var(--bg-primary)', color: 'var(--text-primary)' }} />
  )
}
