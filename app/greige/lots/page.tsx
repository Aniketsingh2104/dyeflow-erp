'use client'
// Greige Lot Details — flat, read-only register of every individual lot
// (not grouped by entry). Lot entry itself now happens on the Register
// page's Lot No. form (with automatic Kg/Meter calculation from taka share);
// this page is purely for viewing/searching every lot's full detail.

import { useEffect, useState, useCallback, useMemo } from 'react'

async function greigeApi(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`/api/greige${qs}`, { cache: 'no-store' })
  return res.json()
}

async function ordersApi(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`/api/orders${qs}`, { cache: 'no-store' })
  return res.json()
}

function fmtDateTime(d: any) {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return '-' }
}

export default function GreigeLotsPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [lots,    setLots]    = useState<any[]>([])
  const [orders,  setOrders]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [entriesRes, lotsRes, ordersRes] = await Promise.all([
        greigeApi(),
        greigeApi({ type: 'lots' }),
        ordersApi({ limit: '3000' }),
      ])
      if (entriesRes.ok) setEntries(entriesRes.data || [])
      if (lotsRes.ok)    setLots(lotsRes.data    || [])
      if (ordersRes.ok)  setOrders(ordersRes.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const entryById = useMemo(() => {
    const m: Record<string, any> = {}
    for (const e of entries) m[e.id] = e
    return m
  }, [entries])

  // Consumption per lot number, summed across every order whose lot_no
  // matches (trimmed + case-insensitive, since orders.lot_no is free-typed
  // text and real data has inconsistent spacing/casing — e.g. "591 B").
  const consumedByLot = useMemo(() => {
    const m: Record<string, { kg: number; qty: number; taka: number }> = {}
    for (const o of orders) {
      const key = String(o.lot_no || '').trim().toUpperCase()
      if (!key) continue
      if (!m[key]) m[key] = { kg: 0, qty: 0, taka: 0 }
      m[key].kg   += parseFloat(o.qty_kg)    || 0
      m[key].qty  += parseFloat(o.qty_mtr)   || 0
      m[key].taka += parseInt(o.no_of_taka)  || 0
    }
    return m
  }, [orders])

  // One row per lot, joined back to its parent entry for party/challan/article,
  // and to matching orders for consumed → pending Kg/Meter/Taka.
  const rows = useMemo(() => {
    return lots.map((l: any) => {
      const e = entryById[l.entry_id] || {}
      const key = String(l.lot_number || '').trim().toUpperCase()
      const consumed = consumedByLot[key] || { kg: 0, qty: 0, taka: 0 }
      const pendingKg   = l.kg   != null ? Math.round((parseFloat(l.kg)  - consumed.kg)  * 100) / 100 : null
      const pendingQty  = l.qty  != null ? Math.round((parseFloat(l.qty) - consumed.qty) * 100) / 100 : null
      const pendingTaka = l.taka != null ? (parseInt(l.taka) - consumed.taka) : null
      return {
        ...l,
        party:        e.party        || '-',
        challan_no:   e.challan_no   || '-',
        article:      e.article      || '-',
        blend:        e.blend        || '-',
        entry_taka:   e.no_of_taka,
        entry_kg:     e.kg,
        entry_qty:    e.qty,
        entry_created: e.created_at,
        consumedKg:   consumed.kg,
        consumedQty:  consumed.qty,
        consumedTaka: consumed.taka,
        pendingKg, pendingQty, pendingTaka,
      }
    })
  }, [lots, entryById, consumedByLot])

  const filtered = search.trim()
    ? rows.filter(r => [r.lot_number, r.party, r.challan_no, r.article]
        .some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
    : rows

  // Sorted most recent first.
  const sorted = [...filtered].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const totals = {
    lots: sorted.length,
    kg:   sorted.reduce((s, r) => s + (parseFloat(r.kg)  || 0), 0),
    qty:  sorted.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0),
    taka: sorted.reduce((s, r) => s + (parseInt(r.taka)  || 0), 0),
  }

  // Only blank the page on the true first load.
  if (loading && entries.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Lot Details</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {totals.lots} lot{totals.lots !== 1 ? 's' : ''} · {totals.kg.toFixed(1)} Kg total · {totals.qty.toFixed(1)} Meter total · {totals.taka} Taka total
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search lot no. / party / challan / article…"
            style={{ width: 260, padding: '6px 10px', fontSize: 12,
              border: '1px solid var(--border-medium)', borderRadius: 5,
              background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          {search && <button className="xs" onClick={() => setSearch('')}>✕</button>}
          <button className="small" onClick={load}>⟳</button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)', fontSize: 14 }}>
          {rows.length === 0
            ? 'No lots entered yet. Add lots from the Greige Register page.'
            : 'No lots match your search.'}
        </div>
      ) : (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
          borderRadius: 10, overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 900, width: '100%', fontSize: 12 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Lot No.', 'Qty (Kg)', 'Qty (Meter)', 'Taka', 'Pending Kg', 'Pending Meter', 'Pending Taka', 'Party', 'Challan No.', 'Article', 'Blend', 'Entry Date', 'Status'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)',
                    whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{r.lot_number}</td>
                  <td style={td}>{r.kg != null ? r.kg : '-'}</td>
                  <td style={td}>{r.qty != null ? r.qty : '-'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{r.taka != null ? r.taka : '-'}</td>
                  <td style={{ ...td, fontWeight: 700, color: r.pendingKg != null && r.pendingKg < 0 ? 'var(--danger)' : r.pendingKg === 0 ? 'var(--text-tertiary)' : 'var(--warning)' }}>
                    {r.pendingKg != null ? r.pendingKg : '-'}
                  </td>
                  <td style={{ ...td, fontWeight: 700, color: r.pendingQty != null && r.pendingQty < 0 ? 'var(--danger)' : r.pendingQty === 0 ? 'var(--text-tertiary)' : 'var(--warning)' }}>
                    {r.pendingQty != null ? r.pendingQty : '-'}
                  </td>
                  <td style={{ ...td, fontWeight: 700, color: r.pendingTaka != null && r.pendingTaka < 0 ? 'var(--danger)' : r.pendingTaka === 0 ? 'var(--text-tertiary)' : 'var(--warning)' }}>
                    {r.pendingTaka != null ? r.pendingTaka : '-'}
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.party}</td>
                  <td style={td}>{r.challan_no}</td>
                  <td style={td}>{r.article}</td>
                  <td style={td}>{r.blend}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.created_at)}</td>
                  <td style={td}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: r.status === 'done' ? 'var(--success-light)' : 'var(--accent-light)',
                      color: r.status === 'done' ? 'var(--success)' : 'var(--accent)' }}>
                      {r.status || 'active'}
                    </span>
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

const td: React.CSSProperties = { padding: '8px 12px', fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap' }
