'use client'
// Lab Approval = requests approved on the Submitted page (fms_data.labDecision
// === 'approved'), showing the specific Lab Number that was selected — and
// where the Recipe (colour/chemical + qty, name from the colour_chemicals
// master list) gets entered. Saved recipes show on the Lab Receipe page.
import { useEffect, useState, useCallback } from 'react'
import { labApi, labPost, StatCard, fmtDateTime } from '../_shared'

export default function LabApprovalPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [indents,  setIndents]  = useState<any[]>([])
  const [chemicals, setChemicals] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')

  const [recipeModal, setRecipeModal] = useState<any>(null)
  const [recipeRows,  setRecipeRows]  = useState<{ name: string; qty: string }[]>([{ name: '', qty: '' }])

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reqRes, indRes, chemRes] = await Promise.all([
        labApi({ type: 'requests' }),
        labApi({ type: 'indents' }),
        fetch('/api/colour-chemicals', { cache: 'no-store' }).then(r => r.json()),
      ])
      if (reqRes.ok) {
        const approved = (reqRes.data || []).filter((r: any) => r.fms_data?.labDecision === 'approved')
        setRequests(approved)
      }
      if (indRes.ok) setIndents(indRes.data || [])
      if (chemRes.ok) setChemicals(chemRes.data || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const indentById = (id: string) => indents.find(ind => ind.id === id)

  const patchFmsData = async (r: any, extra: Record<string, any>) => {
    const payload = { ...(r.fms_data || {}), ...extra }
    return labPost({ action: 'update_request', id: r.id, fmsData: payload })
  }

  // ── Recipe ───────────────────────────────────────────────────────────────

  const openRecipeModal = (r: any) => {
    const existing = r.fms_data?.recipe || []
    setRecipeRows(existing.length > 0 ? existing.map((x: any) => ({ name: x.name, qty: x.qty })) : [{ name: '', qty: '' }])
    setRecipeModal(r)
  }
  const addRecipeRow = () => setRecipeRows(prev => [...prev, { name: '', qty: '' }])
  const removeRecipeRow = (idx: number) => setRecipeRows(prev => prev.filter((_, i) => i !== idx))
  const updateRecipeRow = (idx: number, field: 'name' | 'qty', value: string) =>
    setRecipeRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))

  const saveRecipe = async () => {
    if (!recipeModal) return
    const cleaned = recipeRows
      .map(r => ({ name: r.name.trim(), qty: r.qty.trim() }))
      .filter(r => r.name)
    if (cleaned.length === 0) { alert('Enter at least one colour/chemical.'); return }
    setSaving(true)
    try {
      const res = await patchFmsData(recipeModal, { recipe: cleaned })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Recipe saved')
      setRecipeModal(null)
      load()
    } finally { setSaving(false) }
  }

  // Only blank the page on the true first load; actions here call load()
  // again afterward, which would otherwise wipe the whole page every time.
  if (loading && requests.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="Approved"       value={requests.length}                                                    color="var(--success)" />
        <StatCard label="With Recipe"    value={requests.filter(r=>r.fms_data?.recipe?.length > 0).length}          color="var(--purple)" />
        <StatCard label="Avg DE"         value={requests.length ? (requests.reduce((s,r)=>s+(parseFloat(r.fms_data?.deValue)||0),0)/requests.length).toFixed(2) : '—'} color="var(--accent)" />
      </div>

      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'auto' }}>
        {requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 14 }}>
            No approved lab requests yet. Approve one on the Submitted page.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1450, fontSize: 11 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Request No','Indent No','Date','Unit','Party','Quality','Request Given By','Order Status','Branch',
                  'Shade/Pantone','Chart No','Approved Lab No','Delivery Date','L*','a*','b*','DE Value','Approved At','Recipe'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9,
                    fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
                    letterSpacing: '0.04em', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => {
                const fd = r.fms_data || {}
                const recipe = fd.recipe || []
                return (
                <tr key={r.id} style={{
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--success)' }}>{r.id}</td>
                  <td style={td}>{r.indent_id || '-'}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.confirmed_at || r.created_at)}</td>
                  <td style={td}>{r.unit || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{r.quality || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.request_given_by || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.order_status || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.branch || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fd.chartNumber || '-'}</td>
                  <td style={td}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: 'var(--success)', color: '#fff' }}>{fd.approvedLabNumber || '-'}</span>
                  </td>
                  <td style={td}>{fd.deliveryDate || '-'}</td>
                  <td style={td}>{fd.lValue || '-'}</td>
                  <td style={td}>{fd.aValue || '-'}</td>
                  <td style={td}>{fd.bValue || '-'}</td>
                  <td style={{ ...td, fontWeight: 700, color: parseFloat(fd.deValue) <= 1 ? 'var(--success)' : 'var(--warning)' }}>{fd.deValue || '-'}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(fd.labApprovalAt)}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 140 }}>
                    {recipe.length > 0 ? (
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', cursor: 'pointer' }}
                        onClick={() => openRecipeModal(r)} title="Click to edit recipe">
                        {recipe.map((ing: any, idx: number) => (
                          <span key={idx} style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px',
                            borderRadius: 6, background: '#6A1B9A', color: '#fff' }}>
                            {ing.name}{ing.qty ? ` (${ing.qty})` : ''}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <button className="xs" onClick={() => openRecipeModal(r)}>+ Add Recipe</button>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Recipe — colour/chemical name from the master list + qty, multiple rows */}
      {recipeModal && (
        <div className="modal-overlay" onClick={() => setRecipeModal(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Recipe — {recipeModal.id}</span>
              <button className="small" onClick={() => setRecipeModal(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px',
              marginBottom: 14, fontSize: 13 }}>
              {recipeModal.party} · {recipeModal.shade_pantone}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 11, fontWeight: 700,
              color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              <div style={{ flex: 1 }}>Colour / Chemical</div>
              <div style={{ width: 90 }}>Qty</div>
              <div style={{ width: 28 }} />
            </div>

            {recipeRows.map((row, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input list="chemical-master-list" value={row.name} placeholder="Select or type…" autoFocus={idx === 0}
                  onChange={e => updateRecipeRow(idx, 'name', e.target.value)}
                  style={{ flex: 1, padding: '7px 10px', fontSize: 13,
                    border: '1px solid var(--border-medium)', borderRadius: 6 }} />
                <input value={row.qty} placeholder="e.g. 5g" onChange={e => updateRecipeRow(idx, 'qty', e.target.value)}
                  style={{ width: 90, padding: '7px 10px', fontSize: 13,
                    border: '1px solid var(--border-medium)', borderRadius: 6 }} />
                <button className="xs" onClick={() => removeRecipeRow(idx)}
                  disabled={recipeRows.length === 1}
                  style={{ opacity: recipeRows.length === 1 ? 0.3 : 1 }}>✕</button>
              </div>
            ))}
            <datalist id="chemical-master-list">
              {chemicals.map((c: any) => <option key={c.id} value={c.name} />)}
            </datalist>

            <button className="small" onClick={addRecipeRow} style={{ marginBottom: 14 }}>
              + Add Another
            </button>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setRecipeModal(null)}>Cancel</button>
              <button className="primary" onClick={saveRecipe} disabled={saving}>
                {saving ? 'Saving…' : '✓ Save Recipe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '7px 10px', fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap' }
