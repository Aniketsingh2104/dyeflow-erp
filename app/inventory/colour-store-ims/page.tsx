'use client'
// Colour Store IMS — shows every name in the Colour Chemical Master with its
// latest recorded stock, and lets you upload the daily Consumable Trial
// Balance Report (fixed columns: B=Name, C=Group, K=Balance Qty in grams,
// L=Rate — all other columns ignored). Stock is recorded date-wise
// (colour_store_stock, one row per name per date), so re-uploading the same
// date corrects rather than duplicates. Balance Qty is stored exactly as
// uploaded (grams) and only converted to Kg for display.

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

export default function ColourStoreIMSPage() {
  const [chemicals, setChemicals] = useState<any[]>([])
  const [stock,      setStock]    = useState<any[]>([])
  const [loading,    setLoading]  = useState(true)
  const [search,     setSearch]   = useState('')

  const [file,        setFile]        = useState<File | null>(null)
  const [uploadDate,  setUploadDate]  = useState(todayStr())
  const [uploading,   setUploading]   = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [uploadError, setUploadError] = useState('')

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

  // Latest stock entry per name (stock array is already ordered stock_date desc).
  const latestByName = useMemo(() => {
    const m: Record<string, any> = {}
    for (const s of stock) {
      const key = String(s.name).trim().toLowerCase()
      if (!m[key]) m[key] = s // first occurrence per name = most recent, since pre-sorted desc
    }
    return m
  }, [stock])

  const rows = useMemo(() => {
    return chemicals.map((c: any) => {
      const latest = latestByName[String(c.name).trim().toLowerCase()]
      return {
        ...c,
        latestStockG: latest?.stock_qty ?? null,
        latestGroup: latest?.group_name ?? null,
        latestRate: latest?.rate ?? null,
        latestDate: latest?.stock_date ?? null,
      }
    })
  }, [chemicals, latestByName])

  const filtered = search.trim()
    ? rows.filter(r => String(r.name).toLowerCase().includes(search.toLowerCase()))
    : rows

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

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Colour Store IMS</div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
        {chemicals.length} item(s) in Colour Chemical Master · daily stock recorded date-wise
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Name', 'Group', 'Latest Stock (Kg)', 'Rate', 'Last Updated'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-tertiary)' }}>{r.latestGroup || '-'}</td>
                  <td style={{ padding: '9px 12px', fontWeight: 700,
                    color: r.latestStockG != null ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                    {r.latestStockG != null ? (parseFloat(r.latestStockG) / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 }) : 'No data yet'}
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-tertiary)' }}>{r.latestRate != null ? r.latestRate : '-'}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-tertiary)' }}>
                    {r.latestDate ? fmtDate(r.latestDate) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
