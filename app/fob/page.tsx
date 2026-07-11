'use client'

import { useEffect, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'

async function api(path: string, body?: any) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  return res.json()
}

function fmtDate(d: any) {
  if (!d) return '-'
  try { return new Date(d).toLocaleDateString('en-GB') } catch { return String(d) }
}

export default function FobPage() {
  const [records,    setRecords]    = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState<'all'|'dyeing'|'rolling'>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [toast,      setToast]      = useState('')
  const [editModal,  setEditModal]  = useState<any>(null)
  const [editData,   setEditData]   = useState<any>({})
  const [saving,     setSaving]     = useState(false)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = typeFilter !== 'all' ? `/api/fob?type=${typeFilter}` : '/api/fob'
      const res = await api(url)
      if (res.ok) setRecords(res.data || [])
    } finally { setLoading(false) }
  }, [typeFilter])

  useEffect(() => {
    load()
    const h = () => load()
    window.addEventListener('dyeflow-db-updated', h)
    return () => window.removeEventListener('dyeflow-db-updated', h)
  }, [load])

  const filtered = records.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return [r.order_number, r.party, r.batch_id, r.color, r.fob_type]
        .some(v => String(v ?? '').toLowerCase().includes(q))
    }
    return true
  })

  const handleUpdate = async () => {
    if (!editModal) return
    setSaving(true)
    try {
      const res = await api('/api/fob', { action: 'update', id: editModal.id, ...editData })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Record updated')
      setEditModal(null)
      load()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this FOB record?')) return
    const res = await api('/api/fob', { action: 'delete', id })
    if (!res.ok) { alert('Error: ' + res.error); return }
    showToast('✓ Record deleted')
    load()
  }

  const exportXLSX = () => {
    const rows = filtered.map(r => ({
      'Type':      r.fob_type,
      'Batch ID':  r.batch_id,
      'Order #':   r.order_number,
      'Party':     r.party,
      'Color':     r.color,
      'FOB Kg':    r.fob_kg,
      'Process':   r.process_code,
      'Status':    r.status,
      'Notes':     r.notes,
      'Date':      fmtDate(r.created_at),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'FOB Records')
    XLSX.writeFile(wb, `fob_records_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const stats = {
    total:   records.length,
    dyeing:  records.filter(r => r.fob_type === 'dyeing').length,
    rolling: records.filter(r => r.fob_type === 'rolling').length,
    open:    records.filter(r => r.status === 'open').length,
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading FOB records…
    </div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total',   value: stats.total,   color: 'var(--text-primary)' },
          { label: 'Dyeing',  value: stats.dyeing,  color: 'var(--accent)' },
          { label: 'Rolling', value: stats.rolling, color: 'var(--purple)' },
          { label: 'Open',    value: stats.open,    color: 'var(--danger)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search batch, order, party…"
          style={{ width: 240, padding: '6px 10px', fontSize: 12,
            border: '1px solid var(--border-medium)', borderRadius: 5,
            background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
        {(['all','dyeing','rolling'] as const).map(f => (
          <button key={f} onClick={() => setTypeFilter(f)}
            style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
              border: 'none', fontWeight: typeFilter === f ? 700 : 400,
              background: typeFilter === f ? 'var(--accent)' : 'var(--bg-secondary)',
              color: typeFilter === f ? '#fff' : 'var(--text-secondary)' }}>
            {f === 'all' ? 'All Types' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        {(['all','open'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
              border: 'none', fontWeight: statusFilter === f ? 700 : 400,
              background: statusFilter === f ? 'var(--danger)' : 'var(--bg-secondary)',
              color: statusFilter === f ? '#fff' : 'var(--text-secondary)' }}>
            {f === 'all' ? 'All Status' : 'Open'}
          </button>
        ))}
        <button className="small" onClick={exportXLSX} style={{ marginLeft: 'auto' }}>📥 Export</button>
        <button className="small" onClick={load}>⟳</button>
      </div>

      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)', fontSize: 14 }}>
          {records.length === 0 ? 'No FOB records yet.' : 'No records match your filters.'}
        </div>
      ) : (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
          borderRadius: 10, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                {['Date','Type','Batch ID','Order #','Party','Color','FOB Kg','Process','Status','Notes','Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)',
                    whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id || i} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDate(r.created_at)}</td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: r.fob_type === 'dyeing' ? 'var(--accent-light)' : 'var(--purple-light)',
                      color: r.fob_type === 'dyeing' ? 'var(--accent)' : 'var(--purple)' }}>
                      {r.fob_type}
                    </span>
                  </td>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{r.batch_id || '-'}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.order_number || '-'}</td>
                  <td style={td}>{r.party || '-'}</td>
                  <td style={td}>{r.color || '-'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{r.fob_kg || '-'}</td>
                  <td style={td}>{r.process_code || '-'}</td>
                  <td style={td}>
                    <span style={{ padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: r.status === 'open' ? 'var(--danger-light)' : 'var(--success-light)',
                      color: r.status === 'open' ? 'var(--danger)' : 'var(--success)' }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ ...td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}
                    title={r.notes || ''}>{r.notes || '-'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button className="xs" onClick={() => { setEditModal(r); setEditData({ status: r.status, notes: r.notes || '' }) }}>Edit</button>
                    <button className="xs danger" style={{ marginLeft: 4 }} onClick={() => handleDelete(r.id)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Edit FOB Record — {editModal.batch_id}</span>
              <button className="small" onClick={() => setEditModal(null)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Status</label>
              <select value={editData.status}
                onChange={e => setEditData((p: any) => ({ ...p, status: e.target.value }))}>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Notes / Resolution</label>
              <textarea value={editData.notes} rows={3}
                onChange={e => setEditData((p: any) => ({ ...p, notes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={handleUpdate} disabled={saving}>
                {saving ? 'Saving…' : '✓ Save'}
              </button>
              <button onClick={() => setEditModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--text-primary)' }
