'use client'
// Lab Recipe = all confirmed requests with chart numbers (the recipe register)
import { useEffect, useState, useCallback } from 'react'
import { labApi, StatCard, fmtDateTime } from '../_shared'

export default function LabRecipePage() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await labApi({ type: 'requests' })
      if (res.ok) {
        setRequests((res.data || []).filter((r: any) => r.confirmed && r.fms_data?.chartNumber))
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = search.trim()
    ? requests.filter(r => [r.id, r.party, r.shade_pantone, r.fms_data?.chartNumber]
        .some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
    : requests

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <StatCard label="Recipes"  value={requests.length} color="var(--accent)" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search chart, party, shade…"
          style={{ width: 240, padding: '6px 10px', fontSize: 12, marginLeft: 'auto',
            border: '1px solid var(--border-medium)', borderRadius: 5,
            background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
        {search && <button className="xs" onClick={() => setSearch('')}>✕</button>}
        <button className="small" onClick={load}>⟳</button>
      </div>
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 14 }}>
            No lab recipes yet. Fill Chart Number in Lab FMS page.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Chart No','Request No','Date','Unit','Party','Shade/Pantone','Fastness','L*','a*','b*','ΔE','Delivery'].map(h => (
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
                  <td style={{ ...td, fontWeight: 800, color: 'var(--accent)', fontSize: 13 }}>{r.fms_data?.chartNumber}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.id}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.confirmed_at)}</td>
                  <td style={td}>{r.unit || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={td}>{r.fastness_type || '-'}</td>
                  <td style={td}>{r.fms_data?.lValue || '-'}</td>
                  <td style={td}>{r.fms_data?.aValue || '-'}</td>
                  <td style={td}>{r.fms_data?.bValue || '-'}</td>
                  <td style={{ ...td, fontWeight: 700, color: parseFloat(r.fms_data?.deValue) <= 1 ? 'var(--success)' : 'var(--warning)' }}>{r.fms_data?.deValue || '-'}</td>
                  <td style={td}>{r.fms_data?.deliveryDate || '-'}</td>
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
