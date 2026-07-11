'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

function fmt(n: number) { return n.toLocaleString('en-IN', { maximumFractionDigits: 0 }) }
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function isSameDay(iso: string, target: string) {
  return iso ? iso.slice(0, 10) === target : false
}

export default function DailyProductionSummaryPage() {
  const [date,    setDate]    = useState(todayISO())
  const [report,  setReport]  = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [copied,  setCopied]  = useState(false)
  const [expanded, setExpanded] = useState<string|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [batchesRes, ordersRes, faultyRes] = await Promise.all([
        fetch('/api/batches?limit=5000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/orders?limit=5000',  { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/faulty',             { cache: 'no-store' }).then(r => r.json()),
      ])

      const batches   = batchesRes.data || []
      const orders    = ordersRes.data  || []
      const allFaulty = faultyRes.data  || []

      const orderMap: Record<string, any> = {}
      for (const o of orders) orderMap[o.id] = o

      // Process throughput — batches marked done on this date
      // We use updated_at as proxy for when a batch was completed
      // (In the future, we can add a completed_at column)
      const doneBatches = batches.filter((b: any) =>
        b.status === 'done' && isSameDay(b.updated_at || b.created_at, date)
      )

      // Group by current_process (the process they were at when done)
      const byProcess: Record<string, any> = {}
      for (const b of doneBatches) {
        const order = orderMap[b.order_id] || {}
        const proc  = b.current_process || 'Unknown'
        if (!byProcess[proc]) byProcess[proc] = { code: proc, name: proc, batchesDone: 0, kgDone: 0, batches: [] }
        const kg = parseFloat(b.kg) || 0
        byProcess[proc].batchesDone++
        byProcess[proc].kgDone += kg
        byProcess[proc].batches.push({
          batchId:    b.batch_id || '-',
          orderNo:    order.order_number || '-',
          party:      order.party || '-',
          kg,
          supervisor: order.supervisors?.name || '-',
        })
      }

      // Supervisor output
      const bySupervisor: Record<string, any> = {}
      for (const b of doneBatches) {
        const order = orderMap[b.order_id] || {}
        const sup   = order.supervisors?.name || 'Unassigned'
        if (!bySupervisor[sup]) bySupervisor[sup] = { name: sup, batchesDone: 0, kgDone: 0, processes: [] }
        const kg = parseFloat(b.kg) || 0
        bySupervisor[sup].batchesDone++
        bySupervisor[sup].kgDone += kg
        const proc = b.current_process || '-'
        if (!bySupervisor[sup].processes.includes(proc)) bySupervisor[sup].processes.push(proc)
      }

      const newOrdersToday = orders.filter((o: any) => isSameDay(o.created_at, date))
      const faultsToday    = allFaulty.filter((f: any) => isSameDay(f.created_at, date))
      const completedToday = orders.filter((o: any) => o.status === 'done' && isSameDay(o.updated_at || o.created_at, date))

      const totalKgDone     = Object.values(byProcess).reduce((s: number, p: any) => s + p.kgDone, 0)
      const totalBatchesDone = doneBatches.length

      setReport({
        dateStr: date,
        totalBatchesDone,
        totalKgDone: Math.round(totalKgDone),
        byProcess: Object.values(byProcess).sort((a: any, b: any) => b.kgDone - a.kgDone),
        bySupervisor: Object.values(bySupervisor).sort((a: any, b: any) => b.kgDone - a.kgDone),
        faultsToday,
        newOrdersToday,
        ordersCompletedToday: completedToday,
      })
    } finally { setLoading(false) }
  }, [date])

  useEffect(() => { load() }, [load])

  const buildWhatsApp = () => {
    if (!report) return ''
    const d = new Date(report.dateStr + 'T00:00:00')
    const dl = d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    const lines = [
      `🏭 *DyeFlow Daily Production Summary*`,
      `📅 ${dl}`,
      ``,
      `📊 *OVERVIEW*`,
      `• Batches completed: *${report.totalBatchesDone}*`,
      `• Total Kg processed: *${fmt(report.totalKgDone)} Kg*`,
      `• New orders received: *${report.newOrdersToday.length}*`,
      `• Orders fully completed: *${report.ordersCompletedToday.length}*`,
      `• Faults raised: *${report.faultsToday.length}*`,
      ``,
    ]
    if (report.byProcess.length > 0) {
      lines.push(`⚙️ *PRODUCTION BY PROCESS*`)
      report.byProcess.forEach((p: any) => lines.push(`• ${p.name}: ${p.batchesDone} batches, ${fmt(p.kgDone)} Kg`))
      lines.push(``)
    }
    if (report.bySupervisor.length > 0) {
      lines.push(`👷 *SUPERVISOR OUTPUT*`)
      report.bySupervisor.forEach((s: any) => lines.push(`• ${s.name}: ${s.batchesDone} batches, ${fmt(s.kgDone)} Kg`))
      lines.push(``)
    }
    if (report.faultsToday.length > 0) {
      lines.push(`⚠️ *FAULTS RAISED*`)
      report.faultsToday.slice(0, 5).forEach((f: any) => lines.push(`• Batch ${f.batch_id} — ${f.faulty_type || 'Defect'} (${f.party || '—'})`))
    }
    lines.push(`\n_Generated by DyeFlow ERP_`)
    return lines.join('\n')
  }

  const wText = buildWhatsApp()

  const copyToClipboard = () => {
    navigator.clipboard.writeText(wText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) })
  }

  const d        = new Date(date + 'T00:00:00')
  const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>📋 Daily Production Summary</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>Live from Supabase · Ready to share</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', border: '1px solid var(--border-medium)', borderRadius: 6,
              background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          <button className="small" onClick={load} disabled={loading}>{loading ? '…' : '⟳'}</button>
          <Link href="/reports"><button className="small">← Reports</button></Link>
        </div>
      </div>

      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', marginBottom: 16 }}>{dateLabel}</div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
      ) : !report || (report.totalBatchesDone === 0 && report.newOrdersToday.length === 0 && report.faultsToday.length === 0) ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No activity recorded for this date</div>
          <div style={{ fontSize: 13 }}>Select a different date or process batches in FMS to record completions.</div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Batches Done',    value: report.totalBatchesDone, color: 'var(--accent)' },
              { label: 'Kg Processed',   value: `${fmt(report.totalKgDone)} Kg`, color: 'var(--success)' },
              { label: 'New Orders',      value: report.newOrdersToday.length },
              { label: 'Orders Finished', value: report.ordersCompletedToday.length, color: 'var(--success)' },
              { label: 'Faults Raised',   value: report.faultsToday.length, color: report.faultsToday.length > 0 ? 'var(--danger)' : undefined },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
                borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: s.color || 'var(--text-primary)', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                  letterSpacing: '0.05em', marginTop: 6 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* By Process */}
          {report.byProcess.length > 0 && (
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
              borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
                paddingBottom: 6, borderBottom: '1px solid var(--border-light)' }}>
                ⚙ Production by Process
              </div>
              {report.byProcess.map((p: any) => (
                <div key={p.code}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                    borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}
                    onClick={() => setExpanded(expanded === p.code ? null : p.code)}>
                    <span style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 8px',
                      borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{p.code}</span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.batchesDone} batch{p.batchesDone !== 1 ? 'es' : ''}</span>
                    <span style={{ fontWeight: 700, color: 'var(--success)', minWidth: 80, textAlign: 'right' }}>{fmt(p.kgDone)} Kg</span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{expanded === p.code ? '▲' : '▼'}</span>
                  </div>
                  {expanded === p.code && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 10px', marginBottom: 4 }}>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>{['Batch ID','Order #','Party','Kg','Supervisor'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10,
                              color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {p.batches.map((b: any) => (
                            <tr key={b.batchId}>
                              <td style={{ padding: '4px 8px', fontWeight: 700, color: 'var(--accent)' }}>{b.batchId}</td>
                              <td style={{ padding: '4px 8px' }}>{b.orderNo}</td>
                              <td style={{ padding: '4px 8px' }}>{b.party}</td>
                              <td style={{ padding: '4px 8px', fontWeight: 600 }}>{b.kg} Kg</td>
                              <td style={{ padding: '4px 8px', color: 'var(--text-secondary)' }}>{b.supervisor}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Supervisors */}
          {report.bySupervisor.length > 0 && (
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
              borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
                paddingBottom: 6, borderBottom: '1px solid var(--border-light)' }}>
                👷 Supervisor Output
              </div>
              {report.bySupervisor.map((s: any) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.processes.join(' · ')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 13 }}>{fmt(s.kgDone)} Kg</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.batchesDone} batch{s.batchesDone !== 1 ? 'es' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Faults */}
          {report.faultsToday.length > 0 && (
            <div style={{ background: 'var(--bg-primary)', border: '2px solid var(--danger)',
              borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                ⚠️ Faults Raised Today
              </div>
              {report.faultsToday.map((f: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--danger)' }}>{f.batch_id}</span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {f.party} · {f.faulty_type || 'Defect'}
                  </span>
                  <Link href="/faulty" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>View →</Link>
                </div>
              ))}
            </div>
          )}

          {/* New orders */}
          {report.newOrdersToday.length > 0 && (
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
              borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                📥 New Orders Today ({report.newOrdersToday.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {report.newOrdersToday.map((o: any) => (
                  <span key={o.id} style={{ background: 'var(--accent-light)', color: 'var(--accent)',
                    padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                    {o.order_number}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* WhatsApp share */}
          <div style={{ background: 'var(--bg-primary)', border: '2px solid var(--success)',
            borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              📱 Share to WhatsApp / Management
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button onClick={copyToClipboard}
                style={{ fontWeight: 700, fontSize: 13, padding: '8px 18px', border: 'none', borderRadius: 7,
                  background: copied ? 'var(--success)' : '#25D366', color: '#fff', cursor: 'pointer' }}>
                {copied ? '✓ Copied!' : '📋 Copy for WhatsApp'}
              </button>
              <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(wText)}`, '_blank')}
                style={{ fontWeight: 600, fontSize: 13, padding: '8px 16px', border: '1px solid #25D366',
                  borderRadius: 7, background: '#fff', color: '#25D366', cursor: 'pointer' }}>
                Open WhatsApp
              </button>
            </div>
            <pre style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)',
              background: 'var(--bg-secondary)', padding: '12px 14px', borderRadius: 8,
              whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto', lineHeight: 1.7 }}>
              {wText}
            </pre>
          </div>
        </>
      )}
    </div>
  )
}
