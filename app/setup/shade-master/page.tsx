'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

interface ShadeRule { id: string; shade_name: string; shade_group: string; created_at: string }

const SHADE_GROUPS = ['Light', 'Medium', 'Dark']

const GRP: Record<string, { bg: string; color: string; border: string; dot: string; icon: string }> = {
  Light:  { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', dot: '#F59E0B', icon: '☀️' },
  Medium: { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE', dot: '#3B82F6', icon: '🌤' },
  Dark:   { bg: '#1E1B4B', color: '#C7D2FE', border: '#4338CA', dot: '#818CF8', icon: '🌑' },
}

export default function ShadeMasterPage() {
  const [rules,        setRules]        = useState<ShadeRule[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [showModal,    setShowModal]    = useState(false)
  const [editingId,    setEditingId]    = useState('')
  const [form,         setForm]         = useState({ shade_name: '', shade_group: 'Medium' })
  const [importStatus, setImportStatus] = useState('')
  const [toast,        setToast]        = useState('')
  const [search,       setSearch]       = useState('')
  const [filterGroup,  setFilterGroup]  = useState('')
  const [viewMode,     setViewMode]     = useState<'table' | 'grid'>('table')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const res  = await fetch('/api/shade-master', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) setRules(data.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(true) }, [load])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const save = async () => {
    if (!form.shade_name.trim()) { alert('Keyword required.'); return }
    const dup = rules.find(r =>
      r.shade_name.toLowerCase() === form.shade_name.trim().toLowerCase() && r.id !== editingId
    )
    if (dup) { alert('Keyword already exists.'); return }
    setSaving(true)
    const shade_name  = form.shade_name.trim()
    const shade_group = form.shade_group
    if (editingId) {
      setRules(prev => prev.map(r => r.id === editingId ? { ...r, shade_name, shade_group } : r))
    } else {
      setRules(prev => [...prev, { id: `tmp-${Date.now()}`, shade_name, shade_group, created_at: new Date().toISOString() }]
        .sort((a, b) => a.shade_name.localeCompare(b.shade_name)))
    }
    setShowModal(false)
    showToast('✓ Saved')
    try {
      const res  = await fetch('/api/shade-master', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: editingId ? 'update' : 'create', id: editingId || undefined, shade_name, shade_group }),
      })
      const data = await res.json()
      if (!data.ok) { showToast('⚠ Save failed — refreshing'); load(false) }
      else if (!editingId) load(false)
    } finally { setSaving(false) }
  }

  // Inline group change — no modal needed
  const changeGroup = async (r: ShadeRule, newGroup: string) => {
    setRules(prev => prev.map(x => x.id === r.id ? { ...x, shade_group: newGroup } : x))
    const res  = await fetch('/api/shade-master', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: r.id, shade_name: r.shade_name, shade_group: newGroup }),
    })
    const data = await res.json()
    if (!data.ok) { showToast('⚠ Update failed'); load(false) }
  }

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    setRules(prev => prev.filter(r => r.id !== id))
    showToast('✓ Deleted')
    const res  = await fetch('/api/shade-master', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    })
    const data = await res.json()
    if (!data.ok) { showToast('⚠ Delete failed'); load(false) }
  }

  const processRows = async (rows: any[][]) => {
    if (rows.length < 2) { setImportStatus('❌ File is empty'); return }
    const headers = rows[0].map((h: any) => String(h || '').toLowerCase().trim())
    const keyIdx  = headers.findIndex(h => h.includes('keyword') || h.includes('name') || h.includes('colour') || h.includes('color') || h.includes('shade'))
    const grpIdx  = headers.findIndex(h => h.includes('group') || h.includes('type') || h.includes('category'))
    if (keyIdx < 0) { setImportStatus('❌ No keyword/name/colour column found'); return }
    const existing = new Set(rules.map(r => r.shade_name.toLowerCase()))
    const toAdd: { shade_name: string; shade_group: string }[] = []
    for (let i = 1; i < rows.length; i++) {
      const row   = rows[i]
      const name  = String(row[keyIdx] || '').trim()
      const group = grpIdx >= 0 ? String(row[grpIdx] || '').trim() : 'Medium'
      if (!name || existing.has(name.toLowerCase())) continue
      const validGroup = SHADE_GROUPS.includes(group) ? group : 'Medium'
      toAdd.push({ shade_name: name, shade_group: validGroup })
      existing.add(name.toLowerCase())
    }
    if (!toAdd.length) { setImportStatus('⚠ No new keywords found'); setTimeout(() => setImportStatus(''), 4000); return }
    setImportStatus(`⏳ Saving ${toAdd.length} rules…`)
    const res  = await fetch('/api/shade-master', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_insert', rules: toAdd }),
    })
    const data = await res.json()
    if (!data.ok) { setImportStatus(`❌ ${data.error}`); setTimeout(() => setImportStatus(''), 5000); return }
    setImportStatus(`✅ ${data.inserted} rules imported`)
    setTimeout(() => setImportStatus(''), 4000)
    if (fileRef.current) fileRef.current.value = ''
    load(false)
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setImportStatus('📂 Reading…')
    try {
      let rows: any[][]
      if (file.name.toLowerCase().endsWith('.csv')) {
        rows = (await file.text()).split(/\r?\n/).filter(l => l.trim())
          .map(l => l.split(',').map(c => c.replace(/^"|"$/g, '').trim()))
      } else {
        const buf = await file.arrayBuffer()
        const wb  = XLSX.read(new Uint8Array(buf), { type: 'array', raw: false })
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as any[][]
      }
      await processRows(rows)
    } catch (err: any) { setImportStatus(`❌ ${err.message}`); setTimeout(() => setImportStatus(''), 5000) }
  }

  const groupCounts: Record<string, number> = {}
  rules.forEach(r => { groupCounts[r.shade_group] = (groupCounts[r.shade_group] || 0) + 1 })

  const filtered = rules.filter(r => {
    const matchSearch = !search.trim() || r.shade_name.toLowerCase().includes(search.toLowerCase())
    const matchGroup  = !filterGroup || r.shade_group === filterGroup
    return matchSearch && matchGroup
  })

  return (
    <div className="content" style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 20, zIndex: 9999, background: toast.startsWith('⚠') ? '#FEF3C7' : '#D1FAE5', border: `1px solid ${toast.startsWith('⚠') ? '#FCD34D' : '#6EE7B7'}`, borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600, color: toast.startsWith('⚠') ? '#92400E' : '#065F46', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {toast}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>🎨 Shade Rule Master</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.6 }}>
            Configure how colour names map to shade groups.<br />
            Each keyword is tested as a <strong>case-insensitive substring</strong> of the colour name.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Import */}
          <div style={{ position: 'relative' }}>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, background: 'var(--bg-primary)', border: '1px solid var(--border-medium)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-primary)' }}>
              <span style={{ fontSize: 16 }}>↑</span> Import Excel / CSV
            </button>
          </div>
          <button onClick={() => { setEditingId(''); setForm({ shade_name: '', shade_group: 'Medium' }); setShowModal(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 700, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            + New Rule
          </button>
        </div>
      </div>

      {/* Import status */}
      {importStatus && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: importStatus.startsWith('✅') ? '#D1FAE5' : importStatus.startsWith('❌') ? '#FEE2E2' : '#EFF6FF',
          color:      importStatus.startsWith('✅') ? '#065F46' : importStatus.startsWith('❌') ? '#991B1B' : '#1E40AF',
          border: `1px solid ${importStatus.startsWith('✅') ? '#6EE7B7' : importStatus.startsWith('❌') ? '#FCA5A5' : '#BFDBFE'}` }}>
          {importStatus}
        </div>
      )}

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        {/* Total */}
        <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', borderRadius: 14, padding: '18px 20px', color: '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.6, marginBottom: 8 }}>Total Rules</div>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 }}>{rules.length}</div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>shade_master · Supabase</div>
        </div>

        {/* Group cards */}
        {SHADE_GROUPS.map(g => {
          const cfg     = GRP[g]
          const count   = groupCounts[g] || 0
          const pct     = rules.length > 0 ? Math.round((count / rules.length) * 100) : 0
          const active  = filterGroup === g
          return (
            <div key={g} onClick={() => setFilterGroup(active ? '' : g)}
              style={{ background: active ? cfg.bg : 'var(--bg-primary)', border: `2px solid ${active ? cfg.border : 'var(--border-light)'}`, borderRadius: 14, padding: '18px 20px', cursor: 'pointer', transition: 'all 0.15s', position: 'relative', overflow: 'hidden' }}>
              {/* Background bar */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, width: `${pct}%`, height: 3, background: cfg.dot, borderRadius: '0 3px 0 0', transition: 'width 0.5s' }} />
              <div style={{ fontSize: 18, marginBottom: 6 }}>{cfg.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: cfg.color, marginBottom: 4 }}>{g}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: cfg.color, letterSpacing: '-1px', lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>{pct}% of total {active ? '· click to clear' : ''}</div>
            </div>
          )
        })}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: 14 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search keyword…"
            style={{ width: '100%', paddingLeft: 32, fontSize: 13, padding: '8px 12px 8px 32px', border: '1px solid var(--border-medium)', borderRadius: 8, background: 'var(--bg-primary)' }} />
        </div>

        {/* Group filter pills */}
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg-secondary)', borderRadius: 8, padding: 4 }}>
          <button onClick={() => setFilterGroup('')}
            style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, background: !filterGroup ? 'var(--bg-primary)' : 'transparent', color: !filterGroup ? 'var(--text-primary)' : 'var(--text-tertiary)', cursor: 'pointer', boxShadow: !filterGroup ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
            All
          </button>
          {SHADE_GROUPS.map(g => (
            <button key={g} onClick={() => setFilterGroup(filterGroup === g ? '' : g)}
              style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, background: filterGroup === g ? GRP[g].bg : 'transparent', color: filterGroup === g ? GRP[g].color : 'var(--text-tertiary)', cursor: 'pointer', boxShadow: filterGroup === g ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
              {GRP[g].icon} {g}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 4, gap: 2 }}>
          {[['table','☰'],['grid','⊞']] .map(([v, icon]) => (
            <button key={v} onClick={() => setViewMode(v as any)}
              style={{ padding: '5px 10px', fontSize: 14, border: 'none', borderRadius: 6, background: viewMode === v ? 'var(--bg-primary)' : 'transparent', cursor: 'pointer', color: viewMode === v ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: viewMode === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
              {icon}
            </button>
          ))}
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
          {filtered.length} of {rules.length} rules
        </span>
        <button onClick={() => load(false)} style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-light)', borderRadius: 8, background: 'var(--bg-primary)', cursor: 'pointer', color: 'var(--text-secondary)' }}>↻</button>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎨</div>
          <div>Loading shade rules from Supabase…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-tertiary)', background: 'var(--bg-primary)', border: '2px dashed var(--border-medium)', borderRadius: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎨</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{search ? `No results for "${search}"` : 'No rules yet'}</div>
          <div style={{ fontSize: 13 }}>Upload an Excel file or add rules manually.</div>
        </div>
      ) : viewMode === 'grid' ? (
        // ── GRID VIEW ──
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
          {filtered.map(r => {
            const cfg = GRP[r.shade_group] || GRP.Medium
            return (
              <div key={r.id}
                style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}`, borderRadius: 10, padding: '12px 14px', position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color, lineHeight: 1.3, flex: 1 }}>{r.shade_name}</span>
                  <button onClick={() => del(r.id, r.shade_name)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: cfg.color, opacity: 0.4, fontSize: 13, padding: '0 0 0 6px', flexShrink: 0, lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                  {SHADE_GROUPS.map(g => (
                    <button key={g} onClick={() => r.shade_group !== g && changeGroup(r, g)}
                      style={{ flex: 1, padding: '3px 0', fontSize: 10, fontWeight: 700, border: `1.5px solid ${r.shade_group === g ? GRP[g].border : 'transparent'}`, borderRadius: 5, background: r.shade_group === g ? GRP[g].bg : 'rgba(255,255,255,0.4)', color: GRP[g].color, cursor: r.shade_group === g ? 'default' : 'pointer' }}>
                      {g[0]}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        // ── TABLE VIEW ──
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={th}>#</th>
                  <th style={th}>KEYWORD</th>
                  <th style={th}>SHADE GROUP</th>
                  <th style={{ ...th, minWidth: 200 }}>CHANGE GROUP</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const cfg = GRP[r.shade_group] || GRP.Medium
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)', background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                      <td style={{ ...td, width: 40, color: 'var(--text-tertiary)', fontSize: 11 }}>{i + 1}</td>
                      <td style={{ ...td, fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{r.shade_name}</td>
                      <td style={td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
                          {r.shade_group}
                        </span>
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {SHADE_GROUPS.map(g => (
                            <button key={g} onClick={() => r.shade_group !== g && changeGroup(r, g)}
                              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, border: `1.5px solid ${r.shade_group === g ? GRP[g].border : 'var(--border-light)'}`, borderRadius: 6, background: r.shade_group === g ? GRP[g].bg : 'var(--bg-primary)', color: r.shade_group === g ? GRP[g].color : 'var(--text-tertiary)', cursor: r.shade_group === g ? 'default' : 'pointer', transition: 'all 0.1s' }}>
                              {g}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button onClick={() => del(r.id, r.shade_name)}
                          style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, border: '1px solid #FCA5A5', borderRadius: 6, background: 'var(--bg-primary)', color: '#DC2626', cursor: 'pointer' }}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-light)', fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{filtered.length} of {rules.length} rules</span>
            <span><strong>shade_master</strong> · Supabase · {Object.entries(groupCounts).map(([g, n]) => `${g}: ${n}`).join(' · ')}</span>
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title" style={{ fontSize: 16, fontWeight: 700 }}>
                {editingId ? '✏️ Edit Shade Rule' : '+ New Shade Rule'}
              </span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}>✕</button>
            </div>

            <div className="form-group" style={{ marginBottom: 18 }}>
              <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Keyword *</label>
              <input value={form.shade_name} onChange={e => setForm({ ...form, shade_name: e.target.value })}
                placeholder="e.g. navy blue, red, off white" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') save() }}
                style={{ marginTop: 6, fontSize: 14, padding: '10px 12px', fontFamily: 'monospace' }} />
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 5 }}>
                Matched as a substring of the colour name (case-insensitive)
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shade Group *</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }}>
                {SHADE_GROUPS.map(g => {
                  const cfg    = GRP[g]
                  const active = form.shade_group === g
                  return (
                    <button key={g} onClick={() => setForm({ ...form, shade_group: g })}
                      style={{ padding: '14px 10px', border: `2px solid ${active ? cfg.dot : 'var(--border-light)'}`, borderRadius: 10, background: active ? cfg.bg : 'var(--bg-secondary)', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 22 }}>{cfg.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{g}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{groupCounts[g] || 0} rules</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <button onClick={save} disabled={saving || !form.shade_name.trim()}
              style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 8, background: saving || !form.shade_name.trim() ? 'var(--bg-secondary)' : '#185FA5', color: saving || !form.shade_name.trim() ? 'var(--text-tertiary)' : '#fff', cursor: saving || !form.shade_name.trim() ? 'not-allowed' : 'pointer' }}>
              {saving ? '⏳ Saving…' : editingId ? '✓ Update Rule' : '✓ Add Rule'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em',
  borderBottom: '2px solid var(--border-light)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '9px 14px', verticalAlign: 'middle' }
