'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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

function delay(planned: Date, actual: string | undefined, now: number) {
  const base = actual ? new Date(actual).getTime() : now
  const diff = base - planned.getTime()
  if (diff <= 0) {
    if (actual) return 'On time' // completed before deadline — nothing left to count down
    const remain = -diff
    const h = Math.floor(remain / 3600000)
    const m = Math.floor((remain % 3600000) / 60000)
    return `${h}h ${m}m left`
  }
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}h ${m}m late`
}

function fmtShort(d: any) {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }
  catch { return '-' }
}

// Parses "L001:15, L002:10" into [{lotNumber:'L001', taka:15}, {lotNumber:'L002', taka:10}].
// Taka after the colon is optional (bare "L001" is valid, taka:null). Returns
// null if the text doesn't parse into at least one valid lot.
function parseLots(text: string): { lotNumber: string; taka: number | null }[] | null {
  const parts = text.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const lots: { lotNumber: string; taka: number | null }[] = []
  for (const part of parts) {
    const [lotNumberRaw, takaRaw] = part.split(':').map(s => s?.trim())
    if (!lotNumberRaw) return null
    let taka: number | null = null
    if (takaRaw) {
      const n = parseInt(takaRaw)
      if (isNaN(n) || n < 0) return null
      taka = n
    }
    lots.push({ lotNumber: lotNumberRaw, taka })
  }
  return lots
}

export default function GreigeRegisterPage() {
  const router  = useRouter()
  const [entries, setEntries] = useState<any[]>([])
  const [lots,    setLots]    = useState<any[]>([])
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState('')
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [lotInputValue,  setLotInputValue]  = useState('')
  const [now, setNow] = useState(() => Date.now())

  // Ticks every minute so countdowns/overdue coloring stay live without
  // needing a full data reload.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [entriesRes, lotsRes] = await Promise.all([
        greigeApi(),
        greigeApi({ type: 'lots' }),
      ])
      if (entriesRes.ok) setEntries(entriesRes.data || [])
      if (lotsRes.ok) setLots(lotsRes.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const lotsByEntry = useMemo(() => {
    const m: Record<string, any[]> = {}
    for (const l of lots) {
      if (!m[l.entry_id]) m[l.entry_id] = []
      m[l.entry_id].push(l)
    }
    return m
  }, [lots])

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

  const markDone = async (entryId: string, type: 'erp'|'sikka') => {
    setSaving(true)
    const now = new Date().toISOString()
    try {
      const patch: Record<string, string> = {}
      if (type === 'erp')   patch.erp_done_at   = now
      if (type === 'sikka') patch.sikka_done_at  = now
      await greigePost({ action: 'update_entry', id: entryId, ...patch })
      showToast(`✓ ${type.toUpperCase()} marked done`)
      load()
    } finally { setSaving(false) }
  }

  const startEditingLots = (entry: any) => {
    const existing = lotsByEntry[entry.id] || []
    setLotInputValue(existing.map((l: any) => l.taka != null ? `${l.lot_number}:${l.taka}` : l.lot_number).join(', '))
    setEditingEntryId(entry.id)
  }

  const saveLots = async (entry: any) => {
    const parsed = parseLots(lotInputValue)
    if (!parsed) { alert('Invalid format. Use e.g.: L001:15, L002:10'); return }
    const sumTaka = parsed.reduce((s, l) => s + (l.taka || 0), 0)
    const totalTaka = parseInt(entry.no_of_taka) || 0
    if (parsed.some(l => l.taka != null) && sumTaka !== totalTaka) {
      const proceed = confirm(`Entered taka (${sumTaka}) doesn't match this entry's total taka (${totalTaka}). Save anyway?`)
      if (!proceed) return
    }
    setSaving(true)
    try {
      const res = await greigePost({ action: 'create_lots_bulk', entryId: entry.id, lots: parsed })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Lot(s) saved')
      setEditingEntryId(null)
      setLotInputValue('')
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
                <th rowSpan={2} style={hd}>LOT NO.</th>
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
                    <td style={{ ...cell, whiteSpace: 'normal', minWidth: 170 }}>
                      {editingEntryId === e.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input autoFocus value={lotInputValue} placeholder="L001:15, L002:10"
                            onChange={ev => setLotInputValue(ev.target.value)}
                            onKeyDown={ev => { if (ev.key === 'Enter') saveLots(e); if (ev.key === 'Escape') setEditingEntryId(null) }}
                            style={{ fontSize: 10, padding: '3px 6px', width: 130,
                              border: '1px solid var(--border-medium)', borderRadius: 4 }} />
                          <button className="xs" disabled={saving} onClick={() => saveLots(e)}>✓</button>
                          <button className="xs" onClick={() => setEditingEntryId(null)}>✕</button>
                        </div>
                      ) : (lotsByEntry[e.id]?.length > 0) ? (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', cursor: 'pointer' }}
                          onClick={() => startEditingLots(e)} title="Click to edit lots">
                          {(lotsByEntry[e.id] || []).map((l: any) => (
                            <span key={l.id} style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px',
                              borderRadius: 6, background: '#1B5E20', color: '#fff' }}>
                              {l.lot_number}{l.taka != null ? ` (${l.taka}tk)` : ''}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <button className="xs" onClick={() => startEditingLots(e)}>+ Add Lot</button>
                      )}
                    </td>
                    {/* Lot */}
                    <td style={{ ...cell, background: '#BBDEFB' }}>{fmtShort(lotPl.toISOString())}</td>
                    <td style={{ ...cell, background: '#BBDEFB', fontWeight: 700, color: '#1B5E20' }}>{fmtShort(e.lot_done_at)}</td>
                    <td style={{ ...cell, background: '#BBDEFB', textAlign: 'center' }}>{e.lot_done_at ? '✓' : '-'}</td>
                    <td style={{ ...cell, background: '#BBDEFB', color: !e.lot_done_at && now > lotPl.getTime() ? 'var(--danger)' : 'inherit' }}>{delay(lotPl, e.lot_done_at, now)}</td>
                    {/* ERP */}
                    <td style={{ ...cell, background: '#C8E6C9' }}>{fmtShort(erpPl.toISOString())}</td>
                    <td style={{ ...cell, background: '#C8E6C9', fontWeight: 700, color: '#1B5E20' }}>{fmtShort(e.erp_done_at)}</td>
                    <td style={{ ...cell, background: '#C8E6C9', textAlign: 'center' }}>{e.erp_done_at ? '✓' : '-'}</td>
                    <td style={{ ...cell, background: '#C8E6C9', color: !e.erp_done_at && now > erpPl.getTime() ? 'var(--danger)' : 'inherit' }}>{delay(erpPl, e.erp_done_at, now)}</td>
                    {/* Sikka */}
                    <td style={{ ...cell, background: '#FFE0B2' }}>{fmtShort(skkPl.toISOString())}</td>
                    <td style={{ ...cell, background: '#FFE0B2', fontWeight: 700, color: '#1B5E20' }}>{fmtShort(e.sikka_done_at)}</td>
                    <td style={{ ...cell, background: '#FFE0B2', textAlign: 'center' }}>{e.sikka_done_at ? '✓' : '-'}</td>
                    <td style={{ ...cell, background: '#FFE0B2', color: !e.sikka_done_at && now > skkPl.getTime() ? 'var(--danger)' : 'inherit' }}>{delay(skkPl, e.sikka_done_at, now)}</td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
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
