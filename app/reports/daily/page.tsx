'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 0) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: dec })
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSameDay(iso: string, target: string) {
  if (!iso) return false
  return iso.slice(0, 10) === target
}

// ─── Build report from localStorage ──────────────────────────────────────────

function buildDailyReport(dateStr: string) {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return null
  const db = JSON.parse(raw)

  const orders: any[]      = db.orders       || []
  const processList: any[] = db.processList  || []
  const faultyRecords: any[] = db.faultyRecords || []
  const supervisorDefs: any[] = db.supervisors || []

  // ── Batches completed TODAY by process ────────────────────────────────────
  interface ProcessStat {
    code: string
    name: string
    batchesDone: number
    kgDone: number
    batches: { batchId: string; orderNo: string; party: string; kg: number; supervisor: string }[]
  }
  const byProcess: Record<string, ProcessStat> = {}

  // Build process name map
  const procName: Record<string, string> = {}
  processList.forEach((p: any) => { procName[p.code] = p.name })

  let totalBatchesDone = 0
  let totalKgDone      = 0

  for (const order of orders) {
    for (const batch of (order.splits || [])) {
      if (!batch.fmsActualDates) continue
      for (const [code, dateVal] of Object.entries(batch.fmsActualDates as Record<string, string>)) {
        if (!isSameDay(dateVal, dateStr)) continue

        const name = procName[code] || code
        if (!byProcess[code]) byProcess[code] = { code, name, batchesDone: 0, kgDone: 0, batches: [] }

        const kg = parseFloat(batch.kg) || 0
        byProcess[code].batchesDone++
        byProcess[code].kgDone += kg
        byProcess[code].batches.push({
          batchId: batch.batchId,
          orderNo: order.orderNumber,
          party: order.party,
          kg,
          supervisor: order.supervisor || '—',
        })
        totalBatchesDone++
        totalKgDone += kg
      }
    }
  }

  // ── Per-supervisor output ─────────────────────────────────────────────────
  interface SupervisorStat {
    name: string
    batchesDone: number
    kgDone: number
    ordersDone: number
    processes: string[]
  }
  const bySupervisor: Record<string, SupervisorStat> = {}

  for (const sup of supervisorDefs) {
    bySupervisor[sup.name] = { name: sup.name, batchesDone: 0, kgDone: 0, ordersDone: 0, processes: [] }
  }

  for (const order of orders) {
    const supName = order.supervisor || 'Unassigned'
    if (!bySupervisor[supName]) bySupervisor[supName] = { name: supName, batchesDone: 0, kgDone: 0, ordersDone: 0, processes: [] }

    let orderContributed = false
    for (const batch of (order.splits || [])) {
      if (!batch.fmsActualDates) continue
      for (const [code, dateVal] of Object.entries(batch.fmsActualDates as Record<string, string>)) {
        if (!isSameDay(dateVal, dateStr)) continue
        const kg = parseFloat(batch.kg) || 0
        bySupervisor[supName].batchesDone++
        bySupervisor[supName].kgDone += kg
        const pName = procName[code] || code
        if (!bySupervisor[supName].processes.includes(pName)) bySupervisor[supName].processes.push(pName)
        orderContributed = true
      }
    }
    if (orderContributed) bySupervisor[supName].ordersDone++
  }

  // ── Faults raised TODAY ───────────────────────────────────────────────────
  const faultsToday = faultyRecords.filter((r: any) => isSameDay(r.date, dateStr))

  // ── New orders received TODAY ─────────────────────────────────────────────
  const newOrdersToday = orders.filter(o => isSameDay(o.timestamp, dateStr))

  // ── Orders moved to done status TODAY ────────────────────────────────────
  // (approximate: orders where all batches have fmsDone=true, and one batch completed today)
  const ordersCompletedToday = orders.filter(o => {
    if (o.status !== 'done') return false
    const splits = o.splits || []
    return splits.some((b: any) =>
      b.fmsActualDates && Object.values(b.fmsActualDates).some((v: any) => isSameDay(v, dateStr))
    )
  })

  return {
    dateStr,
    totalBatchesDone,
    totalKgDone: Math.round(totalKgDone),
    byProcess: Object.values(byProcess).sort((a, b) => b.kgDone - a.kgDone),
    bySupervisor: Object.values(bySupervisor).filter(s => s.batchesDone > 0).sort((a, b) => b.kgDone - a.kgDone),
    faultsToday,
    newOrdersToday,
    ordersCompletedToday,
  }
}

