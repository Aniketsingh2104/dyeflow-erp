'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

export default function ColourChemicalMasterPage() {
  const [items,        setItems]        = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [editingId,    setEditingId]    = useState('')
  const [form,         setForm]         = useState({ name: '' })
  const [importStatus, setImportStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/setup/settings?key=colourChemicals', { cache: 'no-store' })
      const data = await res.json()
      const list = Array.isArray(data.value) ? data.value : []
      setItems([...list].sort((a: any, b: any) => a.name.localeCompare(b.name)))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const persist = async (list: any[]) => {
    await fetch('/api/setup/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'colourChemicals', value: list }),
    })
    // Sync to localStorage for backward compat
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('dyeflow_db')
        const db  = raw ? JSON.parse(raw) : {}
        db.colourChemicals = list
        localStorage.setItem('dyeflow_db', JSON.stringify(db))
      } catch {}
    }
  }

  const nextId = (list: any[]) => {
    const nums = list.map(x => { const m = (x.id||'').match(/(\d+)/); return m ? parseInt(m[1]) : 0 })
    return 'CCM-' + String(Math.max(0, ...nums, 0) + 1).padStart(3, '0')
  }

  const save = async () => {
    if (!form.name.trim()) { alert('Name required.'); return }
    const dup = items.find(x => x.name.toLowerCase() === form.name.trim().toLowerCase() && x.id !== editingId)
    if (dup) { alert('Name already exists.'); return }
    let updated
    if (editingId) {
      updated = items.map(x => x.id === editingId ? { ...x, name: form.name.trim() } : x)
    } else {
      updated = [...items, { id: nextId(items), name: form.name.trim(), createdAt: new Date().toISOString() }]
    }
    await persist(updated)
    setItems([...updated].sort((a, b) => a.name.localeCompare(b.name)))
    setShowModal(false)
    setEditingId('')
  }

  const del = async (id: string) => {
    const item = items.find(x => x.id === id)
    if (!item || !confirm(`Delete "${item.name}"?`)) return
    const updated = items.filter(x => x.id !== id)
    await persist(updated)
    setItems(updated)
  }

  const processImportRows = async (data: any[][]) => {
    let startIndex = 0
    for (let i = 0; i < Math.min(3, data.length); i++) {
      const first = String(data[i]?.[0] || '').toLowerCase()
      if (/name|colour|color|chemical|id/i.test(first)) { startIndex = i + 1; break }
    }
    const existing = new Set(items.map((x: any) => x.name.toLowerCase()))
    let added = 0, skipped = 0
    const newItems = [...items]
    for (let i = startIndex; i < data.length; i++) {
      const row = data[i]
      const name = row?.find((c: any) => c != null && String(c).trim() !== '')
      if (!name) continue
      const s = String(name).trim()
      if (existing.has(s.toLowerCase())) { skipped++; continue }
      newItems.push({ id: nextId(newItems), name: s, createdAt: new Date().toISOString() })
      existing.add(s.toLowerCase())
      added++
    }
    await persist(newItems)
    setItems([...newItems].sort((a, b) => a.name.localeCompare(b.name)))
    setImportStatus(`✅ Imported ${added}${skipped ? `, ${skipped} skipped` : ''}`)
    if (fileRef.current) fileRef.current.value = ''
    setTimeout(() => setImportStatus(''), 5000)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus('Reading…')
    if (file.name.endsWith('.csv')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const lines = (ev.target?.result as string).split(/\r?\n/).filter(l => l.trim())
        processImportRows(lines.map(line => line.split(',').map(c => c.replace(/^"|"$/g,'').trim())))
      }
      reader.readAsText(file)
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const wb   = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type: 'array' })
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false }) as any[][]
        processImportRows(rows)
      }
      reader.readAsArrayBuffer(file)
    }
  }

  const todayCount = items.filter(x => new Date(x.createdAt).toDateString() === new Date().toDateString()).length

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      {/* Import */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10,
        padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🎨 Import Colour / Chemical Names</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            One name per row, first column. Header row is auto-detected and skipped.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          {importStatus && (
            <span style={{ fontSize: 12, fontWeight: 500,
              color: importStatus.startsWith('✅') ? 'var(--success)' : 'var(--danger)' }}>{importStatus}</span>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          <button style={{ background: '#137E43', color: '#fff', border: 'none', padding: '7px 14px',
            borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            onClick={() => fileRef.current?.click()}>📄 Upload Excel / CSV</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total Names', value: items.length, sub: 'Master records' },
          { label: 'Added Today', value: todayCount, sub: 'New names', color: '#137E43' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color || 'var(--text-primary)', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Master Register</span>
            <span style={{ fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)',
              padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{items.length} names</span>
          </div>
          <button style={{ background: '#137E43', color: '#fff', border: 'none', padding: '7px 14px',
            borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            onClick={() => { setEditingId(''); setForm({ name: '' }); setShowModal(true) }}>
            + Add Name
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['ID','Name','Created At','Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  No names yet. Click "+ Add Name" or upload Excel.
                </td></tr>
              ) : (
                items.map((x, i) => (
                  <tr key={x.id} style={{ background: i%2===0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--accent)', fontSize: 12 }}>{x.id}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 600, fontSize: 13 }}>{x.name}</td>
                    <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {x.createdAt ? new Date(x.createdAt).toLocaleString('en-GB') : '-'}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="xs" onClick={() => { setEditingId(x.id); setForm({ name: x.name }); setShowModal(true) }}>Edit</button>
                        <button className="xs danger" onClick={() => del(x.id)}>Delete</button>
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
              <span className="modal-title">{editingId ? 'Edit Name' : 'Add Colour / Chemical Name'}</span>
              <button className="small" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Name *</label>
              <input value={form.name} onChange={e => setForm({ name: e.target.value })}
                placeholder="Enter colour or chemical name" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') save() }} />
            </div>
            <button className="primary" onClick={save} style={{ width: '100%' }}>✓ Save</button>
          </div>
        </div>
      )}
    </div>
  )
}
