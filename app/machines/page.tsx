'use client'

import { useEffect, useState, useCallback } from 'react'
import { getMachines, getBatches, getOrders, markProcessDone } from '@/lib/db'

const BUILTIN_SHADE_RULES = [
  { keyword: 'white',   shadeGroup: 'White'  },
  { keyword: 'bleach',  shadeGroup: 'White'  },
  { keyword: 'optical', shadeGroup: 'White'  },
  { keyword: 'light',   shadeGroup: 'Light'  },
  { keyword: 'pale',    shadeGroup: 'Light'  },
  { keyword: 'cream',   shadeGroup: 'Light'  },
  { keyword: 'beige',   shadeGroup: 'Light'  },
  { keyword: 'pastel',  shadeGroup: 'Light'  },
  { keyword: 'dark',    shadeGroup: 'Dark'   },
  { keyword: 'black',   shadeGroup: 'Dark'   },
  { keyword: 'navy',    shadeGroup: 'Dark'   },
  { keyword: 'deep',    shadeGroup: 'Dark'   },
  { keyword: 'medium',  shadeGroup: 'Medium' },
  { keyword: 'normal',  shadeGroup: 'Medium' },
]

function getShadeType(color: string): string {
  const c = (color || '').toLowerCase()
  for (const rule of BUILTIN_SHADE_RULES) {
    if (c.includes(rule.keyword)) return rule.shadeGroup
  }
  return 'Medium'
}

function getShadeOrder(color: string): number {
  const map: Record<string, number> = { White: 1, Light: 2, Medium: 3, Dark: 4 }
  return map[getShadeType(color)] || 3
}

