'use client'

import { useEffect, useState } from 'react'
import { logAudit } from '@/lib/auditLog'

interface ShiftLog {
  id: string
  date: string
  shift: 'morning' | 'evening' | 'night'
  supervisorId: string
  supervisorName: string
  machineIds: string[]
  notes: string
  handoverNotes: string
  batchesCompleted: number
  createdAt: string
}

const SHIFT_CFG = {
  morning: { label: 'Morning',  time: '06:00 – 14:00', icon: '🌅', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
  evening: { label: 'Evening',  time: '14:00 – 22:00', icon: '🌆', bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
  night:   { label: 'Night',    time: '22:00 – 06:00', icon: '🌙', bg: '#1E1B4B', color: '#A5B4FC', border: '#3730A3' },
}

export default function ShiftsPage() {
  const [supervisors, setSupervisors] = useState<any[]>([])
  const [machines, setMachines] = useState<any[]>([])
  const [logs, setLogs] = useState<ShiftLog[]>([])
  const [showModal, setShowModal] = useState(false)
  const [viewDate, setViewDate] = useState(new Date().toISOString().split('T')[0])
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    shift: 'morning' as ShiftLog['shift'],
    supervisorId: '',
    machineIds: [] as string[],
    notes: '',
    handoverNotes: '',
    batchesCompleted: 0,
  })

  useEffect(() => { load() }, [])

  const load = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    setSupervisors(db.supervisors || [])
    setMachines(db.machines || [])
    setLogs((db.shiftLogs || []).sort((a: ShiftLog, b: ShiftLog) =>
      b.date.localeCompare(a.date) || b.shift.localeCompare(a.shift)
    ))
  }

  const getSupervisorName = (id: string) => supervisors.find(s => s.id === id)?.name || id

  const saveShift = () => {
    if (!form.supervisorId) { alert('Select a supervisor.'); return }
    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : {}
    if (!db.shiftLogs) db.shiftLogs = []

    // Check for duplicate (same date + shift)
    const dup = db.shiftLogs.find((l: ShiftLog) => l.date === form.date && l.shift === form.shift)
    if (dup && !confirm(`A ${form.shift} shift on ${form.date} already exists. Overwrite?`)) return
    if (dup) db.shiftLogs = db.shiftLogs.filter((l: ShiftLog) => !(l.date === form.date && l.shift === form.shift))

    const supName = getSupervisorName(form.supervisorId)
    const entry: ShiftLog = {
      id: `SL-${Date.now()}`,
      date: form.date,
      shift: form.shift,
      supervisorId: form.supervisorId,
      supervisorName: supName,
      machineIds: form.machineIds,
      notes: form.notes,
      handoverNotes: form.handoverNotes,
      batchesCompleted: form.batchesCompleted,
      createdAt: new Date().toISOString(),
    }
    db.shiftLogs.push(entry)

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    logAudit({ action: 'create', entityType: 'order', entityId: `${form.date}-${form.shift}`, newValue: supName, note: `Shift assigned: ${form.shift} on ${form.date}` })
    setShowModal(false)
    resetForm()
    load()
  }

  const deleteLog = (id: string) => {
    if (!confirm('Delete this shift log?')) return
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const db = JSON.parse(stored)
    db.shiftLogs = (db.shiftLogs || []).filter((l: ShiftLog) => l.id !== id)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    load()
  }

  const resetForm = () => setForm({
    date: new Date().toISOString().split('T')[0], shift: 'morning',
    supervisorId: '', machineIds: [], notes: '', handoverNotes: '', batchesCompleted: 0,
  })

  const todayLogs = logs.filter(l => l.date === viewDate)

  // Get current shift
  const hour = new Date().getHours()
  const currentShift = hour >= 6 && hour < 14 ? 'morning' : hour >= 14 && hour < 22 ? 'evening' : 'night'

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
          <button className="small" onClick={load}>↻</button>
        </div>
      </div>

      {/* Today's 3-shift view */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {(['morning', 'evening', 'night'] as const).map(shift => {
          const cfg = SHIFT_CFG[shift]
          const shiftLog = todayLogs.find(l => l.shift === shift)
          const isCurrent = shift === currentShift && viewDate === new Date().toISOString().split('T')[0]
          return (
            <div key={shift} style={{
              background: cfg.bg,
              border: `2px solid ${isCurrent ? '#059669' : cfg.border}`,
              borderRadius: 12,
              padding: '16px',
              position: 'relative',
            }}>
              {isCurrent && (
                <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 10, fontWeight: 700, color: '#059669', background: '#D1FAE5', padding: '2px 8px', borderRadius: 10 }}>ACTIVE NOW</div>
              )}
              <div style={{ fontSize: 22, marginBottom: 6 }}>{cfg.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: cfg.color, marginBottom: 2 }}>{cfg.label} Shift</div>
              <div style={{ fontSize: 11, color: cfg.color, opacity: 0.8, marginBottom: 12 }}>{cfg.time}</div>
              {shiftLog ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>👷 {shiftLog.supervisorName}</div>
                  {shiftLog.machineIds.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Machines: {shiftLog.machineIds.map(id => machines.find(m => m.id === id)?.name || id).join(', ')}
                    </div>
                  )}
                  {shiftLog.batchesCompleted > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, marginBottom: 4 }}>✓ {shiftLog.batchesCompleted} batches completed</div>
                  )}
                  {shiftLog.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontStyle: 'italic' }}>"{shiftLog.notes}"</div>}
                  {shiftLog.handoverNotes && (
                    <div style={{ fontSize: 11, background: 'rgba(255,255,255,0.5)', borderRadius: 6, padding: '6px 8px', marginTop: 6 }}>
                      <strong>Handover:</strong> {shiftLog.handoverNotes}
                    </div>
                  )}
                  <button className="xs" style={{ marginTop: 10 }} onClick={() => deleteLog(shiftLog.id)}>Remove</button>
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

      {/* History table */}
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Shift History</div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th>DATE</th><th>SHIFT</th><th>SUPERVISOR</th><th>MACHINES</th><th>BATCHES</th><th>NOTES</th><th>HANDOVER</th><th></th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={8} className="empty-state">No shift logs yet. Assign shifts above to start tracking.</td></tr>
              ) : (
                logs.slice(0, 50).map(l => {
                  const cfg = SHIFT_CFG[l.shift]
                  return (
                    <tr key={l.id}>
                      <td style={{ fontSize: 12, fontWeight: 500 }}>{new Date(l.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td>
                        <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{l.supervisorName}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {l.machineIds.length > 0 ? l.machineIds.map(id => (machines.find(m => m.id === id)?.name || id).replace(/^Machine\s*/i, 'M ')).join(', ') : '—'}
                      </td>
                      <td style={{ fontWeight: l.batchesCompleted > 0 ? 600 : 400, color: l.batchesCompleted > 0 ? 'var(--success)' : 'var(--text-tertiary)' }}>
                        {l.batchesCompleted > 0 ? l.batchesCompleted : '—'}
                      </td>
                      <td style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.notes}>{l.notes || '—'}</td>
                      <td style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.handoverNotes}>{l.handoverNotes || '—'}</td>
                      <td><button className="xs" onClick={() => deleteLog(l.id)}>✕</button></td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
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
                <select value={form.supervisorId} onChange={e => setForm({ ...form, supervisorId: e.target.value })}>
                  <option value="">Select supervisor…</option>
                  {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label>Machines (multi-select)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)' }}>
                  {machines.map(m => (
                    <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.machineIds.includes(m.id)} style={{ width: 'auto' }}
                        onChange={e => setForm(f => ({ ...f, machineIds: e.target.checked ? [...f.machineIds, m.id] : f.machineIds.filter(id => id !== m.id) }))} />
                      {m.name.replace(/^Machine\s*/i, 'M ')}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Batches Completed</label>
                <input type="number" min={0} value={form.batchesCompleted} onChange={e => setForm({ ...form, batchesCompleted: parseInt(e.target.value) || 0 })} />
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
