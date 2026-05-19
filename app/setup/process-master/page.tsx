'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProcessDef, DEFAULT_PROCESSES, loadOrSeedProcessList } from '@/lib/processMap'

export default function ProcessMasterPage() {
  const router = useRouter()
  const [processes, setProcesses] = useState<ProcessDef[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingProcess, setEditingProcess] = useState<ProcessDef | null>(null)
  const [formData, setFormData] = useState({ code: '', name: '', enabled: true, defaultDays: 1, allowFaulty: true, allowFOB: false })
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadProcesses()
  }, [])

  const loadProcesses = () => {
    const list = loadOrSeedProcessList()
    setProcesses([...list].sort((a, b) => a.order - b.order))
  }

  const saveToDb = (updated: ProcessDef[]) => {
    const raw = localStorage.getItem('dyeflow_db')
    const db = raw ? JSON.parse(raw) : {}
    db.processList = updated
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
  }

  const openAddModal = () => {
    setEditingProcess(null)
    setFormData({ code: '', name: '', enabled: true, defaultDays: 1 })
    setError('')
    setShowModal(true)
  }

  const openEditModal = (proc: ProcessDef) => {
    setEditingProcess(proc)
    setFormData({ code: proc.code, name: proc.name, enabled: proc.enabled, defaultDays: proc.defaultDays ?? 1, allowFaulty: proc.allowFaulty ?? true, allowFOB: proc.allowFOB ?? false })
    setError('')
    setShowModal(true)
  }

  const handleSave = () => {
    const code = formData.code.trim()
    const name = formData.name.trim()

    if (!code) { setError('Process code is required.'); return }
    if (!name) { setError('Process name is required.'); return }

    // Duplicate code check (skip self when editing)
    const duplicate = processes.find(
      p => p.code.toUpperCase() === code.toUpperCase() && p.code !== editingProcess?.code
    )
    if (duplicate) { setError(`Code "${code}" already exists as "${duplicate.name}".`); return }

    const raw = localStorage.getItem('dyeflow_db')
    const db = raw ? JSON.parse(raw) : {}
    if (!db.processList || !Array.isArray(db.processList)) db.processList = []

    if (editingProcess) {
      // Update existing
      db.processList = db.processList.map((p: ProcessDef) =>
        p.code === editingProcess.code
          ? { ...p, code, name, enabled: formData.enabled, defaultDays: formData.defaultDays, allowFaulty: formData.allowFaulty, allowFOB: formData.allowFOB }
          : p
      )
    } else {
      // Add new at end
      const maxOrder = db.processList.reduce((m: number, p: ProcessDef) => Math.max(m, p.order), 0)
      db.processList.push({ code, name, enabled: formData.enabled, defaultDays: formData.defaultDays, allowFaulty: formData.allowFaulty, allowFOB: formData.allowFOB, order: maxOrder + 1 })
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
    setShowModal(false)
    loadProcesses()
  }

  const toggleEnabled = (code: string) => {
    const updated = processes.map(p =>
      p.code === code ? { ...p, enabled: !p.enabled } : p
    )
    setProcesses(updated)
    saveToDb(updated)
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    const updated = [...processes]
    ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
    updated.forEach((p, i) => { p.order = i + 1 })
    setProcesses(updated)
    saveToDb(updated)
  }

  const moveDown = (index: number) => {
    if (index === processes.length - 1) return
    const updated = [...processes]
    ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
    updated.forEach((p, i) => { p.order = i + 1 })
    setProcesses(updated)
    saveToDb(updated)
  }

  const handleDelete = (code: string) => {
    const proc = processes.find(p => p.code === code)
    if (!confirm(`Delete process "${proc?.name}" (${code})?\n\nThis will remove it from navigation. Existing order routes using this code are NOT affected.`)) return

    const updated = processes.filter(p => p.code !== code)
    updated.forEach((p, i) => { p.order = i + 1 })
    setProcesses(updated)
    saveToDb(updated)
  }

  const resetToDefaults = () => {
    if (!confirm('Reset to default process list? Your custom processes will be removed.')) return
    const updated = DEFAULT_PROCESSES.map((p, i) => ({ ...p, order: i + 1 }))
    setProcesses(updated)
    saveToDb(updated)
  }

  const filtered = processes.filter(p =>
    p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const enabledCount = processes.filter(p => p.enabled).length

  return (
    <div className="content" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="card-title" style={{ fontSize: 18, marginBottom: 4 }}>Process Master</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Create and manage FMS process steps. Changes instantly reflect in the navigation and FMS pages.
              <strong style={{ color: 'var(--text-primary)' }}> {enabledCount} of {processes.length} </strong>
              processes are enabled.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={resetToDefaults} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Reset to defaults
            </button>
            <button className="primary" onClick={openAddModal}>+ Add Process</button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search by code or name..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ maxWidth: 280 }}
        />
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ width: 50 }}>ORDER</th>
                <th style={{ width: 100 }}>CODE</th>
                <th>NAME</th>
                <th style={{ width: 80 }}>DAYS</th>
                <th style={{ width: 90 }}>STATUS</th>
                <th style={{ width: 80 }}>FAULTY</th>
                <th style={{ width: 80 }}>FOB</th>
                <th style={{ width: 80 }}>MOVE</th>
                <th style={{ width: 140 }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    {processes.length === 0
                      ? 'No processes yet. Click "+ Add Process" to create one.'
                      : 'No processes match your search.'}
                  </td>
                </tr>
              )}
              {filtered.map((proc, idx) => (
                <tr key={proc.code}>
                  <td style={{ color: 'var(--text-tertiary)', fontWeight: 600, textAlign: 'center' }}>
                    {proc.order}
                  </td>
                  <td>
                    <span style={{
                      background: 'var(--accent-light)',
                      color: 'var(--accent-dark)',
                      padding: '3px 9px',
                      borderRadius: 20,
                      fontWeight: 700,
                      fontSize: 12
                    }}>
                      {proc.code}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{proc.name}</td>
                  <td style={{ color: 'var(--text-secondary)', fontWeight: 500, textAlign: 'center' }}>
                    {proc.defaultDays ?? 1}d
                  </td>
                  <td>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      userSelect: 'none',
                      margin: 0
                    }}>
                      <input
                        type="checkbox"
                        checked={proc.enabled}
                        onChange={() => toggleEnabled(proc.code)}
                        style={{ width: 'auto', cursor: 'pointer' }}
                      />
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: proc.enabled ? 'var(--success)' : 'var(--text-tertiary)'
                      }}>
                        {proc.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  </td>
                  {/* Faulty toggle */}
                  <td style={{ textAlign: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={proc.allowFaulty ?? true}
                        onChange={() => {
                          const updated = processes.map(p =>
                            p.code === proc.code ? { ...p, allowFaulty: !(p.allowFaulty ?? true) } : p
                          )
                          setProcesses(updated)
                          saveToDb(updated)
                        }}
                        style={{ width: 'auto', cursor: 'pointer', accentColor: '#EF4444' }}
                      />
                      <span style={{ fontSize: 10, fontWeight: 600, color: (proc.allowFaulty ?? true) ? '#EF4444' : 'var(--text-tertiary)' }}>
                        {(proc.allowFaulty ?? true) ? 'ON' : 'OFF'}
                      </span>
                    </label>
                  </td>
                  {/* FOB toggle */}
                  <td style={{ textAlign: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={proc.allowFOB ?? false}
                        onChange={() => {
                          const updated = processes.map(p =>
                            p.code === proc.code ? { ...p, allowFOB: !(p.allowFOB ?? false) } : p
                          )
                          setProcesses(updated)
                          saveToDb(updated)
                        }}
                        style={{ width: 'auto', cursor: 'pointer', accentColor: '#7C3AED' }}
                      />
                      <span style={{ fontSize: 10, fontWeight: 600, color: (proc.allowFOB ?? false) ? '#7C3AED' : 'var(--text-tertiary)' }}>
                        {(proc.allowFOB ?? false) ? 'ON' : 'OFF'}
                      </span>
                    </label>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="xs"
                        onClick={() => moveUp(processes.indexOf(proc))}
                        disabled={processes.indexOf(proc) === 0}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        className="xs"
                        onClick={() => moveDown(processes.indexOf(proc))}
                        disabled={processes.indexOf(proc) === processes.length - 1}
                        title="Move down"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="xs" onClick={() => openEditModal(proc)}>Edit</button>
                      <button
                        className="xs danger"
                        onClick={() => handleDelete(proc.code)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>
        Tip: Use ↑↓ to reorder processes. This order controls the FMS navigation menu sequence.
        Disabling a process hides it from navigation but does not affect existing orders.
      </p>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span className="modal-title">
                {editingProcess ? `Edit Process — ${editingProcess.code}` : 'Add New Process'}
              </span>
              <button onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 16 }}>
              <div className="form-group">
                <label>Process Code *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g. D"
                  disabled={!!editingProcess}
                  autoFocus={!editingProcess}
                  style={{ opacity: editingProcess ? 0.6 : 1 }}
                />
                {editingProcess && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                    Code cannot be changed (used in order routes)
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>Process Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Dyeing"
                  autoFocus={!!editingProcess}
                />
              </div>
              <div className="form-group">
                <label>Default Days</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={formData.defaultDays}
                  onChange={e => setFormData({ ...formData, defaultDays: Math.max(1, parseInt(e.target.value) || 1) })}
                  placeholder="1"
                />
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                  Used by Date Calculator
                </span>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                Enable this process (show in FMS navigation)
              </label>
            </div>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>FMS Action Buttons</div>
              <div style={{ display: 'flex', gap: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={formData.allowFaulty}
                    onChange={e => setFormData({ ...formData, allowFaulty: e.target.checked })}
                    style={{ width: 'auto', accentColor: '#EF4444' }}
                  />
                  <span>Show <strong style={{ color: '#EF4444' }}>Faulty</strong> button</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={formData.allowFOB}
                    onChange={e => setFormData({ ...formData, allowFOB: e.target.checked })}
                    style={{ width: 'auto', accentColor: '#7C3AED' }}
                  />
                  <span>Show <strong style={{ color: '#7C3AED' }}>FOB</strong> button</span>
                </label>
              </div>
            </div>

            {error && (
              <div style={{
                background: 'var(--danger-light)',
                color: 'var(--danger)',
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 13,
                marginBottom: 16
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={handleSave} style={{ flex: 1 }}>
                {editingProcess ? 'Save Changes' : 'Add Process'}
              </button>
              <button onClick={() => setShowModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
