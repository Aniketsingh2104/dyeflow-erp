'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface SplitBatch {
  id: string
  batchNumber: number
  quantity: number
  meters: number
  supervisor: string
  machine: string
  priority: 'normal' | 'high' | 'urgent'
  dueDate: string
  notes: string
  status: 'valid' | 'invalid'
  errors: string[]
}

interface Order {
  id: string
  orderNumber: string
  party: string
  subParty: string
  article: string
  color: string
  blend: string
  width: string
  gsm: string
  qtyKg: number
  qtyMtr: number
  process: string
}

function SplitOrderContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const orderId = searchParams.get('id')

  const [order, setOrder] = useState<Order | null>(null)
  const [splits, setSplits] = useState<SplitBatch[]>([
    {
      id: 'split-1', batchNumber: 1, quantity: 0, meters: 0,
      supervisor: '', machine: '', priority: 'normal', dueDate: '', notes: '',
      status: 'invalid', errors: ['Quantity required', 'Supervisor required', 'Machine required']
    }
  ])

  useEffect(() => {
    if (orderId) loadOrder(orderId)
  }, [orderId])

  const loadOrder = (id: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const foundOrder = db.orders?.find((o: any) => o.id === id || o.orderNumber === id)
    if (foundOrder) {
      setOrder({
        id: foundOrder.id, orderNumber: foundOrder.orderNumber || '-',
        party: foundOrder.party || '', subParty: foundOrder.subParty || '',
        article: foundOrder.article || '', color: foundOrder.color || '',
        blend: foundOrder.blend || '', width: foundOrder.width || '',
        gsm: foundOrder.gsm || '', qtyKg: foundOrder.qtyKg || 0,
        qtyMtr: foundOrder.qtyMtr || 0, process: foundOrder.process || 'C→S→H→D→F'
      })
      setSplits([{
        id: 'split-1', batchNumber: 1, quantity: foundOrder.qtyKg || 0,
        meters: foundOrder.qtyMtr || 0, supervisor: '', machine: '', priority: 'normal',
        dueDate: new Date().toISOString().split('T')[0], notes: '',
        status: 'invalid', errors: ['Supervisor required', 'Machine required']
      }])
    }
  }

  const totalSplitQty = splits.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)
  const totalSplitMeters = splits.reduce((sum, s) => sum + (Number(s.meters) || 0), 0)
  const remainingQty = (order?.qtyKg || 0) - totalSplitQty
  const remainingMeters = (order?.qtyMtr || 0) - totalSplitMeters
  const isValid = remainingQty === 0 && splits.every(s => s.status === 'valid')

  const handleAddSplit = () => {
    setSplits([...splits, {
      id: `split-${Date.now()}`, batchNumber: splits.length + 1,
      quantity: Math.max(0, remainingQty), meters: Math.max(0, remainingMeters),
      supervisor: '', machine: '', priority: 'normal',
      dueDate: new Date().toISOString().split('T')[0], notes: '',
      status: 'invalid', errors: ['Supervisor required', 'Machine required']
    }])
  }

  const handleDistributeEqually = () => {
    if (!order) return
    const count = splits.length
    const qtyPerSplit = Math.floor(order.qtyKg / count)
    const metersPerSplit = Math.floor(order.qtyMtr / count)
    const remainderQty = order.qtyKg - (qtyPerSplit * count)
    const remainderMeters = order.qtyMtr - (metersPerSplit * count)
    setSplits(prev => prev.map((split, idx) => ({
      ...split,
      quantity: idx === count - 1 ? qtyPerSplit + remainderQty : qtyPerSplit,
      meters: idx === count - 1 ? metersPerSplit + remainderMeters : metersPerSplit
    })))
  }

  const handleCloneSplit = (splitId: string) => {
    const s = splits.find(s => s.id === splitId)
    if (!s) return
    setSplits([...splits, { ...s, id: `split-${Date.now()}`, batchNumber: splits.length + 1, quantity: 0, meters: 0 }])
  }

  const handleDeleteSplit = (splitId: string) => {
    if (splits.length <= 1) { alert('Cannot delete the last split'); return }
    setSplits(splits.filter(s => s.id !== splitId))
  }

  const handleUpdateSplit = (splitId: string, field: keyof SplitBatch, value: any) => {
    setSplits(prev => prev.map(split => {
      if (split.id !== splitId) return split
      const updated = { ...split, [field]: value }
      const errors: string[] = []
      if (!updated.quantity || updated.quantity <= 0) errors.push('Quantity required')
      if (!updated.supervisor) errors.push('Supervisor required')
      if (!updated.machine) errors.push('Machine required')
      updated.status = errors.length === 0 ? 'valid' : 'invalid'
      updated.errors = errors
      return updated
    }))
  }

  const handleSaveSplits = () => {
    if (!order || !isValid) { alert('Please fix all validation errors before saving'); return }
    if (remainingQty !== 0) { alert(`Total split quantity (${totalSplitQty}) must equal order quantity (${order.qtyKg})`); return }
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    const orderIndex = db.orders?.findIndex((o: any) => o.id === order.id)
    if (orderIndex !== -1) {
      db.orders[orderIndex].splits = splits.map(s => ({
        batchNumber: s.batchNumber, quantity: s.quantity, meters: s.meters,
        supervisor: s.supervisor, machine: s.machine, priority: s.priority,
        dueDate: s.dueDate, notes: s.notes
      }))
      db.orders[orderIndex].splitOn = new Date().toISOString()
      db.orders[orderIndex].splitBy = 'Admin'
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      alert('✓ Order split successfully!')
      router.push('/orders')
    }
  }

  if (!order) return (
    <div className="content">
      <div className="card">
        <div className="empty-state">Order not found. <Link href="/orders">Go back</Link></div>
      </div>
    </div>
  )

  return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Split Order: {order.orderNumber}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/orders"><button className="small">← Back</button></Link>
            <button className="small primary" onClick={handleSaveSplits} disabled={!isValid}>💾 Save Splits</button>
          </div>
        </div>

        <div style={{ background: 'linear-gradient(to right, #e6f1fb, #f0f7fc)', border: '1px solid rgba(24,95,165,0.2)', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '12px' }}>
            {[['PARTY', order.party], ['ARTICLE', order.article], ['COLOR', order.color], ['PROCESS', order.process]].map(([label, val]) => (
              <div key={label}><div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: '4px' }}>{label}</div><div style={{ fontSize: '14px', fontWeight: 600 }}>{val}</div></div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px' }}>
            <div><div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: '4px' }}>TOTAL QTY (KG)</div><div style={{ fontSize: '18px', fontWeight: 700, color: '#185FA5' }}>{order.qtyKg}</div></div>
            <div><div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: '4px' }}>TOTAL QTY (MTR)</div><div style={{ fontSize: '18px', fontWeight: 700, color: '#185FA5' }}>{order.qtyMtr}</div></div>
            <div><div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: '4px' }}>BLEND</div><div style={{ fontSize: '14px' }}>{order.blend || '-'}</div></div>
            <div><div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: '4px' }}>WIDTH / GSM</div><div style={{ fontSize: '14px' }}>{order.width || '-'} / {order.gsm || '-'}</div></div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '12px', marginBottom: '20px' }}>
          <div className="stat-card"><div className="stat-label">Total Splits</div><div className="stat-value">{splits.length}</div></div>
          <div className="stat-card"><div className="stat-label">Split Qty (Kg)</div><div className="stat-value" style={{ color: '#185FA5' }}>{totalSplitQty}</div></div>
          <div className="stat-card"><div className="stat-label">Split Qty (Mtr)</div><div className="stat-value" style={{ color: '#185FA5' }}>{totalSplitMeters}</div></div>
          <div className="stat-card" style={{ background: remainingQty !== 0 ? '#ffe9e9' : '#e9f8ee', border: `2px solid ${remainingQty !== 0 ? '#A32D2D' : '#27500A'}` }}>
            <div className="stat-label">Remaining Kg</div><div className="stat-value" style={{ color: remainingQty !== 0 ? '#A32D2D' : '#27500A' }}>{remainingQty}</div>
          </div>
          <div className="stat-card" style={{ background: remainingMeters !== 0 ? '#ffe9e9' : '#e9f8ee', border: `2px solid ${remainingMeters !== 0 ? '#A32D2D' : '#27500A'}` }}>
            <div className="stat-label">Remaining Mtr</div><div className="stat-value" style={{ color: remainingMeters !== 0 ? '#A32D2D' : '#27500A' }}>{remainingMeters}</div>
          </div>
          <div className="stat-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isValid ? <span className="badge badge-success" style={{ fontSize: '13px', padding: '6px 12px' }}>✓ Valid</span>
              : <span className="badge badge-danger" style={{ fontSize: '13px', padding: '6px 12px' }}>⚠ Invalid</span>}
          </div>
        </div>

        {remainingQty !== 0 && (
          <div style={{ background: '#FAEEDA', border: '1px solid rgba(99,56,6,0.2)', borderRadius: '6px', padding: '12px', marginBottom: '16px', display: 'flex', gap: '12px' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#633806', marginBottom: '4px' }}>Quantity Mismatch</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Total split quantity ({totalSplitQty} kg) must equal order quantity ({order.qtyKg} kg).</div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="small" onClick={handleAddSplit}>+ Add Split Batch</button>
          <button className="small" onClick={handleDistributeEqually} disabled={splits.length === 0}>⚖️ Distribute Equally</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch #</th><th>Qty (Kg)</th><th>Qty (Mtr)</th><th>Supervisor</th>
                <th>Machine</th><th>Priority</th><th>Due Date</th><th>Notes</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {splits.map(split => (
                <tr key={split.id}>
                  <td style={{ textAlign: 'center' }}>
                    <span className="badge" style={{ background: '#185FA5', color: 'white', fontWeight: 600 }}>Batch {split.batchNumber}</span>
                  </td>
                  <td><input type="number" value={split.quantity} onChange={e => handleUpdateSplit(split.id, 'quantity', Number(e.target.value))} style={{ width: '100%', padding: '6px', textAlign: 'right' }} min="1" /></td>
                  <td><input type="number" value={split.meters} onChange={e => handleUpdateSplit(split.id, 'meters', Number(e.target.value))} style={{ width: '100%', padding: '6px', textAlign: 'right' }} min="1" /></td>
                  <td>
                    <select value={split.supervisor} onChange={e => handleUpdateSplit(split.id, 'supervisor', e.target.value)} style={{ width: '100%', padding: '6px' }}>
                      <option value="">Select...</option>
                      {['Kundan M.','Nandlal M.','Urvesh M.','Gyaneshwar M.','Jitesh M.'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={split.machine} onChange={e => handleUpdateSplit(split.id, 'machine', e.target.value)} style={{ width: '100%', padding: '6px' }}>
                      <option value="">Select...</option>
                      {['Machine 1','Machine 2','Machine 3','Machine 4','Machine 7'].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={split.priority} onChange={e => handleUpdateSplit(split.id, 'priority', e.target.value as any)} style={{ width: '100%', padding: '6px' }}>
                      <option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                    </select>
                  </td>
                  <td><input type="date" value={split.dueDate} onChange={e => handleUpdateSplit(split.id, 'dueDate', e.target.value)} style={{ width: '100%', padding: '6px' }} /></td>
                  <td><input type="text" value={split.notes} onChange={e => handleUpdateSplit(split.id, 'notes', e.target.value)} placeholder="Add notes..." style={{ width: '100%', padding: '6px' }} /></td>
                  <td>
                    {split.status === 'valid' ? <span className="badge badge-success">✓ Valid</span>
                      : <div><span className="badge badge-danger">⚠ Invalid</span>{split.errors[0] && <div style={{ fontSize: '10px', color: '#A32D2D' }}>{split.errors[0]}</div>}</div>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => handleCloneSplit(split.id)} style={{ padding: '4px 8px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#185FA5', fontSize: '16px', marginRight: '4px' }} title="Clone">📋</button>
                    <button onClick={() => handleDeleteSplit(split.id)} disabled={splits.length <= 1} style={{ padding: '4px 8px', background: 'transparent', border: 'none', cursor: splits.length <= 1 ? 'not-allowed' : 'pointer', color: '#A32D2D', fontSize: '18px' }} title="Delete">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function SplitOrderPage() {
  return (
    <Suspense fallback={<div className="content"><div className="card"><div className="empty-state">Loading...</div></div></div>}>
      <SplitOrderContent />
    </Suspense>
  )
}
