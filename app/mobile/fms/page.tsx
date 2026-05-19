'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { loadOrSeedProcessList } from '@/lib/processMap'

interface FmsBatch {
  batchId: string
  orderId: string
  orderNo: string
  party: string
  article: string
  color: string
  kg: string
  supervisor: string
  processCode: string
  processName: string
  plannedDate: string
  actualDate: string
  isDone: boolean
  isFaulty: boolean
}

function FmsContent() {
  const searchParams = useSearchParams()
  const initialProcess = searchParams.get('process') || ''

  const [processes, setProcesses] = useState<{ code: string; name: string }[]>([])
  const [selectedProcess, setSelectedProcess] = useState(initialProcess)
  const [batches, setBatches] = useState<FmsBatch[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [doneAlert, setDoneAlert] = useState('')

  useEffect(() => {
    const list = loadOrSeedProcessList()
    const enabled = list.filter(p => p.enabled).sort((a, b) => a.order - b.order)
    setProcesses(enabled)
    if (!initialProcess && enabled.length > 0) setSelectedProcess(enabled[0].code)
  }, [])

  useEffect(() => {
    if (selectedProcess) loadBatches(selectedProcess)
  }, [selectedProcess])

  const loadBatches = (code: string) => {
    setLoading(true)
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) { setLoading(false); return }
    const db = JSON.parse(raw)
    const processList = loadOrSeedProcessList()
    const procName = processList.find(p => p.code === code)?.name || code
    const rows: FmsBatch[] = []

    ;(db.orders || []).forEach((order: any) => {
      const route: string[] = order.processRoute || []
      if (!route.includes(code)) return
      ;(order.splits || []).forEach((batch: any) => {
        const firstCode = route[0]
        if (!batch.fmsDispatch?.[firstCode]?.sent) return
        const isActive = batch.fmsActiveProcesses?.[code] || batch.fmsCurrentProcess === code
        const isDone = !!(batch.fmsActualDates?.[code])
        if (!isActive && !isDone) return

        rows.push({
          batchId: batch.batchId || '-',
          orderId: order.id,
          orderNo: order.orderNumber || '-',
          party: order.party || '-',
          article: order.article || '-',
          color: order.color || '-',
          kg: batch.kg || order.qtyKg || '-',
          supervisor: order.supervisor || '-',
          processCode: code,
          processName: procName,
          plannedDate: batch.dateCalcPlan?.[code] || order.plannedDates?.[code] || '-',
          actualDate: batch.fmsActualDates?.[code] || '',
          isDone,
          isFaulty: !!(batch.fmsFaulty?.active),
        })
      })
    })

    setBatches(rows.sort((a, b) => (a.isDone ? 1 : 0) - (b.isDone ? 1 : 0)))
    setLoading(false)
  }

  const markDone = (batch: FmsBatch) => {
    if (batch.isDone) return
    if (!confirm(`Mark batch ${batch.batchId} as DONE in ${batch.processName}?`)) return

    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return
    const db = JSON.parse(raw)
    const order = (db.orders || []).find((o: any) => o.id === batch.orderId)
    if (!order) return
    const b = (order.splits || []).find((s: any) => s.batchId === batch.batchId)
    if (!b) return

    const today = new Date().toISOString().split('T')[0]
    if (!b.fmsActualDates) b.fmsActualDates = {}
    b.fmsActualDates[batch.processCode] = today

    const route: string[] = order.processRoute || []
    const idx = route.indexOf(batch.processCode)
    const next = route[idx + 1] || ''
    if (next) {
      if (!b.fmsActiveProcesses) b.fmsActiveProcesses = {}
      b.fmsActiveProcesses[next] = true
      b.fmsCurrentProcess = next
      if (!b.fmsDispatch) b.fmsDispatch = {}
      b.fmsDispatch[next] = { sent: true, sentAt: new Date().toISOString() }
    } else {
      b.fmsDone = true
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
    setDoneAlert(`✅ Batch ${batch.batchId} marked done!`)
    setTimeout(() => setDoneAlert(''), 2500)
    loadBatches(batch.processCode)
  }

  const filtered = batches.filter(b => {
    if (!search.trim()) return true
    const s = search.toLowerCase()
    return b.batchId.toLowerCase().includes(s) || b.orderNo.toLowerCase().includes(s) || b.party.toLowerCase().includes(s) || b.color.toLowerCase().includes(s)
  })

  const pending = filtered.filter(b => !b.isDone)
  const done = filtered.filter(b => b.isDone)

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9' }}>
      {/* Header */}
      <div style={{ background: '#185FA5', padding: '16px 16px 0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>FMS</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{pending.length} pending · {done.length} done</div>
          </div>
          <button
            onClick={() => selectedProcess && loadBatches(selectedProcess)}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Process selector — horizontal scroll */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, WebkitOverflowScrolling: 'touch' }}>
          {processes.map(p => (
            <button
              key={p.code}
              onClick={() => setSelectedProcess(p.code)}
              style={{
                flexShrink: 0,
                padding: '6px 14px',
                borderRadius: 20,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                background: selectedProcess === p.code ? '#fff' : 'rgba(255,255,255,0.15)',
                color: selectedProcess === p.code ? '#185FA5' : '#fff',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 12px 4px' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search batch, order, party…"
            style={{ width: '100%', padding: '11px 12px 11px 36px', fontSize: 14, border: '1px solid #E2E8F0', borderRadius: 10, background: '#fff', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Done alert */}
      {doneAlert && (
        <div style={{ margin: '8px 12px 0', background: '#D1FAE5', borderRadius: 10, padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#065F46', textAlign: 'center' }}>
          {doneAlert}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>Loading…</div>
      ) : (
        <div style={{ paddingTop: 8 }}>
          {/* Pending batches */}
          {pending.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 16px 4px' }}>
                Pending ({pending.length})
              </div>
              {pending.map(b => (
                <div key={b.batchId} style={{ background: '#fff', margin: '0 12px 10px', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: b.isFaulty ? '4px solid #EF4444' : '4px solid #185FA5' }}>
                  <div style={{ padding: '14px 14px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#185FA5' }}>{b.batchId}</div>
                        <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{b.orderNo} · {b.party}</div>
                      </div>
                      {b.isFaulty && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: '#FEE2E2', color: '#991B1B', padding: '3px 8px', borderRadius: 20 }}>FAULTY</span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12, color: '#64748B' }}>
                      <div><span style={{ color: '#94A3B8' }}>Article </span>{b.article}</div>
                      <div><span style={{ color: '#94A3B8' }}>Color </span>{b.color}</div>
                      <div><span style={{ color: '#94A3B8' }}>Qty </span><strong style={{ color: '#1A1A18' }}>{b.kg} Kg</strong></div>
                      <div><span style={{ color: '#94A3B8' }}>Planned </span>{b.plannedDate}</div>
                    </div>
                  </div>
                  <div style={{ padding: '0 14px 14px' }}>
                    <button
                      onClick={() => markDone(b)}
                      style={{
                        width: '100%', padding: '13px', fontSize: 14, fontWeight: 700,
                        background: '#059669', color: '#fff', border: 'none', borderRadius: 10,
                        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      ✓ Mark as Done
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Done batches */}
          {done.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 16px 4px' }}>
                Completed ({done.length})
              </div>
              {done.map(b => (
                <div key={b.batchId} style={{ background: '#F0FDF4', margin: '0 12px 8px', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', borderLeft: '4px solid #059669' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#065F46' }}>{b.batchId}</div>
                      <div style={{ fontSize: 11, color: '#6EE7B7', marginTop: 2 }}>{b.orderNo} · {b.party} · {b.kg}Kg</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, background: '#D1FAE5', color: '#065F46', padding: '4px 10px', borderRadius: 20 }}>✓ Done</span>
                  </div>
                </div>
              ))}
            </>
          )}

          {filtered.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⚙</div>
              <div style={{ fontSize: 14 }}>No batches in {processes.find(p => p.code === selectedProcess)?.name || selectedProcess} right now.</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function MobileFmsPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>Loading…</div>}>
      <FmsContent />
    </Suspense>
  )
}
