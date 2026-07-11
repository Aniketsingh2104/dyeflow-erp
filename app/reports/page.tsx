'use client'

import { useEffect, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import Link from 'next/link'

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
      borderRadius: 10, padding: '14px 16px',
      borderTop: color ? `3px solid ${color}` : undefined }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: color || 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)',
      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, marginTop: 22,
      paddingBottom: 6, borderBottom: '1px solid var(--border-light)' }}>
      {children}
    </div>
  )
}

type Tab = 'overview' | 'supervisors' | 'machines' | 'faulty' | 'fob'

export default function ReportsPage() {
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<Tab>('overview')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ordersRes, batchesRes, machinesRes, supervisorsRes, faultyRes, fobRes] = await Promise.all([
        fetch('/api/orders?limit=5000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/batches?limit=10000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/machines',  { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/supervisors',{ cache: 'no-store' }).then(r => r.json()),
        fetch('/api/faulty',    { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/fob',       { cache: 'no-store' }).then(r => r.json()),
      ])

      const orders      = ordersRes.data      || []
      const batches     = batchesRes.data     || []
      const machines    = machinesRes.data    || []
      const supervisors = supervisorsRes.data  || []
      const faulty      = faultyRes.data      || []
      const fob         = fobRes.data         || []

      // Build batch map
      const batchMap: Record<string, any[]> = {}
      for (const b of batches) {
        if (!batchMap[b.order_id]) batchMap[b.order_id] = []
        batchMap[b.order_id].push(b)
      }

      // Status groups
      const byStatus: Record<string, number> = {}
      orders.forEach((o: any) => { byStatus[o.status || 'new'] = (byStatus[o.status || 'new'] || 0) + 1 })

      // Kg stats
      const totalKgOrdered   = orders.reduce((s: number, o: any) => s + (parseFloat(o.qty_kg) || 0), 0)
      const totalKgDone      = orders.filter((o: any) => o.status === 'done').reduce((s: number, o: any) => s + (parseFloat(o.qty_kg) || 0), 0)
      const totalKgInProcess = orders.filter((o: any) => ['in-process','splitting','assigned'].includes(o.status))
                                      .reduce((s: number, o: any) => s + (parseFloat(o.qty_kg) || 0), 0)

      // Batch stats
      const activeBatches = batches.filter((b: any) => b.status === 'in-process').length
      const doneBatches   = batches.filter((b: any) => b.status === 'done').length

      // Today
      const todayStr = new Date().toDateString()
      const ordersToday     = orders.filter((o: any) => new Date(o.created_at).toDateString() === todayStr).length
      const ordersThisWeek  = orders.filter((o: any) => {
        const d = new Date(o.created_at)
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
        return d >= weekAgo
      }).length
      const ordersThisMonth = orders.filter((o: any) => {
        const d = new Date(o.created_at)
        const now = new Date()
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      }).length

      // Machine loads
      const machineStats = machines.map((m: any) => {
        const mBatches = batches.filter((b: any) => {
          const machine = b.machines?.name || b.machine_id
          return machine === m.name || machine === m.id
        })
        const activeMBatches = mBatches.filter((b: any) => b.status !== 'done')
        const loadedKg = activeMBatches.reduce((s: number, b: any) => s + (parseFloat(b.kg) || 0), 0)
        const loadPct  = m.capacity ? Math.min(100, Math.round((loadedKg / m.capacity) * 100)) : 0
        return { ...m, loadedKg: Math.round(loadedKg), loadPct, activeBatches: activeMBatches.length }
      })

      // Supervisor stats
      const supervisorStats = supervisors.map((s: any) => {
        const sOrders = orders.filter((o: any) => o.supervisor_id === s.id || o.supervisors?.name === s.name)
        return {
          ...s,
          inbox:  sOrders.filter((o: any) => ['new','pending','assigned'].includes(o.status)).length,
          active: sOrders.filter((o: any) => ['in-process','splitting'].includes(o.status)).length,
          done:   sOrders.filter((o: any) => o.status === 'done').length,
          total:  sOrders.length,
        }
      }).sort((a: any, b: any) => b.total - a.total)

      // Faulty by process
      const faultyByProcess: Record<string, number> = {}
      faulty.forEach((r: any) => {
        const key = r.process_code || r.faulty_type || 'Unknown'
        faultyByProcess[key] = (faultyByProcess[key] || 0) + 1
      })

      // FOB by type
      const fobOpen     = fob.filter((r: any) => r.status === 'open')
      const fobDyeing   = fob.filter((r: any) => r.fob_type === 'dyeing').length
      const fobRolling  = fob.filter((r: any) => r.fob_type === 'rolling').length

      setData({
        totalOrders: orders.length, ordersToday, ordersThisWeek, ordersThisMonth,
        byStatus,
        totalKgOrdered: Math.round(totalKgOrdered),
        totalKgDone:    Math.round(totalKgDone),
        totalKgInProcess: Math.round(totalKgInProcess),
        totalBatches: batches.length, activeBatches, doneBatches,
        machines: machineStats,
        supervisors: supervisorStats,
        totalFaulty: faulty.length,
        faultyOpen: faulty.filter((r: any) => r.status === 'open').length,
        faultyByProcess,
        totalFob: fob.length, fobOpen: fobOpen.length, fobDyeing, fobRolling,
        // Raw for export
        _orders: orders, _batches: batches, _faulty: faulty, _fob: fob,
      })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const exportToExcel = () => {
    if (!data) return
    const wb   = XLSX.utils.book_new()
    const date = new Date().toLocaleDateString('en-GB').replace(/\//g, '-')

    // Orders
    const oh = ['Order #','Party','Article','Color','Qty Kg','Status','Supervisor','Created']
    const or = data._orders.map((o: any) => [
      o.order_number, o.party, o.article, o.color, o.qty_kg, o.status,
      o.supervisors?.name || '-', new Date(o.created_at).toLocaleDateString('en-GB'),
    ])
    const wo = XLSX.utils.aoa_to_sheet([oh, ...or])
    XLSX.utils.book_append_sheet(wb, wo, 'Orders')

    // Summary
    const ws = XLSX.utils.aoa_to_sheet([
      ['DyeFlow ERP — Report'],
      ['Generated:', new Date().toLocaleString('en-GB')],
      [''],
      ['Total Orders', data.totalOrders],
      ['Total Kg Ordered', data.totalKgOrdered],
      ['Kg Done', data.totalKgDone],
      ['Kg In Process', data.totalKgInProcess],
      ['Total Batches', data.totalBatches],
      ['Open Faulty', data.faultyOpen],
      ['Open FOB', data.fobOpen],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Summary')

    XLSX.writeFile(wb, `DyeFlow-Report-${date}.xlsx`)
  }

  const tabStyle = (t: Tab) => ({
    padding: '7px 16px', fontSize: 13, fontWeight: tab === t ? 600 : 400,
    border: 'none', borderRadius: 6, cursor: 'pointer',
    background: tab === t ? 'var(--accent)' : 'var(--bg-secondary)',
    color: tab === t ? '#fff' : 'var(--text-secondary)',
  })

  const statusColors: Record<string, string> = {
    new: '#EF9F27', pending: '#EF9F27', assigned: '#185FA5', splitting: '#3C3489',
    'in-process': '#185FA5', done: '#1D9E75', hold: '#A32D2D'
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading reports…
    </div>
  )

  if (!data) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)', fontSize: 14 }}>
      No data yet.
    </div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Reports & Analytics</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/reports/daily"><button className="small">📋 Daily Report</button></Link>
          <button className="small" onClick={load}>⟳ Refresh</button>
          <button className="small" style={{ background: 'var(--success)', color: '#fff', border: 'none', fontWeight: 600 }}
            onClick={exportToExcel}>⬇ Export xlsx</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['overview','supervisors','machines','faulty','fob'] as Tab[]).map(t => (
          <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>
            {{ overview: '📊 Overview', supervisors: '👷 Supervisors',
               machines: '⚙ Machines', faulty: '⚠ Faulty', fob: '📦 FOB' }[t]}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ────────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          <SectionTitle>Orders</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 4 }}>
            <StatCard label="Total Orders"  value={data.totalOrders} />
            <StatCard label="Today"         value={data.ordersToday}     color="#185FA5" />
            <StatCard label="This Week"     value={data.ordersThisWeek}  color="#3C3489" />
            <StatCard label="This Month"    value={data.ordersThisMonth} color="#1D9E75" />
          </div>

          <SectionTitle>Status Breakdown</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 4 }}>
            {['new','pending','assigned','in-process','done','hold'].map(s => (
              <StatCard key={s} label={s.replace('-',' ')} value={data.byStatus[s] || 0} color={statusColors[s]} />
            ))}
          </div>

          <SectionTitle>Production</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 4 }}>
            <StatCard label="Total Kg Ordered"  value={`${data.totalKgOrdered.toLocaleString()} Kg`} />
            <StatCard label="Kg In Process"     value={`${data.totalKgInProcess.toLocaleString()} Kg`} color="#185FA5" />
            <StatCard label="Kg Completed"      value={`${data.totalKgDone.toLocaleString()} Kg`}      color="#1D9E75" />
          </div>

          <SectionTitle>Batches</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            <StatCard label="Total Batches"  value={data.totalBatches} />
            <StatCard label="Active Batches" value={data.activeBatches} color="#185FA5" />
            <StatCard label="Done Batches"   value={data.doneBatches}   color="#1D9E75" />
          </div>

          {data.totalKgOrdered > 0 && (
            <div style={{ marginTop: 16, background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
                fontWeight: 600, marginBottom: 8 }}>
                <span>Overall Completion</span>
                <span style={{ color: 'var(--accent)' }}>
                  {Math.round((data.totalKgDone / data.totalKgOrdered) * 100)}%
                </span>
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, height: 10, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Math.round((data.totalKgDone / data.totalKgOrdered) * 100))}%`,
                  height: '100%', background: 'var(--accent)', borderRadius: 20 }} />
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SUPERVISORS ─────────────────────────────────────────────────────── */}
      {tab === 'supervisors' && (
        <>
          <SectionTitle>Supervisor Workload</SectionTitle>
          {data.supervisors.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
              No supervisors. Go to Setup → Supervisor Master.
            </div>
          ) : (
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
              borderRadius: 10, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--bg-secondary)' }}>
                  <tr>
                    {['Supervisor','Inbox','Active','Done','Total','Workload'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10,
                        fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                        letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.supervisors.map((sup: any, i: number) => (
                    <tr key={sup.id || i} style={{
                      background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                      borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{sup.name}</td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                          background: 'var(--warning-light)', color: 'var(--warning)' }}>{sup.inbox}</span>
                      </td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                          background: 'var(--accent-light)', color: 'var(--accent)' }}>{sup.active}</span>
                      </td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                          background: 'var(--success-light)', color: 'var(--success)' }}>{sup.done}</span>
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{sup.total}</td>
                      <td style={td}>
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, height: 6, overflow: 'hidden', minWidth: 80 }}>
                          <div style={{ width: `${sup.total > 0 ? Math.round((sup.done / sup.total) * 100) : 0}%`,
                            height: '100%', background: 'var(--accent)', borderRadius: 20 }} />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {sup.total > 0 ? Math.round((sup.done / sup.total) * 100) : 0}%
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── MACHINES ────────────────────────────────────────────────────────── */}
      {tab === 'machines' && (
        <>
          <SectionTitle>Machine Utilization</SectionTitle>
          {data.machines.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
              No machines. Go to Setup → Machine Master.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 12 }}>
              {data.machines.map((m: any) => (
                <div key={m.id} style={{ background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                      background: m.status === 'running' ? 'var(--success-light)' : 'var(--bg-secondary)',
                      color: m.status === 'running' ? 'var(--success)' : 'var(--text-tertiary)' }}>
                      {m.status || 'idle'}
                    </span>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, height: 8, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ width: `${m.loadPct}%`, height: '100%', borderRadius: 20,
                      background: m.loadPct > 80 ? 'var(--danger)' : m.loadPct > 50 ? 'var(--warning)' : 'var(--success)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)' }}>
                    <span>{m.loadedKg} / {m.capacity} Kg</span>
                    <span style={{ fontWeight: 600, color: m.loadPct > 80 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                      {m.loadPct}% · {m.activeBatches} batches
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── FAULTY ──────────────────────────────────────────────────────────── */}
      {tab === 'faulty' && (
        <>
          <SectionTitle>Faulty Summary</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            <StatCard label="Total Faulty" value={data.totalFaulty} />
            <StatCard label="Open"         value={data.faultyOpen}               color={data.faultyOpen > 0 ? 'var(--danger)' : undefined} />
            <StatCard label="Resolved"     value={data.totalFaulty - data.faultyOpen} color="var(--success)" />
          </div>
          {Object.keys(data.faultyByProcess).length > 0 && (
            <>
              <SectionTitle>By Process / Type</SectionTitle>
              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
                borderRadius: 10, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--bg-secondary)' }}>
                    <tr>
                      {['Process / Type','Count','Share'].map(h => (
                        <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10,
                          fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                          letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.faultyByProcess)
                      .sort(([,a],[,b]) => (b as number) - (a as number))
                      .map(([key, count], i) => (
                        <tr key={key} style={{
                          background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                          borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ ...td, fontWeight: 500 }}>{key}</td>
                          <td style={td}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                              background: 'var(--danger-light)', color: 'var(--danger)' }}>{count as number}</span>
                          </td>
                          <td style={{ ...td, fontSize: 11 }}>
                            {Math.round((count as number) / data.totalFaulty * 100)}%
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ── FOB ─────────────────────────────────────────────────────────────── */}
      {tab === 'fob' && (
        <>
          <SectionTitle>FOB Summary</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            <StatCard label="Total FOB"    value={data.totalFob}  />
            <StatCard label="Open"         value={data.fobOpen}   color={data.fobOpen > 0 ? 'var(--danger)' : undefined} />
            <StatCard label="Dyeing FOB"   value={data.fobDyeing}  color="var(--accent)" />
            <StatCard label="Rolling FOB"  value={data.fobRolling} color="var(--purple)" />
          </div>
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Link href="/fob"><button className="primary">View All FOB Records →</button></Link>
          </div>
        </>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '10px 14px', fontSize: 12, color: 'var(--text-primary)' }
