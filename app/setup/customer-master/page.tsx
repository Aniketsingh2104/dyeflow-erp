'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

interface Customer { id: string; name: string; contact?: string; phone?: string; created_at?: string }

export default function CustomerMasterPage() {
  const [customers,    setCustomers]    = useState<Customer[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [editing,      setEditing]      = useState<Customer | null>(null)
  const [form,         setForm]         = useState({ name: '', contact: '', phone: '' })
  const [importStatus, setImportStatus] = useState('')
  const [saving,       setSaving]       = useState(false)
  const [search,       setSearch]       = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load from Supabase ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/customers', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) setCustomers(data.data || [])
      else console.error('Customer load error:', data.error)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Save one customer ────────────────────────────────────────────────────
  const save = async () => {
    if (!form.name.trim()) { alert('Customer name is required.'); return }
    setSaving(true)
    try {
      const res  = await fetch('/api/customers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:  editing ? 'update' : 'upsert',
          id:      editing?.id,
          name:    form.name.trim(),
          contact: form.contact.trim() || null,
          phone:   form.phone.trim()   || null,
        }),
      })
      const data = await res.json()
      if (!data.ok) { alert('Save failed: ' + data.error); return }
      setShowModal(false)
      load()
    } finally { setSaving(false) }
  }

  // ── Delete one customer ──────────────────────────────────────────────────
  const del = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    const res  = await fetch('/api/customers', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'delete', id }),
    })
    const data = await res.json()
    if (!data.ok) alert('Delete failed: ' + data.error)
    else load()
  }

  // ── Excel / CSV import ───────────────────────────────────────────────────
  const processImportRows = async (rows: any[][]) => {
    if (!rows.length || rows.length < 2) {
      setImportStatus('❌ File appears empty.'); return
    }

    const header = rows[0].map((h: any) => String(h ?? '').toLowerCase().trim())
    const col = (keywords: string[]) =>
      header.findIndex(h => keywords.some(k => h.includes(k)))

    const nameIdx  = col(['party', 'name', 'customer', 'client'])
    const emailIdx = col(['email', 'mail', 'contact'])
    const phoneIdx = col(['phone', 'mobile', 'tel', 'number'])

    if (nameIdx < 0) {
      setImportStatus('❌ No "Party", "Name" or "Customer" column found. Check your Excel headers.'); return
    }

    // Build import list, skip blanks
    const toImport: { name: string; contact: string; phone: string }[] = []
    const seen = new Set<string>()

    for (let i = 1; i < rows.length; i++) {
      const row  = rows[i]
      const get  = (idx: number) => idx >= 0 && row[idx] != null ? String(row[idx]).trim() : ''
      const name = get(nameIdx)
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      toImport.push({
        name,
        contact: get(emailIdx),
        phone:   get(phoneIdx),
      })
    }

    if (!toImport.length) {
      setImportStatus('❌ No valid customer names found in file.'); return
    }

    setImportStatus(`⏳ Importing ${toImport.length} customers to Supabase…`)

    // Send as bulk_upsert — one API call for all rows
    const res  = await fetch('/api/customers', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'bulk_upsert', customers: toImport }),
    })
    const data = await res.json()

    if (!data.ok) {
      setImportStatus(`❌ Import failed: ${data.error}`); return
    }

    setImportStatus(`✅ ${data.inserted} customers imported to Supabase`)
    load()
    if (fileInputRef.current) fileInputRef.current.value = ''
    setTimeout(() => setImportStatus(''), 5000)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus('📂 Reading file…')

    try {
      const isCsv = file.name.toLowerCase().endsWith('.csv')
      let rows: any[][]

      if (isCsv) {
        const text = await file.text()
        rows = text
          .split(/\r?\n/)
          .filter(l => l.trim())
          .map(line => line.split(',').map(c => c.replace(/^"|"$/g, '').trim()))
      } else {
        const buf  = await file.arrayBuffer()
        const wb   = XLSX.read(new Uint8Array(buf), { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
      }

      await processImportRows(rows)
    } catch (err: any) {
      setImportStatus(`❌ Error reading file: ${err.message}`)
    }
  }

  const openAdd  = () => { setEditing(null); setForm({ name: '', contact: '', phone: '' }); setShowModal(true) }
  const openEdit = (c: Customer) => {
    setEditing(c)
    setForm({ name: c.name, contact: c.contact || '', phone: c.phone || '' })
    setShowModal(true)
  }

  const filtered = customers.filter(c =>
    !search.trim() ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      {/* Import section */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📥 Import from Excel / CSV</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Required column: <strong>Party</strong> or <strong>Name</strong> or <strong>Customer</strong><br />
              Optional: <strong>Email</strong> (or Mail ID, Contact) · <strong>Phone</strong> (or Mobile, Tel)<br />
              Existing names are updated, new ones are added. All changes go directly to Supabase.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
            {importStatus && (
              <div style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6,
                background: importStatus.startsWith('✅') ? '#D1FAE5' : importStatus.startsWith('❌') ? '#FEE2E2' : '#EFF6FF',
                color: importStatus.startsWith('✅') ? '#065F46' : importStatus.startsWith('❌') ? '#991B1B' : '#1E40AF',
                maxWidth: 280, textAlign: 'right' }}>
                {importStatus}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
            <button onClick={() => fileInputRef.current?.click()}
              style={{ background: '#137E43', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              📄 Choose Excel / CSV File
            </button>
          </div>
        </div>

        {/* Format hint */}
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
          Example columns: <strong>Party</strong> | <strong>Email</strong> | <strong>Phone</strong> &nbsp;→&nbsp; Rajesh Fabrics | rajesh@example.com | 9876543210
        </div>
      </div>

      {/* Table header */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-light)', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Customer / Party Master</span>
            <span style={{ fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
              {customers.length}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search customers…"
              style={{ fontSize: 12, padding: '6px 10px', width: 180, border: '1px solid var(--border-medium)', borderRadius: 5 }} />
            <button className="small" onClick={load} disabled={loading}>{loading ? '…' : '↻'}</button>
            <button onClick={openAdd}
              style={{ background: '#137E43', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Add Customer
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                {['#', 'Customer / Party Name', 'Email', 'Phone', 'Actions'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading from Supabase…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  {search ? `No results for "${search}"` : 'No customers yet. Add one or import from Excel.'}
                </td></tr>
              ) : (
                filtered.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)', background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                    <td style={{ ...td, color: 'var(--text-tertiary)', width: 48 }}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{c.contact || '—'}</td>
                    <td style={td}>{c.phone || '—'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="xs" onClick={() => openEdit(c)}>Edit</button>
                        <button className="xs danger" onClick={() => del(c.id, c.name)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-light)', fontSize: 11, color: 'var(--text-tertiary)' }}>
          {filtered.length} of {customers.length} customers · <strong>customers</strong> table · Supabase
        </div>
      </div>

      {/* Add / Edit modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Customer' : 'Add Customer'}</span>
              <button className="small" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label>Customer / Party Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus placeholder="e.g. Rajesh Fabrics" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="text" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="email@example.com" />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="9876543210" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1 }}>Cancel</button>
              <button className="primary" onClick={save} disabled={saving} style={{ flex: 2 }}>
                {saving ? '⏳ Saving…' : '✓ Save to Supabase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border-light)',
}
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)' }
