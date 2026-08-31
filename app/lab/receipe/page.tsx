'use client'
// Lab Receipe = approved requests that have a Recipe saved on the Approved
// Lab page (fms_data.recipe — colour/chemical + qty, name from the
// colour_chemicals master list).
import { useEffect, useState, useCallback } from 'react'
import { labApi, StatCard, fmtDateTime } from '../_shared'

export default function LabRecipePage() {
  const [requests, setRequests] = useState<any[]>([])
  const [indents,  setIndents]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reqRes, indRes] = await Promise.all([
        labApi({ type: 'requests' }),
        labApi({ type: 'indents' }),
      ])
      if (reqRes.ok) {
        setRequests((reqRes.data || []).filter((r: any) => r.fms_data?.recipe?.length > 0))
      }
      if (indRes.ok) setIndents(indRes.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const indentById = (id: string) => indents.find(ind => ind.id === id)

  const filtered = search.trim()
    ? requests.filter(r => [r.id, r.party, r.shade_pantone, r.fms_data?.chartNumber,
        ...(r.fms_data?.recipe || []).map((ing: any) => ing.name)]
        .some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
    : requests

  // Only blank the page on the true first load; actions here call load()
  // again afterward, which would otherwise wipe the whole page every time.
  if (loading && requests.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <StatCard label="Recipes"  value={requests.length} color="var(--purple)" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search chart, party, shade, chemical…"
          style={{ width: 260, padding: '6px 10px', fontSize: 12, marginLeft: 'auto',
            border: '1px solid var(--border-medium)', borderRadius: 5,
            background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
        {search && <button className="xs" onClick={() => setSearch('')}>✕</button>}
        <button className="small" onClick={load}>⟳</button>
      </div>
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 14 }}>
            {requests.length === 0
              ? 'No lab recipes yet. Add one on the Approved Lab page.'
              : 'No recipes match your search.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1300, fontSize: 11 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Chart No','Request No','Indent No','Date','Unit','Party','Request Given By','Order Status','Branch',
                  'Shade/Pantone','Fastness','Approved Lab No','Recipe','L*','a*','b*','ΔE','Delivery'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.04em', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const fd = r.fms_data || {}
                return (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontWeight: 800, color: 'var(--accent)', fontSize: 13 }}>{fd.chartNumber || '-'}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.id}</td>
                  <td style={td}>{r.indent_id || '-'}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.confirmed_at || r.created_at)}</td>
                  <td style={td}>{r.unit || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.request_given_by || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.order_status || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.branch || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={td}>{r.fastness_type || '-'}</td>
                  <td style={td}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: 'var(--success)', color: '#fff' }}>{fd.approvedLabNumber || '-'}</span>
                  </td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 160 }}>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {(fd.recipe || []).map((ing: any, idx: number) => (
                        <span key={idx} style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px',
                          borderRadius: 6, background: '#6A1B9A', color: '#fff' }}>
                          {ing.name}{ing.qty ? ` (${ing.qty})` : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={td}>{fd.lValue || '-'}</td>
                  <td style={td}>{fd.aValue || '-'}</td>
                  <td style={td}>{fd.bValue || '-'}</td>
                  <td style={{ ...td, fontWeight: 700, color: parseFloat(fd.deValue) <= 1 ? 'var(--success)' : 'var(--warning)' }}>{fd.deValue || '-'}</td>
                  <td style={td}>{fd.deliveryDate || '-'}</td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const td: React.CSSProperties = { padding: '7px 10px', fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap' }
