'use client'
// Requested Unit = pending requests filtered by unit (used by unit-level staff)
import { useEffect, useState, useCallback } from 'react'
import { labApi, labPost, StatCard, fmtDateTime, LAB_UNIT_OPTIONS } from '../_shared'

export default function RequestedUnitPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [unit,     setUnit]     = useState('all')
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await labApi({ type: 'requests' })
      if (res.ok) setRequests((res.data || []).filter((r: any) => !r.confirmed))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = unit !== 'all'
    ? requests.filter(r => r.unit === unit)
    : requests

  const confirm = async (id: string) => {
    setSaving(true)
    try {
      await labPost({ action: 'confirm_request', id })
      showToast('✓ Confirmed')
      load()
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <StatCard label="Pending" value={filtered.length} color="var(--accent)" />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Filter by Unit:</label>
          <select value={unit} onChange={e => setUnit(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border-medium)',
              borderRadius: 5, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <option value="all">All Units</option>
            {LAB_UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <button className="small" onClick={load}>⟳</button>
        </div>
      </div>

      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 14 }}>
            No pending requests {unit !== 'all' ? `for unit ${unit}` : ''}.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Request No','Date','Unit','Party','Shade/Pantone','Fastness','Yarn Design','Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{r.id}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: 'var(--accent-light)', color: 'var(--accent)' }}>
                      {r.unit || '-'}
                    </span>
                  </td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={td}>{r.fastness_type || '-'}</td>
                  <td style={td}>{r.yarn_design || '-'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button className="xs primary" disabled={saving} onClick={() => confirm(r.id)}>Confirm</button>
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

const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--text-primary)' }
