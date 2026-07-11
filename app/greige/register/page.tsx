'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

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

function plannedAt(ts: string, hours: number) {
  const d = new Date(ts); d.setHours(d.getHours() + hours); return d
}

function delay(planned: Date, actual?: string) {
  const base = actual ? new Date(actual).getTime() : Date.now()
  const diff = base - planned.getTime()
  if (!actual && diff <= 0) return 'On time'
  if (diff <= 0) return 'On time'
  const h = Math.floor(diff / 3600000)
  return `${h}h late`
}

function fmtShort(d: any) {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }
  catch { return '-' }
}

export default function GreigeRegisterPage() {
  const router  = useRouter()
  const [entries, setEntries] = useState<any[]>([])
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)
  const [markModal, setMarkModal] = useState<any>(null) // entry to update
  const [markType,  setMarkType]  = useState<'lot'|'erp'|'sikka'>('lot')
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState('')

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await greigeApi()
      if (res.ok) setEntries(res.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = search.trim()
    ? entries.filter(e => [e.party, e.challan_no]
        .some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
    : entries

  const stats = {
    total:      entries.length,
    today:      entries.filter(e => new Date(e.created_at).toDateString() === new Date().toDateString()).length,
    lotPending: entries.filter(e => !e.lot_done_at).length,
    erpPending: entries.filter(e => !e.erp_done_at).length,
  }

  const markDone = async (entryId: string, type: 'lot'|'erp'|'sikka') => {
    setSaving(true)
    const now = new Date().toISOString()
    try {
      const patch: Record<string, string> = {}
      if (type === 'lot')   patch.lot_done_at   = now
      if (type === 'erp')   patch.erp_done_at   = now
      if (type === 'sikka') patch.sikka_done_at  = now
      await greigePost({ action: 'update_entry', id: entryId, ...patch })
      showToast(`✓ ${type.toUpperCase()} marked done`)
      setMarkModal(null)
      load()
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { label: 'Total',      value: stats.total,      color: 'var(--text-primary)' },
          { label: 'Today',      value: stats.today,      color: 'var(--accent)' },
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

      {/* Header */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Greige Register</span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search party / challan…"
          style={{ width: 220, padding: '6px 10px', fontSize: 12, marginLeft: 8,
            border: '1px solid var(--border-medium)', borderRadius: 5,
            background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
        {search && <button className="xs" onClick={() => setSearch('')}>✕</button>}
        <button className="primary" style={{ marginLeft: 'auto' }}
          onClick={() => router.push('/greige/entry')}>+ New Entry</button>
        <button className="small" onClick={load}>⟳</button>
      </div>

      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)', fontSize: 14 }}>
          {entries.length === 0 ? (
            <>No greige entries yet. <button className="xs" onClick={() => router.push('/greige/entry')}>+ Make First Entry</button></>
          ) : 'No entries match your search.'}
        </div>
      ) : (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
          borderRadius: 10, overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 1200, width: '100%', fontSize: 11 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                <th rowSpan={2} style={hd}>TIMESTAMP</th>
                <th rowSpan={2} style={hd}>CHALLAN</th>
                <th rowSpan={2} style={hd}>PARTY</th>
                <th rowSpan={2} style={hd}>TAKA</th>
                <th rowSpan={2} style={hd}>QTY</th>
                <th rowSpan={2} style={hd}>LINKED ORDER</th>
                <th colSpan={4} style={{ ...hd, background: '#BBDEFB', color: '#0C447C', textAlign: 'center' }}>LOT NO. ALLOCATION</th>
                <th colSpan={4} style={{ ...hd, background: '#C8E6C9', color: '#1B5E20', textAlign: 'center' }}>ERP ENTRY</th>
                <th colSpan={4} style={{ ...hd, background: '#FFE0B2', color: '#E65100', textAlign: 'center' }}>SIKKA ON GREIGE</th>
                <th rowSpan={2} style={hd}>ACTIONS</th>
              </tr>
              <tr>
                {(['Planned','Actual','Status','Delay'] as const).map(h => (
                  <th key={`l${h}`} style={{ ...hd, background: '#BBDEFB', color: '#0C447C' }}>{h}</th>
                ))}
                {(['Planned','Actual','Status','Delay'] as const).map(h => (
                  <th key={`e${h}`} style={{ ...hd, background: '#C8E6C9', color: '#1B5E20' }}>{h}</th>
                ))}
                {(['Planned','Actual','Status','Delay'] as const).map(h => (
                  <th key={`s${h}`} style={{ ...hd, background: '#FFE0B2', color: '#E65100' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                const lotPl  = plannedAt(e.created_at, 6)
                const erpPl  = plannedAt(e.created_at, 24)
                const skkPl  = plannedAt(e.created_at, 24)
                return (
                  <tr key={e.id} style={{
                    background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-light)' }}>
                    <td style={cell}>{new Date(e.created_at).toLocaleString('en-GB')}</td>
                    <td style={{ ...cell, fontWeight: 700 }}>{e.challan_no}</td>
                    <td style={{ ...cell, fontWeight: 600 }}>{e.party}</td>
                    <td style={cell}>{e.no_of_taka}</td>
                    <td style={cell}>{e.qty || '-'}</td>
                    <td style={cell}>{e.linked_order_no ? (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px',
                        background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 4 }}>
                        {e.linked_order_no}
                      </span>
                    ) : '—'}</td>
                    {/* Lot */}
                    <td style={{ ...cell, background: '#BBDEFB' }}>{fmtShort(lotPl.toISOString())}</td>
                    <td style={{ ...cell, background: '#BBDEFB', fontWeight: 700, color: '#1B5E20' }}>{fmtShort(e.lot_done_at)}</td>
                    <td style={{ ...cell, background: '#BBDEFB', textAlign: 'center' }}>{e.lot_done_at ? '✓' : '-'}</td>
                    <td style={{ ...cell, background: '#BBDEFB', color: !e.lot_done_at && Date.now() > lotPl.getTime() ? 'var(--danger)' : 'inherit' }}>{delay(lotPl, e.lot_done_at)}</td>
                    {/* ERP */}
                    <td style={{ ...cell, background: '#C8E6C9' }}>{fmtShort(erpPl.toISOString())}</td>
                    <td style={{ ...cell, background: '#C8E6C9', fontWeight: 700, color: '#1B5E20' }}>{fmtShort(e.erp_done_at)}</td>
                    <td style={{ ...cell, background: '#C8E6C9', textAlign: 'center' }}>{e.erp_done_at ? '✓' : '-'}</td>
                    <td style={{ ...cell, background: '#C8E6C9', color: !e.erp_done_at && Date.now() > erpPl.getTime() ? 'var(--danger)' : 'inherit' }}>{delay(erpPl, e.erp_done_at)}</td>
                    {/* Sikka */}
                    <td style={{ ...cell, background: '#FFE0B2' }}>{fmtShort(skkPl.toISOString())}</td>
                    <td style={{ ...cell, background: '#FFE0B2', fontWeight: 700, color: '#1B5E20' }}>{fmtShort(e.sikka_done_at)}</td>
                    <td style={{ ...cell, background: '#FFE0B2', textAlign: 'center' }}>{e.sikka_done_at ? '✓' : '-'}</td>
                    <td style={{ ...cell, background: '#FFE0B2', color: !e.sikka_done_at && Date.now() > skkPl.getTime() ? 'var(--danger)' : 'inherit' }}>{delay(skkPl, e.sikka_done_at)}</td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                      {!e.lot_done_at && <button className="xs" style={{ marginRight: 2 }} onClick={() => markDone(e.id, 'lot')}>Lot✓</button>}
                      {!e.erp_done_at && <button className="xs" style={{ marginRight: 2 }} onClick={() => markDone(e.id, 'erp')}>ERP✓</button>}
                      {!e.sikka_done_at && <button className="xs" onClick={() => markDone(e.id, 'sikka')}>Sikka✓</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const hd: React.CSSProperties = { padding: '7px 8px', textAlign: 'left', fontSize: 9,
  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
  borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap',
  background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }

const cell: React.CSSProperties = { padding: '6px 8px', fontSize: 11,
  color: 'var(--text-primary)', whiteSpace: 'nowrap' }
