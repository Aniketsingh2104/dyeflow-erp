'use client'

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  getOrders, createOrder, updateOrder, deleteOrder,
  assignSupervisor as apiAssignSupervisor,
  updateOrderStatus, bulkUpdateOrders,
  getSupervisors, getCustomers, getMachines,
  createSplits, getCurrentUser,
} from '@/lib/db'
import { getProcessList } from '@/lib/db'

// ── Column definitions ──────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'created_at',      label: 'TIMESTAMP',      defaultWidth: 140 },
  { key: 'order_number',    label: 'ORDER #',         defaultWidth: 140 },
  { key: 'party',           label: 'PARTY',           defaultWidth: 150 },
  { key: 'sub_party',       label: 'SUB PARTY',       defaultWidth: 130 },
  { key: 'sales_person',    label: 'SALES PERSON',    defaultWidth: 130 },
  { key: 'article',         label: 'ARTICLE',         defaultWidth: 150 },
  { key: 'blend',           label: 'BLEND',           defaultWidth: 120 },
  { key: 'width',           label: 'WIDTH',           defaultWidth: 80  },
  { key: 'gsm',             label: 'GSM',             defaultWidth: 80  },
  { key: 'color',           label: 'COLOR',           defaultWidth: 120 },
  { key: 'lab_no',          label: 'LAB NO.',         defaultWidth: 100 },
  { key: 'lot_no',          label: 'LOT NO.',         defaultWidth: 100 },
  { key: 'challan_no',      label: 'CHALLAN NO.',     defaultWidth: 110 },
  { key: 'qty_kg',          label: 'QTY (KG)',        defaultWidth: 90  },
  { key: 'qty_mtr',         label: 'QTY (MTR)',       defaultWidth: 90  },
  { key: 'no_of_taka',      label: 'TAKA',            defaultWidth: 80  },
  { key: 'type_of_finish',  label: 'FINISH',          defaultWidth: 100 },
  { key: 'type_of_packing', label: 'PACKING',         defaultWidth: 100 },
  { key: 'remarks',         label: 'REMARKS',         defaultWidth: 200 },
  { key: 'hold_approval',   label: 'HOLD/APPROVAL',   defaultWidth: 130 },
  { key: 'hold_reason',     label: 'HOLD REMARK',     defaultWidth: 150 },
  { key: 'supervisor',      label: 'SUPERVISOR',      defaultWidth: 120 },
  { key: 'process_route',   label: 'PROCESS ROUTE',   defaultWidth: 200 },
  { key: 'machine',         label: 'MACHINE',         defaultWidth: 120 },
  { key: 'status',          label: 'STATUS',          defaultWidth: 100 },
  { key: 'actions',         label: 'ACTIONS',         defaultWidth: 300 },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function genOrderNumber(count: number, prefix = 'DYG'): string {
  return `${prefix}-${new Date().getFullYear()}-${count + 1}`
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { bg: string; color: string; label: string }> = {
  new:          { bg: '#DBEAFE', color: '#1E40AF', label: 'New' },
  assigned:     { bg: '#FEF3C7', color: '#92400E', label: 'Assigned' },
  splitting:    { bg: '#E9D5FF', color: '#6B21A8', label: 'Split & Planned' },
  'in-process': { bg: '#DBEAFE', color: '#1E40AF', label: 'In Process' },
  done:         { bg: '#D1FAE5', color: '#065F46', label: 'Done' },
  hold:         { bg: '#FEE2E2', color: '#991B1B', label: 'On Hold' },
}

function StatusBadge({ status }: { status: string }) {
  const b = STATUS_MAP[status] || { bg: '#F3F4F6', color: '#6B7280', label: status }
  return (
    <span style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11,
      fontWeight: 600, background: b.bg, color: b.color, whiteSpace: 'nowrap' }}>
      {b.label}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const router = useRouter()

  // Data
  const [orders,      setOrders]      = useState<any[]>([])
  const [supervisors, setSupervisors] = useState<any[]>([])
  const [machines,    setMachines]    = useState<any[]>([])
  const [customers,   setCustomers]   = useState<any[]>([])
  const [processList, setProcessList] = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [toast,       setToast]       = useState('')

  // Filters
  const [searchTerm,    setSearchTerm]    = useState('')
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [articleFilter, setArticleFilter] = useState('all')
  const [colFilters,    setColFilters]    = useState<Record<string, string>>({})

  // Column widths & resize
  const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(COLUMNS.map(c => [c.key, c.defaultWidth]))
  )
  const [resizing, setResizing] = useState<{ key: string; startX: number; startW: number } | null>(null)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Bulk action
  const [bulkAction,     setBulkAction]     = useState('')
  const [bulkSupervisor, setBulkSupervisor] = useState('')
  const [bulkStatus,     setBulkStatus]     = useState('')
  const [bulkHoldReason, setBulkHoldReason] = useState('')
  const [showBulkModal,  setShowBulkModal]  = useState(false)

  // Priority drag
  const [priorityMode, setPriorityMode] = useState(false)
  const [dragIdx,      setDragIdx]      = useState<number | null>(null)
  const [dragOver,     setDragOver]     = useState<number | null>(null)

  // Modals
  const [modal,         setModal]         = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [formData,      setFormData]      = useState<any>({})
  const [splitParts,    setSplitParts]    = useState<any[]>([])

  // ── Load all data ──────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [ordersRes, supsRes, machRes, custRes, procRes] = await Promise.all([
      getOrders({ limit: 1000 }),
      getSupervisors(),
      getMachines(),
      getCustomers(),
      getProcessList(),
    ])
    if (ordersRes.data)  setOrders(ordersRes.data as any[])
    if (supsRes.data)    setSupervisors(supsRes.data as any[])
    if (machRes.data)    setMachines(machRes.data as any[])
    if (custRes.data)    setCustomers(custRes.data as any[])
    if (procRes.data)    setProcessList(procRes.data as any[])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
    const handle = () => loadAll()
    window.addEventListener('dyeflow-db-updated', handle)
    window.addEventListener('dyeflow-refresh',    handle)
    return () => {
      window.removeEventListener('dyeflow-db-updated', handle)
      window.removeEventListener('dyeflow-refresh',    handle)
    }
  }, [loadAll])

  useEffect(() => {
    const onNew = () => openNewModal()
    window.addEventListener('dyeflow-new-order', onNew)
    return () => window.removeEventListener('dyeflow-new-order', onNew)
  }, [orders.length])

  // ── Toast ──────────────────────────────────────────────────────────────────

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // ── Filtered orders ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...orders]
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      list = list.filter(o =>
        Object.values(o).some(v => String(v ?? '').toLowerCase().includes(q))
      )
    }
    if (statusFilter  !== 'all') list = list.filter(o => o.status  === statusFilter)
    if (articleFilter !== 'all') list = list.filter(o => o.article === articleFilter)
    Object.entries(colFilters).forEach(([key, val]) => {
      if (!val.trim()) return
      const q = val.toLowerCase()
      list = list.filter(o => String(o[key] ?? '').toLowerCase().includes(q))
    })
    return list
  }, [orders, searchTerm, statusFilter, articleFilter, colFilters])

  useEffect(() => setSelectedIds(new Set()), [filtered.length])

  const uniqueArticles = useMemo(() =>
    [...new Set(orders.map(o => o.article).filter(Boolean))].sort()
  , [orders])

  // ── Column resize ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!resizing) return
    const onMove = (e: MouseEvent) => {
      const diff = e.pageX - resizing.startX
      setColWidths(prev => ({ ...prev, [resizing.key]: Math.max(50, resizing.startW + diff) }))
    }
    const onUp = () => setResizing(null)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',  onUp)
    document.body.style.cursor     = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',  onUp)
      document.body.style.cursor     = ''
      document.body.style.userSelect = ''
    }
  }, [resizing])

  // ── Bulk selection ─────────────────────────────────────────────────────────

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectAll  = () => setSelectedIds(new Set(filtered.map(o => o.id).filter(Boolean)))
  const deselectAll = () => setSelectedIds(new Set())
  const allSelected  = filtered.length > 0 && filtered.every(o => selectedIds.has(o.id))
  const someSelected = selectedIds.size > 0

  // ── Bulk action ─────────────────────────────────────────────────────────────

  const applyBulk = async () => {
    if (!bulkAction || selectedIds.size === 0) return
    setSaving(true)
    const ids = Array.from(selectedIds)
    try {
      if (bulkAction === 'delete') {
        await Promise.all(ids.map(id => deleteOrder(id)))
        showToast(`✓ ${ids.length} order${ids.length !== 1 ? 's' : ''} deleted`)
      } else if (bulkAction === 'assign' && bulkSupervisor) {
        const sup = supervisors.find(s => s.name === bulkSupervisor)
        if (sup) {
          await Promise.all(ids.map(id => apiAssignSupervisor(id, sup.id)))
          showToast(`✓ ${ids.length} orders assigned to ${bulkSupervisor}`)
        }
      } else if (bulkAction === 'status' && bulkStatus) {
        await bulkUpdateOrders(ids, { status: bulkStatus })
        showToast(`✓ Status updated to ${bulkStatus}`)
      } else if (bulkAction === 'hold') {
        await bulkUpdateOrders(ids, { status: 'hold', hold_reason: bulkHoldReason || null })
        showToast(`✓ ${ids.length} orders put on hold`)
      } else if (bulkAction === 'unhold') {
        await Promise.all(
          ids
            .filter(id => orders.find(o => o.id === id)?.status === 'hold')
            .map(id => {
              const o = orders.find(x => x.id === id)
              return updateOrderStatus(id, o?.supervisor_id ? 'assigned' : 'new')
            })
        )
        showToast('✓ Hold released')
      }
    } finally {
      setSaving(false)
      setShowBulkModal(false)
      deselectAll()
      setBulkAction('')
      setBulkSupervisor('')
      setBulkStatus('')
      setBulkHoldReason('')
      loadAll()
    }
  }

  // ── Priority drag ───────────────────────────────────────────────────────────

  const handleDrop = async () => {
    if (dragIdx === null || dragOver === null || dragIdx === dragOver) {
      setDragIdx(null); setDragOver(null); return
    }
    const reordered = [...filtered]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(dragOver, 0, moved)
    setDragIdx(null); setDragOver(null)
    setOrders(prev => {
      const next = [...prev]
      reordered.forEach((o, idx) => {
        const fi = next.findIndex(x => x.id === o.id)
        if (fi !== -1) next[fi] = { ...next[fi], priority: idx }
      })
      return next
    })
    await Promise.all(reordered.map((o, idx) => updateOrder(o.id, { priority: idx })))
  }

  // ── Modal openers ───────────────────────────────────────────────────────────

  const openNewModal = () => {
    setFormData({
      order_number:    genOrderNumber(orders.length),
      party: '', article: '', color: '', blend: '', width: '', gsm: '',
      lab_no: '', lot_no: '', challan_no: '',
      qty_kg: '', qty_mtr: '', no_of_taka: '',
      type_of_finish: '', type_of_packing: '',
      hold_approval: '', hold_reason: '', remarks: '',
      sub_party: '', sales_person: '',
    })
    setModal('new')
  }

  const openEditModal  = (o: any) => { setSelectedOrder(o); setFormData({ ...o }); setModal('edit') }
  const openViewModal  = (o: any) => { setSelectedOrder(o); setModal('view') }
  const openAssignModal = (o: any) => { setSelectedOrder(o); setModal('assign') }
  const openSplitModal  = (o: any) => {
    setSelectedOrder(o)
    setSplitParts([{ kg: o.qty_kg, mtr: o.qty_mtr || 0, taka: o.no_of_taka || 0 }])
    setModal('split')
  }

  // ── Save order ─────────────────────────────────────────────────────────────

  const saveOrder = async () => {
    if (formData.hold_approval === 'Hold' && !formData.hold_reason) {
      alert('Please enter hold remark.'); return
    }
    setSaving(true)
    try {
      const payload = {
        ...formData,
        qty_kg:     parseFloat(formData.qty_kg)   || 0,
        qty_mtr:    parseFloat(formData.qty_mtr)  || 0,
        no_of_taka: parseInt(formData.no_of_taka) || 0,
        status: formData.hold_approval === 'Hold' ? 'hold'
               : modal === 'new' ? 'new'
               : formData.status,
        process_route: formData.process_route || [],
      }
      if (modal === 'new') {
        const { error } = await createOrder(payload)
        if (error) { alert('Error: ' + error); return }
        showToast('✓ Order created')
      } else if (modal === 'edit' && selectedOrder) {
        const { error } = await updateOrder(selectedOrder.id, payload)
        if (error) { alert('Error: ' + error); return }
        showToast('✓ Order updated')
      }
      setModal(null); setSelectedOrder(null); loadAll()
    } finally { setSaving(false) }
  }

  // ── Assign supervisor ──────────────────────────────────────────────────────

  const doAssign = async (supervisorName: string) => {
    if (!supervisorName || !selectedOrder) { alert('Please select a supervisor.'); return }
    const sup = supervisors.find(s => s.name === supervisorName)
    if (!sup) { alert('Supervisor not found.'); return }
    setSaving(true)
    try {
      const { error } = await apiAssignSupervisor(selectedOrder.id, sup.id)
      if (error) { alert('Error: ' + error); return }
      showToast('✓ Supervisor assigned')
      setModal(null); setSelectedOrder(null); loadAll()
    } finally { setSaving(false) }
  }

  // ── Save splits ────────────────────────────────────────────────────────────

  const saveSplits = async () => {
    if (!selectedOrder) return
    const totalKg   = splitParts.reduce((s, p) => s + (parseFloat(p.kg) || 0), 0)
    const remaining = (selectedOrder.qty_kg || 0) - totalKg
    if (Math.abs(remaining) >= 0.5 && !confirm(`Remaining ${remaining.toFixed(1)} Kg. Save anyway?`)) return
    setSaving(true)
    try {
      const batches = splitParts.map((p, idx) => ({
        batch_id:   `${selectedOrder.order_number}-B${idx + 1}`,
        kg:          parseFloat(p.kg) || 0,
        machine_id:  selectedOrder.machine_id || null,
      }))
      const { error } = await createSplits(selectedOrder.id, batches, selectedOrder.process_route || [])
      if (error) { alert('Error: ' + error); return }
      showToast('✓ Batches created')
      setModal(null); setSelectedOrder(null); setSplitParts([]); loadAll()
    } finally { setSaving(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading orders…
    </div>
  )

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 42px)', padding: '16px 20px 0', gap: 0 }}>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        marginBottom: 10, flexWrap: 'nowrap', background: 'var(--bg-secondary)',
        borderRadius: 8, padding: '8px 14px', border: '1px solid var(--border-light)' }}>
        <input
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search orders…"
          style={{ flex: '1 1 auto', minWidth: 160, maxWidth: 280, padding: '6px 10px',
            fontSize: 12, border: '1px solid var(--border-medium)', borderRadius: 5,
            background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border-medium)',
            borderRadius: 5, background: 'var(--bg-primary)', color: 'var(--text-primary)', width: 130 }}>
          <option value="all">All Status</option>
          {Object.entries(STATUS_MAP).map(([v, b]) =>
            <option key={v} value={v}>{b.label}</option>)}
        </select>
        <select value={articleFilter} onChange={e => setArticleFilter(e.target.value)}
          style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border-medium)',
            borderRadius: 5, background: 'var(--bg-primary)', color: 'var(--text-primary)', width: 130 }}>
          <option value="all">All Articles</option>
          {uniqueArticles.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={() => router.push('/import')}
          style={{ padding: '6px 12px', fontSize: 12, border: '1px solid var(--border-medium)',
            borderRadius: 5, background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}>
          📄 Import Excel
        </button>
        <button onClick={openNewModal}
          style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none',
            borderRadius: 5, background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}>
          + New Order
        </button>
        <button onClick={() => setPriorityMode(m => !m)}
          style={{ padding: '6px 12px', fontSize: 12, fontWeight: priorityMode ? 700 : 500,
            border: `1px solid ${priorityMode ? 'var(--purple)' : 'var(--border-medium)'}`,
            borderRadius: 5,
            background: priorityMode ? 'var(--purple-light)' : 'var(--bg-primary)',
            color: priorityMode ? 'var(--purple)' : 'var(--text-primary)', cursor: 'pointer' }}>
          {priorityMode ? '✔ Priority Mode' : '↕ Set Priority'}
        </button>
        <button onClick={loadAll} title="Refresh"
          style={{ padding: '6px 10px', fontSize: 13, border: '1px solid var(--border-medium)',
            borderRadius: 5, background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          ⟳
        </button>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ flexShrink: 0, background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {/* ── Bulk action bar ── */}
      {someSelected && (
        <div style={{ flexShrink: 0, background: 'var(--accent-light)',
          border: '1px solid var(--accent)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
            {selectedIds.size} selected
          </span>
          <button onClick={deselectAll} className="xs">Clear</button>
          <button onClick={allSelected ? deselectAll : selectAll} className="xs">
            {allSelected ? 'Deselect All' : `Select All ${filtered.length}`}
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--border-light)' }} />
          <button className="small" style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
            onClick={() => { setBulkAction('assign'); setShowBulkModal(true) }}>
            👤 Assign Supervisor
          </button>
          <button className="small" onClick={() => { setBulkAction('status'); setShowBulkModal(true) }}>
            📦 Change Status
          </button>
          <button className="small danger" onClick={() => { setBulkAction('hold'); setShowBulkModal(true) }}>
            ⏸ Put on Hold
          </button>
          <button className="small success"
            onClick={() => { setBulkAction('unhold'); applyBulk() }}>
            ✅ Release Hold
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--border-light)' }} />
          <button className="small danger" onClick={() => { setBulkAction('delete'); setShowBulkModal(true) }}>
            🗑 Delete
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-primary)', borderRadius: 8,
        border: '1px solid var(--border-light)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              {/* Filter row */}
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={{ width: 40, minWidth: 40, padding: 6,
                  borderBottom: '1px solid var(--border-light)',
                  borderRight:  '1px solid var(--border-light)', textAlign: 'center' }}>
                  <input type="checkbox" checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                    onChange={() => allSelected ? deselectAll() : selectAll()}
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                </th>
                {COLUMNS.map(col => (
                  <th key={`f-${col.key}`}
                    style={{ padding: '6px 8px',
                      borderBottom: '1px solid var(--border-light)',
                      borderRight:  '1px solid var(--border-light)',
                      width: colWidths[col.key], minWidth: colWidths[col.key], maxWidth: colWidths[col.key] }}>
                    {col.key !== 'actions' && (
                      <input value={colFilters[col.key] || ''} placeholder="Filter…"
                        onChange={e => setColFilters(p => ({ ...p, [col.key]: e.target.value }))}
                        style={{ width: '100%', padding: '3px 6px', fontSize: 11,
                          border: '1px solid var(--border-medium)', borderRadius: 4,
                          background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                    )}
                  </th>
                ))}
              </tr>
              {/* Header row */}
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={{ width: 40, minWidth: 40, padding: '8px 6px', textAlign: 'center',
                  fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                  borderBottom: '2px solid var(--border-light)',
                  borderRight:  '1px solid var(--border-light)' }}>#</th>
                {COLUMNS.map(col => (
                  <th key={col.key}
                    style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                      color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                      borderBottom: '2px solid var(--border-light)',
                      borderRight:  '1px solid var(--border-light)',
                      width: colWidths[col.key], minWidth: colWidths[col.key], maxWidth: colWidths[col.key],
                      position: 'relative', userSelect: 'none' }}>
                    {col.label}
                    <div onMouseDown={e => {
                      e.preventDefault()
                      setResizing({ key: col.key, startX: e.pageX, startW: colWidths[col.key] })
                    }} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8,
                      cursor: 'col-resize', zIndex: 1 }} />
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 1}
                    style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                    {orders.length === 0
                      ? 'No orders yet. Click "+ New Order" to get started.'
                      : 'No orders match your filters.'}
                  </td>
                </tr>
              ) : filtered.map((order, idx) => {
                const sup     = supervisors.find(s => s.id === order.supervisor_id)
                const mach    = machines.find(m => m.id === order.machine_id)
                const selected = selectedIds.has(order.id)
                return (
                  <tr key={order.id || idx}
                    draggable={priorityMode}
                    onDragStart={priorityMode ? () => setDragIdx(idx) : undefined}
                    onDragEnter={priorityMode ? () => setDragOver(idx) : undefined}
                    onDragOver={priorityMode  ? e => e.preventDefault() : undefined}
                    onDrop={priorityMode      ? handleDrop : undefined}
                    onDragEnd={priorityMode   ? () => { setDragIdx(null); setDragOver(null) } : undefined}
                    style={{
                      background: selected
                        ? 'var(--accent-light)'
                        : dragOver === idx && dragIdx !== idx
                        ? 'var(--purple-light)'
                        : idx % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                      outline: dragOver === idx && dragIdx !== idx ? '2px solid var(--purple)' : 'none',
                      opacity: dragIdx === idx ? 0.4 : 1,
                      cursor:  priorityMode ? 'grab' : 'default',
                      transition: 'background 0.1s',
                    }}>
                    <td style={tdCk} onClick={e => { e.stopPropagation(); toggleSelect(order.id) }}>
                      <input type="checkbox" checked={selected} onChange={() => toggleSelect(order.id)}
                        style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                    </td>

                    <td style={{ ...td, width: colWidths.created_at, fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {fmtDate(order.created_at)}
                    </td>
                    <td style={{ ...td, width: colWidths.order_number, fontWeight: 700, color: 'var(--accent)' }}>
                      {order.order_number || '-'}
                    </td>
                    <td style={{ ...td, width: colWidths.party }}>
                      {order.party ? (
                        <a href={`/party/${encodeURIComponent(order.party)}`}
                          style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}
                          onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--accent)' }}
                          onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-primary)' }}>
                          {order.party}
                        </a>
                      ) : '-'}
                    </td>
                    <td style={{ ...td, width: colWidths.sub_party,       color: 'var(--text-secondary)' }}>{order.sub_party       || '-'}</td>
                    <td style={{ ...td, width: colWidths.sales_person                                   }}>{order.sales_person    || '-'}</td>
                    <td style={{ ...td, width: colWidths.article,          fontWeight: 500               }}>{order.article         || '-'}</td>
                    <td style={{ ...td, width: colWidths.blend,            color: 'var(--text-secondary)', fontSize: 11 }}>{order.blend || '-'}</td>
                    <td style={{ ...td, width: colWidths.width                                           }}>{order.width           || '-'}</td>
                    <td style={{ ...td, width: colWidths.gsm                                             }}>{order.gsm             || '-'}</td>
                    <td style={{ ...td, width: colWidths.color                                           }}>{order.color           || '-'}</td>
                    <td style={{ ...td, width: colWidths.lab_no,           fontSize: 11                  }}>{order.lab_no          || '-'}</td>
                    <td style={{ ...td, width: colWidths.lot_no,           fontSize: 11                  }}>{order.lot_no          || '-'}</td>
                    <td style={{ ...td, width: colWidths.challan_no,       fontSize: 11                  }}>{order.challan_no      || '-'}</td>
                    <td style={{ ...td, width: colWidths.qty_kg,           fontWeight: 600               }}>{order.qty_kg          || '-'}</td>
                    <td style={{ ...td, width: colWidths.qty_mtr                                         }}>{order.qty_mtr         || '-'}</td>
                    <td style={{ ...td, width: colWidths.no_of_taka                                      }}>{order.no_of_taka      || '-'}</td>
                    <td style={{ ...td, width: colWidths.type_of_finish                                  }}>{order.type_of_finish  || '-'}</td>
                    <td style={{ ...td, width: colWidths.type_of_packing                                 }}>{order.type_of_packing || '-'}</td>
                    <td style={{ ...td, width: colWidths.remarks, overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={order.remarks || ''}>{order.remarks || '-'}</td>

                    <td style={{ ...td, width: colWidths.hold_approval }}>
                      {order.hold_approval === 'Hold' ? (
                        <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: 'var(--danger-light)', color: 'var(--danger)' }}>Hold</span>
                      ) : order.hold_approval === '1st Batch Approval' ? (
                        <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: 'var(--warning-light)', color: 'var(--warning)' }}>1st Batch</span>
                      ) : '-'}
                    </td>
                    <td style={{ ...td, width: colWidths.hold_reason, overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={order.hold_reason || ''}>{order.hold_reason || '-'}</td>

                    <td style={{ ...td, width: colWidths.supervisor }}>{sup?.name || '-'}</td>

                    <td style={{ ...td, width: colWidths.process_route }}>
                      {(order.process_route || []).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {(order.process_route as string[]).map((code, i) => {
                            const proc = processList.find((p: any) => p.code === code)
                            return (
                              <span key={i} style={{ background: 'var(--accent-light)',
                                color: 'var(--accent-dark)', padding: '2px 6px',
                                borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                                {proc?.name || code}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </td>

                    <td style={{ ...td, width: colWidths.machine }}>
                      {mach && (
                        <span style={{ background: 'var(--purple-light)', color: 'var(--purple)',
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                          {mach.name}
                        </span>
                      )}
                    </td>

                    <td style={{ ...td, width: colWidths.status }}>
                      <StatusBadge status={order.status || 'new'} />
                    </td>

                    <td style={{ ...td, width: colWidths.actions }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        {priorityMode && (
                          <span title="Drag to reorder"
                            style={{ cursor: 'grab', fontSize: 16, color: 'var(--purple)', padding: '0 4px' }}>⠿</span>
                        )}
                        {typeof order.priority === 'number' && (
                          <span style={{ fontSize: 10, fontWeight: 700,
                            background: 'var(--purple-light)', color: 'var(--purple)',
                            padding: '2px 6px', borderRadius: 10 }}>#{order.priority + 1}</span>
                        )}
                        <button className="xs" onClick={() => openViewModal(order)}>View</button>
                        <button className="xs" onClick={() => openEditModal(order)}>Edit</button>
                        {(!order.supervisor_id || order.status === 'new') && (
                          <button className="xs primary" onClick={() => openAssignModal(order)}>Assign</button>
                        )}
                        {order.supervisor_id && (order.process_route || []).length > 0 && (
                          <button className="xs primary" onClick={() => openSplitModal(order)}>Split</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── New / Edit modal ── */}
      {(modal === 'new' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modal === 'new' ? '+ New Order' : 'Edit Order'}</span>
              <button className="small" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              {([
                ['party',          'Party Name'],
                ['sub_party',      'Sub Party'],
                ['sales_person',   'Sales Person'],
                ['article',        'Article'],
                ['blend',          'Blend'],
                ['width',          'Width'],
                ['gsm',            'GSM'],
                ['color',          'Color'],
                ['lab_no',         'Lab No.'],
                ['lot_no',         'LOT No.'],
                ['challan_no',     'Challan No.'],
                ['qty_kg',         'Qty (Kg)'],
                ['qty_mtr',        'Qty (Mtr)'],
                ['no_of_taka',     'No. of Taka'],
                ['type_of_finish', 'Type of Finish'],
                ['type_of_packing','Type of Packing'],
              ] as [string, string][]).map(([key, label]) => (
                <div key={key} className="form-group">
                  <label>{label}</label>
                  {key === 'party' ? (
                    <>
                      <input list="party-opts" value={formData[key] || ''} placeholder={label}
                        onChange={e => setFormData((p: any) => ({ ...p, [key]: e.target.value }))} />
                      <datalist id="party-opts">
                        {customers.map((c: any) => <option key={c.id} value={c.name} />)}
                      </datalist>
                    </>
                  ) : (
                    <input
                      type={['qty_kg','qty_mtr','no_of_taka'].includes(key) ? 'number' : 'text'}
                      value={formData[key] || ''} placeholder={label}
                      onChange={e => setFormData((p: any) => ({ ...p, [key]: e.target.value }))} />
                  )}
                </div>
              ))}

              <div className="form-group">
                <label>Hold/Approval</label>
                <select value={formData.hold_approval || ''}
                  onChange={e => setFormData((p: any) => ({ ...p, hold_approval: e.target.value }))}>
                  <option value="">None</option>
                  <option value="Hold">Hold</option>
                  <option value="1st Batch Approval">1st Batch Approval</option>
                </select>
              </div>

              {formData.hold_approval === 'Hold' && (
                <div className="form-group">
                  <label>Hold Remark *</label>
                  <input value={formData.hold_reason || ''} placeholder="Reason for hold"
                    onChange={e => setFormData((p: any) => ({ ...p, hold_reason: e.target.value }))} />
                </div>
              )}

              <div className="form-group">
                <label>Order Number</label>
                <input value={formData.order_number || ''} readOnly
                  style={{ background: 'var(--bg-secondary)', fontWeight: 700, color: 'var(--accent)' }} />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Remarks</label>
              <textarea value={formData.remarks || ''} rows={2}
                onChange={e => setFormData((p: any) => ({ ...p, remarks: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={saveOrder} disabled={saving}>
                {saving ? 'Saving…' : '✓ Save Order'}
              </button>
              <button onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── View modal ── */}
      {modal === 'view' && selectedOrder && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 760 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Order — {selectedOrder.order_number}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="small primary" onClick={() => openEditModal(selectedOrder)}>Edit</button>
                {!selectedOrder.supervisor_id && (
                  <button className="small primary" onClick={() => openAssignModal(selectedOrder)}>Assign</button>
                )}
                <button className="small" onClick={() => setModal(null)}>✕</button>
              </div>
            </div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              {([
                ['Order #',     selectedOrder.order_number],
                ['Status',      <StatusBadge key="s" status={selectedOrder.status} />],
                ['Party',       selectedOrder.party],
                ['Article',     selectedOrder.article],
                ['Color',       selectedOrder.color],
                ['Blend',       selectedOrder.blend],
                ['Qty (Kg)',    selectedOrder.qty_kg],
                ['Qty (Mtr)',   selectedOrder.qty_mtr],
                ['No. of Taka', selectedOrder.no_of_taka],
                ['Lab No.',     selectedOrder.lab_no],
                ['Challan No.', selectedOrder.challan_no],
                ['Remarks',     selectedOrder.remarks],
                ['Supervisor',  supervisors.find(s => s.id === selectedOrder.supervisor_id)?.name || '-'],
                ['Machine',     machines.find(m => m.id === selectedOrder.machine_id)?.name || '-'],
                ['Hold',        selectedOrder.hold_approval || '-'],
                ['Hold Reason', selectedOrder.hold_reason   || '-'],
              ] as [string, any][]).map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13 }}>{value || '-'}</div>
                </div>
              ))}
            </div>
            {(selectedOrder.process_route || []).length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
                  textTransform: 'uppercase', marginBottom: 8 }}>Process Route</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  {(selectedOrder.process_route as string[]).map((code, i, arr) => {
                    const proc = processList.find((p: any) => p.code === code)
                    return (
                      <React.Fragment key={i}>
                        <span className="process-step">{proc?.name || code}</span>
                        {i < arr.length - 1 && <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>→</span>}
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Assign modal ── */}
      {modal === 'assign' && selectedOrder && (
        <AssignModal
          order={selectedOrder}
          supervisors={supervisors}
          onAssign={doAssign}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}

      {/* ── Split modal ── */}
      {modal === 'split' && selectedOrder && (
        <SplitModal
          order={selectedOrder}
          splitParts={splitParts}
          setSplitParts={setSplitParts}
          onSave={saveSplits}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}

      {/* ── Bulk modal ── */}
      {showBulkModal && (
        <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {bulkAction === 'assign' && '👤 Assign Supervisor'}
                {bulkAction === 'status' && '📦 Change Status'}
                {bulkAction === 'hold'   && '⏸ Put on Hold'}
                {bulkAction === 'delete' && '🗑 Delete Orders'}
              </span>
              <button className="small" onClick={() => setShowBulkModal(false)}>✕</button>
            </div>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: bulkAction === 'delete' ? 'var(--danger)' : 'var(--accent)' }}>
                {selectedIds.size} order{selectedIds.size !== 1 ? 's' : ''}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {bulkAction === 'delete' ? ' will be permanently deleted' : ' will be updated'}
              </span>
            </div>

            {bulkAction === 'assign' && (
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Supervisor *</label>
                <select value={bulkSupervisor} onChange={e => setBulkSupervisor(e.target.value)}>
                  <option value="">— Choose —</option>
                  {supervisors.map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            )}

            {bulkAction === 'status' && (
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>New Status *</label>
                <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}>
                  <option value="">— Choose —</option>
                  {Object.entries(STATUS_MAP).map(([v, b]) =>
                    <option key={v} value={v}>{b.label}</option>)}
                </select>
              </div>
            )}

            {bulkAction === 'hold' && (
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Hold Reason (optional)</label>
                <textarea value={bulkHoldReason} rows={3}
                  placeholder="Reason for hold…"
                  onChange={e => setBulkHoldReason(e.target.value)} />
              </div>
            )}

            {bulkAction === 'delete' && (
              <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)',
                borderRadius: 8, padding: '12px 14px', marginBottom: 14,
                fontSize: 12, color: 'var(--danger)' }}>
                ⚠ This cannot be undone. All batches and planned dates will also be deleted.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowBulkModal(false)}>Cancel</button>
              <button
                className={bulkAction === 'delete' ? '' : 'primary'}
                style={bulkAction === 'delete' ? {
                  background: 'var(--danger)', color: '#fff', border: 'none',
                  padding: '8px 14px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 13,
                } : {}}
                disabled={saving
                  || (bulkAction === 'assign' && !bulkSupervisor)
                  || (bulkAction === 'status' && !bulkStatus)}
                onClick={applyBulk}>
                {saving ? 'Working…'
                  : bulkAction === 'delete' ? `🗑 Delete ${selectedIds.size}`
                  : `Apply to ${selectedIds.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AssignModal({ order, supervisors, onAssign, onClose, saving }: {
  order: any; supervisors: any[]; onAssign: (name: string) => void; onClose: () => void; saving: boolean
}) {
  const [chosen, setChosen] = useState(
    supervisors.find(s => s.id === order.supervisor_id)?.name || ''
  )
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Assign Supervisor — {order.order_number}</span>
          <button className="small" onClick={onClose}>✕</button>
        </div>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8,
          padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          <strong>{order.article}</strong> · {order.color} · {order.qty_kg} Kg
        </div>
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Select Supervisor</label>
          <select value={chosen} onChange={e => setChosen(e.target.value)}>
            <option value="">— Select —</option>
            {supervisors.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary" onClick={() => onAssign(chosen)} disabled={saving || !chosen}>
            {saving ? 'Assigning…' : '✓ Assign'}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function SplitModal({ order, splitParts, setSplitParts, onSave, onClose, saving }: {
  order: any; splitParts: any[]; setSplitParts: React.Dispatch<React.SetStateAction<any[]>>;
  onSave: () => void; onClose: () => void; saving: boolean
}) {
  const totalKg   = splitParts.reduce((s, p) => s + (parseFloat(p.kg) || 0), 0)
  const remaining = (order.qty_kg || 0) - totalKg
  const ok        = Math.abs(remaining) < 0.5

  const add    = () => setSplitParts(p => [...p, { kg: 0, mtr: 0, taka: 0 }])
  const remove = (i: number) => setSplitParts(p => p.filter((_, j) => j !== i))
  const upd    = (i: number, field: string, val: string) =>
    setSplitParts(p => p.map((b, j) => j === i ? { ...b, [field]: val } : b))
  const balance = () => {
    const per = (order.qty_kg || 0) / splitParts.length
    setSplitParts(splitParts.map(() => ({ kg: per, mtr: 0, taka: 0 })))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Split Order — {order.order_number}</span>
          <button className="small" onClick={onClose}>✕</button>
        </div>
        <div style={{ background: 'var(--bg-secondary)', padding: '8px 14px', borderRadius: 8,
          marginBottom: 10, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span><strong>Total:</strong> {order.qty_kg} Kg</span>
          <span><strong>Article:</strong> {order.article}</span>
          <span><strong>Color:</strong> {order.color}</span>
        </div>
        <div style={{ background: ok ? 'var(--success-light)' : 'var(--danger-light)',
          color: ok ? 'var(--success)' : 'var(--danger)',
          borderRadius: 8, padding: '7px 14px', marginBottom: 10, fontSize: 13, fontWeight: 500 }}>
          Allocated: {totalKg.toFixed(1)} Kg · Remaining: {remaining.toFixed(1)} Kg {ok ? '✓' : '⚠'}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              {['Batch', 'Qty (Kg)', 'Qty (Mtr)', 'Taka', ''].map(h => (
                <th key={h} style={{ padding: '6px 8px', fontSize: 11, textAlign: 'left',
                  borderBottom: '1px solid var(--border-light)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {splitParts.map((part, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td style={{ padding: '6px 8px', fontSize: 12, fontWeight: 600 }}>#{i + 1}</td>
                {(['kg', 'mtr', 'taka'] as const).map(f => (
                  <td key={f} style={{ padding: '6px 8px' }}>
                    <input type="number" value={part[f]}
                      onChange={e => upd(i, f, e.target.value)}
                      style={{ width: 80, padding: '4px 6px', fontSize: 12,
                        border: '1px solid var(--border-medium)', borderRadius: 4,
                        background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                  </td>
                ))}
                <td style={{ padding: '6px 8px' }}>
                  {splitParts.length > 1 && (
                    <button className="xs danger" onClick={() => remove(i)}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="small" onClick={add}>➕ Add Batch</button>
          <button className="small" onClick={balance}>Auto-Balance</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : '✓ Save Splits'}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Style constants ───────────────────────────────────────────────────────────

const td: React.CSSProperties = {
  padding: '10px 10px',
  fontSize: 12,
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border-light)',
  borderRight:  '1px solid var(--border-light)',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  verticalAlign: 'middle',
}

const tdCk: React.CSSProperties = {
  width: 40, minWidth: 40, maxWidth: 40,
  padding: '8px 6px', textAlign: 'center',
  borderBottom: '1px solid var(--border-light)',
  borderRight:  '1px solid var(--border-light)',
}
