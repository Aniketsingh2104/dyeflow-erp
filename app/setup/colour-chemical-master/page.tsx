'use client'
// Setup → Colour Chemical Master. The one place where the reorder-planning
// values are entered: Lead Time (days), Safety Factor, Avg Daily Consumption
// (kg/day). MAX Level = lead × safety × avg is computed here and on the Colour
// Store IMS page, which only shows these values.
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { PlanCell } from '@/components/PlanCell'
import { usePagination, PaginationBar } from '@/components/Pagination'

interface ChemItem {
  id: string; name: string; created_at: string
  type?: string | null; rate?: number | string | null
  lead_time?: number | string | null; safety_factor?: number | string | null; avg_daily_consumption?: number | string | null
}
const TYPES = ['Colour', 'Auxiliary']
type PlanField = 'leadTime' | 'safetyFactor' | 'avgDailyConsumption' | 'rate'
const COL: Record<PlanField, keyof ChemItem> = { leadTime: 'lead_time', safetyFactor: 'safety_factor', avgDailyConsumption: 'avg_daily_consumption', rate: 'rate' }
const num = (v: any): number | null => { if (v == null || v === '') return null; const n = parseFloat(v); return isFinite(n) ? n : null }
const maxLevelOf = (x: ChemItem) => {
  const l = num(x.lead_time), s = num(x.safety_factor), a = num(x.avg_daily_consumption)
  return l != null && s != null && a != null ? l * s * a : null
}
const complete = (x: ChemItem) => maxLevelOf(x) != null

