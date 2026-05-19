'use client'

import { useEffect, useState } from 'react'

export default function MobileSupervisorPage() {
  const [supervisors, setSupervisors] = useState<any[]>([])
  const [selected, setSelected] = useState<string>('')
  const [orders, setOrders] = useState<any[]>([])
  const [tab, setTab] = useState<'inbox' | 'active' | 'done'>('inbox')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  const load = () => {
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return
    const db = JSON.parse(raw)
    const sups = db.supervisors || []
    setSupervisors(sups)
    if (sups.length > 0 && !selected) setSelected(sups[0].name)
    setOrders(db.orders || [])
  }

  const supOrders = orders.filter(o => (o.supervisor || '').toLowerCase() === (selected || '').toLowerCase())
  const inbox  = supOrders.filter(o => o.status === 'assigned')
  const active = supOrders.filter(o => ['splitting', 'in-process'].includes(o.status))
  const done   = supOrders.filter(o => o.status === 'done')

  const tabData = tab === 'inbox' ? inbox : tab === 'active' ? active : done

  const supColors: Record<string, string> = {}
  const palette = ['#185FA5', '#7C3AED', '#059669', '#D97706', '#BE185D', '#0E7490', '#DC2626', '#9333EA']
  supervisors.forEach((s, i) => { supColors[s.name] = palette[i % palette.length] })
  const accentColor = supColors[selected] || '#185FA5'

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9' }}>
      {/* Header */}
      <div style={{ background: accentColor, padding: '16px 16px 0', position: 'sticky', top: 0, zIndex: 50, transition: 'background 0.3s' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Supervisor View</div>

        {/* Supervisor selector */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, WebkitOverflowScrolling: 'touch' }}>
          {supervisors.map(s => (
            <button key={s.name} onClick={() => { setSelected(s.name); setExpanded(null) }} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, background: selected === s.name ? '#fff' : 'rgba(255,255,255,0.2)', color: selected === s.name ? accentColor : '#fff', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
              {s.name}
            </button>
          ))}
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 8, paddingBottom: 12 }}>
          {[
            { key: 'inbox', label: 'Inbox', count: inbox.length },
            { key: 'active', label: 'Active', count: active.length },
            { key: 'done', label: 'Done', count: done.length },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} style={{ flex: 1, padding: '10px 4px', borderRadius: 10, border: 'none', background: tab === t.key ? '#fff' : 'rgba(255,255,255,0.15)', color: tab === t.key ? accentColor : '#fff', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{t.count}</span>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Orders list */}
      {supervisors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👷</div>
          <div>No supervisors configured yet.</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>Go to Setup → Supervisor Master to add supervisors.</div>
        </div>
      ) : tabData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>
            {tab === 'inbox' ? '📬' : tab === 'active' ? '⚙' : '✅'}
          </div>
          <div>No {tab} orders for {selected}.</div>
        </div>
      ) : (
        <div style={{ padding: '10px 12px 8px' }}>
          {tabData.map(o => {
            const isExpanded = expanded === o.id
            const batches = o.splits || []
            const activeBatch = batches.find((b: any) => !b.fmsDone && b.fmsCurrentProcess)
            return (
              <div key={o.id} onClick={() => setExpanded(isExpanded ? null : o.id)} style={{ background: '#fff', borderRadius: 14, marginBottom: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', borderLeft: `4px solid ${accentColor}` }}>
                <div style={{ padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: accentColor }}>{o.orderNumber}</div>
                      <div style={{ fontSize: 13, color: '#64748B', marginTop: 1 }}>{o.party}</div>
                    </div>
                    <span style={{ fontSize: 10, color: '#94A3B8' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 12, color: '#64748B' }}>
                    <div><span style={{ color: '#94A3B8' }}>Article </span>{o.article}</div>
                    <div><span style={{ color: '#94A3B8' }}>Color </span>{o.color}</div>
                    <div><span style={{ color: '#94A3B8' }}>Qty </span><strong style={{ color: '#1A1A18' }}>{o.qtyKg} Kg</strong></div>
                    <div>
                      <span style={{ color: '#94A3B8' }}>Process </span>
                      {activeBatch?.fmsCurrentProcess
                        ? <span style={{ fontWeight: 600, color: accentColor }}>{activeBatch.fmsCurrentProcess}</span>
                        : '—'}
                    </div>
                  </div>

                  {/* Lab/greige checkboxes */}
                  {tab === 'inbox' && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                      {[
                        { field: 'labRecheck', label: '🔬 Lab Recheck' },
                        { field: 'labReceive', label: '📥 Lab Receive' },
                        { field: 'greigeCheck', label: '🧵 Greige Check' },
                      ].map(item => (
                        <label key={item.field} onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={o[item.field] || false}
                            onChange={e => {
                              e.stopPropagation()
                              const raw = localStorage.getItem('dyeflow_db')
                              if (!raw) return
                              const db = JSON.parse(raw)
                              const order = (db.orders || []).find((x: any) => x.id === o.id)
                              if (order) {
                                order[item.field] = e.target.checked
                                localStorage.setItem('dyeflow_db', JSON.stringify(db))
                                load()
                              }
                            }}
                            style={{ width: 'auto', cursor: 'pointer', accentColor: accentColor }}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid #F1F5F9', padding: '12px 14px', background: '#FAFAFA' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12, color: '#64748B', marginBottom: 10 }}>
                      <div><span style={{ color: '#94A3B8' }}>Blend </span>{o.blend || '—'}</div>
                      <div><span style={{ color: '#94A3B8' }}>Machine </span>{o.machine || '—'}</div>
                      <div><span style={{ color: '#94A3B8' }}>Lab No. </span>{o.labNo || '—'}</div>
                      <div><span style={{ color: '#94A3B8' }}>Lot No. </span>{o.lotNo || '—'}</div>
                      {o.remarks && <div style={{ gridColumn: '1/-1' }}><span style={{ color: '#94A3B8' }}>Remarks </span>{o.remarks}</div>}
                    </div>
                    {(o.processRoute || []).length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 6 }}>PROCESS ROUTE</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(o.processRoute || []).map((code: string, idx: number) => {
                            const batchAtCode = batches.find((b: any) => b.fmsCurrentProcess === code)
                            const isDone = batches.every((b: any) => b.fmsActualDates?.[code])
                            return (
                              <span key={code} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', background: isDone ? '#D1FAE5' : batchAtCode ? accentColor : '#E2E8F0', color: isDone ? '#065F46' : batchAtCode ? '#fff' : '#94A3B8', borderRadius: 20 }}>
                                {code}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {batches.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 6 }}>BATCHES</div>
                        {batches.map((b: any) => (
                          <div key={b.batchId} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F1F5F9', fontSize: 12 }}>
                            <span style={{ fontWeight: 600, color: accentColor }}>{b.batchId}</span>
                            <span style={{ color: '#64748B' }}>{b.kg} Kg</span>
                            <span style={{ color: '#94A3B8' }}>{b.fmsCurrentProcess || b.status || '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
