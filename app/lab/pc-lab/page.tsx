'use client'
// PC Lab = pending requests from PC unit
import { useEffect, useState, useCallback } from 'react'
import { labApi, labPost, StatCard, fmtDateTime } from '../_shared'

export default function PcLabPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState('')
  const [saving,   setSaving]   = useState(false)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await labApi({ type: 'requests' })
      if (res.ok) {
        // PC Lab = requests where unit is PC-related or all non-confirmed
        setRequests((res.data || []).filter((r: any) => !r.confirmed))
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const confirm = async (id: string) => {
    if (!confirm('Confirm to move to FMS?')) return
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
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <StatCard label="PC Lab Requests" value={requests.length} color="var(--accent)" />
      </div>

      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'auto' }}>
        {requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--success)', fontSize: 14 }}>
            ✓ All PC lab requests confirmed.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Request No','Indent No','Date','Unit','Party','Shade/Pantone','Fastness','Remark','Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{r.id}</td>
                  <td style={td}>{r.indent_id || '-'}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={td}>{r.unit || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={td}>{r.fastness_type || '-'}</td>
                  <td style={td}>{r.other_remark || '-'}</td>
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