export default function ColourChemicalMasterPage() {
  const [items,        setItems]        = useState<ChemItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [editingId,    setEditingId]    = useState('')
  const [form,         setForm]         = useState({ name: '' })
  const [saving,       setSaving]       = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [toast,        setToast]        = useState('')
  const [search,       setSearch]       = useState('')
  const [filter,       setFilter]       = useState<'all' | 'done' | 'missing'>('all')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const res  = await fetch('/api/colour-chemicals', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) setItems(data.data || [])
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(true) }, [load])
  // opened from Colour Store IMS with ?q=<item name>
  useEffect(() => { try { const q = new URLSearchParams(window.location.search).get('q'); if (q) setSearch(q) } catch {} }, [])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }
  const post = (body: any) => fetch('/api/colour-chemicals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.json()).catch(() => ({ ok: false, error: 'Network error' }))

  // ── Name add / edit / delete ──────────────────────────────────────────────
  const save = async () => {
    if (!form.name.trim()) { alert('Name required.'); return }
    const name = form.name.trim()
    if (items.find(x => x.name.toLowerCase() === name.toLowerCase() && x.id !== editingId)) { alert('Name already exists.'); return }
    setSaving(true)
    try {
      const data = await post({ action: editingId ? 'update' : 'create', id: editingId || undefined, name })
      if (!data.ok) { alert('Not saved: ' + (data.error || 'Unknown error')); return }
      setShowModal(false); showToast('✓ Saved'); load(false)
    } finally { setSaving(false) }
  }
  const del = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    const data = await post({ action: 'delete', id })
    if (!data.ok) { alert('Not deleted: ' + (data.error || 'Unknown error')); return }
    showToast('✓ Deleted'); load(false)
  }

  // ── Planning value cell save ──────────────────────────────────────────────
  const savePlan = async (id: string, field: PlanField, v: number | null): Promise<boolean> => {
    const data = await post({ action: 'update_planning', id, [field]: v === null ? '' : v })
    if (!data.ok) { alert('Not saved: ' + (data.error || 'Unknown error')); return false }
    setItems(prev => prev.map(x => x.id === id ? { ...x, [COL[field]]: v } : x))
    return true
  }

  const saveType = async (id: string, type: string) => {
    const data = await post({ action: 'update_planning', id, type })
    if (!data.ok) { alert('Not saved: ' + (data.error || 'Unknown error')); return }
    setItems(prev => prev.map(x => x.id === id ? { ...x, type: type || null } : x))
  }

  // ── Excel import: Name + planning columns (header names, any order) ──────
  const processRows = async (rows: any[][]) => {
    let start = 0, header: string[] = []
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const h = (rows[i] || []).map((c: any) => String(c ?? '').trim().toLowerCase())
      if (h.some(c => /name|colour|color|chemical|item/.test(c))) { start = i + 1; header = h; break }
    }
    const find = (...keys: string[]) => header.findIndex(h => keys.some(k => h.includes(k)))
    const nameIdx = header.length ? find('name', 'colour', 'color', 'chemical', 'item') : 0
    const ltIdx = find('lead'), sfIdx = find('safety'), adIdx = find('avg', 'daily', 'consumption')
    const tyIdx = find('type', 'group', 'item code'), rtIdx = find('rate')
    const byName = new Map(items.map(x => [x.name.toLowerCase(), x]))
    const out: any[] = []
    for (let i = start; i < rows.length; i++) {
      const row = rows[i] || []
      const name = String(row[nameIdx] ?? '').trim(); if (!name) continue
      const ex = byName.get(name.toLowerCase())
      const cell = (idx: number, cur: any) => idx < 0 ? undefined : (String(row[idx] ?? '').trim() === '' ? (cur ?? null) : row[idx])   // blank cell keeps the current value
      const ty = cell(tyIdx, ex?.type)
      out.push({ name, type: ty === undefined ? undefined : (ty == null ? null : String(ty).trim()), rate: cell(rtIdx, ex?.rate),
        leadTime: cell(ltIdx, ex?.lead_time), safetyFactor: cell(sfIdx, ex?.safety_factor), avgDailyConsumption: cell(adIdx, ex?.avg_daily_consumption) })
    }
    if (!out.length) { setImportStatus('❌ No names found in the file.'); setTimeout(() => setImportStatus(''), 5000); return }
    const newNames = out.filter(r => !byName.has(r.name.toLowerCase())).length
    setImportStatus(`⏳ Saving ${out.length} rows…`)
    const data = await post({ action: 'bulk_upsert_planning', rows: out })
    if (!data.ok) { setImportStatus(`❌ Import failed: ${data.error}`); setTimeout(() => setImportStatus(''), 6000); return }
    const withValues = ltIdx >= 0 || sfIdx >= 0 || adIdx >= 0 || tyIdx >= 0 || rtIdx >= 0
    setImportStatus(`✅ ${out.length} rows: ${newNames} new, ${out.length - newNames} updated${withValues ? '' : ' (names only — no Type / Rate / Lead / Safety / Avg columns in the file)'}`)
    setTimeout(() => setImportStatus(''), 8000)
    if (fileRef.current) fileRef.current.value = ''
    load(false)
  }
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setImportStatus('📂 Reading file…')
    try {
      let rows: any[][]
      if (file.name.toLowerCase().endsWith('.csv')) {
        rows = (await file.text()).split(/\r?\n/).filter(l => l.trim()).map(line => line.split(',').map(c => c.replace(/^"|"$/g, '').trim()))
      } else {
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', raw: false })
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as any[][]
      }
      await processRows(rows)
    } catch (err: any) { setImportStatus(`❌ Error reading file: ${err.message}`); setTimeout(() => setImportStatus(''), 5000) }
  }
  const exportExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Type', 'Rate (per kg)', 'Lead Time (days)', 'Safety Factor', 'Avg Daily Consumption (kg/day)', 'MAX Level (kg)'],
      ...items.map(x => [x.name, x.type || '', num(x.rate), num(x.lead_time), num(x.safety_factor), num(x.avg_daily_consumption), maxLevelOf(x)]),
    ])
    ws['!cols'] = [{ wch: 45 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 28 }, { wch: 14 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Colour Chemical Master')
    XLSX.writeFile(wb, `Colour_Chemical_Master_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── List ──────────────────────────────────────────────────────────────────
  const doneCount = items.filter(complete).length
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(x => (!q || x.name.toLowerCase().includes(q) || (x.type || '').toLowerCase() === q) && (filter === 'all' || (filter === 'done') === complete(x)))
  }, [items, search, filter])
  const pg = usePagination(filtered, 'dyeflow_pg_colour_chem')
  useEffect(() => { pg.resetPage() }, [search, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  const th = (h: string, right = false) => (
    <th key={h} style={{ padding: '12px 16px', textAlign: right ? 'right' : 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
      textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 20, zIndex: 9999, background: toast.startsWith('⚠') ? '#FEF3C7' : '#D1FAE5', border: `1px solid ${toast.startsWith('⚠') ? '#FCD34D' : '#6EE7B7'}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: toast.startsWith('⚠') ? '#92400E' : '#065F46', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Colour Chemical Master</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Dyes and chemicals with their reorder planning values · MAX level = Lead time × Safety factor × Avg daily use · shown on Colour Store IMS
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name…"
            style={{ width: 260, padding: '9px 12px', fontSize: 14, border: '1px solid var(--border-medium)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} title="Columns: Name, Type (Colour/Auxiliary), Rate, Lead Time, Safety Factor, Avg Daily Consumption — existing names are updated, new names created"
            style={{ padding: '9px 14px', fontSize: 14, fontWeight: 700, border: '1px solid var(--accent)', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent-dark)', cursor: 'pointer' }}>
            📥 Import Excel
          </button>
          <button className="small" onClick={exportExcel} disabled={!items.length} style={{ padding: '9px 14px', fontSize: 14 }}>📤 Export</button>
          <button className="small" onClick={() => load(false)} title="Refresh" style={{ padding: '9px 12px', fontSize: 14 }}>↻</button>
          <button className="primary" onClick={() => { setEditingId(''); setForm({ name: '' }); setShowModal(true) }} style={{ padding: '9px 16px', fontSize: 14, fontWeight: 700 }}>+ Add Name</button>
        </div>
      </div>

      {importStatus && (
        <div style={{ background: importStatus.startsWith('❌') ? '#FEE2E2' : importStatus.startsWith('✅') ? '#D1FAE5' : '#EFF6FF', border: `1px solid ${importStatus.startsWith('❌') ? '#FCA5A5' : importStatus.startsWith('✅') ? '#6EE7B7' : '#BFDBFE'}`, borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 13, fontWeight: 600, color: importStatus.startsWith('❌') ? '#991B1B' : importStatus.startsWith('✅') ? '#065F46' : '#1E40AF' }}>
          {importStatus}
        </div>
      )}

      {/* Count cards — click to filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {([['all', 'Items', items.length, 'var(--accent)'], ['done', 'Planning complete', doneCount, '#059669'], ['missing', 'Missing values', items.length - doneCount, '#B45309']] as const).map(([k, label, value, color]) => (
          <div key={k} onClick={() => setFilter(k)} style={{ background: 'var(--bg-primary)', border: `2px solid ${filter === k ? color : 'var(--border-light)'}`, borderRadius: 10, padding: '10px 16px', minWidth: 140, cursor: 'pointer' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
        {TYPES.map(t => (
          <div key={t} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '10px 16px', minWidth: 110 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-secondary)' }}>{items.filter(x => (x.type || '').toLowerCase() === t.toLowerCase()).length}</div>
          </div>
        ))}
        <div style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 6 }}>
          Click a value to type it · Enter / ↓ next row · ↑ previous · Esc cancel · amber = not set
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 1300 }}>
          <colgroup>
            <col style={{ width: 56 }} /><col /><col style={{ width: 130 }} /><col style={{ width: 120 }} /><col style={{ width: 130 }} /><col style={{ width: 140 }} /><col style={{ width: 170 }} />
            <col style={{ width: 130 }} /><col style={{ width: 110 }} /><col style={{ width: 170 }} />
          </colgroup>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)' }}>
            <tr>{th('#')}{th('Name')}{th('Type')}{th('Rate / kg', true)}{th('Lead (days)', true)}{th('Safety factor', true)}{th('Avg use (kg/day)', true)}{th('MAX level (kg)', true)}{th('Added')}{th('Actions')}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</td></tr>
            ) : pg.rows.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                {items.length === 0 ? 'No items yet. Import an Excel file or click "+ Add Name".' : 'No results.'}
              </td></tr>
            ) : pg.rows.map((x, i) => {
              const max = maxLevelOf(x)
              return (
                <tr key={x.id} style={{ background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '10px 16px', color: 'var(--text-tertiary)', fontSize: 12 }}>{pg.start + i + 1}</td>
                  <td style={{ padding: '10px 16px', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.name}>{x.name}</td>
                  <td style={{ padding: '6px 16px' }}>
                    <select value={x.type || ''} onChange={e => saveType(x.id, e.target.value)}
                      style={{ width: '100%', padding: '5px 8px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: '1px solid ' + (x.type ? 'var(--border-light)' : '#F59E0B'),
                        background: x.type ? 'var(--bg-primary)' : '#FFFBEB', color: x.type ? 'var(--text-primary)' : '#B45309' }}>
                      <option value="">—</option>
                      {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      {x.type && !TYPES.includes(x.type) && <option value={x.type}>{x.type}</option>}
                    </select>
                  </td>
                  <td style={{ padding: '6px 16px', textAlign: 'right' }}><PlanCell col="rate" value={num(x.rate)} step="0.01" width={100} onSave={v => savePlan(x.id, 'rate', v)} /></td>
                  <td style={{ padding: '6px 16px', textAlign: 'right' }}><PlanCell col="lead" value={num(x.lead_time)} step="1" onSave={v => savePlan(x.id, 'leadTime', v)} /></td>
                  <td style={{ padding: '6px 16px', textAlign: 'right' }}><PlanCell col="safety" value={num(x.safety_factor)} step="0.1" onSave={v => savePlan(x.id, 'safetyFactor', v)} /></td>
                  <td style={{ padding: '6px 16px', textAlign: 'right' }}><PlanCell col="avg" value={num(x.avg_daily_consumption)} step="0.1" width={110} onSave={v => savePlan(x.id, 'avgDailyConsumption', v)} /></td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: max != null ? 'var(--text-primary)' : 'var(--text-tertiary)', background: 'var(--bg-secondary)' }}>
                    {max != null ? Math.round(max).toLocaleString() : '·'}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {x.created_at ? new Date(x.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="small" onClick={() => { setEditingId(x.id); setForm({ name: x.name }); setShowModal(true) }}>Rename</button>
                      <button className="small danger" onClick={() => del(x.id, x.name)}>Delete</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <PaginationBar {...pg} rowsShown={pg.rows.length} />
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editingId ? 'Rename' : 'Add Colour / Chemical Name'}</span>
              <button className="small" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Name *</label>
              <input value={form.name} onChange={e => setForm({ name: e.target.value })} placeholder="e.g. Reactive Red 120" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') save() }} />
            </div>
            {!editingId && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>Lead time, safety factor and avg daily use are typed in the table after saving.</div>}
            <button className="primary" onClick={save} disabled={saving} style={{ width: '100%' }}>{saving ? '⏳ Saving…' : '✓ Save'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
