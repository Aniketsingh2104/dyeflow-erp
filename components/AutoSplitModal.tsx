'use client'
// ⚡ Auto Split — the Machine calculation sheet on the Orders page.
// The server works out the batches for the order's Dyeing machine(s) (or its
// SCQ machine): equal batches between machine size × 60 % and × 80 %; when the
// supervisor picked several machines the largest is filled at 80 % first and
// the rest goes to the next one (lib/loading.ts). Every batch's Kg and machine
// can be changed here. Check column: green in the range, amber outside it,
// red over the machine size or when the load needs a longer cycle than the
// nozzle table allows (e.g. 2.0 min). Nothing is saved until "Create batches"
// — and then through the normal split checks (create_splits).
import { useCallback, useEffect, useState } from 'react'
import { reelSpeedNeeded, cycleNeeded } from '@/lib/loading'
import { cleanSubProd, subProdFromRemarks } from '@/lib/subProd'

interface Row { kg: string; mtr: string; taka: string; sub: string; machineId: string }
interface Mach { id: string; name: string; capacity: number | null; nozzles: number | null; reel_speed: number | null; ok: boolean; error: string | null
  stdLoad: number | null; minPerBatch: number | null; maxPerBatch: number | null; note: string | null }

export default function AutoSplitModal({ order, onClose, onSaved }: {
  order: { id: string; order_number?: string }
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const j = await fetch('/api/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auto_split_preview', order_id: order.id }) })
      .then(r => r.json()).catch(() => ({ ok: false, error: 'Network error' }))
    setLoading(false)
    if (!j.ok) { setError(j.error || 'Could not work out the batches'); setData(null); return }
    setData(j)
    // an imported order's "Sub Prod: P-xxxx-A" goes into batch 1 of its first split
    setRows(j.batches.map((b: any, i: number) => ({ kg: String(b.kg), mtr: b.mtr != null ? String(b.mtr) : '', taka: b.taka != null ? String(b.taka) : '',
      machineId: b.machine_id, sub: i === 0 && !(j.order.allocated_kg > 0) ? (subProdFromRemarks(j.order.remarks) || '') : '' })))
  }, [order.id])

  useEffect(() => { load() }, [load])

  const num = (v: string) => { const n = parseFloat(v); return isFinite(n) ? n : 0 }
  const total = rows.reduce((t, r) => t + num(r.kg), 0)
  const remaining = data?.order?.remaining_kg ?? 0
  const over = total > remaining + 0.5
  const maxCycle: number = data?.calc?.maxCycle ?? 2
  const hot = data?.calc?.hotLength ?? 0
  const machines: Mach[] = data?.machines || []
  const machOf = (id: string): Mach | undefined => machines.find(m => m.id === id) || machines.find(m => m.ok)

  // green = in the range · amber = outside it (allowed) · red = over the machine size / cycle too long
  const check = (kg: number, m?: Mach): { level: 'ok' | 'warn' | 'bad'; text: string } => {
    if (!(kg > 0) || !m) return { level: 'ok', text: '' }
    if (!m.ok) return { level: 'warn', text: m.error || 'no machine data' }
    const cap = m.capacity, cyc = cycleNeeded(kg, hot, m.nozzles || 0, m.reel_speed || 0)
    const parts: string[] = []
    if (cap) parts.push(`${Math.round(kg / cap * 100)}%`)
    if (cyc != null) parts.push(`cycle ${cyc.toFixed(2)} min`)
    const tail = parts.length ? ' · ' + parts.join(' · ') : ''
    if (cap && kg > cap + 0.5) return { level: 'bad', text: `Over machine size ${cap} Kg${tail}` }
    if (cyc != null && cyc > maxCycle + 0.005) return { level: 'bad', text: `Too heavy — needs cycle ${cyc.toFixed(2)} min (max ${maxCycle})${cap ? ` · ${Math.round(kg / cap * 100)}%` : ''}` }
    if (!cap && m.maxPerBatch != null && kg > m.maxPerBatch + 0.5) return { level: 'bad', text: `Too heavy — max ${m.maxPerBatch} Kg${tail}` }
    if (m.minPerBatch != null && kg < m.minPerBatch - 0.5) return { level: 'warn', text: `Under ${data.settings.minLoadPct}%${tail}` }
    if (m.maxPerBatch != null && kg > m.maxPerBatch + 0.5) return { level: 'warn', text: `Over ${data.settings.maxLoadPct}%${tail}` }
    return { level: 'ok', text: `OK${tail}` }
  }

  const setRow = (i: number, k: keyof Row, v: string) => setRows(prev => prev.map((r, j) => j === i ? { ...r, [k]: v } : r))
  const addRow = () => setRows(prev => [...prev, { kg: '', mtr: '', taka: '', sub: '', machineId: prev[prev.length - 1]?.machineId || machines[0]?.id || '' }])
  const removeRow = (i: number) => setRows(prev => prev.filter((_, j) => j !== i))

  const save = async () => {
    if (!data) return
    const list = rows.filter(r => num(r.kg) > 0)
    if (!list.length) { alert('Every batch needs a quantity above 0 Kg'); return }
    if (over) { alert(`These batches add up to ${total} Kg, but only ${remaining} Kg is left to split.`); return }
    setSaving(true)
    try {
      const params = data.params || {}
      const send = (allowDuplicate: boolean) => fetch('/api/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_splits', order_id: order.id, ...(allowDuplicate ? { allow_duplicate: true } : {}),
          batches: list.map(r => {
            const m = machOf(r.machineId)!
            const kg = num(r.kg)
            const rn = reelSpeedNeeded(kg, hot, m.nozzles || 0, data.settings), cn = cycleNeeded(kg, hot, m.nozzles || 0, m.reel_speed || 0)
            return {
              kg, mtr: num(r.mtr) || null, taka: parseInt(r.taka) || null,
              sub_prod_no: cleanSubProd(r.sub),
              machine_id: m.id,
              process_machine_map: { [data.process]: m.id },
              process_params: {
                machine: m.name, ...params,
                width: data.calc.width, gsm: data.calc.gsm, mtrPerKg: data.calc.mtrPerKg, hotLength: data.calc.hotLength,
                stdLoad: m.stdLoad ?? undefined, minPerBatch: m.minPerBatch ?? undefined, maxPerBatch: m.maxPerBatch ?? undefined,
                reelNeeded: rn == null ? undefined : Math.round(rn),
                cycleNeeded: cn == null ? undefined : Math.round(cn * 100) / 100,
              },
            }
          }) }) })
        .then(x => x.json()).catch(() => ({ ok: false, error: 'Network error' }))
      let res = await send(false)
      if (!res.ok && res.duplicate) {
        if (!confirm(`Sub Prod No. already used:\n${res.error}\n\nSave anyway?`)) return
        res = await send(true)
      }
      if (!res.ok) { alert('Not split: ' + (res.error || 'Unknown error')); if (res.stale) load(); return }
      const names = [...new Set(list.map(r => machOf(r.machineId)?.name).filter(Boolean))]
      onSaved(`✓ ${data.order.order_number}: ${res.data?.length || list.length} batch(es) created on ${names.join(' + ')}`)
    } finally { setSaving(false) }
  }

  const cell: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border-light)', fontSize: 12 }
  const inp: React.CSSProperties = { width: 90, padding: '4px 6px', fontSize: 12 }
  const multi = machines.length > 1

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 920 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">⚡ Auto Split — {data?.order?.order_number || order.order_number || ''}</span>
          <button className="small" onClick={onClose}>✕</button>
        </div>

        {loading && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Working out the batches…</div>}
        {!loading && error && (
          <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '12px 14px', borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}

        {!loading && data && (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, marginBottom: 12, fontSize: 12 }}>
            <Info label="Order" value={`${data.order.qty_kg} Kg · ${data.order.remaining_kg} Kg left`} />
            <Info label="Width × GSM" value={`${data.calc.width}" × ${data.calc.gsm}`} sub={`order: ${data.order.width || '-'} / ${data.order.gsm || '-'}`} />
            <Info label="Mtr / Kg → Hot length" value={`${data.calc.mtrPerKg} → ${data.calc.hotLength}`} sub={`elongation ${data.settings.elongationPct}%`} />
            {data.params && <Info label="Nozzle · Pump · Pressure" value={`${data.params.nozzle} · ${data.params.pumpRpm} rpm · ${data.params.pressure}`} sub={`cycle ${data.params.cycle} min`} />}
          </div>

          {/* the machine(s) the supervisor picked for this process, with their batch range */}
          <div style={{ background: 'var(--accent-light)', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
              Machine{multi ? 's' : ''} ({data.process === 'D' ? 'Dyeing' : data.process}) · batch range {data.settings.minLoadPct}–{data.settings.maxLoadPct}% of size
              {multi && <span style={{ fontWeight: 500, textTransform: 'none' }}> — the largest is filled at {data.settings.maxLoadPct}% first, the rest goes to the next</span>}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
              {machines.map(m => (
                <div key={m.id}>
                  <strong>{m.name}</strong>{' '}
                  {m.ok
                    ? <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{m.minPerBatch != null ? `${m.minPerBatch} – ${m.maxPerBatch} Kg` : `up to ${m.maxPerBatch} Kg`}</span>
                    : <span style={{ color: 'var(--danger)' }}>not used</span>}
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {m.capacity ? `${m.capacity} Kg` : 'no size'} · {m.nozzles ?? '?'} nozzle(s) · {m.reel_speed ?? '?'} m/min
                    {m.stdLoad != null ? ` · std ${m.stdLoad} Kg (info)` : ''}
                    {(m.note || m.error) ? ` · ⚠ ${m.note || m.error}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                <th style={{ ...cell, textAlign: 'left' }}>Batch</th><th style={{ ...cell, textAlign: 'left' }}>Kg</th>
                <th style={{ ...cell, textAlign: 'left' }}>Mtr</th><th style={{ ...cell, textAlign: 'left' }}>Taka</th>
                <th style={{ ...cell, textAlign: 'left' }}>Sub Prod No.</th>
                <th style={{ ...cell, textAlign: 'left' }}>Machine</th>
                <th style={{ ...cell, textAlign: 'left' }}>Check</th><th style={cell}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const m = machOf(r.machineId)
                const c = check(num(r.kg), m)
                return (
                  <tr key={i} style={{ background: c.level === 'bad' ? 'var(--danger-light)' : c.level === 'warn' ? '#FEF3C7' : undefined }}>
                    <td style={cell}>B{i + 1}</td>
                    <td style={cell}><input type="number" value={r.kg} onChange={e => setRow(i, 'kg', e.target.value)} style={inp} /></td>
                    <td style={cell}><input type="number" value={r.mtr} onChange={e => setRow(i, 'mtr', e.target.value)} style={inp} /></td>
                    <td style={cell}><input type="number" value={r.taka} onChange={e => setRow(i, 'taka', e.target.value)} style={{ ...inp, width: 70 }} /></td>
                    <td style={cell}><input type="text" value={r.sub} maxLength={30} placeholder="P-5201-A" onChange={e => setRow(i, 'sub', e.target.value.toUpperCase())} style={{ ...inp, width: 100 }} /></td>
                    <td style={cell}>
                      {multi ? (
                        <select value={m?.id || ''} onChange={e => setRow(i, 'machineId', e.target.value)} style={{ fontSize: 12, padding: '3px 4px', maxWidth: 170 }}>
                          {machines.map(x => <option key={x.id} value={x.id} disabled={!x.ok}>{x.name}</option>)}
                        </select>
                      ) : <span style={{ fontWeight: 600 }}>{m?.name || '—'}</span>}
                    </td>
                    <td style={{ ...cell, color: c.level === 'bad' ? 'var(--danger)' : c.level === 'warn' ? '#92400E' : 'var(--success)', fontWeight: 600 }}>
                      {c.text}
                    </td>
                    <td style={cell}>{rows.length > 1 && <button className="xs danger" onClick={() => removeRow(i)}>✕</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 12 }}>
            <button className="small" onClick={addRow}>➕ Add batch</button>
            <span style={{ fontWeight: 700, color: over ? 'var(--danger)' : 'var(--text-secondary)' }}>
              Total {Math.round(total * 100) / 100} Kg of {remaining} Kg left{over ? ' — too much' : remaining - total > 0.5 ? ` · ${Math.round((remaining - total) * 100) / 100} Kg stays unsplit` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose}>Cancel</button>
            <button className="primary" onClick={save} disabled={saving || over}>{saving ? 'Saving…' : `Create ${rows.filter(r => num(r.kg) > 0).length} batch(es)`}</button>
          </div>
        </>)}
      </div>
    </div>
  )
}

function Info({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{sub}</div>}
    </div>
  )
}
