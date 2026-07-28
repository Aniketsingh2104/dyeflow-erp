'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

interface ChemItem { id: string; name: string; created_at: string }

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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  // ── Save with optimistic update ──────────────────────────────────────────
  const save = async () => {
    if (!form.name.trim()) { alert('Name required.'); return }
    const dup = items.find(x => x.name.toLowerCase() === form.name.trim().toLowerCase() && x.id !== editingId)
    if (dup) { alert('Name already exists.'); return }
    setSaving(true)

    const name = form.name.trim()

    if (editingId) {
      setItems(prev => prev.map(x => x.id === editingId ? { ...x, name } : x))
    } else {
      setItems(prev => [...prev, { id: `tmp-${Date.now()}`, name, created_at: new Date().toISOString() }]
        .sort((a, b) => a.name.localeCompare(b.name)))
    }
    setShowModal(false)
    showToast('✓ Saved')

    try {
      const res  = await fetch('/api/colour-chemicals', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: editingId ? 'update' : 'create', id: editingId || undefined, name }),
      })
      const data = await res.json()
      if (!data.ok) { showToast('⚠ Save failed — refreshing'); load(false) }
      else if (!editingId) load(false) // get real uuid
    } finally { setSaving(false) }
  }

  // ── Delete with optimistic update ────────────────────────────────────────
  const del = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    setItems(prev => prev.filter(x => x.id !== id))
    showToast('✓ Deleted')
    const res  = await fetch('/api/colour-chemicals', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'delete', id }),
    })
    const data = await res.json()
    if (!data.ok) { showToast('⚠ Delete failed — refreshing'); load(false) }
  }

  // ── Excel / CSV import ───────────────────────────────────────────────────
  const processRows = async (rows: any[][]) => {
    // Auto-detect header row
    let start = 0
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      if (/name|colour|color|chemical|id/i.test(String(rows[i]?.[0] || ''))) { start = i + 1; break }
    }

    const existing = new Set(items.map(x => x.name.toLowerCase()))
    const toAdd: string[] = []

    for (let i = start; i < rows.length; i++) {
      // Take first non-empty cell in the row
      const raw = rows[i]?.find((c: any) => c != null && String(c).trim() !== '')
      if (!raw) continue
      const name = String(raw).trim()
      if (!name || existing.has(name.toLowerCase())) continue
      toAdd.push(name)
      existing.add(name.toLowerCase())
    }

    if (!toAdd.length) {
      setImportStatus('⚠ No new names found (all already exist or file empty)')
      setTimeout(() => setImportStatus(''), 4000)
      return
    }

    setImportStatus(`⏳ Saving ${toAdd.length} names to Supabase…`)

    const res  = await fetch('/api/colour-chemicals', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'bulk_insert', names: toAdd }),
    })
    const data = await res.json()

    if (!data.ok) {
      setImportStatus(`❌ Import failed: ${data.error}`)
      setTimeout(() => setImportStatus(''), 5000)
      return
    }

    setImportStatus(`✅ ${data.inserted} names saved to Supabase`)
    setTimeout(() => setImportStatus(''), 5000)
    if (fileRef.current) fileRef.current.value = ''
    load(false) // silent sync
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setImportStatus('📂 Reading file…')
    try {
      let rows: any[][]
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text()
        rows = text.split(/\r?\n/).filter(l => l.trim())
          .map(line => line.split(',').map(c => c.replace(/^"|"$/g, '').trim()))
      } else {
        const buf = await file.arrayBuffer()
        const wb  = XLSX.read(new Uint8Array(buf), { type: 'array', raw: false })
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as any[][]
      }
      await processRows(rows)
    } catch (err: any) {
      setImportStatus(`❌ Error reading file: ${err.message}`)
      setTimeout(() => setImportStatus(''), 5000)
    }
  }

  const filtered = items.filter(x =>
    !search.trim() || x.name.toLowerCase().includes(search.toLowerCase())
  )

  const todayCount = items.filter(x =>
    new Date(x.created_at).toDateString() === new Date().toDateString()
  ).length

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 20, zIndex: 9999, background: toast.startsWith('⚠') ? '#FEF3C7' : '#D1FAE5', border: `1px solid ${toast.startsWith('⚠') ? '#FCD34D' : '#6EE7B7'}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: toast.startsWith('⚠') ? '#92400E' : '#065F46', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {toast}
        </div>
      )}

      {/* Import */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🎨 Import Colour / Chemical Names</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            One name per row, first column. Header row is auto-detected and skipped.<br />
            Saves directly to <strong>colour_chemicals</strong> table in Supabase.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {importStatus && (
            <div style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6, maxWidth: 280, textAlign: 'right',
              background: importStatus.startsWith('✅') ? '#D1FAE5' : importStatus.startsWith('❌') ? '#FEE2E2' : '#EFF6FF',
              color:      importStatus.startsWith('✅') ? '#065F46' : importStatus.startsWith('❌') ? '#991B1B' : '#1E40AF' }}>
              {importStatus}
            </div>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()}
            style={{ background: '#137E43', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            📄 Upload Excel / CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total Names', value: items.length, sub: 'In Supabase colour_chemicals table' },
          { label: 'Added Today', value: todayCount,   sub: 'New names', color: '#137E43' },
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-light)', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Master Register</span>
            <span style={{ fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{items.length} names</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…" style={{ fontSize: 12, padding: '5px 10px', width: 160, border: '1px solid var(--border-medium)', borderRadius: 5 }} />
            <button className="small" onClick={() => load(false)}>↻</button>
            <button onClick={() => { setEditingId(''); setForm({ name: '' }); setShowModal(true) }}
              style={{ background: '#137E43', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Add Name
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                {['#', 'Name', 'Added On', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading from Supabase…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  {search ? `No results for "${search}"` : 'No names yet. Upload Excel or add manually.'}
                </td></tr>
              ) : filtered.map((x, i) => (
                <tr key={x.id} style={{ background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontSize: 11, width: 48 }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13 }}>{x.name}</td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {x.created_at ? new Date(x.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button className="xs" onClick={() => { setEditingId(x.id); setForm({ name: x.name }); setShowModal(true) }} style={{ marginRight: 6 }}>Edit</button>
                    <button className="xs danger" onClick={() => del(x.id, x.name)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-light)', fontSize: 11, color: 'var(--text-tertiary)' }}>
          {filtered.length} of {items.length} names · <strong>colour_chemicals</strong> table · Supabase
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
                placeholder="e.g. Reactive Red 120" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') save() }} />
            </div>
            <button className="primary" onClick={save} disabled={saving} style={{ width: '100%' }}>
              {saving ? '⏳ Saving…' : '✓ Save to Supabase'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
