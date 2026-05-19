'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// STANDARDIZED PROCESS MASTER MAP - SINGLE SOURCE OF TRUTH
const PROCESS_MAP: { [key: string]: string } = {
  'C': 'CBR',
  'S': 'SCQ',
  'H': 'Heat-Set',
  'D': 'Dyeing',
  'S2': 'SCQ2',
  'Rx': 'Relax',
  'O': 'Opener',
  'G': 'Ghanti',
  'F': 'Finish',
  'Co': 'Compactor',
  'Tu': 'Tubler',
  'Add': 'Addition',
  'Level': 'Levelling',
  'Rc': 'RC',
  'Fix': 'Fixing',
  'Wash': 'Washing',
  'Dry': 'Dry',
  'B': 'Brushing',
  'R': 'Raising',
  'K': 'Kundi',
  'Qa': 'QA',
  'Packing': 'Packing',
  'Dispatch': 'Dispatch'
}

// Helper functions
const getMachineName = (machineId: string) => {
  const stored = localStorage.getItem('dyeflow_db')
  if (!stored) return machineId
  const db = JSON.parse(stored)
  const machine = (db.machines || []).find((m: any) => m.id === machineId)
  if (!machine) return machineId
  return (machine.name || '').replace(/^Machine\s*/i, 'M ').trim()
}

// UPDATED: Use standardized process map instead of database
const getProcObj = (code: string) => {
  const name = PROCESS_MAP[code] || code
  return { code, name }
}

const getFirstProcessCode = (order: any) => {
  const route = Array.isArray(order?.processRoute) ? order.processRoute.filter(Boolean) : []
  return route[0] || ''
}

const getBatchProcessPlannedDate = (order: any, batch: any, processCode: string) => {
  if (!processCode) return ''
  return (batch?.dateCalcPlan && batch.dateCalcPlan[processCode]) || 
         (order?.plannedDates && order.plannedDates[processCode]) || ''
}

const normalizeDate = (dateStr: any) => {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return d
}

const dateToStr = (date: Date) => {
  return date.toISOString().split('T')[0]
}

const isFirstProcessDueForFms = (order: any, batch: any) => {
  const firstCode = getFirstProcessCode(order)
  if (!firstCode) return false
  const planned = getBatchProcessPlannedDate(order, batch, firstCode)
  const plannedDt = normalizeDate(planned)
  if (!plannedDt) return false
  const threshold = new Date(plannedDt.getTime())
  threshold.setDate(threshold.getDate() - 1)
  const today = normalizeDate(new Date())
  return !!today && dateToStr(today) >= dateToStr(threshold)
}

const ensureBatchFmsDispatch = (batch: any) => {
  if (!batch || typeof batch !== 'object') return {}
  if (!batch.fmsDispatch || typeof batch.fmsDispatch !== 'object') batch.fmsDispatch = {}
  if (!batch.fmsForceSend || typeof batch.fmsForceSend !== 'object') batch.fmsForceSend = {}
  if (!batch.fmsActualDates || typeof batch.fmsActualDates !== 'object') batch.fmsActualDates = {}
  return batch.fmsDispatch
}

const isBatchSentToFms = (batch: any, processCode: string) => {
  ensureBatchFmsDispatch(batch)
  return !!(batch.fmsDispatch[processCode] && batch.fmsDispatch[processCode].sent)
}

const formatDateOnlyDDMMYYYY = (dateStr: string) => {
  if (!dateStr) return '-'
  const d = normalizeDate(dateStr)
  if (!d) return dateStr
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}-${month}-${year}`
}

const formatDateTimeDDMMYYYY = (dateStr: string) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}-${month}-${year} ${hours}:${minutes}`
}

const getProcessColorByCode = (code: string) => {
  const colors: any = {
    'D': '#3B82F6',
    'S': '#10B981',
    'F': '#8B5CF6',
    'C': '#06B6D4',
    'CBR': '#EF4444',
    'SCO': '#F59E0B',
    'Heat': '#EC4899',
    'Qa': '#6366F1',
    'Packing': '#8B5CF6',
    'Dispatch': '#10B981',
  }
  return colors[code] || '#6B7280'
}

