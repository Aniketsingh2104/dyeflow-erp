'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getBatches, getOrders, markProcessDone, markBatchFaulty } from '@/lib/db'
import { collabBlockMessage, getCollabInfo } from '@/lib/collab'

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeDate(d: any): Date | null {
  if (!d) return null
  if (typeof d === 'string' && /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(d)) {
    const [a, b, y] = d.split(/[\/\-]/)
    const dt = new Date(+y, +b - 1, +a)
    return isNaN(dt.getTime()) ? null : dt
  }
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? null : dt
}

function fmtDate(d: any): string {
  const dt = normalizeDate(d)
  if (!dt) return d ? String(d) : '-'
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`
}

function fmtDateTime(d: any): string {
  if (!d) return '-'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d)
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
}

function delayMeta(planned: string, actual: string, now: Date): { text: string; late: boolean } {
  if (!planned) return { text: '-', late: false }
  const p = normalizeDate(planned)
  if (!p) return { text: '-', late: false }
  const deadline = new Date(p); deadline.setHours(23, 59, 59, 999)
  const compare  = actual ? (() => { const a = normalizeDate(actual); return a ? new Date(a.setHours(23,59,59,999)) : null })() : now
  if (!compare) return { text: '-', late: false }
  const diff = compare.getTime() - deadline.getTime()
  const abs  = Math.abs(diff)
  const d = Math.floor(abs / 86400000)
  const h = Math.floor((abs % 86400000) / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  const late = actual ? diff > 0 : diff > 0
  const sign = diff <= 0 ? '-' : '+'
  return { text: `${sign}${d}d ${h}h ${m}m`, late }
}

// ── Default columns ───────────────────────────────────────────────────────────

const DEFAULT_COLS = [
  { id: 'created_at',       label: 'TIMESTAMP',       visible: true,  width: 150, minWidth: 100 },
  { id: 'orderNo',          label: 'ORDER #',          visible: true,  width: 130, minWidth: 80  },
  { id: 'batch_id',         label: 'BATCH #',          visible: true,  width: 130, minWidth: 80  },
  { id: 'party',            label: 'PARTY',            visible: true,  width: 150, minWidth: 100 },
  { id: 'sub_party',        label: 'SUB PARTY',        visible: false, width: 120, minWidth: 80  },
  { id: 'sales_person',     label: 'SALES PERSON',     visible: false, width: 130, minWidth: 80  },
  { id: 'article',          label: 'ARTICLE',          visible: true,  width: 130, minWidth: 80  },
  { id: 'blend',            label: 'BLEND',            visible: true,  width: 80,  minWidth: 60  },
  { id: 'width',            label: 'WIDTH',            visible: false, width: 70,  minWidth: 50  },
  { id: 'gsm',              label: 'GSM',              visible: true,  width: 70,  minWidth: 50  },
  { id: 'color',            label: 'COLOR',            visible: true,  width: 120, minWidth: 80  },
  { id: 'lab_no',           label: 'LAB NO.',          visible: true,  width: 100, minWidth: 70  },
  { id: 'lot_no',           label: 'LOT NO.',          visible: false, width: 100, minWidth: 70  },
  { id: 'challan_no',       label: 'CHALLAN NO.',      visible: true,  width: 110, minWidth: 80  },
  { id: 'qty_kg',           label: 'QTY (KG)',         visible: true,  width: 90,  minWidth: 60  },
  { id: 'qty_mtr',          label: 'QTY (MTR)',        visible: true,  width: 90,  minWidth: 60  },
  { id: 'no_of_taka',       label: 'TAKA',             visible: true,  width: 70,  minWidth: 50  },
  { id: 'type_of_finish',   label: 'FINISH',           visible: true,  width: 110, minWidth: 80  },
  { id: 'type_of_packing',  label: 'PACKING',          visible: true,  width: 100, minWidth: 70  },
  { id: 'remarks',          label: 'REMARKS',          visible: false, width: 150, minWidth: 80  },
  { id: 'supervisor',       label: 'SUPERVISOR',       visible: true,  width: 130, minWidth: 80  },
  { id: 'machine',          label: 'MACHINE',          visible: true,  width: 160, minWidth: 100 },
  { id: 'process_route',    label: 'PROCESS ROUTE',    visible: true,  width: 220, minWidth: 120 },
  { id: 'planned_date',     label: 'PLANNED DATE',     visible: true,  width: 120, minWidth: 80  },
  { id: 'actual_date',      label: 'ACTUAL DATE',      visible: true,  width: 120, minWidth: 80  },
  { id: 'delivery_date',    label: 'DELIVERY DATE',    visible: true,  width: 120, minWidth: 80  },
  { id: 'actions',          label: 'ACTIONS',          visible: true,  width: 290, minWidth: 200 },
  { id: 'time_delay',       label: 'TIME DELAY',       visible: true,  width: 110, minWidth: 80  },
]

const COL_KEY = 'fms_col_settings_v3'

export default function FmsProcessPage() {
  const params      = useParams()
  const router      = useRouter()
  const processCode = String(params?.process || '').toUpperCase()

  const [rows,     setRows]     = useState<any[]>([])
  const [allBatches, setAllBatches] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [now,      setNow]      = useState(new Date())
  const [cols,     setCols]     = useState<typeof DEFAULT_COLS>(() => {
    try { const s = localStorage.getItem(COL_KEY); return s ? JSON.parse(s) : DEFAULT_COLS } catch { return DEFAULT_COLS }
  })
  const [showCols,   setShowCols]   = useState(false)
  const [resizing,   setResizing]   = useState<string | null>(null)
  const colsRef = useRef(cols); colsRef.current = cols

  // Modals
  const [faultyModal, setFaultyModal] = useState<any>(null)
  const [faultyReason, setFaultyReason] = useState('')
  const [fobModal,     setFobModal]     = useState<any>(null)
  const [fobType,      setFobType]      = useState<'dyeing'|'rolling'>('dyeing')
  const [fobReason,    setFobReason]    = useState('')
  const [saving,       setSaving]       = useState(false)
  const [toast,        setToast]        = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const [batchRes, orderRes, dpRes, fobRes] = await Promise.all([
        getBatches({ limit: 5000 }),
        getOrders({ limit: 1000 }),
        fetch('/api/date-plans', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/fob', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])

      const batches: any[] = batchRes.data  || []
      const orders: any[]  = orderRes.data  || []
      setAllBatches(batches)  // full unfiltered list — needed for collab-partner cross-checks below
      const orderMap: Record<string, any> = {}
      for (const o of orders) orderMap[o.id] = o

      // FOB map: batch UUID + process code → fob record (to know if batch has FOB here)
      const fobRecords: any[] = fobRes.data || []
      const fobMap: Record<string, any> = {}
      for (const f of fobRecords) {
        const key = `${f.batch_uuid || f.batch_id}__${f.process_code}`
        fobMap[key] = f
      }

      // Date plans map: batch UUID → date plan row
      const datePlans: any[] = dpRes.data || []
      const dpMap: Record<string, any> = {}
      for (const dp of datePlans) dpMap[dp.batch_id] = dp

      // Map process code to d_* column in batch_date_plans
      const PROC_COL: Record<string, string> = {
        C:'d_c', S:'d_s', H:'d_h', D:'d_d', S2:'d_s2', Rx:'d_rx', O:'d_o',
        G:'d_g', F:'d_f', Co:'d_co', Tu:'d_tu', Add:'d_add', Level:'d_level',
        Rc:'d_rc', Fix:'d_fix', Wash:'d_wash', Dry:'d_dry', B:'d_b',
        R:'d_r', K:'d_k', QA:'d_qa', Qa:'d_qa', Packing:'d_packing',
        Dispatch:'d_dispatch'
      }

      // Show batches:
      // 1. Active: currently at this process (current_process === thisProcess)
      // 2. Done here: batch_processes has done/faulty/fob entry for this process code
      // 3. Faulty/FOB here: last_process === thisProcess (batch left via faulty or FOB)
      const filtered = batches.filter(b => {
        const bpCode = (c: string) =>
          c?.toUpperCase() === processCode || c === processCode

        // Active at this process
        const isActive = bpCode(b.current_process)

        // Done/faulty/fob here — batch_processes entry for this code
        const isDoneHere = (b.batch_processes || []).some((bp: any) =>
          bpCode(bp.process_code) &&
          (bp.status === 'done' || bp.status === 'faulty' || bp.status === 'fob')
        )

        // Faulty or FOB from this process (last_process tracks where it was marked)
        const isLastHere = bpCode(b.last_process)

        return isActive || isDoneHere || isLastHere
      })

      // Get planned dates from batch_processes
      const enriched = filtered.map(b => {
        const order   = orderMap[b.order_id] || {}
        const sup     = order.supervisors?.name || '-'
        const mach    = b.machines?.name || '-'
        const route: string[] = order.process_route || []

        // Planned date from batch_date_plans for THIS process
        const dp = dpMap[b.id] || {}
        const procColKey = PROC_COL[processCode] || PROC_COL[
          Object.keys(PROC_COL).find(k => k.toUpperCase() === processCode) || ''
        ] || ''
        const planned = procColKey && dp[procColKey]
          ? dp[procColKey].slice(0, 10)  // YYYY-MM-DD
          : ''
        // Delivery date = d_dispatch from batch_date_plans
        const dispatchDate = dp.d_dispatch ? dp.d_dispatch.slice(0, 10) : ''
        // batch_processes entry for THIS process
        const bp = (b.batch_processes || []).find((p: any) =>
          p.process_code?.toUpperCase() === processCode ||
          p.process_code === processCode
        )
        const bpStatus = bp?.status || 'pending'  // 'pending' | 'done' | 'faulty' | 'fob'
        const actual   = bp?.done_at ? bp.done_at.split('T')[0] : ''
        const actualDateTime = bp?.done_at ? bp.done_at : ''  // full timestamp for display
        const delay    = delayMeta(planned, actual, now)
        // Check if FOB exists for this batch at this process
        // Either via fob_records OR via batch_processes.status='fob'
        const fobKey  = `${b.id}__${processCode}`
        const hasFob  = !!fobMap[fobKey] || bpStatus === 'fob'
        // Timestamp = sent_at on batch (when it arrived at this process)
        const sentAt  = b.sent_at || b.updated_at || b.created_at || ''

        return {
          ...b,
          sentAt,          // when batch arrived at this process
          orderNo:         order.order_number    || '-',
          party:           order.party           || '-',
          sub_party:       order.sub_party       || '-',
          sales_person:    order.sales_person    || '-',
          article:         order.article         || '-',
          color:           order.color           || '-',
          blend:           order.blend           || '-',
          width:           order.width           || '-',
          gsm:             order.gsm             || '-',
          lab_no:          order.lab_no          || '-',
          lot_no:          order.lot_no          || '-',
          challan_no:      order.challan_no      || '-',
          qty_mtr:         b.mtr || order.qty_mtr     || '-',
          no_of_taka:      b.taka || order.no_of_taka || '-',
          type_of_finish:  order.type_of_finish  || '-',
          type_of_packing: order.type_of_packing || '-',
          remarks:         order.remarks         || '-',
          supervisorName:  sup,
          machineName:     mach,
          routeStr:        route.join('/'),
          plannedDate:     planned,
          actualDate:      actual,
          delivery_date:   dispatchDate || order.delivery_date || '-',
          // isCompleted: true if process step is done OR faulty
          isCompleted:     bpStatus === 'done' || bpStatus === 'faulty',
          bpStatus,          // 'pending' | 'done' | 'faulty'
          hasFob,            // true if FOB record exists for this batch at this process
          actualDateTime,    // full timestamp of done_at for display
          delayText:         delay.text,
          delayLate:         delay.late,
          isFaulty:          b.is_faulty,
        }
      })

      enriched.sort((a, b) =>
        String(a.plannedDate || '9999').localeCompare(String(b.plannedDate || '9999'))
      )

      setRows(enriched)
    } finally {
      setLoading(false)
    }
  }, [processCode, now])

  useEffect(() => {
    loadRows()
    const h = () => loadRows()
    window.addEventListener('dyeflow-db-updated', h)
    return () => window.removeEventListener('dyeflow-db-updated', h)
  }, [loadRows])

  // ── Column resize ───────────────────────────────────────────────────────────

  const startResize = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    setResizing(id)
    const col   = cols.find(c => c.id === id)!
    const startX = e.clientX
    const startW = col.width
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(col.minWidth || 60, startW + ev.clientX - startX)
      setCols(p => p.map(c => c.id === id ? { ...c, width: w } : c))
    }
    const onUp = () => {
      setResizing(null)
      localStorage.setItem(COL_KEY, JSON.stringify(colsRef.current))
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const saveCols = (next: typeof DEFAULT_COLS) => {
    setCols(next)
    localStorage.setItem(COL_KEY, JSON.stringify(next))
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleDone = async (row: any) => {
    const block = collabBlockMessage(row, processCode, allBatches)
    if (block) { alert(block); return }
    const route: string[] = (row.process_route || row.routeStr?.split('/') || [])
    const idx  = route.findIndex((c: string) => c.toUpperCase() === processCode)
    const next = idx >= 0 ? route[idx + 1] : undefined
    if (!confirm(`Mark ${row.batch_id} done in ${processCode}?`)) return
    setSaving(true)
    try {
      const { error } = await markProcessDone(row.id, row.current_process, next)
      if (error) { alert('Error: ' + error); return }
      showToast(`✓ ${row.batch_id} ${next ? '→ ' + next : 'complete'}`)
      loadRows()
    } finally { setSaving(false) }
  }

  // ── Rollback — send batch back to previous process ──────────────────────
  const handleRollback = async (row: any) => {
    const block = collabBlockMessage(row, processCode, allBatches)
    if (block) { alert(block); return }
    const route: string[] = row.process_route || row.routeStr?.split('/') || []
    const currentIdx = route.findIndex((c: string) =>
      c.toUpperCase() === processCode || c === row.current_process
    )

    let prevProcess: string | null = null
    let newStatus = 'in-process'

    if (currentIdx <= 0) {
      // First process — rollback to pending (back to First Process page)
      prevProcess = null
      newStatus   = 'pending'
    } else {
      // Not first — rollback to previous process
      prevProcess = route[currentIdx - 1]
      newStatus   = 'in-process'
    }

    const msg = prevProcess
      ? `Roll back ${row.batch_id} from ${processCode} to ${prevProcess}?`
      : `Roll back ${row.batch_id} from ${processCode} to First Process page (pending)?`

    if (!confirm(msg)) return
    setSaving(true)
    try {
      // 1. Update batch: set current_process to previous, clear sent_at
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:          'update',
          id:              row.id,
          current_process: prevProcess,
          status:          newStatus,
          sent_at:         null,
        })
      })

      // 2. Reset BOTH:
      //    a) The process we're rolling back FROM (current page) - mark as pending  
      //    b) The process we're going BACK TO (prevProcess) - so it can be marked Done again
      
      // Reset current process (where batch is now leaving)
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:       'reset_process',
          batch_id:     row.id,
          process_code: processCode,   // current page (e.g. H - leaving this)
        })
      })

      // Reset previous process (where batch is going back to, so Done works)
      if (prevProcess) {
        await fetch('/api/batches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action:       'reset_process',
            batch_id:     row.id,
            process_code: prevProcess,  // where batch goes back (e.g. C - needs to be active)
          })
        })
      }

      showToast(prevProcess
        ? `↩ ${row.batch_id} rolled back to ${prevProcess}`
        : `↩ ${row.batch_id} returned to First Process page`)
      loadRows()
    } finally { setSaving(false) }
  }

  const handleFaulty = async () => {
    if (!faultyReason.trim() || !faultyModal) return
    setSaving(true)
    try {
      const row = faultyModal
      const order = { order_number: row.orderNo, party: row.party }
      const { error } = await markBatchFaulty({
        batch_id:    row.id,
        order_id:    row.order_id,
        order_number: row.orderNo,
        party:        row.party,
        color:        row.color,
        faulty_type:  faultyReason,
        faulty_kg:    parseFloat(row.kg) || 0,
        process_code: processCode,
      })
      if (error) { alert('Error: ' + error); return }
      showToast(`✓ ${row.batch_id} marked faulty`)
      setFaultyModal(null); setFaultyReason('')
      loadRows()
    } finally { setSaving(false) }
  }

  const handleFob = async () => {
    if (!fobReason.trim() || !fobModal) return
    setSaving(true)
    try {
      const row = fobModal
      const fobRes = await fetch('/api/fob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:       'create',
          batch_id:     row.id,
          order_id:     row.order_id,
          order_number: row.orderNo,
          party:        row.party,
          fob_kg:       parseFloat(row.kg) || 0,
          process_code: processCode,
          fob_type:     fobType,
          notes:        fobReason,
        }),
      }).then(r => r.json())
      if (!fobRes.ok) { alert('Error: ' + fobRes.error); return }
      showToast(`✓ FOB entry created for ${row.batch_id}`)
      setFobModal(null); setFobReason('')
      loadRows()
    } finally { setSaving(false) }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const visible = cols.filter(c => c.visible)
  const displayRows = search.trim()
    ? rows.filter(r =>
        [r.batch_id, r.orderNo, r.party, r.color, r.article]
          .some(v => String(v || '').toLowerCase().includes(search.toLowerCase()))
      )
    : rows

  // Only show the full-page loading placeholder on the true first load (no
  // data yet). Every action handler (Done/Rollback/Faulty/FOB) calls loadRows()
  // again afterward to get fresh authoritative data — without this guard,
  // `loading` briefly flips true on EVERY action and this same block would
  // blank the entire page (table, search, columns, everything) each time,
  // even though the existing rows were still perfectly valid to keep showing.
  if (loading && rows.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading {processCode}-FMS…
    </div>
  )

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 42px)', padding: '12px 16px 0' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10, flexShrink: 0 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            {processCode}-FMS
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 10 }}>
            {displayRows.length} batch{displayRows.length !== 1 ? 'es' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search batch, order, party…"
            style={{ fontSize: 12, padding: '6px 10px', width: 220,
              border: '1px solid var(--border-medium)', borderRadius: 5,
              background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          {search && <button className="xs" onClick={() => setSearch('')}>✕</button>}
          <button className="small" onClick={() => setShowCols(v => !v)}>
            ⚙ Columns ({visible.length}/{cols.length})
          </button>
          <button className="small" onClick={() => router.push('/fms')}>← Back</button>
          <button className="small" onClick={loadRows}>⟳</button>
        </div>
      </div>

      {toast && (
        <div style={{ flexShrink: 0, background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* Column panel */}
      {showCols && (
        <div style={{ flexShrink: 0, padding: '10px 14px', background: 'var(--bg-secondary)',
          border: '1px solid var(--border-light)', borderRadius: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Show / Hide Columns</span>
            <button className="xs" onClick={() => saveCols(DEFAULT_COLS)}>Reset</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
            {cols.map(col => (
              <label key={col.id} style={{ display: 'flex', alignItems: 'center',
                gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={col.visible}
                  onChange={() => saveCols(cols.map(c => c.id === col.id ? { ...c, visible: !c.visible } : c))}
                  style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-primary)',
        border: '1px solid var(--border-light)', borderRadius: 8, overflow: 'hidden',
        display: 'flex', flexDirection: 'column' }}>
        {rows.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
            flex: 1, color: 'var(--text-tertiary)', fontSize: 14 }}>
            No batches at {processCode} right now.
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                {visible.map(c => <col key={c.id} style={{ width: c.width }} />)}
              </colgroup>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10,
                background: 'var(--bg-secondary)' }}>
                <tr>
                  {visible.map(col => (
                    <th key={col.id} style={{ padding: '9px 8px', textAlign: 'left',
                      fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      borderBottom: '2px solid var(--border-light)',
                      width: col.width, minWidth: col.minWidth,
                      position: 'relative', userSelect: 'none',
                      background: col.id === 'actions' ? 'var(--accent-light)' : 'var(--bg-secondary)',
                      whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {col.label}
                      <div onMouseDown={e => startResize(col.id, e)}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0,
                          width: 6, cursor: 'col-resize', zIndex: 1,
                          background: resizing === col.id ? 'var(--accent)' : 'transparent' }}
                        onMouseEnter={e => { if (!resizing) (e.target as HTMLElement).style.background = 'var(--border-medium)' }}
                        onMouseLeave={e => { if (!resizing) (e.target as HTMLElement).style.background = 'transparent' }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, idx) => (
                  <tr key={row.id || idx} style={{
                    background: row.bpStatus === 'fob'    ? '#F3E8FF'
                              : row.isFaulty                    ? '#FEE2E2'
                              : row.isCompleted                 ? 'var(--success-light)'
                              : idx % 2 === 0                  ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderBottom: row.isFaulty ? '1px solid #FCA5A5' : '1px solid var(--border-light)',
                    opacity: 1 }}>
                    {visible.map(col => {
                      const s: React.CSSProperties = { padding: '9px 8px', fontSize: 12,
                        color: 'var(--text-primary)', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: col.width }
                      switch (col.id) {
                        case 'created_at':    return <td key={col.id} style={{ ...s, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(row.sentAt || row.created_at)}</td>
                        case 'orderNo':       return <td key={col.id} style={{ ...s, fontWeight: 700 }}>{row.orderNo}</td>
                        case 'batch_id':      return (
                          <td key={col.id} style={{ ...s, fontWeight: 700, color: 'var(--accent)' }}>
                            {row.batch_id}
                            {(() => {
                              const info = getCollabInfo(row, processCode, allBatches)
                              if (!info.hasCollab) return null
                              const names = info.partners.map(p => p.batchId).join(', ')
                              return (
                                <span
                                  title={`Collab with: ${names}${info.allArrived ? ' — all arrived' : ' — waiting on: ' + info.partners.filter(p => !p.arrived).map(p => p.batchId).join(', ')}`}
                                  style={{
                                    marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                                    background: info.allArrived ? '#DBEAFE' : '#FEF3C7',
                                    color: info.allArrived ? '#1E40AF' : '#92400E',
                                  }}>
                                  🔗 {info.allArrived ? 'Collab' : 'Waiting'}
                                </span>
                              )
                            })()}
                          </td>
                        )
                        case 'party':         return <td key={col.id} style={s}>{row.party}</td>
                        case 'article':       return <td key={col.id} style={{ ...s, fontWeight: 500 }}>{row.article}</td>
                        case 'color':         return <td key={col.id} style={s}>{row.color}</td>
                        case 'blend':         return <td key={col.id} style={{ ...s, color: 'var(--text-secondary)' }}>{row.blend || '-'}</td>
                        case 'qty_kg':        return <td key={col.id} style={{ ...s, fontWeight: 700 }}>{row.kg}</td>
                        case 'supervisor':    return <td key={col.id} style={s}>{row.supervisorName}</td>
                        case 'machine':       return <td key={col.id} style={s}>{row.machineName}</td>
                        case 'sub_party':     return <td key={col.id} style={s}>{row.sub_party}</td>
                        case 'sales_person':  return <td key={col.id} style={{ ...s, color:'var(--accent)' }}>{row.sales_person}</td>
                        case 'width':         return <td key={col.id} style={s}>{row.width}</td>
                        case 'gsm':           return <td key={col.id} style={{ ...s, fontWeight:700, color:'var(--accent)' }}>{row.gsm}</td>
                        case 'lab_no':        return <td key={col.id} style={{ ...s, fontSize:11, color:'var(--accent)' }}>{row.lab_no}</td>
                        case 'lot_no':        return <td key={col.id} style={{ ...s, fontSize:11 }}>{row.lot_no}</td>
                        case 'challan_no':    return <td key={col.id} style={{ ...s, fontSize:11, color:'var(--accent)' }}>{row.challan_no}</td>
                        case 'qty_mtr':       return <td key={col.id} style={{ ...s, fontWeight:600, color:'var(--accent)' }}>{row.qty_mtr}</td>
                        case 'no_of_taka':    return <td key={col.id} style={{ ...s, fontWeight:600, color:'var(--accent)' }}>{row.no_of_taka}</td>
                        case 'type_of_finish':  return <td key={col.id} style={s}>{row.type_of_finish}</td>
                        case 'type_of_packing': return <td key={col.id} style={{ ...s, color:'var(--accent)' }}>{row.type_of_packing}</td>
                        case 'remarks':       return <td key={col.id} style={{ ...s, fontSize:11, whiteSpace:'normal' }}>{row.remarks}</td>
                        case 'delivery_date': return <td key={col.id} style={{ ...s, fontWeight:700, color:'var(--warning)' }}>{row.delivery_date !== '-' ? fmtDate(row.delivery_date) : '-'}</td>
                        case 'process_route': return <td key={col.id} style={{ ...s, fontWeight: 600, color: 'var(--accent)' }}>{row.routeStr}</td>
                        case 'planned_date':  return <td key={col.id} style={{ ...s, fontWeight: 700, color: row.plannedDate ? 'var(--success)' : 'var(--text-tertiary)' }}>{row.plannedDate ? fmtDate(row.plannedDate) : '-'}</td>
                        case 'actual_date':   return (
                          <td key={col.id} style={{ ...s, fontWeight: 700,
                            color: row.actualDate
                              ? (row.bpStatus === 'faulty' ? 'var(--danger)'
                                : row.hasFob ? 'var(--purple)' : 'var(--success)')
                              : 'var(--text-tertiary)' }}>
                            {row.actualDateTime ? fmtDateTime(row.actualDateTime) : '-'}
                          </td>
                        )
                        case 'time_delay':    return <td key={col.id} style={{ ...s, fontWeight: 700, color: row.delayLate ? 'var(--danger)' : 'var(--success)' }}>{row.delayText}</td>
                        case 'actions': {
                          // Determine which action has been taken
                          const isDone   = row.bpStatus === 'done'
                          const isFaulty = row.bpStatus === 'faulty'
                          const hasFob   = row.hasFob
                          // One action taken = lock other two; Delete always works
                          const anyDone  = isDone || isFaulty || hasFob

                          const btnBase: React.CSSProperties = {
                            padding: '4px 10px', fontSize: 11, fontWeight: 600,
                            borderRadius: 4, cursor: 'pointer', border: 'none',
                          }
                          const disabledStyle: React.CSSProperties = {
                            opacity: 0.3, cursor: 'not-allowed', pointerEvents: 'none'
                          }

                          return (
                            <td key={col.id} style={{ ...s, overflow: 'visible' }}>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>

                                {/* DONE button */}
                                <button
                                  onClick={() => !anyDone && handleDone(row)}
                                  disabled={anyDone || saving}
                                  style={{
                                    ...btnBase,
                                    background: isDone ? '#DCFCE7' : anyDone ? '#F3F4F6' : '#16A34A',
                                    color:      isDone ? '#16A34A' : anyDone ? '#9CA3AF' : '#fff',
                                    border:     isDone ? '1px solid #16A34A' : '1px solid transparent',
                                    ...(anyDone && !isDone ? disabledStyle : {})
                                  }}>
                                  {isDone ? '✓ Done' : 'Done'}
                                </button>

                                {/* FAULTY button */}
                                <button
                                  onClick={() => {
                                    if (anyDone) return
                                    const block = collabBlockMessage(row, processCode, allBatches)
                                    if (block) { alert(block); return }
                                    setFaultyModal(row); setFaultyReason('')
                                  }}
                                  disabled={anyDone || saving}
                                  style={{
                                    ...btnBase,
                                    background:   isFaulty ? '#FEE2E2' : 'transparent',
                                    color:        isFaulty ? '#DC2626' : anyDone ? '#9CA3AF' : '#DC2626',
                                    border:       `1px solid ${isFaulty ? '#DC2626' : anyDone ? '#E5E7EB' : '#DC2626'}`,
                                    ...(anyDone && !isFaulty ? disabledStyle : {})
                                  }}>
                                  {isFaulty ? '⚠ Faulty' : 'Faulty'}
                                </button>

                                {/* FOB button */}
                                <button
                                  onClick={() => {
                                    if (anyDone) return
                                    const block = collabBlockMessage(row, processCode, allBatches)
                                    if (block) { alert(block); return }
                                    setFobModal(row); setFobType('dyeing'); setFobReason('')
                                  }}
                                  disabled={anyDone || saving}
                                  style={{
                                    ...btnBase,
                                    background: hasFob ? '#F3E8FF' : 'transparent',
                                    color:      hasFob ? '#7C3AED' : anyDone ? '#9CA3AF' : '#7C3AED',
                                    border:     `1px solid ${hasFob ? '#7C3AED' : anyDone ? '#E5E7EB' : '#7C3AED'}`,
                                    ...(anyDone && !hasFob ? disabledStyle : {})
                                  }}>
                                  {hasFob ? '✓ FOB' : '+ FOB'}
                                </button>

                                {/* DELETE — always enabled */}
                                <button
                                  onClick={() => handleRollback(row)}
                                  disabled={saving}
                                  style={{ ...btnBase, background:'transparent',
                                    color:'#DC2626', border:'1px solid #DC2626' }}
                                  title="Roll back to previous process">
                                  ↩ Delete
                                </button>

                              </div>
                            </td>
                          )
                        }
                        default: return <td key={col.id} style={s}>-</td>
                      }
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Faulty modal */}
      {faultyModal && (
        <div className="modal-overlay" onClick={() => setFaultyModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Mark Batch as Faulty</span>
              <button className="small" onClick={() => setFaultyModal(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
              <strong style={{ color: 'var(--accent)' }}>{faultyModal.batch_id}</strong>
              <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>
                {faultyModal.party} · {faultyModal.color} · {faultyModal.kg} Kg
              </span>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Fault reason / remark *</label>
              <textarea value={faultyReason} rows={3} autoFocus
                placeholder="e.g. Shade variation, Crease mark, Uneven dyeing…"
                onChange={e => setFaultyReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setFaultyModal(null)}>Cancel</button>
              <button style={{ background: 'var(--danger)', color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: 6, fontWeight: 700, cursor: 'pointer',
                opacity: faultyReason.trim() ? 1 : 0.5 }}
                disabled={!faultyReason.trim() || saving}
                onClick={handleFaulty}>
                {saving ? 'Saving…' : 'Mark as Faulty'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOB modal */}
      {fobModal && (
        <div className="modal-overlay" onClick={() => setFobModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Raise FOB Entry</span>
              <button className="small" onClick={() => setFobModal(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
              <strong style={{ color: 'var(--purple)' }}>{fobModal.batch_id}</strong>
              <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>
                {fobModal.party} · {processCode}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['dyeing','rolling'] as const).map(t => (
                <button key={t} onClick={() => setFobType(t)} style={{
                  flex: 1, padding: 8, fontSize: 13, fontWeight: fobType === t ? 700 : 400,
                  border: `1px solid ${fobType === t ? 'var(--accent)' : 'var(--border-medium)'}`,
                  borderRadius: 6, cursor: 'pointer',
                  background: fobType === t ? 'var(--accent)' : 'var(--bg-primary)',
                  color: fobType === t ? '#fff' : 'var(--text-primary)' }}>
                  {t === 'dyeing' ? '🔵 Dyeing FOB' : '🟣 Rolling FOB'}
                </button>
              ))}
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Reason / remark *</label>
              <textarea value={fobReason} rows={3} autoFocus
                placeholder={fobType === 'dyeing' ? 'e.g. Shade variation, Patta…' : 'e.g. Roller mark, Crease…'}
                onChange={e => setFobReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setFobModal(null)}>Cancel</button>
              <button className="primary" onClick={handleFob}
                disabled={!fobReason.trim() || saving}>
                {saving ? 'Saving…' : 'Add FOB Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
