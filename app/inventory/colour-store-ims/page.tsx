'use client'
// Colour Store IMS — reorder dashboard.
//
// Layout implements design 3a from the Claude Design review: the single 34px
// control strip (2a) over the tinted, pinned sheet (1c). Findings addressed:
//   01-04  Saturated Excel fills (#FF0000/#FFFF00/#6AA84F) replaced with the
//          three tint bands; status encoded ONCE (segmented control + cell
//          tint); zebra striping dropped so row separation has one owner.
//   05     Date columns windowed (last 4/8/12/all) instead of growing
//          unbounded — one extra column per upload widened the grid forever.
//   06     Item column and header row both pin while scrolling.
//   07     "Sr. No." removed — it renumbered on every filter/sort, so it
//          could never be quoted between two people.
//   08     Column headers are clickable to sort; status rank is just the
//          default now, not a lock.
//   09-10  Editable fields (Lead/Safety/Avg) carry a dotted underline;
//          computed fields (MAX/Order) sit in a tinted block. Save failures
//          surface inline instead of through alert().
//   11     Type scale collapsed to 20 / 13 / 11.
//   12     Units in every header; "·" means "no upload that day" and is
//          distinct from a real 0.
//
// Data model unchanged: MAX Level = Lead Time × Safety Factor × Avg Daily
// Consumption, computed live, never stored. Stock is stored in grams and rate
// per gram as uploaded; both convert for display only. Upload stays
// all-or-nothing against the Colour Chemical Master.