export default function MachinesPage() {
  const [machines,     setMachines]     = useState<any[]>([])
  const [machineData,  setMachineData]  = useState<Record<string, any>>({})
  const [loading,      setLoading]      = useState(true)
  const [toast,        setToast]        = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [machRes, batchRes, orderRes] = await Promise.all([
        getMachines(),
        getBatches(),
        getOrders({ limit: 1000 }),
      ])

      const machList: any[] = machRes.data  || []
      const batchList: any[] = batchRes.data || []
      const orderList: any[] = orderRes.data || []

      // Build order lookup
      const orderMap: Record<string, any> = {}
      for (const o of orderList) orderMap[o.id] = o

      // Enrich batches with order info
      const enriched = batchList.map(b => ({
        ...b,
        orderNo:      orderMap[b.order_id]?.order_number || '-',
        party:        orderMap[b.order_id]?.party        || '-',
        article:      orderMap[b.order_id]?.article      || '-',
        color:        orderMap[b.order_id]?.color        || '-',
        blend:        orderMap[b.order_id]?.blend        || '',
        processRoute: orderMap[b.order_id]?.process_route || [],
      }))

      // Build per-machine data
      const data: Record<string, any> = {}
      for (const mach of machList) {
        const mb = enriched
          .filter(b => b.machine_id === mach.id)
          .sort((a, b) => getShadeOrder(a.color) - getShadeOrder(b.color))

        // Group by shade
        const grouped: Record<string, any[]> = {}
        for (const b of mb) {
          const st = getShadeType(b.color)
          if (!grouped[st]) grouped[st] = []
          grouped[st].push(b)
        }

        const activeKg = mb
          .filter(b => b.status !== 'done')
          .reduce((s, b) => s + (parseFloat(b.kg) || 0), 0)

        data[mach.id] = { batches: mb, grouped, totalBatches: mb.length, activeKg }
      }

      setMachines(machList)
      setMachineData(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const h = () => loadData()
    window.addEventListener('dyeflow-db-updated', h)
    return () => window.removeEventListener('dyeflow-db-updated', h)
  }, [loadData])

  const handleMarkDone = async (batch: any) => {
    const curCode = batch.current_process
    const route: string[] = batch.processRoute || []
    const idx  = route.indexOf(curCode)
    const next = idx >= 0 ? route[idx + 1] : undefined
    if (!confirm(`Mark ${batch.batch_id} done in ${curCode || '?'}?`)) return
    const { error } = await markProcessDone(batch.id, curCode, next)
    if (error) { alert('Error: ' + error); return }
    showToast(`✓ ${batch.batch_id} ${next ? '→ ' + next : 'complete'}`)
    loadData()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading machines…
    </div>
  )

  if (machines.length === 0) return (
    <div className="content" style={{ padding: 20 }}>
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🏭</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No Machines Configured</div>
        <div style={{ fontSize: 12, marginBottom: 20 }}>Add machines in Setup → Machine Master.</div>
        <button className="primary" onClick={() => window.location.href = '/setup/machine-master'}>
          Go to Machine Master →
        </button>
      </div>
    </div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '10px 14px',
          marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {machines.map(mach => {
        const { batches, grouped, totalBatches, activeKg } = machineData[mach.id] || { batches: [], grouped: {}, totalBatches: 0, activeKg: 0 }
        const loadPct = mach.capacity ? Math.min(100, Math.round((activeKg / mach.capacity) * 100)) : 0

        return (
          <div key={mach.id} style={{ background: 'var(--bg-primary)',
            border: '1px solid var(--border-light)', borderRadius: 10,
            marginBottom: 20, overflow: 'hidden' }}>

            {/* Machine header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--bg-secondary)' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {mach.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Capacity: {mach.capacity} Kg · {totalBatches} batch{totalBatches !== 1 ? 'es' : ''}
                  · {Math.round(activeKg)} Kg active ({loadPct}% loaded)
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Load bar */}
                <div style={{ width: 80, height: 8, background: 'var(--border-light)',
                  borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4,
                    width: `${loadPct}%`,
                    background: loadPct > 80 ? 'var(--danger)' : loadPct > 50 ? 'var(--warning)' : 'var(--success)',
                    transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                  background: mach.status === 'running' ? 'var(--success-light)' : 'var(--bg-secondary)',
                  color:      mach.status === 'running' ? 'var(--success)'       : 'var(--text-tertiary)' }}>
                  {mach.status === 'running' ? 'Running' : 'Idle'}
                </span>
              </div>
            </div>

            {batches.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                No batches assigned to this machine
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                {Object.entries(grouped).map(([shade, shadeBatches]: [string, any]) => (
                  <div key={shade}>
                    <div style={{ padding: '6px 16px', background: 'var(--bg-secondary)',
                      fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      borderBottom: '1px solid var(--border-light)' }}>
                      {shade} shades
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-secondary)' }}>
                          {['Batch ID','Order #','Party','Color','Article','Kg','Process','Status','Actions'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left',
                              fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
                              textTransform: 'uppercase', letterSpacing: '0.05em',
                              borderBottom: '1px solid var(--border-light)',
                              borderRight: '1px solid var(--border-light)',
                              whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(shadeBatches as any[]).map((b: any, i: number) => (
                          <tr key={b.id || i} style={{
                            background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                            borderBottom: '1px solid var(--border-light)' }}>
                            <td style={td}><span style={{ fontWeight: 700, color: 'var(--accent)' }}>{b.batch_id}</span></td>
                            <td style={td}>{b.orderNo}</td>
                            <td style={td}>{b.party}</td>
                            <td style={td}>{b.color}</td>
                            <td style={{ ...td, fontWeight: 500 }}>{b.article}</td>
                            <td style={{ ...td, fontWeight: 600 }}>{b.kg}</td>
                            <td style={td}>
                              {b.current_process ? (
                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px',
                                  borderRadius: 4, background: 'var(--accent)', color: '#fff' }}>
                                  {b.current_process}
                                </span>
                              ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                            </td>
                            <td style={td}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px',
                                borderRadius: 4,
                                background: b.status === 'done'       ? 'var(--success-light)' :
                                            b.status === 'in-process' ? 'var(--accent-light)'  : 'var(--bg-secondary)',
                                color:      b.status === 'done'       ? 'var(--success)'       :
                                            b.status === 'in-process' ? 'var(--accent)'        : 'var(--text-tertiary)' }}>
                                {b.status || 'pending'}
                              </span>
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              {b.current_process && (
                                <button className="xs"
                                  onClick={() => window.location.href = `/fms/${b.current_process}`}>
                                  FMS →
                                </button>
                              )}
                              {b.status !== 'done' && b.current_process && (
                                <button className="xs" style={{ marginLeft: 4, background: 'var(--success)',
                                  color: '#fff', border: 'none', cursor: 'pointer' }}
                                  onClick={() => handleMarkDone(b)}>
                                  ✓ Done
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const td: React.CSSProperties = {
  padding: '10px 12px', fontSize: 12, color: 'var(--text-primary)',
  borderRight: '1px solid var(--border-light)', whiteSpace: 'nowrap',
}
