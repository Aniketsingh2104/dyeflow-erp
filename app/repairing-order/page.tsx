'use client'

import { useEffect, useState, useCallback } from 'react'

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

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  Low:      { bg: 'var(--success-light)',  color: 'var(--success)'  },
  Medium:   { bg: 'var(--warning-light)',  color: 'var(--warning)'  },
  High:     { bg: 'var(--danger-light)',   color: 'var(--danger)'   },
  Critical: { bg: '#1C0518',              color: '#F472B6'         },
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:    { bg: 'var(--warning-light)',  color: 'var(--warning)'  },
  'In Repair':{ bg: 'var(--accent-light)',   color: 'var(--accent)'   },
  completed:  { bg: 'var(--success-light)',  color: 'var(--success)'  },
  rejected:   { bg: 'var(--danger-light)',   color: 'var(--danger)'   },
}

export default function RepairingOrderPage() {
  const [records,     setRecords]     = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search,      setSearch]      = useState('')
  const [toast,       setToast]       = useState('')
  const [editModal,   setEditModal]   = useState<any>(null)
  const [editData,    setEditData]    = useState<any>({})
  const [saving,      setSaving]      = useState(false)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api('/api/repairing-orders')
      if (res.ok) setRecords(res.data || [])
    } finally { setLoading(false) }
  }, [])

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
      return [r.order_number, r.party, r.batch_id]
        .some(v => String(v ?? '').toLowerCase().includes(q))
    }
    return true
  })

  const handleUpdate = async () => {
    if (!editModal) return
    setSaving(true)
    try {
      const res = await api('/api/repairing-orders', { action: 'update', id: editModal.id, ...editData })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Updated')
      setEditModal(null); load()
    } finally { setSaving(false) }
  }

  const stats = {
    total:     records.length,
    pending:   records.filter(r => r.status === 'pending').length,
    inRepair:  records.filter(r => r.status === 'In Repair').length,
    completed: records.filter(r => r.status === 'completed').length,
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading repairing orders…
    </div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total',      value: stats.total,     color: 'var(--text-primary)' },
          { label: 'Pending',    value: stats.pending,   color: 'var(--warning)' },
          { label: 'In Repair',  value: stats.inRepair,  color: 'var(--accent)' },
          { label: 'Completed',  value: stats.completed, color: 'var(--success)' },
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
          placeholder="Search order, batch, party…"
          style={{ width: 240, padding: '6px 10px', fontSize: 12,
            border: '1px solid var(--border-medium)', borderRadius: 5,
            background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
        {['all','pending','In Repair','completed','rejected'].map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
              border: 'none', fontWeight: statusFilter === f ? 700 : 400,
              background: statusFilter === f ? 'var(--accent)' : 'var(--bg-secondary)',
              color: statusFilter === f ? '#fff' : 'var(--text-secondary)' }}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button className="small" onClick={load} style={{ marginLeft: 'auto' }}>⟳ Refresh</button>
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
          {records.length === 0 ? 'No repairing orders yet.' : 'No records match your filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((r, i) => {
            const sc = STATUS_COLORS[r.status]   || STATUS_COLORS.pending
            return (
              <div key={r.id || i} style={{ background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px',
                borderLeft: `4px solid ${r.status === 'completed' ? 'var(--success)' : r.status === 'rejected' ? 'var(--danger)' : 'var(--accent)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                      {r.order_number || r.id?.slice(-8) || '-'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                      {r.party || '-'}
                    </span>
                    {r.batch_id && (
                      <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 8,
                        padding: '2px 7px', background: 'var(--accent-light)',
                        color: 'var(--accent)', borderRadius: 4 }}>
                        {r.batch_id}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: sc.bg, color: sc.color }}>{r.status}</span>
                    <button className="xs" onClick={() => {
                      setEditModal(r)
                      setEditData({ status: r.status, notes: r.notes || '', repair_kg: r.repair_kg })
                    }}>Edit</button>
                  </div>
                </div>
                <div style={{ display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))',
                  gap: '4px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <div><span style={{ color: 'var(--text-tertiary)' }}>Repair Kg </span><strong style={{ color: 'var(--text-primary)' }}>{r.repair_kg || '-'}</strong></div>
                  <div><span style={{ color: 'var(--text-tertiary)' }}>Process </span>{(r.process_route || []).join(' → ') || '-'}</div>
                  <div><span style={{ color: 'var(--text-tertiary)' }}>Machine </span>{r.machines?.name || '-'}</div>
                  <div><span style={{ color: 'var(--text-tertiary)' }}>Created </span>{fmtDate(r.created_at)}</div>
                  {r.notes && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text-tertiary)' }}>Notes </span>{r.notes}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit modal */}
      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Update Repairing Order</span>
              <button className="small" onClick={() => setEditModal(null)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Status</label>
              <select value={editData.status}
                onChange={e => setEditData((p: any) => ({ ...p, status: e.target.value }))}>
                <option value="pending">Pending</option>
                <option value="In Repair">In Repair</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Repair Kg</label>
              <input type="number" value={editData.repair_kg || ''}
                onChange={e => setEditData((p: any) => ({ ...p, repair_kg: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Notes</label>
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
