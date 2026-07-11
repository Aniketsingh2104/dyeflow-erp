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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/masters?table=customers', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) setCustomers(data.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const api = async (action: string, payload: Record<string, any>) => {
    const res = await fetch('/api/masters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'customers', action, ...payload }),
    })
    return res.json()
  }

  const openAdd  = () => { setEditing(null); setForm({ name: '', contact: '', phone: '' }); setShowModal(true) }
  const openEdit = (c: Customer) => { setEditing(c); setForm({ name: c.name, contact: c.contact || '', phone: c.phone || '' }); setShowModal(true) }

  const save = async () => {
    if (!form.name.trim()) { alert('Customer name is required.'); return }
    setSaving(true)
    try {
      const payload = { name: form.name.trim(), contact: form.contact.trim(), phone: form.phone.trim(), is_active: true }
      const data = editing
        ? await api('update', { id: editing.id, ...payload })
        : await api('upsert', payload)
      if (!data.ok) throw new Error(data.error)
      setShowModal(false)
      load()
    } catch (err) { alert(`Save failed: ${err}`) }
    finally { setSaving(false) }
  }

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete customer "${name}"?`)) return
    const data = await api('delete', { id })
    if (!data.ok) alert(`Delete failed: ${data.error}`)
    else load()
  }

  const processImportRows = async (rows: any[]) => {
    if (rows.length < 2) { setImportStatus('❌ File appears empty.'); return }
    const header = rows[0].map((h: any) => String(h || '').toLowerCase().trim())
    const nameIdx  = header.findIndex((h: string) => h.includes('party') || h.includes('name') || h.includes('customer'))
    const emailIdx = header.findIndex((h: string) => h.includes('email') || h.includes('mail'))
    const phoneIdx = header.findIndex((h: string) => h.includes('phone') || h.includes('mobile') || h.includes('contact') || h.includes('tel'))
    if (nameIdx < 0) { setImportStatus('❌ No "Party" or "Name" column found.'); return }

    const existing = new Set(customers.map(c => c.name.trim().toLowerCase()))
    let added = 0, skipped = 0

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const get = (idx: number) => idx >= 0 && row[idx] != null ? String(row[idx]).trim() : ''
      const name = get(nameIdx)
      if (!name || existing.has(name.toLowerCase())) { skipped++; continue }
      await api('upsert', { name, contact: get(emailIdx), phone: get(phoneIdx), is_active: true })
      existing.add(name.toLowerCase())
      added++
    }
    setImportStatus(`✅ Imported ${added} customers${skipped > 0 ? `, ${skipped} skipped` : ''}`)
    load()
    if (fileInputRef.current) fileInputRef.current.value = ''
    setTimeout(() => setImportStatus(''), 5000)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus('Reading file…')
    if (file.name.endsWith('.csv')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const lines = (ev.target?.result as string).split(/\r?\n/).filter(l => l.trim())
        const rows  = lines.map(line => line.split(',').map(c => c.replace(/^"|"$/g, '').trim()))
        processImportRows(rows)
      }
      reader.readAsText(file)
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const wb   = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type: 'array' })
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[]
        processImportRows(rows)
      }
      reader.readAsArrayBuffer(file)
    }
  }

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      {/* Import */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10,
        padding: '14px 18px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📄 Import from Excel / CSV</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Columns: <strong>Party</strong> (or Name), <strong>Email</strong> (or Mail ID), <strong>Phone</strong>. Existing names are skipped.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          {importStatus && (
            <span style={{ fontSize: 12, fontWeight: 500,
              color: importStatus.startsWith('✅') ? 'var(--success)' : importStatus.startsWith('❌') ? 'var(--danger)' : 'var(--text-secondary)' }}>
              {importStatus}
            </span>
          )}
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button style={{ background: '#137E43', color: '#fff', border: 'none', padding: '7px 14px',
            borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            onClick={() => fileInputRef.current?.click()}>
            📄 Choose File
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Customer Master</span>
            <span style={{ fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)',
              padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{customers.length}</span>
          </div>
          <button style={{ background: '#137E43', color: '#fff', border: 'none', padding: '7px 14px',
            borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }} onClick={openAdd}>
            + Add Customer
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Customer / Party Name</th>
                <th style={th}>Email</th>
                <th style={th}>Phone</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  No customers yet. Click "+ Add Customer" or import from Excel.
                </td></tr>
              ) : (
                customers.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)',
                    background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                    <td style={td}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{c.contact || '-'}</td>
                    <td style={td}>{c.phone || '-'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 8 }}>
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
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Customer' : 'Add Customer'}</span>
              <button className="small" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="form-group">
                <label>Customer / Party Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="text" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <button className="primary" onClick={save} disabled={saving} style={{ width: '100%', marginTop: 8 }}>
              {saving ? 'Saving…' : '✓ Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border-light)' }
const td: React.CSSProperties = { padding: '11px 14px', fontSize: 13, color: 'var(--text-primary)' }
