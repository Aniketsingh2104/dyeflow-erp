'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

interface ImportedOrder {
  party:      string
  subParty?:  string
  salesPerson?: string
  article:    string
  blend?:     string
  width?:     string
  gsm?:       string
  color:      string
  labNo?:     string
  lotNo?:     string
  challanNo?: string
  qtyKg:      number
  qtyMtr?:    number
  noOfTaka?:  number
  typeOfFinish?:   string
  typeOfPacking?:  string
  remarks?:   string
}

export default function ImportPage() {
  const router = useRouter()
  const [file,              setFile]              = useState<File | null>(null)
  const [importing,         setImporting]         = useState(false)
  const [result,            setResult]            = useState<any>(null)
  const [error,             setError]             = useState('')
  const [templateFile,      setTemplateFile]      = useState<File | null>(null)
  const [uploadingTemplate, setUploadingTemplate] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setError(''); setResult(null) }
  }

  const parseCSV = (text: string): string[][] => {
    return text.split('\n').map(line => {
      const values: string[] = []; let current = ''; let inQuotes = false
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes }
        else if (char === ',' && !inQuotes) { values.push(current.trim()); current = '' }
        else { current += char }
      }
      values.push(current.trim()); return values
    }).filter(row => row.some(c => c.length > 0))
  }

  const parseExcel = (file: File): Promise<string[][]> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const data = e.target?.result; if (!data) { reject(new Error('Failed to read file')); return }
          const wb   = XLSX.read(data, { type: 'array' })
          const ws   = wb.Sheets[wb.SheetNames[0]]
          if (!ws) { reject(new Error('No sheets found')); return }
          const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false })
          resolve(rows.map(row => row.map((cell: any) => String(cell || '').trim())))
        } catch (err: any) { reject(new Error('Failed to parse Excel: ' + err.message)) }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsArrayBuffer(file)
    })

  const handleImport = async () => {
    if (!file) { setError('Please select a file first'); return }
    setImporting(true); setError(''); setResult(null)
    try {
      const fileName = file.name.toLowerCase()
      const isCSV   = fileName.endsWith('.csv')
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
      if (!isCSV && !isExcel) throw new Error('Please upload a CSV or Excel file (.csv, .xlsx, .xls)')

      const rows = isCSV ? parseCSV(await file.text()) : await parseExcel(file)
      await processAndSave(rows)
    } catch (err: any) {
      setError(err.message || 'Failed to import file')
    } finally { setImporting(false) }
  }

  const processAndSave = async (rows: string[][]) => {
    if (!rows.length) throw new Error('File is empty')

    const headers  = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '').trim())
    const dataRows = rows.slice(1)

    // Column name aliases
    const alias: Record<string, string> = {
      'labno': 'labno', 'lotno': 'lotno', 'challannumber': 'challanno', 'challanno': 'challanno',
      'qtykg': 'qtykg', 'qtymtr': 'qtymtr', 'nooftaka': 'nooftaka',
      'typeoffinish': 'typeoffinish', 'typeofpacking': 'typeofpacking',
      'subparty': 'subparty', 'salesperson': 'salesperson', 'holdapproval': 'holdapproval', 'holdreason': 'holdreason',
    }

    const find = (key: string): number => {
      const idx = headers.indexOf(key); if (idx >= 0) return idx
      const aliasKey = alias[key]; if (aliasKey) { const i = headers.indexOf(aliasKey); if (i >= 0) return i }
      return headers.findIndex(h => h.includes(key))
    }

    // Map to column indices
    const col = (k: string) => find(k)
    const get = (row: string[], k: string): string => {
      const i = col(k); return i >= 0 ? (row[i] || '') : ''
    }

    const imported: ImportedOrder[] = []
    for (const row of dataRows) {
      if (!row.some(c => c)) continue
      const party   = get(row, 'party')
      const article = get(row, 'article')
      const color   = get(row, 'color')
      if (!party && !article && !color) continue

      imported.push({
        party:          party       || 'Unknown',
        subParty:       get(row, 'subparty')     || undefined,
        salesPerson:    get(row, 'salesperson')  || undefined,
        article:        article     || '',
        blend:          get(row, 'blend')        || undefined,
        width:          get(row, 'width')        || undefined,
        gsm:            get(row, 'gsm')          || undefined,
        color:          color       || '',
        labNo:          get(row, 'labno')        || undefined,
        lotNo:          get(row, 'lotno')        || undefined,
        challanNo:      get(row, 'challanno')    || undefined,
        qtyKg:          parseFloat(get(row, 'qtykg')    || '0') || 0,
        qtyMtr:         parseFloat(get(row, 'qtymtr')   || '0') || undefined,
        noOfTaka:       parseInt(  get(row, 'nooftaka') || '0') || undefined,
        typeOfFinish:   get(row, 'typeoffinish') || undefined,
        typeOfPacking:  get(row, 'typeofpacking')|| undefined,
        remarks:        get(row, 'remarks')      || undefined,
      })
    }

    if (!imported.length) throw new Error('No valid data found. Ensure the file has party, article, or color columns.')

    // Save each order to Supabase via /api/orders
    let saved = 0; const errors: string[] = []
    for (const order of imported) {
      try {
        const res  = await fetch('/api/orders', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action:       'create',
            party:        order.party,
            article:      order.article,
            color:        order.color,
            blend:        order.blend        || null,
            qty_kg:       order.qtyKg        || 0,
            challan_no:   order.challanNo    || null,
            remarks:      [
              order.remarks,
              order.labNo    ? `Lab: ${order.labNo}`        : null,
              order.lotNo    ? `Lot: ${order.lotNo}`        : null,
              order.subParty ? `SubParty: ${order.subParty}`: null,
            ].filter(Boolean).join(' · ') || null,
            status:       'new',
          }),
        })
        const data = await res.json()
        if (data.ok) saved++
        else errors.push(`${order.party}/${order.article}: ${data.error}`)
      } catch (e: any) {
        errors.push(`${order.party}: ${e.message}`)
      }
    }

    setResult({
      imported:   saved,
      failed:     errors.length,
      errors:     errors.slice(0, 5),
      headers:    headers.slice(0, 10),
      preview:    imported.slice(0, 5),
    })

    // Notify other components
    window.dispatchEvent(new Event('dyeflow-db-updated'))
  }

  const handleDownloadTemplate = () => {
    const headers = ['party','subparty','salesperson','article','blend','width','gsm','color','labno','lotno','challannumber','qtykg','qtymtr','nooftaka','typeoffinish','typeofpacking','remarks']
    const example = ['Rajesh Fabrics','Sub Party A','John Doe','Cotton Fabric','100% Cotton','44','200','Navy Blue','L-2001','LOT-445','CH-1001','500','1200','60','Matt','Roll','Sample order']
    const blob = new Blob([[headers, example].map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'dyeflow_import_template.csv'; a.click()
  }

  const handleDownloadExcelTemplate = () => {
    const headers = ['party','subparty','salesperson','article','blend','width','gsm','color','labno','lotno','challannumber','qtykg','qtymtr','nooftaka','typeoffinish','typeofpacking','remarks']
    const example = ['Rajesh Fabrics','Sub Party A','John Doe','Cotton Fabric','100% Cotton','44','200','Navy Blue','L-2001','LOT-445','CH-1001','500','1200','60','Matt','Roll','Sample order']
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, example]), 'Orders')
    XLSX.writeFile(wb, 'dyeflow_import_template.xlsx')
  }

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    if (!f.name.match(/\.(xlsx|xls)$/i)) { alert('Please upload an Excel file (.xlsx or .xls)'); return }
    setTemplateFile(f); setUploadingTemplate(true)
    const reader = new FileReader()
    reader.onload = ev => {
      const data = ev.target?.result
      if (data) {
        // Store template in localStorage (browser-local preference, not app data)
        localStorage.setItem('dyeflow_import_template', JSON.stringify({
          name: f.name, data: Array.from(new Uint8Array(data as ArrayBuffer))
        }))
        alert(`✓ Template "${f.name}" saved for this browser.`)
      }
      setUploadingTemplate(false)
    }
    reader.readAsArrayBuffer(f)
  }

  const handleDownloadSavedTemplate = () => {
    const saved = localStorage.getItem('dyeflow_import_template')
    if (!saved) { alert('No custom template uploaded yet.'); return }
    try {
      const { name, data } = JSON.parse(saved)
      const blob = new Blob([new Uint8Array(data)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
    } catch { alert('Failed to download template') }
  }

  return (
    <div className="content">
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Import Orders (CSV & Excel)</h2>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
          Import orders directly into Supabase. Both CSV and Excel formats are supported.
        </p>
      </div>

      <div style={{ background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 18 }}>✓</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#065F46', marginBottom: 4 }}>Saves directly to Supabase</div>
          <div style={{ fontSize: 12, color: '#047857' }}>Imported orders appear instantly on all devices — no migration step needed.</div>
        </div>
      </div>

      {/* Upload card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ border: '2px dashed var(--border-medium)', borderRadius: 8, padding: 32, textAlign: 'center', background: 'var(--bg-secondary)', marginBottom: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{file ? '📄' : '📁'}</div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>{file ? file.name : 'Choose a file to import'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>Supported: .csv, .xlsx, .xls</div>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange}
            style={{ display: 'block', margin: '0 auto', padding: 8, fontSize: 13, cursor: 'pointer' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleImport} disabled={!file || importing}
            className={file && !importing ? 'primary' : ''}
            style={{ opacity: file && !importing ? 1 : 0.6 }}>
            {importing ? '⏳ Importing…' : '⬆ Import to Supabase'}
          </button>
          <button onClick={handleDownloadTemplate} className="small">Download CSV Template</button>
          <button onClick={handleDownloadExcelTemplate} className="small" style={{ background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7' }}>Download Excel Template</button>
          <label style={{ position: 'relative', cursor: 'pointer' }}>
            <input type="file" accept=".xlsx,.xls" onChange={handleTemplateUpload} style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
            <span className="small" style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 12px', border: '1px solid var(--accent)', borderRadius: 6, background: 'var(--accent-light)', color: 'var(--accent-dark)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {uploadingTemplate ? '⏳ Uploading…' : '📤 Upload My Template'}
            </span>
          </label>
          <button onClick={handleDownloadSavedTemplate} className="small">Download My Template</button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div><div style={{ fontSize: 14, fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>Import Error</div><div style={{ fontSize: 13, color: '#7F1D1D' }}>{error}</div></div>
          </div>
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="card">
          <div style={{ padding: '14px 16px', background: result.failed > 0 ? '#FEF3C7' : '#D1FAE5', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>{result.failed > 0 ? '⚠️' : '✅'}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: result.failed > 0 ? '#92400E' : '#065F46' }}>
                {result.imported} order{result.imported !== 1 ? 's' : ''} imported to Supabase
                {result.failed > 0 && ` · ${result.failed} failed`}
              </div>
              {result.errors?.length > 0 && (
                <div style={{ fontSize: 12, color: '#92400E', marginTop: 4 }}>
                  Errors: {result.errors.join(' · ')}
                </div>
              )}
            </div>
          </div>

          {/* Preview table */}
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Preview of imported orders:</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Party','Article','Color','Qty Kg','Challan No','Remarks'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.preview.map((row: ImportedOrder, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{row.party}</td>
                    <td style={{ padding: '8px 12px' }}>{row.article}</td>
                    <td style={{ padding: '8px 12px' }}>{row.color}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{row.qtyKg}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-tertiary)' }}>{row.challanNo || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-tertiary)', fontSize: 11 }}>{row.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <button className="primary" onClick={() => router.push('/orders')}>View All Orders →</button>
          </div>
        </div>
      )}

      {/* Format guide */}
      <div className="card">
        <div className="card-header"><span className="card-title" style={{ fontSize: 13 }}>File Format</span></div>
        <div style={{ padding: '0 16px 16px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          First row must be column headers. Required: at least one of <strong>party</strong>, <strong>article</strong>, <strong>color</strong>.
          <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}>
            party · subparty · salesperson · article · blend · width · gsm · color · labno · lotno · challannumber · qtykg · qtymtr · nooftaka · typeoffinish · typeofpacking · remarks
          </div>
          <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--accent-light)', borderRadius: 8, fontSize: 12, color: 'var(--accent-dark)' }}>
            ✓ Each row becomes one order in Supabase with status "new". Orders appear instantly on all devices.
          </div>
        </div>
      </div>
    </div>
  )
}
