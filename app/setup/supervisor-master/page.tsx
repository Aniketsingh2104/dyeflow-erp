'use client'

import { useEffect, useState, useCallback } from 'react'
import { SECTIONS } from '@/lib/machineSections'

interface Supervisor { id: string; name: string; email?: string; phone?: string; created_at?: string; default_sections?: string[] }

export default function SupervisorMasterPage() {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showModal,   setShowModal]   = useState(false)
  const [editing,     setEditing]     = useState<Supervisor | null>(null)
  const [form,        setForm]        = useState({ name: '', email: '', phone: '', sections: [] as string[] })
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

  const openAdd  = () => { setEditing(null); setForm({ name: '', email: '', phone: '', sections: [] }); setShowModal(true) }
  const openEdit = (s: Supervisor) => { setEditing(s); setForm({ name: s.name, email: s.email || '', phone: s.phone || '', sections: s.default_sections || [] }); setShowModal(true) }
  const toggleSection = (x: string) => setForm(f => ({ ...f, sections: f.sections.includes(x) ? f.sections.filter(y => y !== x) : [...f.sections, x] }))

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
        ? await apiCall('update', { id: editing.id, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), default_sections: form.sections })
        : await apiCall('create', { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), default_sections: form.sections, is_active: true })
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
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Supervisor Master</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Supervisors and the machine sections their sheets open with
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="text" placeholder="Search supervisors…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: 280, padding: '9px 12px', fontSize: 14,
              border: '1px solid var(--border-medium)', borderRadius: 8,
              background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          <button className="primary" onClick={openAdd} style={{ padding: '9px 16px', fontSize: 14, fontWeight: 700 }}>+ Add Supervisor</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['Supervisors', supervisors.length, 'var(--accent)'],
          ...SECTIONS.map(sec => [sec, supervisors.filter(x => (x.default_sections || []).includes(sec)).length, '#3366CC'] as [string, number, string]),
          ['All machines', supervisors.filter(x => !(x.default_sections || []).length).length, 'var(--text-tertiary)']].map(([label, value, color]) => (
          <div key={String(label)} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10,
            padding: '10px 16px', minWidth: 120 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: String(color) }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 900 }}>
          <colgroup>
            <col style={{ width: '22%' }} /><col style={{ width: '26%' }} /><col style={{ width: '18%' }} />
            <col style={{ width: '12%' }} /><col style={{ width: '10%' }} /><col style={{ width: '12%' }} />
          </colgroup>
          <thead style={{ background: 'var(--bg-secondary)' }}>
            <tr>
              {['Name','Machine Sections','Email','Phone','Created','Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700,
                  color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                  borderBottom: '2px solid var(--border-light)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                {supervisors.length === 0 ? 'No supervisors yet. Click "+ Add Supervisor" to create one.' : 'No results.'}
              </td></tr>
            ) : (
              filtered.map((s, i) => (
                <tr key={s.id} style={{ background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 700, fontSize: 15 }}>{s.name}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13 }}>
                    {(s.default_sections || []).length
                      ? (s.default_sections || []).map(x => <span key={x} style={{ display: 'inline-block', background: '#E6F0FF', color: '#3366CC', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, marginRight: 6, marginBottom: 2 }}>{x}</span>)
                      : <span style={{ color: 'var(--text-tertiary)' }}>All machines</span>}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.email || '-'}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13 }}>{s.phone || '-'}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-tertiary)' }}>
                    {s.created_at ? new Date(s.created_at).toLocaleDateString('en-GB') : '-'}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="small" onClick={() => openEdit(s)}>Edit</button>
                      <button className="small danger" onClick={() => del(s.id, s.name)}>Delete</button>
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
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
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
                <label>Machine Sections (shown first on this supervisor's sheet)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {SECTIONS.map(x => {
                    const on = form.sections.includes(x)
                    return (
                      <button key={x} type="button" onClick={() => toggleSection(x)}
                        style={{ padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          border: '1px solid ' + (on ? '#3366CC' : 'var(--border-medium)'),
                          background: on ? '#3366CC' : 'var(--bg-primary)', color: on ? '#fff' : 'var(--text-secondary)' }}>
                        {on ? '✓ ' : ''}{x}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                  {form.sections.length ? `Sheet opens with ${form.sections.join(' + ')} machines; other sections can still be ticked per batch.` : 'None selected = every machine is listed.'}
                </div>
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
