'use client'

import { useEffect, useState, useCallback } from 'react'

interface Supervisor { id: string; name: string; email?: string; phone?: string; created_at?: string }

export default function SupervisorMasterPage() {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showModal,   setShowModal]   = useState(false)
  const [editing,     setEditing]     = useState<Supervisor | null>(null)
  const [form,        setForm]        = useState({ name: '', email: '', phone: '' })
  const [search,      setSearch]      = useState('')
  const [saving,      setSaving]      = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/supervisors', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) setSupervisors(data.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openAdd  = () => { setEditing(null); setForm({ name: '', email: '', phone: '' }); setShowModal(true) }
  const openEdit = (s: Supervisor) => { setEditing(s); setForm({ name: s.name, email: s.email || '', phone: s.phone || '' }); setShowModal(true) }

  const apiCall = async (action: string, payload: Record<string, any>) => {
    const res = await fetch('/api/supervisors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    return res.json()
  }

  const save = async () => {
    if (!form.name.trim()) { alert('Name required.'); return }
    setSaving(true)
    try {
      const data = editing
        ? await apiCall('update', { id: editing.id, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() })
        : await apiCall('create', { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), is_active: true })
      if (!data.ok) throw new Error(data.error)
      setShowModal(false)
      load()
    } catch (err) { alert(`Save failed: ${err}`) }
    finally { setSaving(false) }
  }

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete supervisor "${name}"?`)) return
    const data = await apiCall('delete', { id })
    if (!data.ok) alert(`Delete failed: ${data.error}`)
    else load()
  }

  const filtered = supervisors.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.phone || '').includes(search)
  )

  return (
    <div style={{ padding: '16px 20px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Supervisor Master</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Manage supervisor details · {supervisors.length} total
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input type="text" placeholder="Search supervisors…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 320, padding: '7px 10px', fontSize: 13,
            border: '1px solid var(--border-medium)', borderRadius: 6,
            background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
        <button className="primary" onClick={openAdd}>+ Add Supervisor</button>
      </div>

      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-secondary)' }}>
            <tr>
              {['Name','Email','Phone','Created','Actions'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                  color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                  borderBottom: '1px solid var(--border-light)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                {supervisors.length === 0 ? 'No supervisors yet. Click "+ Add Supervisor" to create one.' : 'No results.'}
              </td></tr>
            ) : (
              filtered.map((s, i) => (
                <tr key={s.id} style={{ background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: 13 }}>{s.name}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{s.email || '-'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12 }}>{s.phone || '-'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {s.created_at ? new Date(s.created_at).toLocaleDateString('en-GB') : '-'}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="xs" onClick={() => openEdit(s)}>Edit</button>
                      <button className="xs danger" onClick={() => del(s.id, s.name)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Supervisor' : 'Add New Supervisor'}</span>
              <button className="small" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="form-group">
                <label>Supervisor Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter supervisor name" autoFocus />
              </div>
              <div className="form-group">
                <label>Email (Optional)</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="supervisor@example.com" />
              </div>
              <div className="form-group">
                <label>Phone (Optional)</label>
                <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 XXXXX XXXXX" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="primary" onClick={save} disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Saving…' : editing ? '✓ Update' : '✓ Add Supervisor'}
              </button>
              <button onClick={() => setShowModal(false)} style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