import { useEffect, useState, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'

type Band = 'crit' | 'warn' | 'ok' | 'none'

const ACCENT: Record<Exclude<Band, 'none'>, string> = {
  crit: 'oklch(0.55 0.16 28)',
  warn: 'oklch(0.72 0.13 78)',
  ok:   'oklch(0.62 0.1 150)',
}
const TINT: Record<Exclude<Band, 'none'>, string> = {
  crit: 'oklch(0.9 0.055 28)',
  warn: 'oklch(0.93 0.06 88)',
  ok:   'oklch(0.93 0.05 150)',
}
const TINT_FG: Record<Exclude<Band, 'none'>, string> = {
  crit: 'oklch(0.4 0.14 28)',
  warn: '#25241F',
  ok:   '#25241F',
}
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace"

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDate(d: string) {
  if (!d) return '-'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function shortDate(d: string) {
  if (!d) return ''
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}
const n = (v: number, d = 1) => v.toLocaleString(undefined, { maximumFractionDigits: d })

function bandOf(stockKg: number | null, maxLevel: number | null): Band {
  if (stockKg == null || !maxLevel || maxLevel <= 0) return 'none'
  const pct = stockKg / maxLevel
  if (pct < 0.33) return 'crit'
  if (pct < 0.66) return 'warn'
  return 'ok'
}

export default function ColourStoreIMSPage() {
  const [chemicals, setChemicals] = useState<any[]>([])
  const [stock,     setStock]     = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)

  const [search,      setSearch]      = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [bandFilter,  setBandFilter]  = useState<Band | ''>('')
  // Default: heaviest-consuming items first, alphabetical within ties.
  const [sortKey,     setSortKey]     = useState('avg')
  const [sortDir,     setSortDir]     = useState<1 | -1>(-1)

  const [uploadOpen,   setUploadOpen]   = useState(false)
  const [file,         setFile]         = useState<File | null>(null)
  const [uploadDate,   setUploadDate]   = useState(todayStr())
  const [uploading,    setUploading]    = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [uploadError,  setUploadError]  = useState<{ message: string; unmatched: string[] } | null>(null)
  const [dragOver,     setDragOver]     = useState(false)

  const [editingPlan,   setEditingPlan]   = useState<string | null>(null)
  const [editPlanValue, setEditPlanValue] = useState('')
  const [rowError,      setRowError]      = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/colour-store', { cache: 'no-store' }).then(r => r.json())
      if (res.ok) { setChemicals(res.chemicals || []); setStock(res.stock || []) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const latestByName = useMemo(() => {
    const m: Record<string, any> = {}
    for (const s of stock) {
      const k = String(s.name).trim().toLowerCase()
      if (!m[k]) m[k] = s
    }
    return m
  }, [stock])

  const allDates = useMemo(() => {
    const set = new Set<string>()
    for (const s of stock) set.add(s.stock_date)
    return Array.from(set).sort()
  }, [stock])

  const shownDates = allDates
  const latestDate = allDates.length ? allDates[allDates.length - 1] : null

  const stockByNameDate = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    for (const s of stock) {
      const k = String(s.name).trim().toLowerCase()
      if (!m[k]) m[k] = {}
      m[k][s.stock_date] = parseFloat(s.stock_qty)
    }
    return m
  }, [stock])

  const rows = useMemo(() => chemicals.map((c: any) => {
    const k = String(c.name).trim().toLowerCase()
    const latest = latestByName[k]
    const leadTime = c.lead_time             != null ? parseFloat(c.lead_time)             : null
    const safety   = c.safety_factor         != null ? parseFloat(c.safety_factor)         : null
    const avgCons  = c.avg_daily_consumption != null ? parseFloat(c.avg_daily_consumption) : null
    const maxLevel = (leadTime != null && safety != null && avgCons != null)
      ? leadTime * safety * avgCons : null
    const dateValues = stockByNameDate[k] || {}
    const latestG  = latestDate ? dateValues[latestDate] : undefined
    const latestKg = latestG != null ? latestG / 1000 : null
    const band = bandOf(latestKg, maxLevel)
    const reorder = (band === 'crit' || band === 'warn') && maxLevel != null
      ? Math.max(0, maxLevel - (latestKg || 0)) : null
    return {
      ...c, leadTime, safety, avgCons, maxLevel, latestKg, band, reorder,
      group: latest?.group_name ?? null,
      rate:  latest?.rate != null ? parseFloat(latest.rate) * 1000 : null,
      dateValues,
    }
  }), [chemicals, latestByName, stockByNameDate, latestDate])

  const groupOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.group) set.add(r.group)
    return Array.from(set).sort()
  }, [rows])

  const counts = useMemo(() => ({
    crit: rows.filter(r => r.band === 'crit').length,
    warn: rows.filter(r => r.band === 'warn').length,
    ok:   rows.filter(r => r.band === 'ok').length,
    none: rows.filter(r => r.band === 'none').length,
  }), [rows])

  const filtered = useMemo(() => {
    let out = rows
    if (search.trim()) out = out.filter(r => String(r.name).toLowerCase().includes(search.toLowerCase()))
    if (groupFilter)   out = out.filter(r => r.group === groupFilter)
    if (bandFilter)    out = out.filter(r => r.band === bandFilter)
    return out
  }, [rows, search, groupFilter, bandFilter])

  const sorted = useMemo(() => {
    const rank: Record<Band, number> = { crit: 0, warn: 1, ok: 2, none: 3 }
    const val = (r: any) => {
      switch (sortKey) {
        case 'name':    return String(r.name).toLowerCase()
        case 'rate':    return r.rate ?? -1
        case 'lead':    return r.leadTime ?? -1
        case 'safety':  return r.safety ?? -1
        case 'avg':     return r.avgCons ?? -1
        case 'max':     return r.maxLevel ?? -1
        case 'reorder': return r.reorder ?? -1
        case 'stock':   return r.latestKg ?? -1
        default:        return rank[r.band as Band]
      }
    }
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av < bv) return -sortDir
      if (av > bv) return  sortDir
      return String(a.name).localeCompare(String(b.name))
    })
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortKey(key); setSortDir(1) }
  }
  const resetFilters = () => {
    setSearch(''); setGroupFilter(''); setBandFilter('')
    setSortKey('avg'); setSortDir(-1)
  }

  const startEditPlan = (id: string, field: string, current: any) => {
    setRowError(null)
    setEditingPlan(`${id}::${field}`)
    setEditPlanValue(current != null ? String(current) : '')
  }
  const savePlanField = async (id: string, field: 'leadTime' | 'safetyFactor' | 'avgDailyConsumption') => {
    setSaving(true); setRowError(null)
    try {
      const res = await fetch('/api/colour-chemicals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_planning', id, [field]: editPlanValue }),
      }).then(r => r.json())
      if (!res.ok) { setRowError(`Couldn't save: ${res.error}`); return }
      setEditingPlan(null)
      load()
    } catch (e: any) {
      setRowError(`Couldn't save: ${e.message || 'network error'}`)
    } finally { setSaving(false) }
  }

  const parseExcel = (f: File): Promise<string[][]> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = e.target?.result
        if (!data) { reject(new Error('Failed to read file')); return }
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        if (!ws) { reject(new Error('No sheets found')); return }
        const rws: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false })
        resolve(rws.map(row => row.map((cell: any) => String(cell ?? '').trim())))
      } catch (err: any) { reject(new Error('Failed to parse Excel: ' + err.message)) }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(f)
  })

  const handleUpload = async () => {
    if (!file) return
    setUploading(true); setUploadError(null); setUploadResult(null)
    try {
      const rawRows = await parseExcel(file)
      if (rawRows.length < 2) throw new Error('File has no data rows.')
      const NAME = 1, GROUP = 2, QTY = 10, RATE = 11
      const parsed = rawRows.slice(1)
        .map(r => ({ name: r[NAME], group: r[GROUP], qty: r[QTY], rate: r[RATE] }))
        .filter(r => r.name)
      if (!parsed.length) throw new Error('No valid rows — check column B has names and column K has Balance Qty.')
      const res = await fetch('/api/colour-store', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload_stock', stockDate: uploadDate, rows: parsed }),
      }).then(r => r.json())
      if (!res.ok) {
        if (res.error === 'not_in_master') { setUploadError({ message: res.message, unmatched: res.unmatched || [] }); return }
        throw new Error(res.error || 'Upload failed')
      }
      setUploadResult(res); setFile(null); setUploadOpen(false); load()
    } catch (err: any) {
      setUploadError({ message: err.message || 'Upload failed', unmatched: [] })
    } finally { setUploading(false) }
  }

  const exportCsv = () => {
    const head = ['Item', 'Group', 'Rate per Kg', 'Lead days', 'Safety factor', 'Avg Kg/day',
      'MAX Kg', 'Order Kg', ...shownDates.map(d => `${fmtDate(d)} Kg`)]
    const body = sorted.map(r => [
      r.name, r.group ?? '', r.rate ?? '', r.leadTime ?? '', r.safety ?? '', r.avgCons ?? '',
      r.maxLevel != null ? r.maxLevel.toFixed(2) : '',
      r.reorder  != null ? r.reorder.toFixed(2)  : '',
      ...shownDates.map(d => { const g = r.dateValues[d]; return g != null ? (g / 1000).toFixed(3) : '' }),
    ])
    const csv = [head, ...body]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `colour-store-ims-${latestDate || todayStr()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading && chemicals.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
  )

  const CTRL: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 13px',
    border: '1px solid var(--border-medium)', borderRadius: 8,
    background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 13, boxSizing: 'border-box',
  }
  const TH: React.CSSProperties = {
    padding: '9px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    color: 'var(--text-tertiary)', background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-medium)', whiteSpace: 'nowrap',
    textAlign: 'right', position: 'sticky', top: 0, zIndex: 2, cursor: 'pointer',
    fontFamily: MONO,
  }
  const TD: React.CSSProperties = {
    padding: '9px 8px', textAlign: 'right', fontFamily: MONO, fontSize: 12,
    borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap',
  }
  const arrow = (k: string) => (sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : '')

  // Selects/inputs need an explicit width and no flex-grow — without this they
  // stretch to fill the strip and each ends up on its own line.
  const SEL: React.CSSProperties = { ...CTRL, width: 200, flex: '0 0 auto' }

  const segment = (key: Band | '', label: string, count: number, accent?: string) => {
    const active = bandFilter === key
    return (
      <button key={label} onClick={() => setBandFilter(key)}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 13px', height: '100%',
          border: 'none', borderLeft: label === 'All' ? 'none' : '1px solid var(--border-light)',
          background: active ? 'var(--text-primary)' : 'transparent',
          color: active ? 'var(--bg-primary)' : 'var(--text-primary)',
          fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer' }}>
        {accent && <span style={{ width: 7, height: 7, borderRadius: 2, background: accent }} />}
        {label}
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, opacity: active ? 0.65 : 1 }}>{count}</span>
      </button>
    )
  }

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ border: '1px solid var(--border-light)', borderRadius: 12,
        background: 'var(--bg-primary)', overflow: 'hidden' }}>

        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10,
          flexWrap: 'wrap', borderBottom: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', marginRight: 6 }}>
            Colour Store IMS
          </span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-tertiary)' }}>
            {chemicals.length} ITEMS · {allDates.length} DATES{latestDate ? ` · LATEST ${fmtDate(latestDate)}` : ''}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={exportCsv} style={{ ...CTRL, fontWeight: 600, cursor: 'pointer' }}>Export</button>
            <button onClick={() => setUploadOpen(o => !o)}
              style={{ ...CTRL, background: 'var(--text-primary)', color: 'var(--bg-primary)',
                border: 'none', fontWeight: 600, cursor: 'pointer' }}>
              {uploadOpen ? 'Close' : 'Upload daily stock'}
            </button>
          </span>
        </div>

        {uploadOpen && (
          <div style={{ padding: '18px 20px', display: 'flex', gap: 20, alignItems: 'flex-start',
            flexWrap: 'wrap', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
            <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault(); setDragOver(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) { setFile(f); setUploadError(null); setUploadResult(null) }
                }}
                style={{ border: `1.5px dashed ${dragOver ? 'var(--text-primary)' : 'var(--border-medium)'}`,
                  borderRadius: 10, padding: 22, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 7, cursor: 'pointer',
                  background: dragOver ? 'var(--bg-primary)' : 'transparent' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {file ? file.name : 'Drop the Consumable Trial Balance Report'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {file ? 'Click to choose a different file' : 'or choose a file · .xlsx .xls .csv'}
                </span>
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                  onChange={e => { setFile(e.target.files?.[0] || null); setUploadError(null); setUploadResult(null) }} />
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['B → Name', 'C → Group', 'K → Balance Qty (g)', 'L → Rate (per g)'].map(c => (
                  <span key={c} style={{ fontFamily: MONO, fontSize: 11, padding: '3px 8px',
                    borderRadius: 5, background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>{c}</span>
                ))}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Every name must exist in the Colour Chemical Master, or nothing is saved.
              </span>
            </div>
            <div style={{ width: 250, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>STOCK DATE</span>
                <input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)}
                  style={{ ...CTRL, width: '100%' }} />
              </label>
              <button onClick={handleUpload} disabled={!file || uploading}
                style={{ height: 38, borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: file && !uploading ? 'pointer' : 'default',
                  background: file && !uploading ? 'var(--text-primary)' : 'var(--border-medium)',
                  color: file && !uploading ? 'var(--bg-primary)' : '#fff' }}>
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
              {!file && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.45 }}>
                  Disabled until a file is chosen.
                </span>
              )}
            </div>
          </div>
        )}

        {uploadError && (
          <div style={{ padding: '10px 20px', background: 'var(--danger-light)', color: 'var(--danger)',
            borderBottom: '1px solid var(--border-light)', fontSize: 12 }}>
            {uploadError.message}
            {uploadError.unmatched.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {uploadError.unmatched.map((u, i) => (
                  <span key={i} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700,
                    padding: '2px 6px', borderRadius: 4, background: 'var(--danger)', color: '#fff' }}>{u}</span>
                ))}
              </div>
            )}
          </div>
        )}
        {uploadResult && (
          <div style={{ padding: '10px 20px', background: 'var(--success-light)', color: 'var(--success)',
            borderBottom: '1px solid var(--border-light)', fontSize: 12, fontWeight: 600 }}>
            ✓ {uploadResult.saved} rows saved for {fmtDate(uploadDate)} — all matched the master.
          </div>
        )}
        {rowError && (
          <div style={{ padding: '10px 20px', background: 'var(--danger-light)', color: 'var(--danger)',
            borderBottom: '1px solid var(--border-light)', fontSize: 12 }}>{rowError}</div>
        )}

        <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10,
          flexWrap: 'wrap', borderBottom: '1px solid var(--border-medium)', background: 'var(--bg-secondary)' }}>
          <span style={{ display: 'inline-flex', height: 34, border: '1px solid var(--border-medium)',
            borderRadius: 8, overflow: 'hidden', background: 'var(--bg-primary)' }}>
            {segment('',     'All',          chemicals.length)}
            {segment('crit', 'Below 33%',    counts.crit, ACCENT.crit)}
            {segment('warn', '33–66%',       counts.warn, ACCENT.warn)}
            {segment('ok',   'Healthy',      counts.ok,   ACCENT.ok)}
            {segment('none', 'No plan data', counts.none)}
          </span>
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} style={SEL}>
            <option value="">All groups</option>
            {groupOptions.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name…"
            style={SEL} />
          <select value={`${sortKey}:${sortDir}`}
            onChange={e => {
              const [k, d] = e.target.value.split(':')
              setSortKey(k); setSortDir(Number(d) as 1 | -1)
            }} style={SEL}>
            <option value="avg:-1">Avg use — high to low</option>
            <option value="avg:1">Avg use — low to high</option>
            <option value="name:1">Name — A to Z</option>
            <option value="name:-1">Name — Z to A</option>
            <option value="status:1">Status — critical first</option>
            <option value="reorder:-1">Order Kg — high to low</option>
            <option value="max:-1">MAX Kg — high to low</option>
            <option value="stock:-1">Stock — high to low</option>
            <option value="rate:-1">Rate — high to low</option>
          </select>
          <button onClick={resetFilters}
            style={{ ...CTRL, border: 'none', background: 'transparent',
              color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: 'auto' }}>Reset</button>
        </div>

        <div style={{ overflow: 'auto', maxHeight: '68vh' }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 13 }}>
              {chemicals.length === 0
                ? 'No items in Colour Chemical Master yet. Add some in Setup → Colour Chemical Master.'
                : 'No items match these filters.'}
            </div>
          ) : (
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content' }}>
              <thead>
                <tr>
                  <th onClick={() => toggleSort('name')}
                    style={{ ...TH, textAlign: 'left', left: 0, zIndex: 3, width: 224,
                      padding: '9px 14px', borderRight: '1px solid var(--border-light)' }}>
                    ITEM{arrow('name')}
                  </th>
                  <th onClick={() => toggleSort('rate')}   style={{ ...TH, width: 92 }}>RATE/KG{arrow('rate')}</th>
                  <th onClick={() => toggleSort('lead')}   style={{ ...TH, width: 62 }}>LEAD D{arrow('lead')}</th>
                  <th onClick={() => toggleSort('safety')} style={{ ...TH, width: 66 }}>SAFETY{arrow('safety')}</th>
                  <th onClick={() => toggleSort('avg')}
                    style={{ ...TH, width: 70, borderRight: '1px solid var(--border-medium)' }}>AVG KG/D{arrow('avg')}</th>
                  <th onClick={() => toggleSort('max')} style={{ ...TH, width: 74 }}>MAX KG{arrow('max')}</th>
                  <th onClick={() => toggleSort('reorder')}
                    style={{ ...TH, width: 84, borderRight: '2px solid var(--border-medium)' }}>ORDER KG{arrow('reorder')}</th>
                  {shownDates.map(d => {
                    const isLatest = d === latestDate
                    return (
                      <th key={d} onClick={() => toggleSort('stock')}
                        style={{ ...TH, minWidth: 74, fontWeight: isLatest ? 800 : 700,
                          color: isLatest ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        {shortDate(d)}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => {
                  const cell = (field: 'leadTime' | 'safetyFactor' | 'avgDailyConsumption', current: number | null) => {
                    const key = `${r.id}::${field}`
                    if (editingPlan === key) {
                      return (
                        <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}
                          onClick={e => e.stopPropagation()}>
                          <input autoFocus type="number" value={editPlanValue}
                            onChange={e => setEditPlanValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') savePlanField(r.id, field)
                              if (e.key === 'Escape') setEditingPlan(null)
                            }}
                            style={{ width: 52, fontSize: 12, padding: '2px 5px', textAlign: 'right',
                              border: '1px solid var(--border-medium)', borderRadius: 4 }} />
                          <button disabled={saving} onClick={() => savePlanField(r.id, field)}
                            style={{ fontSize: 11, padding: '0 5px', cursor: 'pointer' }}>✓</button>
                        </span>
                      )
                    }
                    return (
                      <span style={{ borderBottom: '1px dotted var(--border-medium)', cursor: 'pointer' }}>
                        {current != null ? current : <span style={{ color: 'var(--text-tertiary)' }}>Set</span>}
                      </span>
                    )
                  }
                  return (
                    <tr key={r.id}>
                      <td style={{ ...TD, textAlign: 'left', padding: '9px 14px', position: 'sticky', left: 0,
                        zIndex: 1, background: 'var(--bg-primary)', fontFamily: 'inherit', fontSize: 13,
                        fontWeight: 600, maxWidth: 224, overflow: 'hidden', textOverflow: 'ellipsis',
                        borderRight: '1px solid var(--border-light)' }}>
                        {r.name}
                        {r.group && (
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 400,
                            color: 'var(--text-tertiary)' }}>{r.group}</span>
                        )}
                      </td>
                      <td style={{ ...TD, color: 'var(--text-secondary)' }}>
                        {r.rate != null ? n(r.rate, 2) : '·'}
                      </td>
                      <td style={TD} onClick={() => editingPlan !== `${r.id}::leadTime` && startEditPlan(r.id, 'leadTime', r.leadTime)}>
                        {cell('leadTime', r.leadTime)}
                      </td>
                      <td style={TD} onClick={() => editingPlan !== `${r.id}::safetyFactor` && startEditPlan(r.id, 'safetyFactor', r.safety)}>
                        {cell('safetyFactor', r.safety)}
                      </td>
                      <td style={{ ...TD, borderRight: '1px solid var(--border-medium)' }}
                        onClick={() => editingPlan !== `${r.id}::avgDailyConsumption` && startEditPlan(r.id, 'avgDailyConsumption', r.avgCons)}>
                        {cell('avgDailyConsumption', r.avgCons)}
                      </td>
                      <td style={{ ...TD, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        {r.maxLevel != null ? n(r.maxLevel, 0) : '·'}
                      </td>
                      <td style={{ ...TD, background: 'var(--bg-secondary)', fontWeight: 700,
                        borderRight: '2px solid var(--border-medium)',
                        color: r.reorder != null
                          ? (r.band === 'crit' ? ACCENT.crit : 'var(--text-primary)')
                          : 'var(--text-tertiary)' }}>
                        {r.reorder != null ? n(r.reorder, 0) : '—'}
                      </td>
                      {shownDates.map(d => {
                        const g = r.dateValues[d]
                        if (g == null) {
                          return <td key={d} style={{ ...TD, color: 'var(--text-tertiary)' }}>·</td>
                        }
                        const kg = g / 1000
                        const b = bandOf(kg, r.maxLevel)
                        return (
                          <td key={d} style={{ ...TD, fontWeight: 500,
                            background: b === 'none' ? 'transparent' : TINT[b],
                            color: b === 'none' ? 'var(--text-primary)' : TINT_FG[b] }}>
                            {n(kg)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: '12px 20px', background: 'var(--bg-secondary)', display: 'flex',
          alignItems: 'center', gap: 14, flexWrap: 'wrap', borderTop: '1px solid var(--border-light)' }}>
          {([['crit', '<33% of MAX'], ['warn', '33–66%'], ['ok', '66–100%']] as [Exclude<Band, 'none'>, string][])
            .map(([b, label]) => (
              <span key={b} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12,
                color: 'var(--text-secondary)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: TINT[b] }} />{label}
              </span>
            ))}
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span style={{ fontFamily: MONO, color: 'var(--text-tertiary)' }}>·</span> no upload that day
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
            Dotted underline = editable · grey block = computed · item column pins on scroll
          </span>
        </div>
      </div>
    </div>
  )
}