export default function FirstProcessBatchPage() {
  const router = useRouter()
  const [batches, setBatches] = useState<any[]>([])
  const [filteredBatches, setFilteredBatches] = useState<any[]>([])
  const [processFilter, setProcessFilter] = useState<string>('')
  const [readyCount, setReadyCount] = useState<number>(0)
  
  // NEW: Additional filter states
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [sendStatusFilter, setSendStatusFilter] = useState<string>('all')
  const [articleFilter, setArticleFilter] = useState<string>('all')
  const [columnFilters, setColumnFilters] = useState<{ [key: string]: string }>({})

  useEffect(() => {
    loadData()
  }, [])

  // NEW: Updated filtering logic with all filters
  useEffect(() => {
    let filtered = [...batches]
    
    // Global search
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(batch => 
        Object.values(batch).some(val => 
          String(val || '').toLowerCase().includes(search)
        )
      )
    }
    
    // Process filter
    if (processFilter) {
      filtered = filtered.filter(batch => batch.firstProcess === processFilter)
    }
    
    // Send status filter
    if (sendStatusFilter !== 'all') {
      if (sendStatusFilter === 'sent') {
        filtered = filtered.filter(b => b.fmsSent)
      } else if (sendStatusFilter === 'ready') {
        filtered = filtered.filter(b => !b.fmsSent && b.hasPlannedDate && (b.due || b.forceSend))
      } else if (sendStatusFilter === 'waiting') {
        filtered = filtered.filter(b => !b.fmsSent && b.hasPlannedDate && !b.due && !b.forceSend)
      }
    }
    
    // Article filter
    if (articleFilter !== 'all') {
      filtered = filtered.filter(batch => batch.article === articleFilter)
    }
    
    // Column filters
    Object.keys(columnFilters).forEach(key => {
      const filterValue = columnFilters[key].toLowerCase().trim()
      if (filterValue) {
        filtered = filtered.filter(batch => {
          const value = String(batch[key] || '').toLowerCase()
          return value.includes(filterValue)
        })
      }
    })
    
    setFilteredBatches(filtered)
    
    // UPDATED: Only count batches with planned dates as ready
    const ready = batches.filter(b => !b.fmsSent && b.hasPlannedDate && (b.due || b.forceSend))
    setReadyCount(ready.length)
  }, [batches, processFilter, searchTerm, sendStatusFilter, articleFilter, columnFilters])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const allBatches: any[] = []
    
    ;(db.orders || []).forEach((order: any) => {
      ;(order.splits || []).forEach((batch: any) => {
        const route = Array.isArray(order.processRoute) ? order.processRoute.filter(Boolean) : []
        const firstCode = route[0] || ''
        const firstProc = firstCode ? getProcObj(firstCode) : null
        const plannedDate = getBatchProcessPlannedDate(order, batch, firstCode)
        
        // CRITICAL: Check if planned date exists
        const hasPlannedDate = !!plannedDate
        
        ensureBatchFmsDispatch(batch)
        const sentMeta = (batch.fmsDispatch && batch.fmsDispatch[firstCode]) ? batch.fmsDispatch[firstCode] : null
        const forceSend = !!(batch.fmsForceSend && batch.fmsForceSend[firstCode])
        const due = isFirstProcessDueForFms(order, batch)
        const fmsSent = !!(sentMeta && sentMeta.sent)
        
        allBatches.push({
          orderId: order.id,
          timestamp: order.timestamp,
          orderNumber: order.orderNumber,
          batchId: batch.batchId,
          party: order.party,
          subParty: order.subParty,
          salesPerson: order.salesPerson,
          article: order.article,
          blend: order.blend,
          width: order.width,
          gsm: order.gsm,
          color: order.color,
          labNo: order.labNo,
          lotNo: order.lotNo,
          challanNo: order.challanNo,
          qtyKg: batch.kg || order.qtyKg,
          qtyMtr: batch.mtr || order.qtyMtr,
          noOfTaka: batch.taka || order.noOfTaka,
          typeOfFinish: order.typeOfFinish,
          typeOfPacking: order.typeOfPacking,
          remarks: order.remarks,
          supervisor: order.supervisor,
          machine: order.machine,
          processRoute: route,
          firstProcess: firstCode || '-',
          firstProcessName: firstProc ? (firstProc.name || firstCode) : '-',
          plannedDate,
          hasPlannedDate,  // NEW: Track if planned date exists
          due,
          forceSend,
          fmsSent,
          fmsSentAt: sentMeta ? sentMeta.sentAt : '',
          fmsSource: sentMeta ? (sentMeta.source || '') : '',
        })
      })
    })

    allBatches.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
    setBatches(allBatches)
    setFilteredBatches(allBatches)
  }

  const toggleSendOverride = (orderId: string, batchId: string, checked: boolean) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    
    const order = (db.orders || []).find((o: any) => o.id === orderId)
    if (!order) return
    
    const batch = (order.splits || []).find((b: any) => b.batchId === batchId)
    if (!batch) return
    
    const firstCode = getFirstProcessCode(order)
    if (!firstCode) return
    
    // CRITICAL: Check if planned date exists before allowing override
    const plannedDate = getBatchProcessPlannedDate(order, batch, firstCode)
    if (!plannedDate) {
      alert('Cannot send batch to FMS: No planned date generated.\n\nPlease generate dates in the Date Calculator first.')
      return
    }
    
    ensureBatchFmsDispatch(batch)
    
    if (checked) {
      batch.fmsForceSend[firstCode] = true
    } else {
      delete batch.fmsForceSend[firstCode]
    }
    
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const confirmSendToFms = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    
    const ready: any[] = []
    const noPlannedDate: any[] = []
    
    ;(db.orders || []).forEach((order: any) => {
      const firstCode = getFirstProcessCode(order)
      if (!firstCode) return
      
      ;(order.splits || []).forEach((batch: any) => {
        ensureBatchFmsDispatch(batch)
        if (isBatchSentToFms(batch, firstCode)) return
        
        // CRITICAL: Check if planned date exists
        const plannedDate = getBatchProcessPlannedDate(order, batch, firstCode)
        if (!plannedDate) {
          const manual = !!(batch.fmsForceSend && batch.fmsForceSend[firstCode])
          if (manual) {
            noPlannedDate.push(batch.batchId)
          }
          return // Skip batches without planned dates
        }
        
        const manual = !!(batch.fmsForceSend && batch.fmsForceSend[firstCode])
        const due = isFirstProcessDueForFms(order, batch)
        
        if (manual || due) {
          ready.push({ order, batch, firstCode, manual, due })
        }
      })
    })
    
    if (noPlannedDate.length > 0) {
      alert(`⚠️ Cannot send ${noPlannedDate.length} batch(es) - No planned date generated.\n\nBatch(es): ${noPlannedDate.join(', ')}\n\nPlease generate dates in the Date Calculator first.`)
      return
    }
    
    if (!ready.length) {
      alert('No first-process batches are ready to send.')
      return
    }
    
    if (!confirm(`Send ${ready.length} first-process batch(es) to FMS now?`)) return
    
    ready.forEach(x => {
      const nowIso = new Date().toISOString()
      x.batch.fmsDispatch[x.firstCode] = {
        sent: true,
        sentAt: nowIso,
        source: x.manual ? 'manual' : 'due'
      }
      
      if (x.batch.fmsForceSend && x.batch.fmsForceSend[x.firstCode]) {
        delete x.batch.fmsForceSend[x.firstCode]
      }
    })
    
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
    alert(`✓ Sent ${ready.length} batch(es) to FMS.`)
  }

  // NEW: Helper functions for filters
  const handleColumnFilterChange = (column: string, value: string) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: value
    }))
  }

  const getUniqueArticles = () => {
    const articles = new Set(batches.map(b => b.article).filter(Boolean))
    return Array.from(articles).sort()
  }

  const processOptions = [...new Set(batches.map(b => b.firstProcess).filter(x => x && x !== '-'))]

  if (batches.length === 0) {
    return (
      <div className="content">
        <div className="card">
          <div className="empty-state">
            No batches found. Split orders and assign process routes first.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="content">
      <div className="card">
        {/* NEW: Filter Bar */}
        <div style={{
          background: '#F9FAFB',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          border: '1px solid #E5E7EB'
        }}>
          <input
            type="text"
            placeholder="Search by order no., party, article, color, batch..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: '1 1 auto',
              minWidth: '200px',
              maxWidth: '350px',
              padding: '7px 10px',
              fontSize: '12px',
              border: '1px solid #D1D5DB',
              borderRadius: '5px',
              outline: 'none'
            }}
          />
          
          <select
            value={processFilter}
            onChange={(e) => setProcessFilter(e.target.value)}
            style={{
              width: '150px',
              padding: '7px 10px',
              fontSize: '12px',
              border: '1px solid #D1D5DB',
              borderRadius: '5px',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="">All Process</option>
            {processOptions.map(code => {
              const proc = getProcObj(code)
              return (
                <option key={code} value={code}>
                  {code} - {proc.name}
                </option>
              )
            })}
          </select>

          <select
            value={sendStatusFilter}
            onChange={(e) => setSendStatusFilter(e.target.value)}
            style={{
              width: '130px',
              padding: '7px 10px',
              fontSize: '12px',
              border: '1px solid #D1D5DB',
              borderRadius: '5px',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Status</option>
            <option value="sent">Sent</option>
            <option value="ready">Ready to Send</option>
            <option value="waiting">Waiting</option>
          </select>

          <select
            value={articleFilter}
            onChange={(e) => setArticleFilter(e.target.value)}
            style={{
              width: '150px',
              padding: '7px 10px',
              fontSize: '12px',
              border: '1px solid #D1D5DB',
              borderRadius: '5px',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Articles</option>
            {getUniqueArticles().map(article => (
              <option key={article} value={article}>{article}</option>
            ))}
          </select>

          <span style={{ fontSize: '12px', color: '#6B7280', marginLeft: 'auto' }}>
            {filteredBatches.length} of {batches.length} batches
          </span>
          
          <button
            onClick={confirmSendToFms}
            disabled={readyCount === 0}
            style={{
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '5px',
              background: readyCount === 0 ? '#D1D5DB' : '#3B82F6',
              color: 'white',
              cursor: readyCount === 0 ? 'not-allowed' : 'pointer',
              opacity: readyCount === 0 ? 0.5 : 1
            }}
          >
            Confirm Send to FMS ({readyCount})
          </button>
        </div>
        
        <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '6px', padding: '0 20px', fontWeight: 600 }}>
          ⚠️ IMPORTANT: Batches can only be sent after planned dates are generated in the Date Calculator.
        </div>
        
        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '6px', padding: '0 20px' }}>
          Auto-send rule: batch becomes ready when today is one day before planned date of first process. 
          You can also tick <strong>Send Override</strong> to send irrespective of date (planned date still required).
        </div>
        
        {processOptions.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px', padding: '0 20px' }}>
            {processOptions.map(code => {
              const color = getProcessColorByCode(code)
              return (
                <span
                  key={code}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 9px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: `${color}20`,
                    color: color,
                    border: `1px solid ${color}55`,
                    cursor: 'pointer'
                  }}
                  onClick={() => setProcessFilter(code === processFilter ? '' : code)}
                  title={`Click to ${code === processFilter ? 'clear' : 'filter by'} ${code}`}
                >
                  {code}
                </span>
              )
            })}
          </div>
        )}
        
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '2300px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F9FAFB' }}>
              {/* Column Filters Row */}
              <tr style={{ background: '#F9FAFB' }}>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['timestamp'] || ''} onChange={(e) => handleColumnFilterChange('timestamp', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['orderNumber'] || ''} onChange={(e) => handleColumnFilterChange('orderNumber', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['batchId'] || ''} onChange={(e) => handleColumnFilterChange('batchId', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['party'] || ''} onChange={(e) => handleColumnFilterChange('party', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['subParty'] || ''} onChange={(e) => handleColumnFilterChange('subParty', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['salesPerson'] || ''} onChange={(e) => handleColumnFilterChange('salesPerson', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['article'] || ''} onChange={(e) => handleColumnFilterChange('article', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['blend'] || ''} onChange={(e) => handleColumnFilterChange('blend', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['width'] || ''} onChange={(e) => handleColumnFilterChange('width', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['gsm'] || ''} onChange={(e) => handleColumnFilterChange('gsm', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['color'] || ''} onChange={(e) => handleColumnFilterChange('color', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['labNo'] || ''} onChange={(e) => handleColumnFilterChange('labNo', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['lotNo'] || ''} onChange={(e) => handleColumnFilterChange('lotNo', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['challanNo'] || ''} onChange={(e) => handleColumnFilterChange('challanNo', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['qtyKg'] || ''} onChange={(e) => handleColumnFilterChange('qtyKg', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['qtyMtr'] || ''} onChange={(e) => handleColumnFilterChange('qtyMtr', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['noOfTaka'] || ''} onChange={(e) => handleColumnFilterChange('noOfTaka', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['typeOfFinish'] || ''} onChange={(e) => handleColumnFilterChange('typeOfFinish', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['typeOfPacking'] || ''} onChange={(e) => handleColumnFilterChange('typeOfPacking', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['remarks'] || ''} onChange={(e) => handleColumnFilterChange('remarks', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['supervisor'] || ''} onChange={(e) => handleColumnFilterChange('supervisor', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['machine'] || ''} onChange={(e) => handleColumnFilterChange('machine', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}></th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}></th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['firstProcessName'] || ''} onChange={(e) => handleColumnFilterChange('firstProcessName', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}>
                  <input type="text" placeholder="Filter..." value={columnFilters['plannedDate'] || ''} onChange={(e) => handleColumnFilterChange('plannedDate', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
                </th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}></th>
                <th style={{ padding: '6px 8px', borderBottom: '1px solid #E5E7EB' }}></th>
              </tr>
              
              {/* Header Row */}
              <tr>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>TIME STAMP</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>ORDER #</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>BATCH #</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>PARTY</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>SUB PARTY</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>SALES PERSON</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>ARTICLE</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>BLEND</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>WIDTH</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>GSM</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>COLOR</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>LAB NO.</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>LOT NO.</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>CHALLAN NO.</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>QTY (KG)</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>QTY (MTR.)</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>NO. OF TA</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>TYPE OF FINISH</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>TYPE OF PACKING</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>REMARKS</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>SUPERVISOR</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>MACHINE</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>PROCESS ROUTE</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>FIRST PROCESS</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>FIRST PROCESS NAME</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>PLANNED DATE</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>SEND OVERRIDE</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>SEND STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.map((batch, idx) => {
                const procColor = getProcessColorByCode(batch.firstProcess)
                
                // UPDATED: Show "No Planned Date" status when date is missing
                const sendStatus = batch.fmsSent
                  ? `Sent ${batch.fmsSentAt ? '· ' + formatDateTimeDDMMYYYY(batch.fmsSentAt) : ''}`
                  : !batch.hasPlannedDate
                  ? 'No Planned Date'
                  : (batch.due || batch.forceSend ? 'Ready to Send' : 'Waiting')
                
                const sendColor = batch.fmsSent 
                  ? '#D1FAE5' 
                  : !batch.hasPlannedDate
                  ? '#FEE2E2'
                  : (batch.due || batch.forceSend ? '#DBEAFE' : '#F3F4F6')
                
                const sendTextColor = batch.fmsSent 
                  ? '#065F46' 
                  : !batch.hasPlannedDate
                  ? '#991B1B'
                  : (batch.due || batch.forceSend ? '#1E40AF' : '#6B7280')
                
                return (
                  <tr
                    key={batch.batchId}
                    style={{
                      background: idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB',
                      borderLeft: `3px solid ${procColor}`
                    }}
                  >
                    <td style={{ padding: '12px 10px', fontSize: '11px', color: '#6B7280', whiteSpace: 'nowrap' }}>{batch.timestamp || '-'}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700 }}>{batch.orderNumber || '-'}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700, color: procColor }}>{batch.batchId || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.party || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.subParty || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.salesPerson || '-'}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 500 }}>{batch.article || '-'}</td>
                    <td style={{ padding: '12px 10px', fontSize: '11px', color: '#6B7280' }}>{batch.blend || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.width || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.gsm || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.color || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.labNo || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.lotNo || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.challanNo || '-'}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700 }}>{batch.qtyKg || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.qtyMtr || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.noOfTaka || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.typeOfFinish || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.typeOfPacking || '-'}</td>
                    <td style={{ padding: '12px 10px', maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={batch.remarks || ''}>{batch.remarks || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.supervisor || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>{batch.machine ? getMachineName(batch.machine) : '-'}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700, color: '#3B82F6' }}>{batch.processRoute.join('/') || '-'}</td>
                    <td style={{ padding: '12px 10px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: `${procColor}20`,
                        color: procColor,
                        border: `1px solid ${procColor}55`
                      }}>
                        {batch.firstProcess}
                      </span>
                    </td>
                    <td style={{ padding: '12px 10px' }}>{batch.firstProcessName || '-'}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700, color: batch.plannedDate ? '#3B82F6' : '#EF4444' }}>
                      {batch.plannedDate ? formatDateOnlyDDMMYYYY(batch.plannedDate) : '⚠️ Generate Date'}
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={batch.forceSend}
                        disabled={batch.fmsSent || !batch.hasPlannedDate}
                        onChange={(e) => toggleSendOverride(batch.orderId, batch.batchId, e.target.checked)}
                        title={!batch.hasPlannedDate ? 'Generate planned date first' : ''}
                        style={{ 
                          width: 'auto', 
                          cursor: (batch.fmsSent || !batch.hasPlannedDate) ? 'not-allowed' : 'pointer',
                          opacity: !batch.hasPlannedDate ? 0.4 : 1
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: sendColor,
                        color: sendTextColor,
                        whiteSpace: 'nowrap'
                      }}>
                        {sendStatus}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {filteredBatches.length === 0 && (
                <tr>
                  <td
                    colSpan={28}
                    style={{
                      textAlign: 'center',
                      padding: '24px',
                      color: '#6B7280'
                    }}
                  >
                    No batch found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
