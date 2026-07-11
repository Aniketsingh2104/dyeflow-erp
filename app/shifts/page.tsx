'use client'

import { useEffect, useState, useCallback } from 'react'

interface ShiftLog {
  id: string
  shift_date: string
  shift: 'morning' | 'evening' | 'night'
  supervisor_name: string
  machine_ids: string[]
  notes: string
  handover_notes: string
  batches_completed: number
  created_at: string
}

const SHIFT_CFG = {
  morning: { label: 'Morning',  time: '06:00 – 14:00', icon: '🌅', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
  evening: { label: 'Evening',  time: '14:00 – 22:00', icon: '🌆', bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
  night:   { label: 'Night',    time: '22:00 – 06:00', icon: '🌙', bg: '#1E1B4B', color: '#A5B4FC', border: '#3730A3' },
}

export default function ShiftsPage() {
  const [supervisors, setSupervisors] = useState<any[]>([])
  const [machines,    setMachines]    = useState<any[]>([])
  const [logs,        setLogs]        = useState<ShiftLog[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showModal,   setShowModal]   = useState(false)
  const [viewDate,    setViewDate]    = useState(new Date().toISOString().split('T')[0])
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    shift: 'morning' as ShiftLog['shift'],
    supervisorId: '',
    supervisorName: '',
    machineIds: [] as string[],
    notes: '',
    handoverNotes: '',
    batchesCompleted: 0,
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [supRes, mRes, logRes] = await Promise.all([
      fetch('/api/supervisors', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/machines',    { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/shifts',      { cache: 'no-store' }).then(r => r.json()),
    ])
    setSupervisors(supRes.data || [])
    setMachines(mRes.data || [])
    setLogs(logRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const saveShift = async () => {
    if (!form.supervisorName.trim()) { alert('Select a supervisor.'); return }
    const res = await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:              'create',
        shift_date:          form.date,
        shift:               form.shift,
        supervisor_name:     form.supervisorName,
        machine_ids:         form.machineIds,
        notes:               form.notes,
        handover_notes:      form.handoverNotes,
        batches_completed:   form.batchesCompleted,
      }),
    })
    const data = await res.json()
    if (!data.ok) { alert(`Failed: ${data.error}`); return }
    setShowModal(false)
    resetForm()
    load()
  }

  const deleteLog = async (id: string) => {
    if (!confirm('Delete this shift log?')) return
    await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    })
    load()
  }

  const resetForm = () => setForm({
    date: new Date().toISOString().split('T')[0], shift: 'morning',
    supervisorId: '', supervisorName: '', machineIds: [],
    notes: '', handoverNotes: '', batchesCompleted: 0,
  })

  const todayLogs = logs.filter(l => l.shift_date === viewDate)
  const hour = new Date().getHours()
  const currentShift = hour >= 6 && hour < 14 ? 'morning' : hour >= 14 && hour < 22 ? 'evening' : 'night'

  const machineNameById = (id: string) => machines.find(m => m.id === id)?.name || id

  return (
    <div className="content" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="topbar">
        <div>
          <div className="topbar-title">Shift Management</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Current shift: <strong style={{ color: 'var(--accent)' }}>{SHIFT_CFG[currentShift].icon} {SHIFT_CFG[currentShift].label}</strong> ({SHIFT_CFG[currentShift].time})
          </div>
        </div>
        <div className="topbar-actions">
          <input type="date" value={viewDate} onChange={e => setViewDate(e.target.value)} style={{ width: 150 }} />
          <button className="primary" onClick={() => setShowModal(true)}>+ Assign Shift</button>
          <button className="small" onClick={load} disabled={loading}>{loading ? '…' : '↻'}</button>
        </div>
      </div>

      {/* 3-shift cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {(['morning', 'evening', 'night'] as const).map(shift => {
          const cfg = SHIFT_CFG[shift]
          const log = todayLogs.find(l => l.shift === shift)
          const isCurrent = shift === currentShift && viewDate === new Date().toISOString().split('T')[0]
          return (
            <div key={shift} style={{ background: cfg.bg, border: `2px solid ${isCurrent ? '#059669' : cfg.border}`, borderRadius: 12, padding: '16px', position: 'relative' }}>
              {isCurrent && (
                <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 10, fontWeight: 700, color: '#059669', background: '#D1FAE5', padding: '2px 8px', borderRadius: 10 }}>ACTIVE NOW</div>
              )}
              <div style={{ fontSize: 22, marginBottom: 6 }}>{cfg.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: cfg.color, marginBottom: 2 }}>{cfg.label} Shift</div>
              <div style={{ fontSize: 11, color: cfg.color, opacity: 0.8, marginBottom: 12 }}>{cfg.time}</div>
              {log ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>👷 {log.supervisor_name}</div>
                  {log.machine_ids.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Machines: {log.machine_ids.map(machineNameById).join(', ')}
                    </div>
                  )}
                  {log.batches_completed > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, marginBottom: 4 }}>✓ {log.batches_completed} batches</div>
                  )}
                  {log.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 4 }}>"{log.notes}"</div>}
                  {log.handover_notes && (
                    <div style={{ fontSize: 11, background: 'rgba(255,255,255,0.5)', borderRadius: 6, padding: '6px 8px', marginTop: 6 }}>
                      <strong>Handover:</strong> {log.handover_notes}
                    </div>
                  )}
                  <button className="xs" style={{ marginTop: 10 }} onClick={() => deleteLog(log.id)}>Remove</button>
                </>
              ) : (
                <div>
                  <div style={{ fontSize: 12, color: cfg.color, opacity: 0.7, marginBottom: 10 }}>Not assigned</div>
                  <button className="xs" onClick={() => { setForm(f => ({ ...f, date: viewDate, shift })); setShowModal(true) }}
                    style={{ background: cfg.color, color: '#fff', border: 'none' }}>
                    + Assign
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* History */}
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Shift History</div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table style={{ minWidth: 700 }}>
            <thead>
              <tr><th>DATE</th><th>SHIFT</th><th>SUPERVISOR</th><th>MACHINES</th><th>BATCHES</th><th>NOTES</th><th>HANDOVER</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={8} className="empty-state">No shift logs yet.</td></tr>
              ) : (
                logs.slice(0, 50).map(l => {
                  const cfg = SHIFT_CFG[l.shift]
                  return (
                    <tr key={l.id}>
                      <td style={{ fontSize: 12, fontWeight: 500 }}>{new Date(l.shift_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td><span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{cfg.icon} {cfg.label}</span></td>
                      <td style={{ fontWeight: 600 }}>{l.supervisor_name}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{l.machine_ids.length > 0 ? l.machine_ids.map(machineNameById).join(', ') : '—'}</td>
                      <td style={{ fontWeight: l.batches_completed > 0 ? 600 : 400, color: l.batches_completed > 0 ? 'var(--success)' : 'var(--text-tertiary)' }}>
                        {l.batches_completed > 0 ? l.batches_completed : '—'}
                      </td>
                      <td style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.notes}>{l.notes || '—'}</td>
                      <td style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.handover_notes}>{l.handover_notes || '—'}</td>
                      <td><button className="xs" onClick={() => deleteLog(l.id)}>✕</button></td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); resetForm() }}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Assign Shift</span>
              <button onClick={() => { setShowModal(false); resetForm() }}>✕</button>
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="form-group">
                <label>Date *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Shift *</label>
                <select value={form.shift} onChange={e => setForm({ ...form, shift: e.target.value as any })}>
                  {Object.entries(SHIFT_CFG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label} ({v.time})</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label>Supervisor *</label>
                <select value={form.supervisorId}
                  onChange={e => {
                    const sup = supervisors.find(s => s.id === e.target.value)
                    setForm({ ...form, supervisorId: e.target.value, supervisorName: sup?.name || '' })
                  }}>
                  <option value="">Select supervisor…</option>
                  {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label>Machines</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)' }}>
                  {machines.map(m => (
                    <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.machineIds.includes(m.id)} style={{ width: 'auto' }}
                        onChange={e => setForm(f => ({ ...f, machineIds: e.target.checked ? [...f.machineIds, m.id] : f.machineIds.filter(id => id !== m.id) }))} />
                      {m.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Batches Completed</label>
                <input type="number" min={0} value={form.batchesCompleted}
                  onChange={e => setForm({ ...form, batchesCompleted: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label>Shift Notes</label>
                <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes for this shift" />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label>Handover Notes (for next shift)</label>
                <input type="text" value={form.handoverNotes} onChange={e => setForm({ ...form, handoverNotes: e.target.value })} placeholder="What the next shift needs to know…" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="primary" onClick={saveShift} style={{ flex: 1 }}>Save Shift</button>
              <button onClick={() => { setShowModal(false); resetForm() }} style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
