'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getOrders } from '@/lib/db'

async function greigeApi(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`/api/greige${qs}`, { cache: 'no-store' })
  return res.json()
}

async function greigePost(body: Record<string, any>) {
  const res = await fetch('/api/greige', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

function timeDiff(entryTs: string, hoursLimit: number) {
  const deadline = new Date(entryTs).getTime() + hoursLimit * 3600000
  const now = Date.now()
  const diff = deadline - now
  const abs = Math.abs(diff)
  const h = Math.floor(abs / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  return { overdue: diff < 0, label: `${h}h ${m}m ${diff < 0 ? 'overdue' : 'left'}` }
}

const BLANK = { party: '', challan: '', taka: '', qty: '', article: '', blend: '', linkedOrderId: '' }

export default function GreigeEntryPage() {
  const router = useRouter()
  const [entries,  setEntries]  = useState<any[]>([])
  const [orders,   setOrders]   = useState<any[]>([])
  const [parties,  setParties]  = useState<string[]>([])
  const [form,     setForm]     = useState({ ...BLANK })
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    const [entriesRes, ordersRes] = await Promise.all([
      greigeApi(),
      getOrders({ limit: 500 }),
    ])
    const allEntries = entriesRes.data || []
    setEntries(allEntries)
    const allOrders = (ordersRes.data || []).filter((o: any) => o.status !== 'done')
    setOrders(allOrders)
    const partySet = new Set<string>([
      ...allEntries.map((e: any) => e.party),
      ...allOrders.map((o: any) => o.party),
    ].filter(Boolean))
    setParties([...partySet])
  }, [])

  useEffect(() => { load() }, [load])

  const handleSubmit = async () => {
    if (!form.party.trim() || !form.challan.trim() || !form.taka || parseInt(form.taka) <= 0) {
      alert('Party Name, Challan No. and No. of Taka are required.'); return
    }
    setSaving(true)
    try {
      const res = await greigePost({ action: 'create_entry', ...form })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Entry saved! Lot No. must be added within 6 hours.')
      setForm({ ...BLANK })
      load()
    } finally { setSaving(false) }
  }

  const todayEntries = entries.filter(e =>
    new Date(e.created_at).toDateString() === new Date().toDateString()
  )

  const stats = {
    total:      entries.length,
    today:      todayEntries.length,
    lotPending: entries.filter(e => !e.lot_done_at).length,
    erpPending: entries.filter(e => !e.erp_done_at).length,
  }

  const linkOrder = (orderId: string) => {
    const order = orders.find((o: any) => o.id === orderId)
    setForm(p => ({
      ...p, linkedOrderId: orderId,
      party:   order?.party   || p.party,
      article: order?.article || p.article,
      blend:   order?.blend   || p.blend,
    }))
  }

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>New Greige Entry</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Lot No. within <strong>6 hours</strong> · ERP & Sikka within <strong>24 hours</strong>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Total', value: stats.total, color: 'var(--text-primary)' },
          { label: 'Today', value: stats.today, color: 'var(--accent)' },
          { label: 'Lot Pending', value: stats.lotPending, color: stats.lotPending > 0 ? 'var(--danger)' : 'var(--success)' },
          { label: 'ERP Pending', value: stats.erpPending, color: stats.erpPending > 0 ? 'var(--warning)' : 'var(--success)' },
        ].map(s => (
          <div key={s.label} style={{ flex: '1 1 130px', minWidth: 130,
            background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
            borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 12, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      {/* Form */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label>Party Name *</label>
            <input list="party-list" value={form.party} placeholder="Select or type…"
              onChange={e => setForm(p => ({ ...p, party: e.target.value }))} />
            <datalist id="party-list">
              {parties.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div className="form-group">
            <label>Challan No. *</label>
            <input value={form.challan} placeholder="e.g. 00367"
              onChange={e => setForm(p => ({ ...p, challan: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>No. of Taka *</label>
            <input type="number" min="1" value={form.taka} placeholder="e.g. 30"
              onChange={e => setForm(p => ({ ...p, taka: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Qty (optional)</label>
            <input type="number" min="0" step="0.01" value={form.qty} placeholder="Metres"
              onChange={e => setForm(p => ({ ...p, qty: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Article</label>
            <input value={form.article} placeholder="e.g. VISCOSE SUPER 30S"
              onChange={e => setForm(p => ({ ...p, article: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Blend</label>
            <input value={form.blend} placeholder="e.g. 100% Viscose"
              onChange={e => setForm(p => ({ ...p, blend: e.target.value }))} />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Link to Order (optional)</label>
          <select value={form.linkedOrderId} onChange={e => linkOrder(e.target.value)}>
            <option value="">— Not linked —</option>
            {orders.map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.order_number} · {o.party} · {o.article} · {o.color}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : '✓ Save Entry'}
          </button>
          <button onClick={() => setForm({ ...BLANK })}>Reset</button>
          <button className="small" style={{ marginLeft: 'auto' }}
            onClick={() => router.push('/greige/register')}>View All →</button>
        </div>
      </div>

      {/* Today's entries */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)',
          fontSize: 13, fontWeight: 600 }}>
          Today's Entries ({todayEntries.length})
        </div>
        {todayEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)', fontSize: 13 }}>
            No entries today yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Time','Party','Challan','Taka','Qty','Lot Status','ERP Status','Sikka'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)',
                    whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todayEntries.map((e, i) => {
                const lotDiff  = timeDiff(e.created_at, 6)
                const erpDiff  = timeDiff(e.created_at, 24)
                return (
                  <tr key={e.id} style={{
                    background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ ...td, fontSize: 11 }}>{new Date(e.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{e.party}</td>
                    <td style={td}>{e.challan_no}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{e.no_of_taka}</td>
                    <td style={td}>{e.qty || '-'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {e.lot_done_at ? (
                        <span style={{ color: 'var(--success)', fontWeight: 700 }}>✓ Done</span>
                      ) : lotDiff.overdue ? (
                        <span style={{ color: 'var(--danger)', fontWeight: 700 }}>⚠ {lotDiff.label}</span>
                      ) : (
                        <span style={{ color: 'var(--warning)' }}>Pending ({lotDiff.label})</span>
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {e.erp_done_at ? (
                        <span style={{ color: 'var(--success)', fontWeight: 700 }}>✓ Done</span>
                      ) : erpDiff.overdue ? (
                        <span style={{ color: 'var(--danger)' }}>⚠ Overdue</span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>Pending</span>
                      )}
                    </td>
                    <td style={td}>
                      {e.sikka_done_at ? (
                        <span style={{ color: 'var(--success)', fontWeight: 700 }}>✓ Done</span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>Pending</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12, color: 'var(--text-primary)' }
