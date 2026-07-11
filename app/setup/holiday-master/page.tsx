'use client'

import { useEffect, useState, useCallback } from 'react'

interface Holiday {
  id: string
  holiday_date: string
  type: 'global' | 'machine'
  machine_id?: string
  reason?: string
}

const api = async (action: string, payload: Record<string, any> = {}) => {
  const res = await fetch('/api/setup/holidays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  return res.json()
}

const fmtDate = (d: string) => {
  if (!d) return '-'
  const [y, m, day] = d.split('-')
  return `${day}-${m}-${y}`
}

const getDayName = (d: string) => {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' }) }
  catch { return '-' }
}

export default function HolidayMasterPage() {
  const [holidays,  setHolidays]  = useState<Holiday[]>([])
  const [machines,  setMachines]  = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [globalModal, setGlobalModal] = useState(false)
  const [machineModal, setMachineModal] = useState(false)
  const [globalDate, setGlobalDate] = useState('')
  const [mForm, setMForm] = useState({ machine_id: '', date: '', reason: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const [hRes, mRes] = await Promise.all([
      fetch('/api/setup/holidays', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/machines', { cache: 'no-store' }).then(r => r.json()),
    ])
    if (hRes.ok) setHolidays(hRes.data || [])
    if (mRes.ok) setMachines(mRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const globalHolidays  = holidays.filter(h => h.type === 'global').sort((a,b) => a.holiday_date.localeCompare(b.holiday_date))
  const machineHolidays = holidays.filter(h => h.type === 'machine').sort((a,b) => a.holiday_date.localeCompare(b.holiday_date))

  const saveGlobal = async () => {
    if (!globalDate) { alert('Select date.'); return }
    if (globalHolidays.some(h => h.holiday_date === globalDate)) { alert('Already exists.'); return }
    const data = await api('add', { date: globalDate, type: 'global' })
    if (!data.ok) alert(`Failed: ${data.error}`)
    else { setGlobalModal(false); setGlobalDate(''); load() }
  }

  const saveMachine = async () => {
    if (!mForm.machine_id || !mForm.date) { alert('Select machine and date.'); return }
    if (machineHolidays.some(h => h.machine_id === mForm.machine_id && h.holiday_date === mForm.date)) {
      alert('Already exists.'); return
    }
    const data = await api('add', { date: mForm.date, type: 'machine', machine_id: mForm.machine_id, reason: mForm.reason })
    if (!data.ok) alert(`Failed: ${data.error}`)
    else { setMachineModal(false); setMForm({ machine_id: '', date: '', reason: '' }); load() }
  }

  const del = async (id: string) => {
    if (!confirm('Delete this holiday?')) return
    await api('delete', { id })
    load()
  }

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { icon: '🌍', label: 'GLOBAL', count: globalHolidays.length, color: '#137E43', bg: '#EAF3DE' },
          { icon: '🔧', label: 'MACHINE', count: machineHolidays.length, color: '#0369A1', bg: '#E0F2FE' },
          { icon: '☀️', label: 'RULE', count: 'MANUAL', color: '#7C3AED', bg: '#F3E8FF' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-primary)', border: `2px solid ${s.bg}`,
            borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                background: s.bg, color: s.color, letterSpacing: '0.5px' }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.count}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {s.label === 'GLOBAL' ? 'Applicable everywhere' : s.label === 'MACHINE' ? 'Machine only' : 'Add Sunday to skip'}
            </div>
          </div>
        ))}
      </div>

      {/* Global Holidays */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Global Holiday Register</span>
          <button className="primary" onClick={() => { setGlobalDate(''); setGlobalModal(true) }}>+ Global Holiday</button>
        </div>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : globalHolidays.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>No global holidays added.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Date','Day','Action'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {globalHolidays.map((h, i) => (
                <tr key={h.id} style={{ background: i%2===0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{fmtDate(h.holiday_date)}</td>
                  <td style={td}>{getDayName(h.holiday_date)}</td>
                  <td style={td}><button className="xs danger" onClick={() => del(h.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Machine Holidays */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Machine Holiday Register</span>
          <button className="primary" onClick={() => { setMForm({ machine_id: '', date: '', reason: '' }); setMachineModal(true) }}>+ Machine Holiday</button>
        </div>
        {!loading && machineHolidays.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>No machine holidays added.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Date','Machine','Reason','Action'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {machineHolidays.map((h, i) => {
                const m = machines.find(m => m.id === h.machine_id)
                return (
                  <tr key={h.id} style={{ background: i%2===0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{fmtDate(h.holiday_date)}</td>
                    <td style={td}>{m?.name || h.machine_id}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 12 }}>{h.reason || '-'}</td>
                    <td style={td}><button className="xs danger" onClick={() => del(h.id)}>Delete</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Global Holiday Modal */}
      {globalModal && (
        <div className="modal-overlay" onClick={() => setGlobalModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Global Holiday</span>
              <button className="small" onClick={() => setGlobalModal(false)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Date *</label>
              <input type="date" value={globalDate} onChange={e => setGlobalDate(e.target.value)} />
            </div>
            <button className="primary" onClick={saveGlobal} style={{ width: '100%' }}>✓ Save</button>
          </div>
        </div>
      )}

      {/* Machine Holiday Modal */}
      {machineModal && (
        <div className="modal-overlay" onClick={() => setMachineModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Machine Holiday</span>
              <button className="small" onClick={() => setMachineModal(false)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Machine *</label>
              <select value={mForm.machine_id} onChange={e => setMForm({ ...mForm, machine_id: e.target.value })}>
                <option value="">Select machine</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label>Date *</label>
              <input type="date" value={mForm.date} onChange={e => setMForm({ ...mForm, date: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Reason</label>
              <input value={mForm.reason} onChange={e => setMForm({ ...mForm, reason: e.target.value })} placeholder="Optional reason" />
            </div>
            <button className="primary" onClick={saveMachine} style={{ width: '100%' }}>✓ Save</button>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }
const td: React.CSSProperties = { padding: '11px 14px', fontSize: 13, color: 'var(--text-primary)' }
