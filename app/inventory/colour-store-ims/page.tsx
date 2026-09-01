'use client'
// Colour Store IMS — full reorder-point dashboard, matching the reference
// sheet's design:
//   - Lead Time, Safety Factor, Avg Daily Consumption are entered per item
//     (editable here) — MAX Level = Lead Time × Safety Factor × Avg Daily
//     Consumption is computed from them, never stored.
//   - Every uploaded date gets its own column (not just "latest") — a full
//     running history, left to right, oldest to newest.
//   - Each date-cell is color-coded against that item's own MAX Level,
//     using the exact thresholds found in the reference sheet's conditional
//     formatting: <33% red, 33–66% yellow, 66–100% green.
// Upload still reads the daily Consumable Trial Balance Report (fixed
// columns: B=Name, C=Group, K=Balance Qty in grams, L=Rate). Balance Qty and
// Rate are stored exactly as uploaded and only converted to Kg / per-Kg at
// display time.

import { useEffect, useState, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(d: string) {
  if (!d) return '-'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

/** Color-codes a date-cell's stock (Kg) against that item's MAX Level, using
 *  the exact thresholds extracted from the reference sheet's conditional
 *  formatting rules ($K*0.33 and $K*0.66 boundaries). */
function stockCellStyle(stockKg: number | null, maxLevel: number | null): React.CSSProperties {
  if (stockKg == null) return { background: 'transparent', color: 'var(--text-tertiary)' }
  if (!maxLevel || maxLevel <= 0) return { background: 'transparent', color: 'var(--text-primary)', fontWeight: 600 }
  const pct = stockKg / maxLevel
  if (pct < 0.33) return { background: '#FF0000', color: '#fff', fontWeight: 700 }
  if (pct < 0.66) return { background: '#FFFF00', color: '#333', fontWeight: 700 }
  if (pct <= 1)   return { background: '#6AA84F', color: '#fff', fontWeight: 700 }
  return { background: 'transparent', color: 'var(--text-primary)', fontWeight: 600 } // excess — no rule found for >100%, left plain
}

export default function ColourStoreIMSPage() {
  const [chemicals, setChemicals] = useState<any[]>([])
  const [stock,      setStock]    = useState<any[]>([])
  const [loading,    setLoading]  = useState(true)
  const [search,     setSearch]   = useState('')
  const [saving,     setSaving]   = useState(false)

  const [file,        setFile]        = useState<File | null>(null)
  const [uploadDate,  setUploadDate]  = useState(todayStr())
  const [uploading,   setUploading]   = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [uploadError, setUploadError] = useState('')

  // Inline editing for the three planning fields.
  const [editingPlan, setEditingPlan] = useState<string | null>(null) // `${id}::field`
  const [editPlanValue, setEditPlanValue] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/colour-store', { cache: 'no-store' }).then(r => r.json())
      if (res.ok) {
        setChemicals(res.chemicals || [])
        setStock(res.stock || [])
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Latest record per name (for Group/Rate) — stock array is pre-sorted
  // stock_date desc by the API.
  const latestByName = useMemo(() => {
    const m: Record<string, any> = {}
    for (const s of stock) {
      const key = String(s.name).trim().toLowerCase()
      if (!m[key]) m[key] = s
    }
    return m
  }, [stock])

  // Every distinct date across all stock records, oldest to newest (matches
  // the reference sheet's left-to-right layout).
  const allDates = useMemo(() => {
    const set = new Set<string>()
    for (const s of stock) set.add(s.stock_date)
    return Array.from(set).sort()
  }, [stock])

  // name -> date -> stock_qty (grams)
  const stockByNameDate = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    for (const s of stock) {
      const key = String(s.name).trim().toLowerCase()
      if (!m[key]) m[key] = {}
      m[key][s.stock_date] = parseFloat(s.stock_qty)
    }
    return m
  }, [stock])

  const rows = useMemo(() => {
    return chemicals.map((c: any) => {
      const key = String(c.name).trim().toLowerCase()
      const latest = latestByName[key]
      const leadTime = c.lead_time != null ? parseFloat(c.lead_time) : null
      const safetyFactor = c.safety_factor != null ? parseFloat(c.safety_factor) : null
      const avgConsumption = c.avg_daily_consumption != null ? parseFloat(c.avg_daily_consumption) : null
      const maxLevel = (leadTime != null && safetyFactor != null && avgConsumption != null)
        ? leadTime * safetyFactor * avgConsumption
        : null
      return {
        ...c,
        leadTime, safetyFactor, avgConsumption, maxLevel,
        latestGroup: latest?.group_name ?? null,
        latestRate: latest?.rate ?? null,
        dateValues: stockByNameDate[key] || {},
      }
    })
  }, [chemicals, latestByName, stockByNameDate])

  const filtered = search.trim()
    ? rows.filter(r => String(r.name).toLowerCase().includes(search.toLowerCase()))
    : rows

  // ── Planning-field editing ──────────────────────────────────────────────

  const startEditPlan = (id: string, field: string, current: any) => {
    setEditingPlan(`${id}::${field}`)
    setEditPlanValue(current != null ? String(current) : '')
  }

  const savePlanField = async (id: string, field: 'leadTime' | 'safetyFactor' | 'avgDailyConsumption') => {
    setSaving(true)
    try {
      const res = await fetch('/api/colour-chemicals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_planning', id, [field]: editPlanValue }),
      }).then(r => r.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      setEditingPlan(null)
      load()
    } finally { setSaving(false) }
  }

  // ── Excel upload ──────────────────────────────────────────────────────

  const parseExcel = (f: File): Promise<string[][]> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const data = e.target?.result
          if (!data) { reject(new Error('Failed to read file')); return }
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          if (!ws) { reject(new Error('No sheets found')); return }
          const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false })
          resolve(rows.map(row => row.map((cell: any) => String(cell ?? '').trim())))
        } catch (err: any) { reject(new Error('Failed to parse Excel: ' + err.message)) }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsArrayBuffer(f)
    })

  const handleUpload = async () => {
    if (!file) { setUploadError('Choose a file first.'); return }
    setUploading(true); setUploadError(''); setUploadResult(null)
    try {
      const rawRows = await parseExcel(file)
      if (rawRows.length < 2) throw new Error('File has no data rows.')

      // Fixed columns from the real report format: B=Name, C=Group,
      // K=Balance Qty (grams), L=Rate. 0-indexed: B=1, C=2, K=10, L=11.
      const NAME_COL = 1, GROUP_COL = 2, QTY_COL = 10, RATE_COL = 11

      const parsedRows = rawRows.slice(1)
        .map(r => ({
          name:  r[NAME_COL],
          group: r[GROUP_COL],
          qty:   r[QTY_COL],
          rate:  r[RATE_COL],
        }))
        .filter(r => r.name)

      if (parsedRows.length === 0) throw new Error('No valid rows found — check that column B has names and column K has Balance Qty.')

      const res = await fetch('/api/colour-store', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload_stock', stockDate: uploadDate, rows: parsedRows }),
      }).then(r => r.json())

      if (!res.ok) throw new Error(res.error || 'Upload failed')
      setUploadResult(res)
      setFile(null)
      load()
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed')
    } finally { setUploading(false) }
  }

  // Only blank the page on the true first load.
  if (loading && chemicals.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  const planCellStyle: React.CSSProperties = { padding: '9px 10px', cursor: 'pointer', minWidth: 70 }

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Colour Store IMS</div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
        {chemicals.length} item(s) in Colour Chemical Master · {allDates.length} date(s) recorded · click Lead Time / Safety Factor / Avg Consumption to edit
      </div>

      {/* Upload card */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Upload Daily Stock (Excel)</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>Stock Date</label>
            <input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)}
              style={{ padding: '6px 10px', fontSize: 13 }} />
          </div>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={e => { setFile(e.target.files?.[0] || null); setUploadError(''); setUploadResult(null) }}
            style={{ fontSize: 13 }} />
          <button className="primary" onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? 'Uploading…' : '⬆ Upload Stock'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
          Expects the daily Consumable Trial Balance Report format: column B = Name, column C = Group, column K = Balance Qty (grams), column L = Rate. All other columns are ignored.
        </div>

        {uploadError && (
          <div style={{ marginTop: 10, background: 'var(--danger-light)', color: 'var(--danger)',
            border: '1px solid var(--danger)', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
            {uploadError}
          </div>
        )}
        {uploadResult && (
          <div style={{ marginTop: 10, background: 'var(--success-light)', color: 'var(--success)',
            border: '1px solid var(--success)', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
            ✓ {uploadResult.saved} row(s) saved for {fmtDate(uploadDate)} — {uploadResult.matched} matched the master list.
            {uploadResult.unmatched?.length > 0 && (
              <div style={{ marginTop: 4, color: 'var(--warning)' }}>
                ⚠ {uploadResult.unmatched.length} name(s) didn't match the master list (saved anyway, but not linked): {uploadResult.unmatched.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Color legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 11, alignItems: 'center' }}>
        <span style={{ fontWeight: 700, color: 'var(--text-tertiary)' }}>Legend:</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#FF0000', marginRight: 4, verticalAlign: 'middle' }} />Below 33% of MAX</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#FFFF00', marginRight: 4, verticalAlign: 'middle' }} />33–66% of MAX</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#6AA84F', marginRight: 4, verticalAlign: 'middle' }} />66–100% of MAX (Normal)</span>
      </div>

      {/* Stock table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Current Stock</div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name…"
          style={{ width: 220, padding: '6px 10px', fontSize: 12,
            border: '1px solid var(--border-medium)', borderRadius: 5,
            background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
      </div>

      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 14 }}>
            {chemicals.length === 0
              ? 'No items in Colour Chemical Master yet. Add some in Setup → Colour Chemical Master.'
              : 'No items match your search.'}
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 900 + allDates.length * 90 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Sr. No.', 'Name', 'Group', 'Rate (per Kg)', 'Lead Time', 'Safety Factor', 'Avg Daily Consumption', 'MAX Level'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
                {allDates.map(d => (
                  <th key={d} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-light)',
                    borderLeft: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>{fmtDate(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '9px 12px', color: 'var(--text-tertiary)' }}>{i + 1}</td>
                  <td style={{ padding: '9px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{r.latestGroup || '-'}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                    {r.latestRate != null ? (parseFloat(r.latestRate) * 1000).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
                  </td>

                  {/* Lead Time — inline editable */}
                  <td style={planCellStyle} onClick={() => editingPlan !== `${r.id}::leadTime` && startEditPlan(r.id, 'leadTime', r.leadTime)}>
                    {editingPlan === `${r.id}::leadTime` ? (
                      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                        <input autoFocus type="number" value={editPlanValue} onChange={e => setEditPlanValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') savePlanField(r.id, 'leadTime'); if (e.key === 'Escape') setEditingPlan(null) }}
                          style={{ width: 60, fontSize: 11, padding: '3px 6px', border: '1px solid var(--border-medium)', borderRadius: 4 }} />
                        <button className="xs" disabled={saving} onClick={() => savePlanField(r.id, 'leadTime')}>✓</button>
                      </div>
                    ) : (r.leadTime ?? <span style={{ color: 'var(--text-tertiary)' }}>+ Set</span>)}
                  </td>

                  {/* Safety Factor — inline editable */}
                  <td style={planCellStyle} onClick={() => editingPlan !== `${r.id}::safetyFactor` && startEditPlan(r.id, 'safetyFactor', r.safetyFactor)}>
                    {editingPlan === `${r.id}::safetyFactor` ? (
                      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                        <input autoFocus type="number" value={editPlanValue} onChange={e => setEditPlanValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') savePlanField(r.id, 'safetyFactor'); if (e.key === 'Escape') setEditingPlan(null) }}
                          style={{ width: 60, fontSize: 11, padding: '3px 6px', border: '1px solid var(--border-medium)', borderRadius: 4 }} />
                        <button className="xs" disabled={saving} onClick={() => savePlanField(r.id, 'safetyFactor')}>✓</button>
                      </div>
                    ) : (r.safetyFactor ?? <span style={{ color: 'var(--text-tertiary)' }}>+ Set</span>)}
                  </td>

                  {/* Avg Daily Consumption — inline editable */}
                  <td style={planCellStyle} onClick={() => editingPlan !== `${r.id}::avgDailyConsumption` && startEditPlan(r.id, 'avgDailyConsumption', r.avgConsumption)}>
                    {editingPlan === `${r.id}::avgDailyConsumption` ? (
                      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                        <input autoFocus type="number" value={editPlanValue} onChange={e => setEditPlanValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') savePlanField(r.id, 'avgDailyConsumption'); if (e.key === 'Escape') setEditingPlan(null) }}
                          style={{ width: 60, fontSize: 11, padding: '3px 6px', border: '1px solid var(--border-medium)', borderRadius: 4 }} />
                        <button className="xs" disabled={saving} onClick={() => savePlanField(r.id, 'avgDailyConsumption')}>✓</button>
                      </div>
                    ) : (r.avgConsumption ?? <span style={{ color: 'var(--text-tertiary)' }}>+ Set</span>)}
                  </td>

                  {/* MAX Level — computed, not editable */}
                  <td style={{ padding: '9px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {r.maxLevel != null ? r.maxLevel.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
                  </td>

                  {/* One cell per date, color-coded against MAX Level */}
                  {allDates.map(d => {
                    const g = r.dateValues[d]
                    const kg = g != null ? g / 1000 : null
                    return (
                      <td key={d} style={{ padding: '9px 12px', borderLeft: '1px solid var(--border-light)',
                        whiteSpace: 'nowrap', ...stockCellStyle(kg, r.maxLevel) }}>
                        {kg != null ? kg.toLocaleString(undefined, { maximumFractionDigits: 3 }) : '-'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
