'use client'
// Excel-style column filter menu for the Order Sheet (app/sheet). Opens from
// the ▼ on a column heading: sort, a value checklist (with search) and a
// text condition. The sheet keeps one ColFilter per column.
import { useEffect, useMemo, useRef, useState } from 'react'

export type FilterOp = 'contains' | 'notContains' | 'equals' | 'beginsWith' | 'endsWith' | 'blank' | 'notBlank'
export interface ColFilter {
  values?: string[] | null       // checked values (null / undefined = all)
  op?: FilterOp
  text?: string
}
export const OPS: { v: FilterOp; label: string; needsText: boolean }[] = [
  { v: 'contains', label: 'Contains', needsText: true },
  { v: 'notContains', label: 'Does not contain', needsText: true },
  { v: 'equals', label: 'Equals', needsText: true },
  { v: 'beginsWith', label: 'Begins with', needsText: true },
  { v: 'endsWith', label: 'Ends with', needsText: true },
  { v: 'blank', label: 'Is blank', needsText: false },
  { v: 'notBlank', label: 'Is not blank', needsText: false },
]

export const cellText = (v: any) => (v == null ? '' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)).trim()

/** does this cell pass the column's filter? */
export function passes(f: ColFilter | undefined, raw: any): boolean {
  if (!f) return true
  const v = cellText(raw); const lv = v.toLowerCase()
  if (f.values && !f.values.includes(v)) return false
  if (f.op) {
    const t = (f.text || '').trim().toLowerCase()
    switch (f.op) {
      case 'blank': if (v !== '') return false; break
      case 'notBlank': if (v === '') return false; break
      case 'contains': if (t && !lv.includes(t)) return false; break
      case 'notContains': if (t && lv.includes(t)) return false; break
      case 'equals': if (t && lv !== t) return false; break
      case 'beginsWith': if (t && !lv.startsWith(t)) return false; break
      case 'endsWith': if (t && !lv.endsWith(t)) return false; break
    }
  }
  return true
}
export const isActive = (f: ColFilter | undefined) =>
  !!f && (!!f.values || (!!f.op && (f.op === 'blank' || f.op === 'notBlank' || !!(f.text || '').trim())))

export function ColumnFilterMenu({ title, allValues, filter, sortDir, onApply, onSort, onClose, anchor }: {
  title: string
  allValues: any[]                              // raw cell values of every row in this column
  filter: ColFilter | undefined
  sortDir: 'asc' | 'desc' | null
  onApply: (f: ColFilter | undefined) => void
  onSort: (dir: 'asc' | 'desc' | null) => void
  onClose: () => void
  anchor: { left: number; top: number }
}) {
  const [search, setSearch] = useState('')
  const [op, setOp] = useState<FilterOp | ''>(filter?.op || '')
  const [text, setText] = useState(filter?.text || '')
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of allValues) { const t = cellText(v); m.set(t, (m.get(t) || 0) + 1) }
    return Array.from(m.entries()).sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0], undefined, { numeric: true })))
  }, [allValues])
  const [checked, setChecked] = useState<Set<string>>(() => new Set(filter?.values ?? counts.map(c => c[0])))
  const shown = counts.filter(([v]) => !search || v.toLowerCase().includes(search.toLowerCase()))
  const allShownChecked = shown.length > 0 && shown.every(([v]) => checked.has(v))
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    setTimeout(() => { document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey) }, 0)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  const apply = () => {
    const everything = checked.size === counts.length
    const f: ColFilter = {}
    if (!everything) f.values = Array.from(checked)
    if (op) { f.op = op; f.text = text }
    onApply(f.values || f.op ? f : undefined); onClose()
  }
  const clear = () => { onApply(undefined); onClose() }
  const row = (label: string, on: () => void, active = false) => (
    <div onClick={on} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 500, background: active ? '#E8F5E9' : 'transparent', borderRadius: 4 }}
      onMouseEnter={e => (e.currentTarget.style.background = active ? '#E8F5E9' : '#f3f4f6')} onMouseLeave={e => (e.currentTarget.style.background = active ? '#E8F5E9' : 'transparent')}>{label}</div>
  )
  // keep the panel on screen
  const left = Math.min(anchor.left, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 300)
  return (
    <div ref={ref} onMouseDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}
      style={{ position: 'fixed', left, top: anchor.top, zIndex: 1000, width: 280, background: '#fff', border: '1px solid #cfd4dc', borderRadius: 8,
        boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: 8, fontSize: 12, color: '#1a1a18', userSelect: 'none' }}>
      <div style={{ fontWeight: 700, padding: '2px 10px 6px', fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
      {row('↑ Sort A to Z', () => { onSort('asc'); onClose() }, sortDir === 'asc')}
      {row('↓ Sort Z to A', () => { onSort('desc'); onClose() }, sortDir === 'desc')}
      {sortDir && row('✕ Remove sort', () => { onSort(null); onClose() })}
      <div style={{ height: 1, background: '#e6e9ef', margin: '6px 0' }} />

      <div style={{ display: 'flex', gap: 6, padding: '0 4px' }}>
        <select value={op} onChange={e => setOp(e.target.value as FilterOp | '')} style={{ flex: 1, fontSize: 12, padding: '4px 6px', border: '1px solid #cfd4dc', borderRadius: 4, width: 'auto' }}>
          <option value="">Text filter…</option>
          {OPS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        {op && OPS.find(o => o.v === op)?.needsText && (
          <input value={text} onChange={e => setText(e.target.value)} placeholder="text" autoFocus
            onKeyDown={e => { if (e.key === 'Enter') apply() }}
            style={{ flex: 1, fontSize: 12, padding: '4px 6px', border: '1px solid #cfd4dc', borderRadius: 4 }} />
        )}
      </div>
      <div style={{ height: 1, background: '#e6e9ef', margin: '6px 0' }} />

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search values…"
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '5px 8px', border: '1px solid #cfd4dc', borderRadius: 4, margin: '0 0 6px' }} />
      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e6e9ef', borderRadius: 4, padding: 4 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 6px', cursor: 'pointer', fontWeight: 700 }}>
          <input type="checkbox" checked={allShownChecked} style={{ width: 'auto', margin: 0 }}
            onChange={e => setChecked(prev => { const n = new Set(prev); shown.forEach(([v]) => e.target.checked ? n.add(v) : n.delete(v)); return n })} />
          (Select All{search ? ' search results' : ''})
        </label>
        {shown.map(([v, n]) => (
          <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={checked.has(v)} style={{ width: 'auto', margin: 0 }}
              onChange={e => setChecked(prev => { const nn = new Set(prev); e.target.checked ? nn.add(v) : nn.delete(v); return nn })} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: v === '' ? '#9ca3af' : 'inherit', fontStyle: v === '' ? 'italic' : 'normal' }}>{v === '' ? '(Blanks)' : v}</span>
            <span style={{ color: '#9ca3af', fontSize: 11 }}>{n}</span>
          </label>
        ))}
        {shown.length === 0 && <div style={{ padding: 8, color: '#9ca3af' }}>No values</div>}
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="small" onClick={clear}>Clear</button>
        <button className="small" onClick={onClose}>Cancel</button>
        <button className="small" onClick={apply} disabled={checked.size === 0} style={{ background: '#137E43', color: '#fff', borderColor: '#137E43', fontWeight: 700 }}>OK</button>
      </div>
    </div>
  )
}
