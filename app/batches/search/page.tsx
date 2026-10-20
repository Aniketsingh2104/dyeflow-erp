'use client'
/**
 * /batches/search — find any batch (by batch code, Sub Prod No., order number, party,
 * article or colour) and open its Batch Trace.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SubProdCell } from '@/components/SubProd'

const STATUS_COLOR: Record<string, [string, string]> = {
  pending:      ['var(--bg-secondary)', 'var(--text-tertiary)'],
  'in-process': ['#DBEAFE', '#1D4ED8'],
  done:         ['var(--success-light)', 'var(--success)'],
  faulty:       ['#FEE2E2', '#991B1B'],
  repairing:    ['#FEF3C7', '#92400E'],
}

export default function BatchSearchPage() {
  const router = useRouter()
  const [batches, setBatches] = useState<any[]>([])
  const [orders,  setOrders]  = useState<Record<string, any>>({})
  const [q,       setQ]       = useState('')
  const [status,  setStatus]  = useState('active')
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    (async () => {
      try {
        const [bRes, oRes] = await Promise.all([
          fetch('/api/batches', { cache: 'no-store' }).then(r => r.json()),
          fetch('/api/orders',  { cache: 'no-store' }).then(r => r.json()),
        ])
        if (!bRes.ok) throw new Error(bRes.error || 'Could not load batches')
        const om: Record<string, any> = {}
        for (const o of oRes.data || []) om[o.id] = o
        setOrders(om)
        setBatches((bRes.data || []).slice().sort((a: any, b: any) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at))))
      } catch (e: any) { setError(e?.message || String(e)) }
      finally { setLoading(false) }
    })()
  }, [])

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return batches.filter(b => {
      if (status === 'active' && (b.status === 'done')) return false
      if (status !== 'active' && status !== 'all' && (b.is_faulty ? 'faulty' : b.status) !== status) return false
      if (!s) return true
      const o = orders[b.order_id] || {}
      return [b.batch_id, b.sub_prod_no, o.order_number, o.party, o.article, o.color, b.current_process, b.machines?.name]
        .some(v => String(v || '').toLowerCase().includes(s))
    })
  }, [batches, orders, q, status])

  const open = (code: string) => router.push(`/batches/${encodeURIComponent(code)}`)

  return (
    <div className="content" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>🔍 Batch Trace</div>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>Search a batch, then click it to see its full journey</div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <form onSubmit={e => { e.preventDefault(); if (rows.length === 1) open(rows[0].batch_id); else if (q.trim()) {
            const exact = batches.find(b => String(b.batch_id).toLowerCase() === q.trim().toLowerCase() || String(b.sub_prod_no || '').toLowerCase() === q.trim().toLowerCase()); if (exact) open(exact.batch_id) } }}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Batch code, Sub Prod No., order number, party, article or colour…"
            style={{ flex: 1, minWidth: 240, padding: '8px 12px', fontSize: 14 }} />
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ padding: '8px 10px', fontSize: 13 }}>
            <option value="active">Not finished</option>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="in-process">In process</option>
            <option value="faulty">Faulty</option>
            <option value="repairing">Repairing</option>
            <option value="done">Done</option>
          </select>
          <button className="primary" type="submit">Trace</button>
        </form>
      </div>

      <div className="card">
        {loading ? <div className="empty-state">Loading batches…</div>
        : error ? <div className="empty-state" style={{ color: 'var(--danger)' }}>⚠ {error}</div>
        : !rows.length ? <div className="empty-state">No batch matches.</div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>{rows.length} batch{rows.length === 1 ? '' : 'es'}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Batch', 'Sub Prod No.', 'Order', 'Party', 'Article / Colour', 'Kg', 'Status', 'Now at', 'Machine'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map(b => {
                  const o = orders[b.order_id] || {}
                  const st = b.is_faulty ? 'faulty' : b.status
                  const [bg, fg] = STATUS_COLOR[st] || ['var(--bg-secondary)', 'var(--text-secondary)']
                  return (
                    <tr key={b.id} onClick={() => open(b.batch_id)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}>
                      <td style={td}><Link href={`/batches/${encodeURIComponent(b.batch_id)}`} style={{ fontWeight: 700 }}>{b.batch_id}</Link></td>
                      <td style={td}><SubProdCell value={b.sub_prod_no} /></td>
                      <td style={td}>{o.order_number || '—'}</td>
                      <td style={td}>{o.party || '—'}</td>
                      <td style={td}>{o.article || '—'} · {o.color || '—'}</td>
                      <td style={td}>{b.kg}</td>
                      <td style={td}><span style={{ padding: '2px 8px', borderRadius: 10, background: bg, color: fg, fontWeight: 700, fontSize: 11 }}>{st}</span></td>
                      <td style={td}>{b.current_process || '—'}</td>
                      <td style={td}>{b.machines?.name || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length > 300 && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>Showing the first 300 — type more to narrow it down.</div>}
          </div>
        )}
      </div>
    </div>
  )
}

const td: React.CSSProperties = { padding: '8px 10px' }
