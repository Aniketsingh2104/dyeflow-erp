'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getBatches, getOrders, markProcessDone } from '@/lib/db'
import { sb } from '@/lib/supabase'

export default function FirstProcessBatchPage() {
  const router = useRouter()
  const [batches, setBatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState('')
  const [search,  setSearch]  = useState('')
  const [saving,  setSaving]  = useState(false)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [batchRes, orderRes, dpRes] = await Promise.all([
        getBatches(),
        getOrders({ limit: 1000 }),
        fetch('/api/date-plans', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])

      const batches: any[] = batchRes.data  || []
      const orders:  any[] = orderRes.data  || []
      const datePlans: any[] = dpRes.data   || []

      const oMap: Record<string, any> = {}
      for (const o of orders) oMap[o.id] = o

      // Build date plan map: batch UUID → date plan row
      const dpMap: Record<string, any> = {}
      for (const dp of datePlans) dpMap[dp.batch_id] = dp

      // First process batches: batches with no current_process yet but have a process route
      const firstProcess = batches.filter(b => {
        const order = oMap[b.order_id]
        const route: string[] = order?.process_route || []
        return (
          !b.current_process &&
          b.status !== 'done' &&
          route.length > 0
        )
      }).map(b => {
        const order = oMap[b.order_id] || {}
        const route: string[] = order.process_route || []
        return {
          ...b,
          order_number:  order.order_number || '-',
          party:         order.party        || '-',
          article:       order.article      || '-',
          color:         order.color        || '-',
          process_route: route,
          first_process: route[0] || '',
          sub_party:     order.sub_party     || '-',
          sales_person:  order.sales_person   || '-',
          blend:         order.blend          || '-',
          width:         order.width          || '-',
          sub_party:     order.sub_party     || '-',
          supervisor:    order.supervisors?.name || '-',
          machine_name:  b.machines?.name || '-',
          // All order fields filled at time of order entry
          gsm:           order.gsm          || '-',
          lab_no:        order.lab_no       || '-',
          lot_no:        order.lot_no       || '-',
          challan_no:    order.challan_no   || '-',
          qty_mtr:       order.qty_mtr      || '-',
          no_of_taka:    order.no_of_taka   || '-',
          type_of_finish:  order.type_of_finish  || '-',
          type_of_packing: order.type_of_packing || '-',
          remarks:       order.remarks      || '-',
          delivery_date: order.delivery_date ? (() => {
            const parts = String(order.delivery_date).slice(0,10).split('-')
            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : order.delivery_date
          })() : '-',
          // Planned date of first process from batch_date_plans
          planned_date:  (() => {
            const dp = dpMap[b.id] || {}
            const firstProc = route[0] || ''
            const colMap: Record<string,string> = {
              C:'d_c', S:'d_s', H:'d_h', D:'d_d', S2:'d_s2', Rx:'d_rx',
              O:'d_o', G:'d_g', F:'d_f', Co:'d_co', Tu:'d_tu', Add:'d_add',
              Level:'d_level', Rc:'d_rc', Fix:'d_fix', Wash:'d_wash',
              Dry:'d_dry', B:'d_b', R:'d_r', K:'d_k',
              QA:'d_qa', Packing:'d_packing', Dispatch:'d_dispatch'
            }
            const col = colMap[firstProc]
            if (!col || !dp[col]) return '-'
            const ymd = String(dp[col]).slice(0,10)
            const parts = ymd.split('-')
            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : ymd
          })(),
        }
      })

      setBatches(firstProcess)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const h = () => load()
    window.addEventListener('dyeflow-db-updated', h)
    return () => window.removeEventListener('dyeflow-db-updated', h)
  }, [load])

  const handleDispatch = async (batch: any) => {
    if (!batch.first_process) { alert('No process route assigned'); return }
    if (!confirm(`Dispatch ${batch.batch_id} to ${batch.first_process}?`)) return
    setSaving(true)
    try {
      // Update batch: set current_process to first process and status to in-process
      const { error } = await sb(`/batches`, {
        method: 'PATCH',
        body: JSON.stringify({ current_process: batch.first_process, status: 'in-process' }),
        params: { id: `eq.${batch.id}` },
        headers: { 'Prefer': 'return=minimal' },
      })
      if (error) { alert('Error: ' + error); return }

      // Mark the batch_process row as sent
      await sb('/batch_processes', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() }),
        params: { batch_id: `eq.${batch.id}`, process_code: `eq.${batch.first_process}` },
        headers: { 'Prefer': 'return=minimal' },
      })

      showToast(`✓ ${batch.batch_id} dispatched to ${batch.first_process}`)
      load()
    } finally { setSaving(false) }
  }

  const handleDispatchAll = async () => {
    const undispatched = filtered.filter(b => b.first_process)
    if (!undispatched.length) { alert('No batches to dispatch'); return }
    if (!confirm(`Dispatch all ${undispatched.length} batches to their first process?`)) return
    setSaving(true)
    try {
      for (const batch of undispatched) {
        await sb('/batches', {
          method: 'PATCH',
          body: JSON.stringify({ current_process: batch.first_process, status: 'in-process' }),
          params: { id: `eq.${batch.id}` },
          headers: { 'Prefer': 'return=minimal' },
        })
        await sb('/batch_processes', {
          method: 'PATCH',
          body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() }),
          params: { batch_id: `eq.${batch.id}`, process_code: `eq.${batch.first_process}` },
          headers: { 'Prefer': 'return=minimal' },
        })
      }
      showToast(`✓ ${undispatched.length} batches dispatched`)
      load()
    } finally { setSaving(false) }
  }

  const filtered = batches.filter(b => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return [b.batch_id, b.order_number, b.party, b.color, b.article]
      .some(v => String(v ?? '').toLowerCase().includes(q))
  })

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading first-process batches…
    </div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 700 }}>First Process Batch</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 10 }}>
            {filtered.length} batch{filtered.length !== 1 ? 'es' : ''} awaiting dispatch
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ width: 200, padding: '6px 10px', fontSize: 12,
              border: '1px solid var(--border-medium)', borderRadius: 5,
              background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          {filtered.length > 0 && (
            <button className="primary" onClick={handleDispatchAll} disabled={saving}>
              {saving ? 'Dispatching…' : `🚀 Dispatch All (${filtered.length})`}
            </button>
          )}
          <button className="small" onClick={load}>⟳</button>
        </div>
      </div>

      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--success)', fontSize: 15 }}>
          ✓ All batches have been dispatched to their first process.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
          borderRadius: 10, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
              <tr>
                {['Batch ID','Order #','Party','Sub Party','Sales Person','Article','Blend','Width','GSM','Color','Lab No','Lot No','Challan No','Qty (KG)','Qty (MTR)','Taka','Finish','Packing','Remarks','Route','First Process','Planned Date','Delivery Date','Supervisor','Machine','Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)',
                    whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => (
                <tr key={b.id || i} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{b.batch_id}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{b.order_number}</td>
                  <td style={{ ...td, color:'var(--accent)', fontWeight:600 }}>{b.party}</td>
                  <td style={td}>{b.sub_party}</td>
                  <td style={{ ...td, color:'var(--accent)' }}>{b.sales_person}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{b.article}</td>
                  <td style={{ ...td, color:'var(--warning)' }}>{b.blend}</td>
                  <td style={td}>{b.width}</td>
                  <td style={{ ...td, color:'var(--accent)', fontWeight:700 }}>{b.gsm}</td>
                  <td style={td}>{b.color}</td>
                  <td style={{ ...td, color:'var(--accent)' }}>{b.lab_no}</td>
                  <td style={td}>{b.lot_no}</td>
                  <td style={{ ...td, color:'var(--accent)' }}>{b.challan_no}</td>
                  <td style={{ ...td, fontWeight: 700, color:'var(--accent)' }}>{b.kg} Kg</td>
                  <td style={{ ...td, fontWeight:700, color:'var(--accent)' }}>{b.qty_mtr}</td>
                  <td style={{ ...td, fontWeight:700, color:'var(--accent)' }}>{b.no_of_taka}</td>
                  <td style={td}>{b.type_of_finish}</td>
                  <td style={{ ...td, color:'var(--accent)' }}>{b.type_of_packing}</td>
                  <td style={{ ...td, fontSize:11, maxWidth:120 }}>{b.remarks !== '-' ? b.remarks : ''}</td>
                  <td style={{ ...td, fontSize: 11, maxWidth: 200, whiteSpace:'normal' }}>
                    {(b.process_route || []).join(' → ')}
                  </td>
                  <td style={td}>
                    {b.first_process ? (
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px',
                        background: 'var(--accent)', color: '#fff', borderRadius: 4 }}>
                        {b.first_process}
                      </span>
                    ) : <span style={{ color: 'var(--danger)', fontSize: 11 }}>No route!</span>}
                  </td>
                  <td style={{ ...td, fontWeight: 700,
                    color: b.planned_date !== '-' ? 'var(--success)' : 'var(--text-tertiary)' }}>
                    {b.planned_date}
                  </td>
                  <td style={{ ...td, color: 'var(--warning)', fontWeight: 600 }}>
                    {b.delivery_date !== '-' ? b.delivery_date : '-'}
                  </td>
                  <td style={td}>{b.supervisor}</td>
                  <td style={td}>
                    {b.machine_name !== '-' && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px',
                        background: 'var(--purple-light)', color: 'var(--purple)', borderRadius: 4 }}>
                        {b.machine_name}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, maxWidth: 150, whiteSpace: 'normal', fontSize: 11 }}>
                    {b.remarks !== '-' ? b.remarks : ''}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button className="xs primary" disabled={!b.first_process || saving}
                      onClick={() => handleDispatch(b)}>
                      🚀 Dispatch
                    </button>
                    {b.first_process && (
                      <button className="xs" style={{ marginLeft: 4 }}
                        onClick={() => router.push(`/fms/${b.first_process}`)}>
                        FMS →
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--text-primary)' }
