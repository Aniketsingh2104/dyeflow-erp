'use client'

import { useEffect, useState, useCallback } from 'react'

interface ProcessDef {
  id: string
  code: string
  name: string
  display_order: number
  default_days: number
  hours_per_batch?: number | null
  allow_faulty: boolean
  allow_fob: boolean
  is_enabled: boolean
}

export default function ProcessMasterPage() {
  const [processes,   setProcesses]   = useState<ProcessDef[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showModal,   setShowModal]   = useState(false)
  const [editing,     setEditing]     = useState<ProcessDef | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [search,      setSearch]      = useState('')
  const [error,       setError]       = useState('')
  const [form, setForm] = useState({
    code: '', name: '', is_enabled: true, default_days: 1, hours_per_batch: '' as string | number, allow_faulty: true, allow_fob: false,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/processes', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) setProcesses(data.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const api = async (action: string, payload: Record<string, any>) => {
    const res = await fetch('/api/processes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    return res.json()
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ code: '', name: '', is_enabled: true, default_days: 1, hours_per_batch: '', allow_faulty: true, allow_fob: false })
    setError('')
    setShowModal(true)
  }

  const openEdit = (p: ProcessDef) => {
    setEditing(p)
    setForm({
      code: p.code, name: p.name, is_enabled: p.is_enabled,
      default_days: p.default_days, hours_per_batch: p.hours_per_batch ?? '', allow_faulty: p.allow_faulty, allow_fob: p.allow_fob,
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    const code = form.code.trim().toUpperCase()
    const name = form.name.trim()
    if (!code) { setError('Process code is required.'); return }
    if (!name) { setError('Process name is required.');  return }
    if (!editing) {
      const dup = processes.find(p => p.code.toUpperCase() === code)
      if (dup) { setError(`Code "${code}" already exists as "${dup.name}".`); return }
    }
    setSaving(true)
    try {
      const maxOrder = processes.reduce((m, p) => Math.max(m, p.display_order), 0)
      const hours = form.hours_per_batch === '' || form.hours_per_batch == null ? null : parseFloat(String(form.hours_per_batch))
      if (hours !== null && !(hours > 0 && hours <= 240)) { setError('Hours per batch must be between 0 and 240 (or blank for the default).'); setSaving(false); return }
      const data = editing
        ? await api('update', { id: editing.id, name, is_enabled: form.is_enabled,
            default_days: form.default_days, hours_per_batch: hours, allow_faulty: form.allow_faulty, allow_fob: form.allow_fob })
        : await api('create', { code, name, is_enabled: form.is_enabled,
            default_days: form.default_days, hours_per_batch: hours, allow_faulty: form.allow_faulty,
            allow_fob: form.allow_fob, display_order: maxOrder + 1 })
      if (!data.ok) throw new Error(data.error)
      setShowModal(false)
      load()
    } catch (err) { setError(String(err)) }
    finally { setSaving(false) }
  }

  const toggleEnabled = async (p: ProcessDef) => {
    await api('update', { id: p.id, is_enabled: !p.is_enabled })
    load()
  }

  const toggleFaulty = async (p: ProcessDef) => {
    await api('update', { id: p.id, allow_faulty: !p.allow_faulty })
    load()
  }

  const toggleFob = async (p: ProcessDef) => {
    await api('update', { id: p.id, allow_fob: !p.allow_fob })
    load()
  }

  const moveUp = async (idx: number) => {
    if (idx === 0) return
    const updated = [...processes]
    const a = updated[idx - 1], b = updated[idx]
    await api('reorder', { items: [
      { id: a.id, display_order: b.display_order },
      { id: b.id, display_order: a.display_order },
    ]})
    load()
  }

  const moveDown = async (idx: number) => {
    if (idx === processes.length - 1) return
    const updated = [...processes]
    const a = updated[idx], b = updated[idx + 1]
    await api('reorder', { items: [
      { id: a.id, display_order: b.display_order },
      { id: b.id, display_order: a.display_order },
    ]})
    load()
  }

  const del = async (p: ProcessDef) => {
    if (!confirm(`Delete process "${p.name}" (${p.code})? This cannot be undone.`)) return
    const data = await api('delete', { id: p.id })
    if (!data.ok) alert(`Delete failed: ${data.error}`)
    else load()
  }

  const filtered = processes.filter(p =>
    p.code.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Process Master</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            The process steps batches go through, in sheet order · Faulty / FOB say where those can be raised
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search code or name…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: 260, padding: '9px 12px', fontSize: 14, border: '1px solid var(--border-medium)', borderRadius: 8,
              background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          <button className="small" onClick={load} title="Refresh" style={{ padding: '9px 12px', fontSize: 14 }}>↻</button>
          <button className="primary" onClick={openAdd} style={{ padding: '9px 16px', fontSize: 14, fontWeight: 700 }}>+ Add Process</button>
        </div>
      </div>

      {/* Count cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['Processes', processes.length, 'var(--accent)'],
          ['Enabled', processes.filter(p => p.is_enabled).length, '#059669'],
          ['Disabled', processes.filter(p => !p.is_enabled).length, 'var(--text-tertiary)'],
          ['Faulty allowed', processes.filter(p => p.allow_faulty).length, '#EF4444'],
          ['FOB allowed', processes.filter(p => p.allow_fob).length, '#7C3AED']].map(([label, value, color]) => (
          <div key={String(label)} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '10px 16px', minWidth: 130 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: String(color) }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 900 }}>
          <colgroup>
            <col style={{ width: 60 }} /><col style={{ width: 110 }} /><col /><col style={{ width: 80 }} /><col style={{ width: 120 }} /><col style={{ width: 130 }} />
            <col style={{ width: 100 }} /><col style={{ width: 100 }} /><col style={{ width: 100 }} /><col style={{ width: 160 }} />
          </colgroup>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)' }}>
            <tr>
              {['#', 'Code', 'Name', 'Days', 'Hours / batch', 'Status', 'Faulty', 'FOB', 'Move', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: ['#', 'Days', 'Hours / batch', 'Faulty', 'FOB'].includes(h) ? 'center' : 'left', fontSize: 12, fontWeight: 700,
                  color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                {processes.length === 0 ? 'No processes yet. Click "+ Add Process".' : 'No results.'}
              </td></tr>
            ) : (
              filtered.map((p, idx) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)',
                  background: idx % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)', opacity: p.is_enabled ? 1 : 0.6 }}>
                  <td style={{ padding: '12px 16px', color: 'var(--text-tertiary)', fontWeight: 700, textAlign: 'center' }}>{p.display_order}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: '#E6F0FF', color: '#3366CC', padding: '4px 12px', borderRadius: 6, fontWeight: 800, fontSize: 13 }}>{p.code}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 15 }}>{p.name}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>{p.default_days} d</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'center', fontWeight: 700, color: p.hours_per_batch ? 'var(--text-primary)' : 'var(--text-tertiary)' }} title={p.hours_per_batch ? '' : 'Blank = default from Factory Settings'}>{p.hours_per_batch ? `${p.hours_per_batch} h` : 'default'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: 0 }}>
                      <input type="checkbox" checked={p.is_enabled} onChange={() => toggleEnabled(p)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#059669' }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: p.is_enabled ? '#059669' : 'var(--text-tertiary)' }}>{p.is_enabled ? 'Enabled' : 'Disabled'}</span>
                    </label>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <input type="checkbox" checked={p.allow_faulty} onChange={() => toggleFaulty(p)} title="Faulty can be raised at this process"
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#EF4444' }} />
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <input type="checkbox" checked={p.allow_fob} onChange={() => toggleFob(p)} title="FOB can be raised at this process"
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#7C3AED' }} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="small" onClick={() => moveUp(processes.indexOf(p))} disabled={processes.indexOf(p) === 0} title="Move up">↑</button>
                      <button className="small" onClick={() => moveDown(processes.indexOf(p))} disabled={processes.indexOf(p) === processes.length - 1} title="Move down">↓</button>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="small" onClick={() => openEdit(p)}>Edit</button>
                      <button className="small danger" onClick={() => del(p)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-light)', fontSize: 12, color: 'var(--text-tertiary)' }}>
          Showing {filtered.length} of {processes.length}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <span className="modal-title">
                {editing ? `Edit Process — ${editing.code}` : 'Add New Process'}
              </span>
              <button className="small" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 14 }}>
              <div className="form-group">
                <label>Process Code *</label>
                <input type="text" value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. D" disabled={!!editing}
                  style={{ opacity: editing ? 0.6 : 1 }} autoFocus={!editing} />
              </div>
              <div className="form-group">
                <label>Process Name *</label>
                <input type="text" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Dyeing" autoFocus={!!editing} />
              </div>
              <div className="form-group">
                <label>Default Days</label>
                <input type="number" min={1} value={form.default_days}
                  onChange={e => setForm({ ...form, default_days: Math.max(1, parseInt(e.target.value) || 1) })}
                  placeholder="1" />
              </div>
              <div className="form-group">
                <label>Hours per batch (machine sheet)</label>
                <input type="number" min={0} step={0.5} value={form.hours_per_batch as any}
                  onChange={e => setForm({ ...form, hours_per_batch: e.target.value })}
                  placeholder="blank = default" />
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>How long one batch of this process holds a machine — sets how many fit in a day (Factory Settings → working hours per day).</div>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={form.is_enabled} onChange={e => setForm({ ...form, is_enabled: e.target.checked })} style={{ width: 'auto' }} />
                Enable this process (show in FMS navigation)
              </label>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>FMS Action Buttons</div>
              <div style={{ display: 'flex', gap: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.allow_faulty} onChange={e => setForm({ ...form, allow_faulty: e.target.checked })} style={{ width: 'auto', accentColor: '#EF4444' }} />
                  <span>Show <strong style={{ color: '#EF4444' }}>Faulty</strong> button</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.allow_fob} onChange={e => setForm({ ...form, allow_fob: e.target.checked })} style={{ width: 'auto', accentColor: '#7C3AED' }} />
                  <span>Show <strong style={{ color: '#7C3AED' }}>FOB</strong> button</span>
                </label>
              </div>
            </div>
            {error && (
              <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '8px 12px',
                borderRadius: 6, fontSize: 12, marginBottom: 14 }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Process'}
              </button>
              <button onClick={() => setShowModal(false)} style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
