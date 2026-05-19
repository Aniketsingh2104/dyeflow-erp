'use client'

import { useEffect, useState } from 'react'
import { PROCESS_MAP, loadOrSeedProcessList } from '@/lib/processMap'
import * as XLSX from 'xlsx'

export interface FOBRecord {
  id: string
  type: 'dyeing' | 'rolling'
  batchId: string
  orderNo: string
  party: string
  subParty?: string
  salesPerson?: string
  article?: string
  blend?: string
  width?: string
  gsm?: string
  color?: string
  labNo?: string
  lotNo?: string
  challanNo?: string
  supervisor?: string
  processCode?: string
  processName?: string
  qtyKg: number
  qtyMtr?: string
  noOfTaka?: string
  typeOfFinish?: string
  typeOfPacking?: string
  orderRemarks?: string
  date: string
  reason: string
  status: 'open' | 'resolved'
  resolvedAt?: string
  resolvedNote?: string
  createdAt: string
  fobSent?: boolean
  fobSentAt?: string
  fobApproved?: boolean
  fobApprovedAt?: string
  fobReprocess?: boolean
  fobReprocessAt?: string
}

interface ColumnConfig {
  id: string
  label: string
  visible: boolean
  width: number
  minWidth?: number
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'createdAt',     label: 'TIME STAMP',       visible: true,  width: 150, minWidth: 100 },
  { id: 'batchId',       label: 'BATCH ID',          visible: true,  width: 130, minWidth: 80  },
  { id: 'orderNo',       label: 'ORDER #',            visible: true,  width: 130, minWidth: 80  },
  { id: 'party',         label: 'PARTY',              visible: true,  width: 150, minWidth: 100 },
  { id: 'subParty',      label: 'SUB PARTY',          visible: true,  width: 120, minWidth: 80  },
  { id: 'salesPerson',   label: 'SALES PERSON',       visible: true,  width: 130, minWidth: 90  },
  { id: 'article',       label: 'ARTICLE',            visible: true,  width: 130, minWidth: 80  },
  { id: 'blend',         label: 'BLEND',              visible: true,  width: 100, minWidth: 70  },
  { id: 'width',         label: 'WIDTH',              visible: true,  width: 80,  minWidth: 60  },
  { id: 'gsm',           label: 'GSM',                visible: true,  width: 80,  minWidth: 60  },
  { id: 'color',         label: 'COLOR',              visible: true,  width: 130, minWidth: 80  },
  { id: 'labNo',         label: 'LAB NO.',            visible: true,  width: 100, minWidth: 70  },
  { id: 'lotNo',         label: 'LOT NO.',            visible: true,  width: 100, minWidth: 70  },
  { id: 'challanNo',     label: 'CHALLAN NO.',        visible: true,  width: 110, minWidth: 80  },
  { id: 'qtyKg',         label: 'QTY (KG)',           visible: true,  width: 100, minWidth: 70  },
  { id: 'qtyMtr',        label: 'QTY (MTR.)',         visible: true,  width: 100, minWidth: 70  },
  { id: 'noOfTaka',      label: 'NO. OF TA',          visible: true,  width: 100, minWidth: 70  },
  { id: 'typeOfFinish',  label: 'TYPE OF FINISH',     visible: true,  width: 140, minWidth: 100 },
  { id: 'typeOfPacking', label: 'TYPE OF PACKING',    visible: true,  width: 150, minWidth: 100 },
  { id: 'orderRemarks',  label: 'REMARKS',            visible: true,  width: 200, minWidth: 120 },
  { id: 'supervisor',    label: 'SUPERVISOR',         visible: true,  width: 130, minWidth: 80  },
  { id: 'processName',   label: 'PROCESS',            visible: true,  width: 110, minWidth: 70  },
  { id: 'reason',        label: 'FOB REASON',         visible: true,  width: 250, minWidth: 150 },
  { id: 'date',          label: 'FOB DATE',           visible: true,  width: 120, minWidth: 80  },
  { id: 'status',        label: 'STATUS',             visible: true,  width: 110, minWidth: 80  },
  { id: 'resolvedAt',    label: 'RESOLVED AT',        visible: true,  width: 150, minWidth: 100 },
  { id: 'resolvedNote',  label: 'RESOLVE NOTE',       visible: true,  width: 200, minWidth: 120 },
  { id: 'fobSent',          label: 'FOB SENT',           visible: true,  width: 100, minWidth: 80  },
  { id: 'fobSentAt',        label: 'FOB SENT TIME',      visible: true,  width: 150, minWidth: 110 },
  { id: 'fobApproved',      label: 'FOB APPROVED',       visible: true,  width: 110, minWidth: 80  },
  { id: 'fobApprovedAt',    label: 'FOB APPROVED TIME',  visible: true,  width: 150, minWidth: 110 },
  { id: 'fobReprocess',     label: 'REPROCESS',          visible: true,  width: 100, minWidth: 80  },
  { id: 'fobReprocessAt',   label: 'REPROCESS TIME',     visible: true,  width: 150, minWidth: 110 },
  { id: 'action',           label: 'ACTION',             visible: true,  width: 140, minWidth: 100 },
]