// ─── WhatsApp-format text builder ────────────────────────────────────────────

function buildWhatsAppText(r: ReturnType<typeof buildDailyReport>) {
  if (!r) return ''
  const d = new Date(r.dateStr + 'T00:00:00')
  const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  const lines = [
    `🏭 *DyeFlow Daily Production Summary*`,
    `📅 ${dateLabel}`,
    ``,
    `📊 *OVERVIEW*`,
    `• Batches completed: *${r.totalBatchesDone}*`,
    `• Total Kg processed: *${fmt(r.totalKgDone)} Kg*`,
    `• New orders received: *${r.newOrdersToday.length}*`,
    `• Orders fully completed: *${r.ordersCompletedToday.length}*`,
    `• Faults raised: *${r.faultsToday.length}*`,
    ``,
  ]

  if (r.byProcess.length > 0) {
    lines.push(`⚙️ *PRODUCTION BY PROCESS*`)
    r.byProcess.forEach(p => {
      lines.push(`• ${p.name}: ${p.batchesDone} batch${p.batchesDone !== 1 ? 'es' : ''}, ${fmt(p.kgDone)} Kg`)
    })
    lines.push(``)
  }

  if (r.bySupervisor.length > 0) {
    lines.push(`👷 *SUPERVISOR OUTPUT*`)
    r.bySupervisor.forEach(s => {
      lines.push(`• ${s.name}: ${s.batchesDone} batch${s.batchesDone !== 1 ? 'es' : ''}, ${fmt(s.kgDone)} Kg`)
    })
    lines.push(``)
  }

  if (r.faultsToday.length > 0) {
    lines.push(`⚠️ *FAULTS RAISED*`)
    r.faultsToday.slice(0, 5).forEach((f: any) => {
      lines.push(`• Batch ${f.batchId} — ${f.faultyType || 'Defect'} (${f.party || '—'})`)
    })
    if (r.faultsToday.length > 5) lines.push(`• ...and ${r.faultsToday.length - 5} more`)
    lines.push(``)
  }

  lines.push(`_Generated by DyeFlow ERP_`)

  return lines.join('\n')
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DailyProductionSummaryPage() {
  const [date, setDate] = useState(todayISO())
  const [report, setReport] = useState<ReturnType<typeof buildDailyReport>>(null)
  const [copied, setCopied] = useState(false)
  const [expandedProcess, setExpandedProcess] = useState<string | null>(null)

  useEffect(() => {
    setReport(buildDailyReport(date))
  }, [date])

  const whatsappText = report ? buildWhatsAppText(report) : ''

  const copyToClipboard = () => {
    navigator.clipboard.writeText(whatsappText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const Card = ({ children, accent }: { children: React.ReactNode; accent?: string }) => (
    <div style={{
      background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
      borderLeft: accent ? `4px solid ${accent}` : undefined,
      borderRadius: 10, padding: '14px 18px', marginBottom: 12,
    }}>
      {children}
    </div>
  )

  const Stat = ({ label, value, color }: { label: string; value: string | number; color?: string }) => (
    <div style={{ textAlign: 'center', padding: '10px 4px' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  )

  const SH = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border-light)' }}>
      {children}
    </div>
  )

  const d = new Date(date + 'T00:00:00')
  const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>📋 Daily Production Summary</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>Auto-generated from FMS activity. Ready to share.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', border: '1px solid var(--border-medium)', borderRadius: 6 }}
          />
          <Link href="/reports">
            <button className="small">← Reports</button>
          </Link>
        </div>
      </div>

      {/* Date label */}
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', marginBottom: 16 }}>{dateLabel}</div>

      {!report || (report.totalBatchesDone === 0 && report.newOrdersToday.length === 0 && report.faultsToday.length === 0) ? (
        <Card>
          <div className="empty-state" style={{ padding: '48px 20px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No activity recorded for this date</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              FMS activity (marking batches done) is stamped with the date. Select a different date or start using FMS to record completions.
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* Overview stats */}
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, divider: 'none' }}>
              <Stat label="Batches Done"    value={report.totalBatchesDone} color="var(--accent)" />
              <Stat label="Kg Processed"   value={`${fmt(report.totalKgDone)} Kg`} color="var(--success)" />
              <Stat label="New Orders"      value={report.newOrdersToday.length} />
              <Stat label="Orders Finished" value={report.ordersCompletedToday.length} color="#1D9E75" />
              <Stat label="Faults Raised"   value={report.faultsToday.length} color={report.faultsToday.length > 0 ? 'var(--danger)' : 'var(--text-tertiary)'} />
            </div>
          </Card>

          {/* By Process */}
          {report.byProcess.length > 0 && (
            <Card>
              <SH>⚙ Production by Process</SH>
              {report.byProcess.map(p => (
                <div key={p.code}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}
                    onClick={() => setExpandedProcess(expandedProcess === p.code ? null : p.code)}
                  >
                    <span style={{ background: 'var(--accent-light)', color: 'var(--accent-dark)', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{p.code}</span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.batchesDone} batch{p.batchesDone !== 1 ? 'es' : ''}</span>
                    <span style={{ fontWeight: 700, color: 'var(--success)', fontSize: 13, minWidth: 80, textAlign: 'right' }}>{fmt(p.kgDone)} Kg</span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{expandedProcess === p.code ? '▲' : '▼'}</span>
                  </div>
                  {expandedProcess === p.code && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 10px', marginTop: 4, marginBottom: 4 }}>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            {['Batch ID', 'Order #', 'Party', 'Kg', 'Supervisor'].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {p.batches.map(b => (
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
            </Card>
          )}

          {/* By Supervisor */}
          {report.bySupervisor.length > 0 && (
            <Card>
              <SH>👷 Supervisor Output</SH>
              {report.bySupervisor.map(s => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
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
            </Card>
          )}

          {/* Faults */}
          {report.faultsToday.length > 0 && (
            <Card accent="var(--danger)">
              <SH>⚠️ Faults Raised Today</SH>
              {report.faultsToday.map((f: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--danger)', fontSize: 13 }}>{f.batchId}</span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>{f.party} · {f.faultyType || 'Defect'}</span>
                  <Link href="/faulty" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>View →</Link>
                </div>
              ))}
            </Card>
          )}

          {/* New orders */}
          {report.newOrdersToday.length > 0 && (
            <Card>
              <SH>📥 New Orders Received Today ({report.newOrdersToday.length})</SH>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {report.newOrdersToday.map((o: any) => (
                  <span key={o.id} style={{ background: 'var(--accent-light)', color: 'var(--accent-dark)', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                    {o.orderNumber}
                  </span>
                ))}
              </div>
            </Card>
          )}

          {/* WhatsApp share */}
          <Card accent="var(--success)">
            <SH>📱 Share to WhatsApp / Management</SH>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button
                onClick={copyToClipboard}
                style={{ fontWeight: 700, fontSize: 13, padding: '8px 18px', border: 'none', borderRadius: 7, background: copied ? 'var(--success)' : '#25D366', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {copied ? '✓ Copied!' : '📋 Copy for WhatsApp'}
              </button>
              <button
                onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(whatsappText)}`, '_blank')}
                style={{ fontWeight: 600, fontSize: 13, padding: '8px 16px', border: '1px solid #25D366', borderRadius: 7, background: '#fff', color: '#25D366', cursor: 'pointer' }}
              >
                Open WhatsApp
              </button>
            </div>
            <pre style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '12px 14px', borderRadius: 8, whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto', lineHeight: 1.7 }}>
              {whatsappText}
            </pre>
          </Card>
        </>
      )}
    </div>
  )
}
