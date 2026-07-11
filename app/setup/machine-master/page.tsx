'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

interface Machine { id: string; name: string; machine_type?: string; capacity: number; status: string }

const api = async (action: string, payload: Record<string, any> = {}) => {
  const res = await fetch('/api/machines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  return res.json()
}

export default function MachineMasterPage() {
  const [machines,     setMachines]     = useState<Machine[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [form, setForm] = useState({ name: '', machine_type: '', capacity: 200 })
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/machines', { cache: 'no-store' })
    const data = await res.json()
    if (data.ok) setMachines(data.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const updateStatus = async (id: string, status: string) => {
    await api('update', { id, status })
    load()
  }

  const del = async (id: string) => {
    if (!confirm('Delete this machine?')) return
    await api('delete', { id })
    load()
  }

  const save = async () => {
    if (!form.name.trim()) { alert('Machine name required.'); return }
    const data = await api('create', {
      name: form.name.trim(), machine_type: form.machine_type.trim(),
      capacity: form.capacity, status: 'idle', is_active: true,
    })
    if (!data.ok) alert(`Failed: ${data.error}`)
    else { setShowModal(false); setForm({ name: '', machine_type: '', capacity: 200 }); load() }
  }

  const processImport = async (rows: any[][]) => {
    if (rows.length < 2) { setImportStatus('❌ File appears empty.'); return }
    let header = rows[0].map((h: any) => String(h || '').trim().toLowerCase())
    let nameIdx = header.findIndex(h => h.includes('name') || h.includes('jet') || h.includes('no'))
    let typeIdx = header.findIndex(h => h.includes('type'))
    let capIdx  = header.findIndex(h => h.includes('capacity') || h.includes('cap'))
    if (nameIdx < 0) { nameIdx = 0; typeIdx = 1; capIdx = 2 }

    let added = 0, skipped = 0
    const existing = new Set(machines.map(m => m.name.toLowerCase()))

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const get = (idx: number) => idx >= 0 && row[idx] != null ? String(row[idx]).trim() : ''
      const name = get(nameIdx)
      if (!name || existing.has(name.toLowerCase())) { skipped++; continue }
      const data = await api('create', {
        name, machine_type: get(typeIdx), capacity: parseInt(get(capIdx)) || 200,
        status: 'idle', is_active: true,
      })
      if (data.ok) { existing.add(name.toLowerCase()); added++ } else skipped++
    }
    setImportStatus(`✅ Imported ${added} machines${skipped ? `, ${skipped} skipped` : ''}`)
    load()
    if (fileRef.current) fileRef.current.value = ''
    setTimeout(() => setImportStatus(''), 5000)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus('Reading file…')
    if (file.name.endsWith('.csv')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const lines = (ev.target?.result as string).split(/\r?\n/).filter(l => l.trim())
        processImport(lines.map(line => line.split(',').map(c => c.replace(/^"|"$/g,'').trim())))
      }
      reader.readAsText(file)
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const wb   = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type: 'array' })
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false }) as any[][]
        processImport(rows)
      }
      reader.readAsArrayBuffer(file)
    }
  }

  const COLORS = ['#185FA5','#1D9E75','#D85A30','#7F77DD','#BA7517','#D4537E','#378ADD','#3B6D11']

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      {/* Import */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10,
        padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📄 Import Machines from Excel / CSV</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Columns: <strong>Name, Type, Capacity</strong>. Existing machines with same name are skipped.
          </div>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 5, padding: '4px 10px',
            fontSize: 11, fontFamily: 'monospace', display: 'inline-block', marginTop: 6 }}>
            Example: Long Tube Jet 1, Jet, 500
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          {importStatus && (
            <span style={{ fontSize: 12, fontWeight: 500,
              color: importStatus.startsWith('✅') ? 'var(--success)' : importStatus.startsWith('❌') ? 'var(--danger)' : 'var(--text-secondary)' }}>
              {importStatus}
            </span>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          <button style={{ background: '#137E43', color: '#fff', border: 'none', padding: '7px 14px',
            borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            onClick={() => fileRef.current?.click()}>
            📄 Upload Excel / CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>All Machines</span>
            <span style={{ fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)',
              padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{machines.length}</span>
          </div>
          <button style={{ background: '#137E43', color: '#fff', border: 'none', padding: '7px 14px',
            borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            onClick={() => { setForm({ name: '', machine_type: '', capacity: 200 }); setShowModal(true) }}>
            + Add Machine
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Machine Name','Type','Capacity (Kg)','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</td></tr>
              ) : machines.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  No machines yet. Click "+ Add Machine" or upload Excel.
                </td></tr>
              ) : (
                machines.map((m, i) => (
                  <tr key={m.id} style={{ background: i%2===0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: 13 }}>{m.name}</td>
                    <td style={{ padding: '12px 14px' }}>
                      {m.machine_type && (
                        <span style={{ background: '#E6F0FF', color: '#3366CC', padding: '2px 8px',
                          borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{m.machine_type}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13 }}>{m.capacity} Kg</td>
                    <td style={{ padding: '12px 14px' }}>
                      <select value={m.status || 'idle'} onChange={e => updateStatus(m.id, e.target.value)}
                        style={{ fontSize: 12, padding: '3px 8px', border: '1px solid var(--border-medium)',
                          borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                        <option value="running">Running</option>
                        <option value="idle">Idle</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="xs" style={{ background: '#137E43', color: '#fff', border: 'none' }}
                          onClick={() => window.location.href = `/machines/${m.id}`}>Open</button>
                        <button className="xs danger" onClick={() => del(m.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Machine cards */}
      {machines.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {machines.map((m, i) => {
            const col = COLORS[i % COLORS.length]
            return (
              <div key={m.id} onClick={() => window.location.href = `/machines/${m.id}`}
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
                  borderRadius: 10, padding: '14px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: `${col}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: col, flexShrink: 0 }}>
                    {m.name.substring(0, 3)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{m.machine_type || 'Machine'}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Capacity: {m.capacity} Kg</div>
                <div style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                    background: m.status === 'running' ? 'var(--success-light)' : 'var(--bg-secondary)',
                    color: m.status === 'running' ? 'var(--success)' : 'var(--text-tertiary)' }}>
                    {m.status || 'idle'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add New Machine</span>
              <button className="small" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>Machine Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Long Tube Jet No. 1" autoFocus />
              </div>
              <div className="form-group">
                <label>Type</label>
                <input type="text" value={form.machine_type} onChange={e => setForm({ ...form, machine_type: e.target.value })}
                  placeholder="Jet / HT / Jigger / Winch" />
              </div>
              <div className="form-group">
                <label>Capacity (Kg)</label>
                <input type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 200 })}
                  placeholder="200" />
              </div>
            </div>
            <button className="primary" onClick={save} style={{ width: '100%', marginTop: 8 }}>✓ Save Machine</button>
          </div>
        </div>
      )}
    </div>
  )
}