function fmtDateTime(s: string) {
  if (!s) return '-'
  try {
    const d = new Date(s)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const mn = String(d.getMinutes()).padStart(2, '0')
    return `${dd}-${mm}-${yy} ${hh}:${mn}`
  } catch { return s }
}

function fmtDate(s: string) {
  if (!s) return '-'
  try {
    const d = new Date(s)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = d.getFullYear()
    return `${dd}-${mm}-${yy}`
  } catch { return s }
}

export default function FOBPage() {
  const [tab, setTab] = useState<'dyeing' | 'rolling'>('dyeing')
  const [records, setRecords] = useState<FOBRecord[]>([])
  const [enrichedRecords, setEnrichedRecords] = useState<FOBRecord[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showResolveModal, setShowResolveModal] = useState(false)
  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const [resolveRecord, setResolveRecord] = useState<FOBRecord | null>(null)
  const [resolveNote, setResolveNote] = useState('')
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS)
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [batchOptions, setBatchOptions] = useState<any[]>([])

  const [form, setForm] = useState({
    batchId: '', orderNo: '', party: '', article: '', color: '', blend: '',
    qtyKg: '', reason: '', processCode: '',
    date: new Date().toISOString().split('T')[0],
    status: 'open' as 'open' | 'resolved',
  })

  useEffect(() => {
    loadData()
    loadBatchOptions()
    loadColumnSettings()
  }, [])

  const loadColumnSettings = () => {
    const saved = localStorage.getItem('fob_column_settings')
    if (saved) {
      try { setColumns(JSON.parse(saved)) } catch {}
    }
  }

  const saveColumnSettings = (cols: ColumnConfig[]) => {
    localStorage.setItem('fob_column_settings', JSON.stringify(cols))
    setColumns(cols)
  }

  const toggleColumnVisibility = (id: string) => {
    saveColumnSettings(columns.map(c => c.id === id ? { ...c, visible: !c.visible } : c))
  }

  const resetColumns = () => saveColumnSettings(DEFAULT_COLUMNS)

  const startResize = (columnId: string, e: React.MouseEvent) => {
    e.preventDefault()
    setResizingColumn(columnId)
    const startX = e.clientX
    const col = columns.find(c => c.id === columnId)
    if (!col) return
    const startWidth = col.width

    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(col.minWidth || 60, startWidth + (ev.clientX - startX))
      setColumns(prev => prev.map(c => c.id === columnId ? { ...c, width: newW } : c))
    }
    const onUp = () => {
      setResizingColumn(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const loadData = () => {
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return
    const db = JSON.parse(raw)
    const fobRecords: FOBRecord[] = db.fobRecords || []

    // Enrich FOB records with full order data
    const enriched = fobRecords.map((r: FOBRecord) => {
      // Find matching order
      let orderData: any = null
      let batchData: any = null
      for (const order of (db.orders || [])) {
        if (
          (r.orderNo && order.orderNumber === r.orderNo) ||
          (r.batchId && (order.splits || []).some((b: any) => b.batchId === r.batchId))
        ) {
          orderData = order
          batchData = (order.splits || []).find((b: any) => b.batchId === r.batchId) || null
          break
        }
      }

      return {
        ...r,
        subParty:      orderData?.subParty      || r.subParty      || '',
        salesPerson:   orderData?.salesPerson   || r.salesPerson   || '',
        article:       orderData?.article       || r.article       || '',
        blend:         orderData?.blend         || r.blend         || '',
        width:         orderData?.width         || r.width         || '',
        gsm:           orderData?.gsm           || r.gsm           || '',
        color:         orderData?.color         || r.color         || '',
        labNo:         orderData?.labNo         || r.labNo         || '',
        lotNo:         orderData?.lotNo         || r.lotNo         || '',
        challanNo:     orderData?.challanNo     || r.challanNo     || '',
        qtyMtr:        batchData?.mtr           || orderData?.qtyMtr    || r.qtyMtr    || '',
        noOfTaka:      batchData?.taka          || orderData?.noOfTaka  || r.noOfTaka  || '',
        typeOfFinish:  orderData?.typeOfFinish  || r.typeOfFinish  || '',
        typeOfPacking: orderData?.typeOfPacking || r.typeOfPacking || '',
        orderRemarks:  orderData?.remarks       || r.orderRemarks  || '',
        supervisor:    orderData?.supervisor    || r.supervisor    || '',
        qtyKg:         parseFloat(String(batchData?.kg || orderData?.qtyKg || r.qtyKg || 0)),
      }
    })

    setRecords(fobRecords)
    setEnrichedRecords(enriched)
  }

  const loadBatchOptions = () => {
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return
    const db = JSON.parse(raw)
    const opts: any[] = []
    for (const order of (db.orders || [])) {
      for (const batch of (order.splits || [])) {
        opts.push({
          batchId: batch.batchId, orderNo: order.orderNumber,
          party: order.party, article: order.article,
          color: order.color, blend: order.blend,
          supervisor: order.supervisor, qtyKg: batch.kg || order.qtyKg,
        })
      }
    }
    setBatchOptions(opts)
  }

  const handleBatchSelect = (batchId: string) => {
    const opt = batchOptions.find(o => o.batchId === batchId)
    if (opt) {
      setForm(prev => ({
        ...prev, batchId,
        orderNo: opt.orderNo || prev.orderNo,
        party:   opt.party   || prev.party,
        article: opt.article || prev.article,
        color:   opt.color   || prev.color,
        blend:   opt.blend   || prev.blend,
        qtyKg:   String(opt.qtyKg || '') || prev.qtyKg,
      }))
    } else {
      setForm(prev => ({ ...prev, batchId }))
    }
  }

  const saveRecord = () => {
    if (!form.batchId.trim() || !form.reason.trim()) {
      alert('Batch ID and Reason are required.')
      return
    }
    const raw = localStorage.getItem('dyeflow_db')
    const db = raw ? JSON.parse(raw) : {}
    if (!db.fobRecords) db.fobRecords = []
    db.fobRecords.push({
      id: `FOB${Date.now()}`, type: tab,
      batchId: form.batchId.trim(), orderNo: form.orderNo.trim(),
      party: form.party.trim(), article: form.article.trim(),
      color: form.color.trim(), blend: form.blend.trim(),
      supervisor: '', processCode: form.processCode.trim(),
      processName: form.processCode.trim(),
      qtyKg: parseFloat(form.qtyKg) || 0,
      date: form.date, reason: form.reason.trim(),
      status: form.status, createdAt: new Date().toISOString(),
    })
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
    loadData()
    closeModal()
  }

  const closeModal = () => {
    setShowModal(false)
    setForm({
      batchId: '', orderNo: '', party: '', article: '', color: '', blend: '',
      qtyKg: '', reason: '', processCode: '',
      date: new Date().toISOString().split('T')[0], status: 'open',
    })
  }

  const toggleFobCheck = (id: string, field: 'fobSent' | 'fobApproved' | 'fobReprocess', current: boolean) => {
    // Once ticked, these checkboxes cannot be unticked
    if (current) return
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return
    const db = JSON.parse(raw)
    const rec = (db.fobRecords || []).find((r: FOBRecord) => r.id === id)
    if (!rec) return

    rec[field] = !current

    // Timestamps — only set, never removed
    if (field === 'fobSent')      rec.fobSentAt      = new Date().toISOString()
    if (field === 'fobApproved')  rec.fobApprovedAt  = new Date().toISOString()
    if (field === 'fobReprocess') rec.fobReprocessAt = new Date().toISOString()

    // ── FOB APPROVED: advance batch to next FMS process (same as IF OK in Faulty page) ──
    if (field === 'fobApproved' && !current) {
      // Find the batch and its order
      let targetBatch: any = null
      let targetOrder: any = null
      for (const order of (db.orders || [])) {
        const batch = (order.splits || []).find((b: any) => b.batchId === rec.batchId)
        if (batch) { targetBatch = batch; targetOrder = order; break }
      }

      if (targetBatch && targetOrder) {
        // The FOB was raised at processCode — use that as the current process
        // processName is stored as e.g. "CBR [CBR-FMS]" so extract the code
        const rawProcessCode = rec.processCode || rec.processName || ''
        // Strip the "[xxx-FMS]" suffix if present
        const processTag = rawProcessCode.replace(/\s*\[[^\]]+\]/, '').trim()

        // Build name→code map from processList
        const processList = loadOrSeedProcessList()
        const nameToCode: Record<string, string> = {}
        processList.forEach((p: any) => { nameToCode[p.name] = p.code })
        Object.entries(PROCESS_MAP).forEach(([code, name]) => {
          if (!nameToCode[name]) nameToCode[name] = code
        })

        // Resolve current process code
        // Try direct code match first, then name match
        let currentProcessCode = processList.find((p: any) =>
          p.code.toUpperCase() === processTag.toUpperCase()
        )?.code || nameToCode[processTag] || ''

        // If processName contains the code in brackets like "CBR [C-FMS]", extract it
        if (!currentProcessCode) {
          const bracketMatch = rawProcessCode.match(/\[([^-\]]+)-FMS\]/)
          if (bracketMatch) currentProcessCode = bracketMatch[1]
        }

        if (currentProcessCode) {
          const processRoute: string[] = targetOrder.processRoute || []

          // Initialize FMS objects if missing
          if (!targetBatch.fmsDispatch)       targetBatch.fmsDispatch = {}
          if (!targetBatch.fmsActiveProcesses) targetBatch.fmsActiveProcesses = {}
          if (!targetBatch.fmsActualDates)     targetBatch.fmsActualDates = {}
          if (!targetBatch.fmsEnterAt)         targetBatch.fmsEnterAt = {}

          // Mark current process as DONE
          const today = new Date().toISOString().split('T')[0]
          targetBatch.fmsActualDates[currentProcessCode] = today

          // Build full route (add tail processes if not present)
          const fullRoute = [...processRoute]
          if (!fullRoute.includes('Qa') && !fullRoute.includes('QA')) fullRoute.push('Qa')
          if (!fullRoute.includes('Packing'))  fullRoute.push('Packing')
          if (!fullRoute.includes('Dispatch')) fullRoute.push('Dispatch')

          // Find next process
          const currentIdx = fullRoute.indexOf(currentProcessCode)
          const nextProc = currentIdx >= 0 ? (fullRoute[currentIdx + 1] || '') : ''

          if (nextProc) {
            targetBatch.fmsActiveProcesses[nextProc] = true
            targetBatch.fmsCurrentProcess = nextProc
            targetBatch.fmsDone = false

            const nowIso = new Date().toISOString()
            if (!targetBatch.fmsDispatch[nextProc]?.sent) {
              targetBatch.fmsDispatch[nextProc] = { sent: true, sentAt: nowIso, source: 'fob-approved' }
            }
            if (!targetBatch.fmsEnterAt[nextProc]) {
              targetBatch.fmsEnterAt[nextProc] = nowIso
            }

            const nextName = processList.find((p: any) => p.code === nextProc)?.name || PROCESS_MAP[nextProc] || nextProc
            alert(`✓ FOB Approved!\n\nBatch ${rec.batchId} moved to next process: ${nextName} (${nextProc})`)
          } else {
            targetBatch.fmsCurrentProcess = currentProcessCode
            targetBatch.fmsDone = true
            alert(`✓ FOB Approved!\n\nBatch ${rec.batchId} — this was the final process.`)
          }
        } else {
          alert(`✓ FOB Approved! (Note: process code "${processTag}" could not be resolved — batch position not updated.)`)
        }
      }
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
    loadData()
  }

  const doResolve = () => {
    if (!resolveRecord) return
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return
    const db = JSON.parse(raw)
    const rec = (db.fobRecords || []).find((r: FOBRecord) => r.id === resolveRecord.id)
    if (!rec) return
    rec.status = 'resolved'
    rec.resolvedAt = new Date().toISOString()
    rec.resolvedNote = resolveNote.trim()
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
    setShowResolveModal(false)
    setResolveRecord(null)
    setResolveNote('')
    loadData()
  }

  const deleteRecord = (id: string, batchId: string) => {
    if (!confirm(`Delete FOB record for batch ${batchId}?`)) return
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return
    const db = JSON.parse(raw)
    db.fobRecords = (db.fobRecords || []).filter((r: FOBRecord) => r.id !== id)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const exportToExcel = () => {
    if (filtered.length === 0) { alert('No records to export.'); return }
    const headers = DEFAULT_COLUMNS.filter(c => c.id !== 'action').map(c => c.label)
    const rows = filtered.map(r => [
      fmtDateTime(r.createdAt), r.batchId, r.orderNo || '-', r.party || '-',
      r.subParty || '-', r.salesPerson || '-', r.article || '-', r.blend || '-',
      r.width || '-', r.gsm || '-', r.color || '-',
      r.labNo || '-', r.lotNo || '-', r.challanNo || '-',
      r.qtyKg || 0, r.qtyMtr || '-', r.noOfTaka || '-',
      r.typeOfFinish || '-', r.typeOfPacking || '-', r.orderRemarks || '-',
      r.supervisor || '-', r.processName || r.processCode || '-',
      r.reason, fmtDate(r.date), r.status,
      r.resolvedAt ? fmtDateTime(r.resolvedAt) : '-',
      r.resolvedNote || '-',
      r.fobSent ? 'Yes' : 'No',
      r.fobSentAt ? fmtDateTime(r.fobSentAt) : '-',
      r.fobApproved ? 'Yes' : 'No',
      r.fobApprovedAt ? fmtDateTime(r.fobApprovedAt) : '-',
      r.fobReprocess ? 'Yes' : 'No',
      r.fobReprocessAt ? fmtDateTime(r.fobReprocessAt) : '-',
    ])
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = headers.map(() => ({ wch: 16 }))
    XLSX.utils.book_append_sheet(wb, ws, tab === 'dyeing' ? 'Dyeing FOB' : 'Rolling FOB')
    XLSX.writeFile(wb, `DyeFlow-FOB-${tab}-${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.xlsx`)
  }

  const filtered = enrichedRecords
    .filter(r => r.type === tab)
    .filter(r => statusFilter === 'all' || r.status === statusFilter)
    .filter(r => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return [r.batchId, r.orderNo, r.party, r.article, r.color, r.processName, r.reason, r.supervisor]
        .some(v => (v || '').toLowerCase().includes(q))
    })

  const openCount  = enrichedRecords.filter(r => r.type === tab && r.status === 'open').length
  const totalCount = enrichedRecords.filter(r => r.type === tab).length
  const visibleColumns = columns.filter(c => c.visible)

  const accentColor = tab === 'dyeing' ? '#185FA5' : '#7C3AED'

  const getCellContent = (r: FOBRecord, colId: string) => {
    switch (colId) {
      case 'createdAt':     return fmtDateTime(r.createdAt)
      case 'batchId':       return r.batchId
      case 'orderNo':       return r.orderNo || '-'
      case 'party':         return r.party || '-'
      case 'subParty':      return (r as any).subParty || '-'
      case 'salesPerson':   return (r as any).salesPerson || '-'
      case 'article':       return r.article || '-'
      case 'blend':         return r.blend || '-'
      case 'width':         return (r as any).width || '-'
      case 'gsm':           return (r as any).gsm || '-'
      case 'color':         return r.color || '-'
      case 'labNo':         return (r as any).labNo || '-'
      case 'lotNo':         return (r as any).lotNo || '-'
      case 'challanNo':     return (r as any).challanNo || '-'
      case 'qtyKg':         return r.qtyKg || '-'
      case 'qtyMtr':        return (r as any).qtyMtr || '-'
      case 'noOfTaka':      return (r as any).noOfTaka || '-'
      case 'typeOfFinish':  return (r as any).typeOfFinish || '-'
      case 'typeOfPacking': return (r as any).typeOfPacking || '-'
      case 'orderRemarks':  return (r as any).orderRemarks || '-'
      case 'supervisor':    return r.supervisor || '-'
      case 'processName':   return r.processName || r.processCode || '-'
      case 'reason':        return r.reason
      case 'date':          return fmtDate(r.date)
      case 'resolvedAt':    return r.resolvedAt ? fmtDateTime(r.resolvedAt) : '-'
      case 'resolvedNote':  return r.resolvedNote || '-'
      default:              return '-'
    }
  }

  return (
    <div className="content">
      <div className="card">
        {/* Header */}
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="card-title">🔄 FOB Records</span>
              {/* Tab toggles inside header */}
              <div style={{ display: 'flex', gap: 6 }}>
                {(['dyeing', 'rolling'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    padding: '5px 14px', fontSize: 12, fontWeight: tab === t ? 700 : 500,
                    border: 'none', borderRadius: 20, cursor: 'pointer',
                    background: tab === t ? (t === 'dyeing' ? '#185FA5' : '#7C3AED') : 'var(--bg-secondary)',
                    color: tab === t ? '#fff' : 'var(--text-secondary)',
                  }}>
                    {t === 'dyeing' ? '🔵 Dyeing' : '🟣 Rolling'}
                    <span style={{ marginLeft: 6, background: 'rgba(255,255,255,0.25)', padding: '0 6px', borderRadius: 10, fontSize: 10 }}>
                      {enrichedRecords.filter(r => r.type === t).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Fresh On Board entries raised from FMS processes or added manually
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={exportToExcel}
              style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, background: '#1D9E75', color: '#fff', cursor: 'pointer' }}>
              ⬇ Export (.xlsx)
            </button>
            <button onClick={() => setShowColumnSettings(!showColumnSettings)}
              style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border-medium)', borderRadius: 6, background: 'var(--bg-primary)', cursor: 'pointer' }}>
              ⚙️ Columns
            </button>
            <button onClick={() => setShowModal(true)}
              style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 6, background: accentColor, color: '#fff', cursor: 'pointer' }}>
              + New FOB Entry
            </button>
          </div>
        </div>

        {/* Column Settings Panel */}
        {showColumnSettings && (
          <div style={{ padding: 16, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)', maxHeight: 300, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Show / Hide Columns</span>
              <button onClick={resetColumns} style={{ padding: '3px 10px', fontSize: 11, border: '1px solid var(--border-medium)', borderRadius: 4, background: 'var(--bg-primary)', cursor: 'pointer' }}>
                Reset to Default
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {columns.map(col => (
                <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={col.visible} onChange={() => toggleColumnVisibility(col.id)} style={{ cursor: 'pointer' }} />
                  {col.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search batch, order, party, article, supervisor…"
            style={{ minWidth: 220, maxWidth: 320, fontSize: 12, padding: '6px 10px', border: '1px solid var(--border-medium)', borderRadius: 5 }} />
          <div style={{ display: 'flex', gap: 5 }}>
            {(['all', 'open', 'resolved'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                padding: '5px 12px', fontSize: 11, fontWeight: statusFilter === s ? 600 : 400,
                border: `1px solid ${statusFilter === s ? accentColor : 'var(--border-light)'}`,
                borderRadius: 5, cursor: 'pointer',
                background: statusFilter === s ? accentColor + '15' : 'var(--bg-primary)',
                color: statusFilter === s ? accentColor : 'var(--text-secondary)',
              }}>
                {s === 'all' ? `All (${totalCount})` : s === 'open' ? `Open (${openCount})` : `Resolved (${totalCount - openCount})`}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>{filtered.length} records</span>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{tab === 'dyeing' ? '🔵' : '🟣'}</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No {tab} FOB records</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              {statusFilter !== 'all' ? `No records with status "${statusFilter}". ` : ''}
              FOB entries are raised from FMS process pages or added via "+ New FOB Entry".
            </div>
          </div>
        ) : (
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)' }}>
                <tr>
                  {visibleColumns.map(col => (
                    <th key={col.id} style={{
                      padding: '10px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                      color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px',
                      borderBottom: '2px solid var(--border-light)', whiteSpace: 'nowrap',
                      width: col.width, minWidth: col.minWidth, position: 'relative',
                    }}>
                      {col.label}
                      <div onMouseDown={e => startResize(col.id, e)}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize',
                          background: resizingColumn === col.id ? '#3B82F6' : 'transparent' }}
                        onMouseEnter={e => { if (!resizingColumn) e.currentTarget.style.background = '#D1D5DB' }}
                        onMouseLeave={e => { if (!resizingColumn) e.currentTarget.style.background = 'transparent' }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} style={{
                    background: r.status === 'resolved'
                      ? (i % 2 === 0 ? '#F0FDF4' : '#DCFCE7')
                      : (i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)'),
                    borderBottom: '1px solid var(--border-light)',
                    opacity: r.status === 'resolved' ? 0.85 : 1,
                  }}>
                    {visibleColumns.map(col => {
                      const w = col.width

                      // FOB Sent checkbox
                      if (col.id === 'fobSent') {
                        return (
                          <td key={col.id} style={{ ...tdStyle, width: w, textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={r.fobSent || false}
                              onChange={() => toggleFobCheck(r.id, 'fobSent', r.fobSent || false)}
                              style={{ width: 16, height: 16, accentColor: '#185FA5',
                                cursor: r.fobSent ? 'not-allowed' : 'pointer' }}
                              title={r.fobSent ? '✓ FOB Sent (locked)' : 'Mark FOB as Sent'}
                            />
                          </td>
                        )
                      }

                      // FOB Sent timestamp
                      if (col.id === 'fobSentAt') {
                        return (
                          <td key={col.id} style={{ ...tdStyle, width: w, fontSize: 11,
                            color: r.fobSentAt ? '#185FA5' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            {r.fobSentAt ? fmtDateTime(r.fobSentAt) : '-'}
                          </td>
                        )
                      }

                      // FOB Approved checkbox
                      if (col.id === 'fobApproved') {
                        return (
                          <td key={col.id} style={{ ...tdStyle, width: w, textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={r.fobApproved || false}
                              onChange={() => toggleFobCheck(r.id, 'fobApproved', r.fobApproved || false)}
                              style={{ width: 16, height: 16, accentColor: '#059669',
                                cursor: r.fobApproved ? 'not-allowed' : 'pointer' }}
                              title={r.fobApproved ? '✓ FOB Approved (locked)' : 'Mark FOB as Approved'}
                            />
                          </td>
                        )
                      }

                      // FOB Approved timestamp
                      if (col.id === 'fobApprovedAt') {
                        return (
                          <td key={col.id} style={{ ...tdStyle, width: w, fontSize: 11,
                            color: r.fobApprovedAt ? '#059669' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            {r.fobApprovedAt ? fmtDateTime(r.fobApprovedAt) : '-'}
                          </td>
                        )
                      }

                      // FOB Reprocess checkbox
                      if (col.id === 'fobReprocess') {
                        return (
                          <td key={col.id} style={{ ...tdStyle, width: w, textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={r.fobReprocess || false}
                              onChange={() => toggleFobCheck(r.id, 'fobReprocess', r.fobReprocess || false)}
                              style={{ width: 16, height: 16, accentColor: '#F59E0B',
                                cursor: r.fobReprocess ? 'not-allowed' : 'pointer' }}
                              title={r.fobReprocess ? '✓ Reprocess (locked)' : 'Mark for Reprocess'}
                            />
                          </td>
                        )
                      }

                      // FOB Reprocess timestamp
                      if (col.id === 'fobReprocessAt') {
                        return (
                          <td key={col.id} style={{ ...tdStyle, width: w, fontSize: 11,
                            color: r.fobReprocessAt ? '#D97706' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            {r.fobReprocessAt ? fmtDateTime(r.fobReprocessAt) : '-'}
                          </td>
                        )
                      }

                      // Action column
                      if (col.id === 'action') {
                        return (
                          <td key={col.id} style={{ ...tdStyle, width: w, whiteSpace: 'nowrap' }}>
                            {r.status === 'open' && (
                              <button onClick={() => { setResolveRecord(r); setResolveNote(''); setShowResolveModal(true) }}
                                style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #6EE7B7', borderRadius: 4, background: '#ECFDF5', color: '#059669', cursor: 'pointer', fontWeight: 600, marginRight: 5 }}>
                                Resolve
                              </button>
                            )}
                            <button onClick={() => deleteRecord(r.id, r.batchId)}
                              style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #FCA5A5', borderRadius: 4, background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontWeight: 600 }}>
                              Delete
                            </button>
                          </td>
                        )
                      }

                      // Status column
                      if (col.id === 'status') {
                        return (
                          <td key={col.id} style={{ ...tdStyle, width: w }}>
                            <span style={{
                              padding: '3px 10px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                              background: r.status === 'open' ? '#FEF3C7' : '#D1FAE5',
                              color: r.status === 'open' ? '#92400E' : '#065F46',
                            }}>
                              {r.status === 'open' ? '🔴 Open' : '✅ Resolved'}
                            </span>
                          </td>
                        )
                      }

                      // Process badge
                      if (col.id === 'processName') {
                        const val = r.processName || r.processCode
                        return (
                          <td key={col.id} style={{ ...tdStyle, width: w }}>
                            {val ? (
                              <span style={{ background: '#EDE9FE', color: '#5B21B6', padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700 }}>
                                {val}
                              </span>
                            ) : '-'}
                          </td>
                        )
                      }

                      // Default cell with styling per column
                      const value = getCellContent(r, col.id)
                      let extraStyle: any = {}

                      if (col.id === 'batchId')      { extraStyle = { fontWeight: 700, color: accentColor } }
                      else if (col.id === 'orderNo') { extraStyle = { fontWeight: 600 } }
                      else if (col.id === 'article') { extraStyle = { fontWeight: 500 } }
                      else if (col.id === 'blend')   { extraStyle = { fontSize: 11, color: 'var(--text-tertiary)' } }
                      else if (col.id === 'qtyKg')   { extraStyle = { fontWeight: 700 } }
                      else if (col.id === 'reason')  { extraStyle = { whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: w } }
                      else if (col.id === 'resolvedNote') { extraStyle = { color: '#059669', whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: w } }
                      else if (col.id === 'resolvedAt')   { extraStyle = { color: r.resolvedAt ? '#059669' : 'var(--text-tertiary)' } }
                      else if (col.id === 'date')    { extraStyle = { fontWeight: 600, color: accentColor } }
                      else if (col.id === 'orderRemarks') { extraStyle = { whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: w } }

                      return (
                        <td key={col.id} style={{ ...tdStyle, width: w, ...extraStyle }}>
                          {value}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── New Entry Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{tab === 'dyeing' ? '🔵 Dyeing' : '🟣 Rolling'} FOB — New Entry</span>
              <button className="small" onClick={closeModal}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['dyeing', 'rolling'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  flex: 1, padding: '7px', fontSize: 12, fontWeight: tab === t ? 700 : 400,
                  border: `1px solid ${tab === t ? (t === 'dyeing' ? '#185FA5' : '#7C3AED') : 'var(--border-light)'}`,
                  borderRadius: 5, cursor: 'pointer',
                  background: tab === t ? (t === 'dyeing' ? '#185FA5' : '#7C3AED') : 'var(--bg-primary)',
                  color: tab === t ? '#fff' : 'var(--text-secondary)',
                }}>
                  {t === 'dyeing' ? '🔵 Dyeing FOB' : '🟣 Rolling FOB'}
                </button>
              ))}
            </div>
            <div className="form-group">
              <label>Batch ID *</label>
              <input value={form.batchId} onChange={e => handleBatchSelect(e.target.value)}
                list="fob-batch-list" placeholder="Type or select batch ID" />
              <datalist id="fob-batch-list">
                {batchOptions.map(o => <option key={o.batchId} value={o.batchId}>{o.batchId} · {o.party} · {o.color}</option>)}
              </datalist>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group"><label>Order #</label><input value={form.orderNo} onChange={e => setForm({...form, orderNo: e.target.value})} /></div>
              <div className="form-group"><label>Party</label><input value={form.party} onChange={e => setForm({...form, party: e.target.value})} /></div>
              <div className="form-group"><label>Article</label><input value={form.article} onChange={e => setForm({...form, article: e.target.value})} /></div>
              <div className="form-group"><label>Color</label><input value={form.color} onChange={e => setForm({...form, color: e.target.value})} /></div>
              <div className="form-group"><label>Qty (Kg)</label><input type="number" value={form.qtyKg} onChange={e => setForm({...form, qtyKg: e.target.value})} min="0" step="0.01" /></div>
              <div className="form-group"><label>Process</label><input value={form.processCode} onChange={e => setForm({...form, processCode: e.target.value})} placeholder="e.g. D, F, C" /></div>
              <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
              <div className="form-group"><label>Status</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value as any})}>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Reason / Remark *</label>
              <textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})}
                placeholder="Describe the FOB issue…" rows={3} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={closeModal}>Cancel</button>
              <button className="primary" onClick={saveRecord}>Add FOB Entry</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resolve Modal ── */}
      {showResolveModal && resolveRecord && (
        <div className="modal-overlay" onClick={() => setShowResolveModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">✅ Resolve FOB Entry</span>
              <button className="small" onClick={() => setShowResolveModal(false)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>{resolveRecord.batchId} — {resolveRecord.party}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>{resolveRecord.reason}</div>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Resolution Note (optional)</label>
              <textarea value={resolveNote} onChange={e => setResolveNote(e.target.value)}
                placeholder="How was this resolved? e.g. Re-dyed, passed shade approval…" rows={3} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowResolveModal(false)}>Cancel</button>
              <button className="primary" onClick={doResolve}>Mark as Resolved</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const tdStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: '12px',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
}
