'use client'
// ⚡ Auto Split — the Machine calculation sheet on the Orders page.
// The server works out equal batches for the order's Dyeing machine (or its
// SCQ machine): each no more than the machine's Loading Std Qty or size × 90 %
// (lib/loading.ts). Every batch can be changed here; a batch heavier than the
// machine can take turns red. Nothing is saved until "Create batches" — and
// then through the normal split checks (create_splits).
import { useCallback, useEffect, useState } from 'react'
import { reelSpeedNeeded } from '@/lib/loading'

interface Row { kg: string; mtr: string; taka: string }

export default function AutoSplitModal({ order, onClose, onSaved }: {
  order: { id: string; order_number?: string }
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [machineId, setMachineId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (mid?: string) => {
    setLoading(true); setError('')
    const j = await fetch('/api/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auto_split_preview', order_id: order.id, ...(mid ? { machine_id: mid } : {}) }) })
      .then(r => r.json()).catch(() => ({ ok: false, error: 'Network error' }))
    setLoading(false)
    if (!j.ok) { setError(j.error || 'Could not work out the batches'); setData(null); return }
    setData(j)
    setMachineId(j.machine.id)
    setRows(j.batches.map((b: any) => ({ kg: String(b.kg), mtr: b.mtr != null ? String(b.mtr) : '', taka: b.taka != null ? String(b.taka) : '' })))
  }, [order.id])

  useEffect(() => { load() }, [load])

  const num = (v: string) => { const n = parseFloat(v); return isFinite(n) ? n : 0 }
  const total = rows.reduce((t, r) => t + num(r.kg), 0)
  const remaining = data?.order?.remaining_kg ?? 0
  const over = total > remaining + 0.5
  const maxPer = data?.calc?.maxPerBatch ?? Infinity
  const hot = data?.calc?.hotLength ?? 0
  const nozzles = data?.machine?.nozzles ?? 0
  const reelMax = data?.machine?.reel_speed ?? null

  const setRow = (i: number, k: keyof Row, v: string) => setRows(prev => prev.map((r, j) => j === i ? { ...r, [k]: v } : r))
  const addRow = () => setRows(prev => [...prev, { kg: '', mtr: '', taka: '' }])
  const removeRow = (i: number) => setRows(prev => prev.filter((_, j) => j !== i))

  const save = async () => {
    if (!data) return
    const list = rows.filter(r => num(r.kg) > 0)
    if (!list.length) { alert('Every batch needs a quantity above 0 Kg'); return }
    if (over) { alert(`These batches add up to ${total} Kg, but only ${remaining} Kg is left to split.`); return }
    setSaving(true)
    try {
      const params = data.params || {}
      const res = await fetch('/api/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_splits', order_id: order.id,
          batches: list.map(r => ({
            kg: num(r.kg), mtr: num(r.mtr) || null, taka: parseInt(r.taka) || null,
            machine_id: data.machine.id,
            process_machine_map: { [data.process]: data.machine.id },
            process_params: {
              machine: data.machine.name, ...params,
              width: data.calc.width, gsm: data.calc.gsm, mtrPerKg: data.calc.mtrPerKg, hotLength: data.calc.hotLength,
              stdLoad: data.calc.stdLoad ?? undefined, maxPerBatch: data.calc.maxPerBatch,
              reelNeeded: (() => { const x = reelSpeedNeeded(num(r.kg), hot, nozzles, data.settings); return x == null ? undefined : Math.round(x) })(),
            },
          })) }) })
        .then(x => x.json()).catch(() => ({ ok: false, error: 'Network error' }))
      if (!res.ok) { alert('Not split: ' + (res.error || 'Unknown error')); if (res.stale) load(machineId); return }
      onSaved(`✓ ${data.order.order_number}: ${res.data?.length || list.length} batch(es) created on ${data.machine.name}`)
    } finally { setSaving(false) }
  }

  const cell: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border-light)', fontSize: 12 }
  const inp: React.CSSProperties = { width: 90, padding: '4px 6px', fontSize: 12 }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
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
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>
                Machine ({data.process === 'D' ? 'Dyeing' : data.process})
              </div>
              {data.machines.length > 1 ? (
                <select value={machineId} onChange={e => load(e.target.value)} style={{ fontSize: 12, marginTop: 2, width: '100%' }}>
                  {data.machines.map((m: any, i: number) => <option key={m.id} value={m.id}>{`Machine ${i + 1}: ${m.name}`}</option>)}
                </select>
              ) : <div style={{ fontWeight: 700 }}>{data.machine.name}</div>}
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                {data.machine.capacity ? `${data.machine.capacity} Kg` : 'no size'} · {data.machine.nozzles ?? '?'} nozzle(s) · {data.machine.reel_speed ?? '?'} m/min
              </div>
            </div>
            <Info label="Loading Std Qty" value={data.calc.stdLoad != null ? `${data.calc.stdLoad} Kg` : '—'} sub={`cycle ${data.settings.cycleTimeMin} min`} />
            <Info label={`Size × ${data.settings.maxLoadPct}%`} value={data.calc.sizeLimit != null ? `${data.calc.sizeLimit} Kg` : '—'} />
            <Info label="Max per batch" value={`${data.calc.maxPerBatch} Kg`} strong />
            {data.params && <Info label="Nozzle · Pump · Pressure" value={`${data.params.nozzle} · ${data.params.pumpRpm} rpm · ${data.params.pressure}`} sub={`cycle ${data.params.cycle} min`} />}
          </div>
          {data.calc.note && (
            <div style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', padding: '6px 10px', borderRadius: 6, marginBottom: 10 }}>
              ⚠ {data.machine.name}: {data.calc.note}. Fill it in Setup → Machine Master for an exact load.
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                <th style={{ ...cell, textAlign: 'left' }}>Batch</th><th style={{ ...cell, textAlign: 'left' }}>Kg</th>
                <th style={{ ...cell, textAlign: 'left' }}>Mtr</th><th style={{ ...cell, textAlign: 'left' }}>Taka</th>
                <th style={{ ...cell, textAlign: 'left' }}>Check</th><th style={cell}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const kg = num(r.kg)
                const need = reelSpeedNeeded(kg, hot, nozzles, data.settings)
                const heavy = kg > maxPer + 0.5
                return (
                  <tr key={i} style={{ background: heavy ? 'var(--danger-light)' : undefined }}>
                    <td style={cell}>B{i + 1}</td>
                    <td style={cell}><input type="number" value={r.kg} onChange={e => setRow(i, 'kg', e.target.value)} style={inp} /></td>
                    <td style={cell}><input type="number" value={r.mtr} onChange={e => setRow(i, 'mtr', e.target.value)} style={inp} /></td>
                    <td style={cell}><input type="number" value={r.taka} onChange={e => setRow(i, 'taka', e.target.value)} style={{ ...inp, width: 70 }} /></td>
                    <td style={{ ...cell, color: heavy ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                      {heavy
                        ? (need != null && reelMax ? `Too heavy — needs ${Math.round(need)} m/min, machine max ${reelMax}` : `Too heavy — max ${maxPer} Kg`)
                        : (need != null ? `OK · ${Math.round(need)} m/min` : 'OK')}
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

function Info({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div style={{ background: strong ? 'var(--accent-light)' : 'var(--bg-secondary)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontWeight: 700, color: strong ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{sub}</div>}
    </div>
  )
}
