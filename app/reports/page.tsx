'use client'

import { useEffect, useState, useMemo } from 'react'
import * as XLSX from 'xlsx'

interface ReportData {
  // Orders
  totalOrders: number
  ordersToday: number
  ordersThisWeek: number
  ordersThisMonth: number
  byStatus: Record<string, number>
  // Production
  totalKgOrdered: number
  totalKgInProcess: number
  totalKgDone: number
  totalBatches: number
  activeBatches: number
  doneBatches: number
  // Machines
  machines: { id: string; name: string; capacity: number; loadedKg: number; loadPct: number; status: string }[]
  // Supervisors
  supervisors: { name: string; inbox: number; active: number; done: number; total: number }[]
  // Faulty
  totalFaulty: number
  faultyOpen: number
  faultyByProcess: Record<string, number>
  // Delays — orders whose planned date has passed but not done
  overdueOrders: number
  // Process throughput
  processThroughput: { code: string; name: string; done: number; active: number }[]
}

const TODAY = new Date()
const startOfDay = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate())
const startOfWeek = new Date(startOfDay)
startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay())
const startOfMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1)

function isAfter(dateStr: string, since: Date): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return !isNaN(d.getTime()) && d >= since
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px', borderTop: color ? `3px solid ${color}` : undefined }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: color || 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, marginTop: 22, paddingBottom: 6, borderBottom: '1px solid var(--border-light)' }}>
      {children}
    </div>
  )
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [tab, setTab] = useState<'overview' | 'supervisors' | 'machines' | 'processes' | 'faulty'>('overview')

  useEffect(() => {
    buildReport()
  }, [])

  const buildReport = () => {
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) { setData(null); return }
    const db = JSON.parse(raw)

    const orders: any[] = db.orders || []
    const machines: any[] = db.machines || []
    const supervisorDefs: any[] = db.supervisors || []
    const faultyRecords: any[] = db.faultyRecords || []
    const processList: any[] = db.processList || []

    // ── Orders ──────────────────────────────────────────────────────────────
    const byStatus: Record<string, number> = {}
    orders.forEach(o => { byStatus[o.status || 'new'] = (byStatus[o.status || 'new'] || 0) + 1 })

    const ordersToday = orders.filter(o => isAfter(o.timestamp, startOfDay)).length
    const ordersThisWeek = orders.filter(o => isAfter(o.timestamp, startOfWeek)).length
    const ordersThisMonth = orders.filter(o => isAfter(o.timestamp, startOfMonth)).length

    // ── Batches ──────────────────────────────────────────────────────────────
    const allBatches = orders.flatMap(o =>
      (o.splits || []).map((b: any) => ({ ...b, orderId: o.id, machine: b.machine || o.machine, supervisor: o.supervisor, processRoute: o.processRoute || [] }))
    )
    const activeBatches = allBatches.filter(b => b.status === 'in-process').length
    const doneBatches = allBatches.filter(b => b.status === 'done').length

    // ── Kg ───────────────────────────────────────────────────────────────────
    const totalKgOrdered = orders.reduce((s, o) => s + (parseFloat(o.qtyKg) || 0), 0)
    const doneOrders = orders.filter(o => o.status === 'done')
    const totalKgDone = doneOrders.reduce((s, o) => s + (parseFloat(o.qtyKg) || 0), 0)
    const inProcessOrders = orders.filter(o => ['assigned', 'splitting', 'in-process'].includes(o.status))
    const totalKgInProcess = inProcessOrders.reduce((s, o) => s + (parseFloat(o.qtyKg) || 0), 0)

    // ── Machines ─────────────────────────────────────────────────────────────
    const machineStats = machines.map((m: any) => {
      const mBatches = allBatches.filter(b => (b.machine === m.id) && b.status !== 'done')
      const loadedKg = mBatches.reduce((s: number, b: any) => s + (parseFloat(b.kg) || 0), 0)
      const loadPct = m.capacity ? Math.min(100, Math.round((loadedKg / m.capacity) * 100)) : 0
      return { id: m.id, name: (m.name || m.id).replace(/^Machine\s*/i, 'M ').trim(), capacity: m.capacity || 0, loadedKg, loadPct, status: m.status || 'idle' }
    })

    // ── Supervisors ──────────────────────────────────────────────────────────
    const supervisorStats = supervisorDefs.map((sup: any) => {
      const supOrders = orders.filter(o => (o.supervisor || '').toLowerCase() === (sup.name || '').toLowerCase())
      return {
        name: sup.name,
        inbox: supOrders.filter(o => o.status === 'assigned').length,
        active: supOrders.filter(o => ['splitting', 'in-process'].includes(o.status)).length,
        done: supOrders.filter(o => o.status === 'done').length,
        total: supOrders.length
      }
    }).sort((a, b) => b.total - a.total)

    // ── Faulty ───────────────────────────────────────────────────────────────
    const faultyOpen = faultyRecords.filter(r => r.status === 'open').length
    const faultyByProcess: Record<string, number> = {}
    faultyRecords.forEach(r => {
      const key = r.faultyFrom || r.faultyType || 'Unknown'
      faultyByProcess[key] = (faultyByProcess[key] || 0) + 1
    })

    // Also count from batch fmsFaulty flags
    allBatches.forEach(b => {
      if (b.fmsFaulty?.active) {
        const key = b.fmsFaulty.processCode || 'Unknown'
        faultyByProcess[key] = (faultyByProcess[key] || 0) + 1
      }
    })

    // ── Process throughput ───────────────────────────────────────────────────
    const processThroughput = processList.map((p: any) => {
      let done = 0, active = 0
      allBatches.forEach(b => {
        if (b.fmsActualDates?.[p.code]) done++
        else if (b.fmsActiveProcesses?.[p.code]) active++
      })
      return { code: p.code, name: p.name, done, active }
    }).filter(p => p.done > 0 || p.active > 0)

    // ── Overdue ──────────────────────────────────────────────────────────────
    const overdueOrders = orders.filter(o => {
      if (['done', 'new'].includes(o.status)) return false
      const planned = o.plannedDates?.['Dispatch'] || o.plannedDates?.['Qa'] || ''
      if (!planned) return false
      const d = new Date(planned)
      return !isNaN(d.getTime()) && d < TODAY
    }).length

    setData({
      totalOrders: orders.length, ordersToday, ordersThisWeek, ordersThisMonth, byStatus,
      totalKgOrdered: Math.round(totalKgOrdered), totalKgInProcess: Math.round(totalKgInProcess),
      totalKgDone: Math.round(totalKgDone), totalBatches: allBatches.length, activeBatches, doneBatches,
      machines: machineStats, supervisors: supervisorStats,
      totalFaulty: faultyRecords.length, faultyOpen, faultyByProcess,
      overdueOrders, processThroughput
    })
  }

  // ── EXCEL EXPORT ─────────────────────────────────────────────────────────

  const exportToExcel = () => {
    if (!data) return
    const raw = localStorage.getItem('dyeflow_db')
    const db = raw ? JSON.parse(raw) : {}
    const orders: any[] = db.orders || []
    const faultyRecords: any[] = db.faultyRecords || []
    const allBatches = orders.flatMap(o =>
      (o.splits || []).map((b: any) => ({ ...b, orderNumber: o.orderNumber, party: o.party, article: o.article, color: o.color, supervisor: o.supervisor, machine: b.machine || o.machine }))
    )

    const wb = XLSX.utils.book_new()
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')

    // ── Sheet 1: Overview ──────────────────────────────────────────────────
    const overviewData = [
      ['DyeFlow ERP — Reports Export'],
      ['Generated:', new Date().toLocaleString('en-GB')],
      [''],
      ['ORDERS SUMMARY'],
      ['Total Orders', data.totalOrders],
      ['Orders Today', data.ordersToday],
      ['Orders This Week', data.ordersThisWeek],
      ['Orders This Month', data.ordersThisMonth],
      [''],
      ['STATUS BREAKDOWN'],
      ...Object.entries(data.byStatus).map(([status, count]) => [status.toUpperCase(), count]),
      [''],
      ['PRODUCTION'],
      ['Total Kg Ordered', data.totalKgOrdered],
      ['Kg In Process', data.totalKgInProcess],
      ['Kg Completed', data.totalKgDone],
      ['Completion %', data.totalKgOrdered > 0 ? Math.round((data.totalKgDone / data.totalKgOrdered) * 100) + '%' : '0%'],
      ['Overdue Orders', data.overdueOrders],
      [''],
      ['BATCHES'],
      ['Total Batches', data.totalBatches],
      ['Active Batches', data.activeBatches],
      ['Done Batches', data.doneBatches],
      [''],
      ['FAULTY'],
      ['Total Faulty Records', data.totalFaulty],
      ['Open (Unresolved)', data.faultyOpen],
      ['Resolved', data.totalFaulty - data.faultyOpen],
    ]
    const wsOverview = XLSX.utils.aoa_to_sheet(overviewData)
    wsOverview['!cols'] = [{ wch: 28 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, wsOverview, 'Overview')

    // ── Sheet 2: All Orders ──────────────────────────────────────────────
    const orderHeaders = ['ORDER #', 'TIMESTAMP', 'PARTY', 'SUB PARTY', 'SALES PERSON', 'ARTICLE', 'BLEND', 'WIDTH', 'GSM', 'COLOR', 'LAB NO', 'LOT NO', 'CHALLAN NO', 'QTY KG', 'QTY MTR', 'NO OF TAKA', 'FINISH', 'PACKING', 'REMARKS', 'HOLD/APPROVAL', 'SUPERVISOR', 'MACHINE', 'PROCESS ROUTE', 'STATUS']
    const orderRows = orders.map(o => [
      o.orderNumber || '', o.timestamp || '', o.party || '', o.subParty || '', o.salesPerson || '',
      o.article || '', o.blend || '', o.width || '', o.gsm || '', o.color || '',
      o.labNo || '', o.lotNo || '', o.challanNo || '', o.qtyKg || '', o.qtyMtr || '',
      o.noOfTaka || '', o.typeOfFinish || '', o.typeOfPacking || '', o.remarks || '',
      o.holdApproval || '', o.supervisor || '', o.machine || '',
      (o.processRoute || []).join('/'), o.status || ''
    ])
    const wsOrders = XLSX.utils.aoa_to_sheet([orderHeaders, ...orderRows])
    wsOrders['!cols'] = orderHeaders.map((h, i) => ({ wch: [14,18,18,14,14,14,12,8,8,14,12,12,14,10,10,10,14,14,22,14,16,14,22,12][i] || 14 }))
    // Style header row bold
    orderHeaders.forEach((_, i) => {
      const cell = XLSX.utils.encode_cell({ r: 0, c: i })
      if (wsOrders[cell]) wsOrders[cell].s = { font: { bold: true }, fill: { fgColor: { rgb: 'E6F1FB' } } }
    })
    XLSX.utils.book_append_sheet(wb, wsOrders, 'All Orders')

    // ── Sheet 3: Batches ──────────────────────────────────────────────────
    const batchHeaders = ['BATCH ID', 'ORDER #', 'PARTY', 'ARTICLE', 'COLOR', 'QTY KG', 'SUPERVISOR', 'MACHINE', 'CURRENT PROCESS', 'STATUS', 'FAULTY']
    const batchRows = allBatches.map(b => [
      b.batchId || '', b.orderNumber || '', b.party || '', b.article || '', b.color || '',
      b.kg || '', b.supervisor || '', b.machine || '',
      b.fmsCurrentProcess || '', b.status || '',
      b.fmsFaulty?.active ? 'Yes' : 'No'
    ])
    const wsBatches = XLSX.utils.aoa_to_sheet([batchHeaders, ...batchRows])
    wsBatches['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 8 }]
    XLSX.utils.book_append_sheet(wb, wsBatches, 'Batches')

    // ── Sheet 4: Supervisors ──────────────────────────────────────────────
    const supHeaders = ['SUPERVISOR', 'INBOX', 'ACTIVE', 'DONE', 'TOTAL', 'COMPLETION %']
    const supRows = data.supervisors.map(s => [
      s.name, s.inbox, s.active, s.done, s.total,
      s.total > 0 ? Math.round((s.done / s.total) * 100) + '%' : '0%'
    ])
    const wsSup = XLSX.utils.aoa_to_sheet([supHeaders, ...supRows])
    wsSup['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, wsSup, 'Supervisors')

    // ── Sheet 5: Machines ─────────────────────────────────────────────────
    const machHeaders = ['MACHINE', 'STATUS', 'CAPACITY (KG)', 'LOADED (KG)', 'LOAD %']
    const machRows = data.machines.map(m => [m.name, m.status, m.capacity, m.loadedKg, m.loadPct + '%'])
    const wsMach = XLSX.utils.aoa_to_sheet([machHeaders, ...machRows])
    wsMach['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, wsMach, 'Machines')

    // ── Sheet 6: Process Throughput ───────────────────────────────────────
    if (data.processThroughput.length > 0) {
      const procHeaders = ['CODE', 'PROCESS NAME', 'ACTIVE BATCHES', 'COMPLETED BATCHES']
      const procRows = data.processThroughput
        .sort((a, b) => b.done - a.done)
        .map(p => [p.code, p.name, p.active, p.done])
      const wsProc = XLSX.utils.aoa_to_sheet([procHeaders, ...procRows])
      wsProc['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, wsProc, 'Process Throughput')
    }

    // ── Sheet 7: Faulty Records ───────────────────────────────────────────
    if (faultyRecords.length > 0) {
      const faultyHeaders = ['ID', 'BATCH ID', 'ORDER #', 'PARTY', 'ARTICLE', 'COLOR', 'QTY KG', 'FAULTY TYPE', 'FAULTY FROM', 'DATE', 'STATUS', 'REMARKS']
      const faultyRows = faultyRecords.map(r => [
        r.id || '', r.batchId || '', r.orderNo || '', r.party || '',
        r.article || '', r.color || '', r.qtyKg || '',
        r.faultyType || '', r.faultyFrom || '', r.date || '',
        r.status || '', r.remarks || r.faultyRemarks || ''
      ])
      const wsFaulty = XLSX.utils.aoa_to_sheet([faultyHeaders, ...faultyRows])
      wsFaulty['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 24 }]
      XLSX.utils.book_append_sheet(wb, wsFaulty, 'Faulty Records')
    }

    // ── Sheet 8: Faulty by Process ────────────────────────────────────────
    if (Object.keys(data.faultyByProcess).length > 0) {
      const fpHeaders = ['PROCESS / TYPE', 'COUNT', 'SHARE %']
      const fpRows = Object.entries(data.faultyByProcess)
        .sort(([, a], [, b]) => b - a)
        .map(([key, count]) => [key, count, Math.round(count / data.totalFaulty * 100) + '%'])
      const wsFP = XLSX.utils.aoa_to_sheet([fpHeaders, ...fpRows])
      wsFP['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, wsFP, 'Faulty by Process')
    }

    // ── Download ──────────────────────────────────────────────────────────
    XLSX.writeFile(wb, `DyeFlow-Report-${dateStr}.xlsx`)
  }

  // ── CURRENT TAB EXPORT (quick export of active tab only) ─────────────────

  const exportCurrentTab = () => {
    if (!data) return
    const raw = localStorage.getItem('dyeflow_db')
    const db = raw ? JSON.parse(raw) : {}
    const wb = XLSX.utils.book_new()
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')

    if (tab === 'overview') {
      exportToExcel(); return // full export for overview
    }

    if (tab === 'supervisors') {
      const headers = ['SUPERVISOR', 'INBOX', 'ACTIVE', 'DONE', 'TOTAL', 'COMPLETION %']
      const rows = data.supervisors.map(s => [s.name, s.inbox, s.active, s.done, s.total, s.total > 0 ? Math.round((s.done / s.total) * 100) + '%' : '0%'])
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Supervisors')
      XLSX.writeFile(wb, `DyeFlow-Supervisors-${dateStr}.xlsx`)
    }

    if (tab === 'machines') {
      const headers = ['MACHINE', 'STATUS', 'CAPACITY (KG)', 'LOADED (KG)', 'LOAD %']
      const rows = data.machines.map(m => [m.name, m.status, m.capacity, m.loadedKg, m.loadPct + '%'])
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Machines')
      XLSX.writeFile(wb, `DyeFlow-Machines-${dateStr}.xlsx`)
    }

    if (tab === 'processes') {
      const headers = ['CODE', 'PROCESS NAME', 'ACTIVE BATCHES', 'COMPLETED BATCHES']
      const rows = data.processThroughput.sort((a, b) => b.done - a.done).map(p => [p.code, p.name, p.active, p.done])
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Process Throughput')
      XLSX.writeFile(wb, `DyeFlow-Processes-${dateStr}.xlsx`)
    }

    if (tab === 'faulty') {
      const faultyRecords: any[] = db.faultyRecords || []
      const headers = ['ID', 'BATCH ID', 'ORDER #', 'PARTY', 'ARTICLE', 'COLOR', 'QTY KG', 'FAULTY TYPE', 'FAULTY FROM', 'DATE', 'STATUS', 'REMARKS']
      const rows = faultyRecords.map(r => [r.id || '', r.batchId || '', r.orderNo || '', r.party || '', r.article || '', r.color || '', r.qtyKg || '', r.faultyType || '', r.faultyFrom || '', r.date || '', r.status || '', r.remarks || r.faultyRemarks || ''])
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 24 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Faulty Records')
      XLSX.writeFile(wb, `DyeFlow-Faulty-${dateStr}.xlsx`)
    }
  }

  const tabStyle = (t: string) => ({
    padding: '7px 16px', fontSize: 13, fontWeight: tab === t ? 600 : 400,
    border: 'none', borderRadius: 6, cursor: 'pointer',
    background: tab === t ? 'var(--accent)' : 'var(--bg-secondary)',
    color: tab === t ? '#fff' : 'var(--text-secondary)',
  })

  if (!data) {
    return (
      <div className="content">
        <div className="card">
          <div className="empty-state">No data yet. Start by adding orders, machines, and supervisors in Setup.</div>
        </div>
      </div>
    )
  }

  const statusColors: Record<string, string> = {
    new: '#EF9F27', assigned: '#185FA5', splitting: '#3C3489',
    'in-process': '#185FA5', done: '#1D9E75', hold: '#A32D2D'
  }

  return (
    <div className="content">
      {/* Header */}
      <div className="topbar" style={{ marginBottom: 14 }}>
        <div className="topbar-title">Reports & Analytics</div>
        <div className="topbar-actions">
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Live data · {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          <button onClick={buildReport} className="small">↻ Refresh</button>
          <button
            onClick={exportCurrentTab}
            className="small"
            title="Export current tab to Excel"
            style={{ background: 'var(--success-light)', color: 'var(--success)', borderColor: '#c6f6d5', fontWeight: 600 }}
          >
            ⬇ Export Tab
          </button>
          <button
            onClick={exportToExcel}
            className="small"
            title="Export full report — all tabs — to Excel"
            style={{ background: '#1D9E75', color: '#fff', border: 'none', fontWeight: 600 }}
          >
            ⬇ Full Report (.xlsx)
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['overview', 'supervisors', 'machines', 'processes', 'faulty'] as const).map(t => (
          <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>
            {{ overview: '📊 Overview', supervisors: '👷 Supervisors', machines: '⚙ Machines', processes: '🔄 Processes', faulty: '⚠ Faulty' }[t]}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ────────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          <SectionTitle>Orders</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 4 }}>
            <StatCard label="Total Orders" value={data.totalOrders} />
            <StatCard label="Today" value={data.ordersToday} color="#185FA5" />
            <StatCard label="This Week" value={data.ordersThisWeek} color="#3C3489" />
            <StatCard label="This Month" value={data.ordersThisMonth} color="#1D9E75" />
          </div>

          <SectionTitle>Order Status Breakdown</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 4 }}>
            {['new', 'assigned', 'splitting', 'in-process', 'done', 'hold'].map(s => (
              <StatCard key={s} label={s.replace('-', ' ')} value={data.byStatus[s] || 0} color={statusColors[s]} />
            ))}
          </div>

          <SectionTitle>Production</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 4 }}>
            <StatCard label="Total Kg Ordered" value={`${data.totalKgOrdered.toLocaleString()} Kg`} />
            <StatCard label="Kg In Process" value={`${data.totalKgInProcess.toLocaleString()} Kg`} color="#185FA5" />
            <StatCard label="Kg Completed" value={`${data.totalKgDone.toLocaleString()} Kg`} color="#1D9E75" />
            <StatCard label="Overdue Orders" value={data.overdueOrders} color={data.overdueOrders > 0 ? '#A32D2D' : undefined} sub="past planned dispatch date" />
          </div>

          <SectionTitle>Batches</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <StatCard label="Total Batches" value={data.totalBatches} />
            <StatCard label="Active Batches" value={data.activeBatches} color="#185FA5" />
            <StatCard label="Done Batches" value={data.doneBatches} color="#1D9E75" />
          </div>

          {/* Completion bar */}
          {data.totalKgOrdered > 0 && (
            <div style={{ marginTop: 16, background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                <span>Overall Completion</span>
                <span style={{ color: 'var(--accent)' }}>{Math.round((data.totalKgDone / data.totalKgOrdered) * 100)}%</span>
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, height: 10, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Math.round((data.totalKgDone / data.totalKgOrdered) * 100))}%`, height: '100%', background: 'var(--accent)', borderRadius: 20, transition: 'width 0.5s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                <span>{data.totalKgDone.toLocaleString()} Kg done</span>
                <span>{data.totalKgInProcess.toLocaleString()} Kg in process</span>
                <span>{(data.totalKgOrdered - data.totalKgDone - data.totalKgInProcess).toLocaleString()} Kg pending</span>
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
            <div className="empty-state">No supervisors configured. Go to Setup → Supervisor Master.</div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table style={{ minWidth: 500 }}>
                  <thead>
                    <tr>
                      <th>SUPERVISOR</th>
                      <th>INBOX</th>
                      <th>ACTIVE</th>
                      <th>DONE</th>
                      <th>TOTAL</th>
                      <th style={{ width: 200 }}>WORKLOAD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.supervisors.map(sup => (
                      <tr key={sup.name}>
                        <td style={{ fontWeight: 600 }}>{sup.name}</td>
                        <td>
                          <span style={{ background: 'var(--warning-light)', color: 'var(--warning)', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{sup.inbox}</span>
                        </td>
                        <td>
                          <span style={{ background: 'var(--accent-light)', color: 'var(--accent-dark)', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{sup.active}</span>
                        </td>
                        <td>
                          <span style={{ background: 'var(--success-light)', color: 'var(--success)', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{sup.done}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{sup.total}</td>
                        <td>
                          <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, height: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${sup.total > 0 ? Math.round((sup.done / sup.total) * 100) : 0}%`, height: '100%', background: 'var(--accent)', borderRadius: 20 }} />
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                            {sup.total > 0 ? Math.round((sup.done / sup.total) * 100) : 0}% complete
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── MACHINES ────────────────────────────────────────────────────────── */}
      {tab === 'machines' && (
        <>
          <SectionTitle>Machine Utilization</SectionTitle>
          {data.machines.length === 0 ? (
            <div className="empty-state">No machines configured. Go to Setup → Machine Master.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {data.machines.map(m => (
                <div key={m.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                      background: m.status === 'running' ? 'var(--success-light)' : 'var(--bg-secondary)',
                      color: m.status === 'running' ? 'var(--success)' : 'var(--text-tertiary)'
                    }}>{m.status}</span>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, height: 8, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{
                      width: `${m.loadPct}%`, height: '100%', borderRadius: 20,
                      background: m.loadPct > 80 ? '#E24B4A' : m.loadPct > 50 ? '#EF9F27' : '#1D9E75',
                      transition: 'width 0.5s'
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)' }}>
                    <span>{m.loadedKg} / {m.capacity} Kg</span>
                    <span style={{ fontWeight: 600, color: m.loadPct > 80 ? '#E24B4A' : 'var(--text-secondary)' }}>{m.loadPct}% loaded</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── PROCESSES ───────────────────────────────────────────────────────── */}
      {tab === 'processes' && (
        <>
          <SectionTitle>Process Throughput</SectionTitle>
          {data.processThroughput.length === 0 ? (
            <div className="empty-state">No batch activity recorded yet across FMS processes.</div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table style={{ minWidth: 400 }}>
                  <thead>
                    <tr>
                      <th>CODE</th>
                      <th>PROCESS</th>
                      <th>ACTIVE BATCHES</th>
                      <th>COMPLETED BATCHES</th>
                      <th style={{ width: 180 }}>THROUGHPUT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.processThroughput.sort((a, b) => b.done - a.done).map(p => (
                      <tr key={p.code}>
                        <td>
                          <span style={{ background: 'var(--accent-light)', color: 'var(--accent-dark)', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{p.code}</span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                        <td>
                          {p.active > 0 && <span style={{ background: 'var(--accent-light)', color: 'var(--accent-dark)', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{p.active}</span>}
                          {p.active === 0 && <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                        </td>
                        <td>
                          <span style={{ background: 'var(--success-light)', color: 'var(--success)', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{p.done}</span>
                        </td>
                        <td>
                          <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, height: 6, overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, Math.round(p.done / Math.max(...data.processThroughput.map(x => x.done), 1) * 100))}%`,
                              height: '100%', background: 'var(--accent)', borderRadius: 20
                            }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── FAULTY ──────────────────────────────────────────────────────────── */}
      {tab === 'faulty' && (
        <>
          <SectionTitle>Faulty Summary</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            <StatCard label="Total Faulty Records" value={data.totalFaulty} />
            <StatCard label="Open (Unresolved)" value={data.faultyOpen} color={data.faultyOpen > 0 ? '#A32D2D' : undefined} />
            <StatCard label="Resolved" value={data.totalFaulty - data.faultyOpen} color="#1D9E75" />
          </div>

          {Object.keys(data.faultyByProcess).length > 0 && (
            <>
              <SectionTitle>Faulty by Process / Type</SectionTitle>
              <div className="card" style={{ padding: 0 }}>
                <div className="table-wrap">
                  <table style={{ minWidth: 300 }}>
                    <thead>
                      <tr>
                        <th>PROCESS / TYPE</th>
                        <th>COUNT</th>
                        <th style={{ width: 200 }}>SHARE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.faultyByProcess)
                        .sort(([, a], [, b]) => b - a)
                        .map(([key, count]) => (
                          <tr key={key}>
                            <td style={{ fontWeight: 500 }}>{key}</td>
                            <td>
                              <span style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{count}</span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 20, height: 6, overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${Math.round(count / data.totalFaulty * 100)}%`,
                                    height: '100%', background: '#E24B4A', borderRadius: 20
                                  }} />
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 32 }}>
                                  {Math.round(count / data.totalFaulty * 100)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
