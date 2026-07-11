'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getOrders, getSupervisors, getMachines, createSplits } from '@/lib/db'

function SplitOrderContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const orderId      = searchParams.get('id')

  const [order,       setOrder]       = useState<any>(null)
  const [supervisors, setSupervisors] = useState<any[]>([])
  const [machines,    setMachines]    = useState<any[]>([])
  const [saving,      setSaving]      = useState(false)
  const [parts,       setParts]       = useState([{ kg: 0, mtr: 0, machine_id: '' }])

  const loadAll = useCallback(async () => {
    const [supRes, machRes] = await Promise.all([getSupervisors(), getMachines()])
    setSupervisors(supRes.data || [])
    setMachines(machRes.data   || [])

    if (!orderId) return
    const { data: orders } = await getOrders({ limit: 1000 })
    const found = (orders || []).find((o: any) => o.id === orderId || o.order_number === orderId)
    if (found) {
      setOrder(found)
      setParts([{ kg: parseFloat(found.qty_kg) || 0, mtr: parseFloat(found.qty_mtr) || 0, machine_id: found.machine_id || '' }])
    }
  }, [orderId])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Computations ────────────────────────────────────────────────────────────

  const totalKg  = parts.reduce((s, p) => s + (parseFloat(String(p.kg))  || 0), 0)
  const totalMtr = parts.reduce((s, p) => s + (parseFloat(String(p.mtr)) || 0), 0)
  const remKg    = (parseFloat(order?.qty_kg)  || 0) - totalKg
  const remMtr   = (parseFloat(order?.qty_mtr) || 0) - totalMtr
  const ok       = Math.abs(remKg) < 0.5

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const add = () => setParts(p => [...p, { kg: Math.max(0, remKg), mtr: Math.max(0, remMtr), machine_id: '' }])

  const remove = (i: number) => {
    if (parts.length <= 1) { alert('Cannot remove the last batch'); return }
    setParts(p => p.filter((_, j) => j !== i))
  }

  const upd = (i: number, field: string, val: any) =>
    setParts(p => p.map((b, j) => j === i ? { ...b, [field]: val } : b))

  const balance = () => {
    if (!order) return
    const n  = parts.length
    const kg = (parseFloat(order.qty_kg)  || 0) / n
    const mt = (parseFloat(order.qty_mtr) || 0) / n
    setParts(parts.map(() => ({ ...parts[0], kg: parseFloat(kg.toFixed(2)), mtr: parseFloat(mt.toFixed(2)) })))
  }

  const handleSave = async () => {
    if (!order) return
    if (!ok && !confirm(`Remaining ${remKg.toFixed(1)} Kg. Save anyway?`)) return
    setSaving(true)
    try {
      const batches = parts.map((p, i) => ({
        batch_id:   `${order.order_number}-B${i + 1}`,
        kg:          parseFloat(String(p.kg)) || 0,
        machine_id:  p.machine_id || null,
      }))
      const { error } = await createSplits(order.id, batches, order.process_route || [])
      if (error) { alert('Error: ' + error); return }
      alert('✓ Order split successfully!')
      router.push('/orders')
    } finally { setSaving(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!order) return (
    <div className="content" style={{ padding: 20 }}>
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)' }}>
        {orderId ? 'Order not found.' : 'No order selected.'}{' '}
        <button className="xs" onClick={() => router.push('/orders')}>← Back to Orders</button>
      </div>
    </div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          Split Order — {order.order_number}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="small" onClick={() => router.push('/orders')}>← Back</button>
          <button className="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save Splits'}
          </button>
        </div>
      </div>

      {/* Order summary */}
      <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)',
        borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: '10px 20px' }}>
          {[
            ['Party',      order.party],
            ['Article',    order.article],
            ['Color',      order.color],
            ['Blend',      order.blend],
            ['Qty (Kg)',   order.qty_kg],
            ['Qty (Mtr)',  order.qty_mtr],
            ['Process',    (order.process_route || []).join(' → ')],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{val || '-'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Batches',      value: parts.length,        color: 'var(--text-primary)' },
          { label: 'Allocated Kg', value: totalKg.toFixed(1),  color: 'var(--accent)' },
          { label: 'Remaining Kg', value: remKg.toFixed(1),    color: ok ? 'var(--success)' : 'var(--danger)' },
          { label: 'Status',       value: ok ? '✓ Ready' : '⚠ Check', color: ok ? 'var(--success)' : 'var(--danger)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-secondary)',
            border: `1px solid ${s.color === 'var(--danger)' ? 'var(--danger)' : 'var(--border-light)'}`,
            borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {!ok && (
        <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13,
          color: 'var(--warning)' }}>
          ⚠ Total allocated ({totalKg.toFixed(1)} Kg) doesn't match order qty ({order.qty_kg} Kg).
          Remaining: {remKg.toFixed(1)} Kg.
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className="small" onClick={add}>➕ Add Batch</button>
        <button className="small" onClick={balance} disabled={parts.length < 2}>⚖ Auto-Balance</button>
      </div>

      {/* Batch rows */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-secondary)' }}>
            <tr>
              {['Batch','Batch ID','Qty (Kg)','Qty (Mtr)','Machine',''].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10,
                  fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                  letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parts.map((part, i) => {
              const batchId = `${order.order_number}-B${i + 1}`
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-light)',
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px',
                      background: 'var(--accent)', color: '#fff', borderRadius: 4 }}>
                      #{i + 1}
                    </span>
                  </td>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--accent)' }}>{batchId}</td>
                  <td style={td}>
                    <input type="number" value={part.kg} min={0} step={0.1}
                      onChange={e => upd(i, 'kg', e.target.value)}
                      style={{ width: 90, padding: '5px 8px', textAlign: 'right',
                        border: '1px solid var(--border-medium)', borderRadius: 4,
                        background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }} />
                  </td>
                  <td style={td}>
                    <input type="number" value={part.mtr} min={0} step={0.1}
                      onChange={e => upd(i, 'mtr', e.target.value)}
                      style={{ width: 90, padding: '5px 8px', textAlign: 'right',
                        border: '1px solid var(--border-medium)', borderRadius: 4,
                        background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13 }} />
                  </td>
                  <td style={td}>
                    <select value={part.machine_id}
                      onChange={e => upd(i, 'machine_id', e.target.value)}
                      style={{ padding: '5px 8px', border: '1px solid var(--border-medium)',
                        borderRadius: 4, background: 'var(--bg-primary)',
                        color: 'var(--text-primary)', fontSize: 13, minWidth: 160 }}>
                      <option value="">— Select machine —</option>
                      {machines.map((m: any) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.capacity} Kg)</option>
                      ))}
                    </select>
                  </td>
                  <td style={td}>
                    {parts.length > 1 && (
                      <button className="xs danger" onClick={() => remove(i)}>✕</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SplitOrderPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
        Loading…
      </div>
    }>
      <SplitOrderContent />
    </Suspense>
  )
}

const td: React.CSSProperties = {
  padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)',
}
