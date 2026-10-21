'use client'
// Lab Receipe — every recipe in one list:
//   • Manual recipes by Lab No. ("➕ Add Recipe" here; table lab_recipes).
//     One recipe per Lab No.; saving the same Lab No. again asks "replace?".
//     Click the recipe to edit; Delete is admin only. Changes go to the Audit Log.
//   • Recipes from the lab request flow (Approved Lab page → fms_data.recipe).
// Colour / chemical names are suggested from the colour_chemicals master.
import { useEffect, useState, useCallback } from 'react'
import { labApi, labPost, StatCard, fmtDateTime } from '../_shared'
import { usePermission } from '@/lib/permissions'

interface Ing { name: string; qty: string }
interface Form { id?: string; labNo: string; party: string; shade: string; article: string; remarks: string; rows: Ing[] }
const EMPTY: Form = { labNo: '', party: '', shade: '', article: '', remarks: '', rows: [{ name: '', qty: '' }] }

export default function LabRecipePage() {
  const [requests, setRequests] = useState<any[]>([])
  const [manual,   setManual]   = useState<any[]>([])
  const [indents,  setIndents]  = useState<any[]>([])
  const [chemicals, setChemicals] = useState<any[]>([])
  const [labNos,   setLabNos]   = useState<string[]>([])     // Lab Nos already on orders, for the suggestion list
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [form,     setForm]     = useState<Form | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')
  const perm = usePermission('/lab')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reqRes, indRes, recRes, chemRes, ordRes] = await Promise.all([
        labApi({ type: 'requests' }),
        labApi({ type: 'indents' }),
        labApi({ type: 'recipes' }),
        fetch('/api/colour-chemicals', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
        fetch('/api/orders?fields=lab_nos', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
      ])
      if (reqRes.ok) setRequests((reqRes.data || []).filter((r: any) => r.fms_data?.recipe?.length > 0))
      if (indRes.ok) setIndents(indRes.data || [])
      if (recRes.ok) setManual(recRes.data || [])
      if (chemRes.ok) setChemicals(chemRes.data || [])
      if (ordRes.ok) setLabNos([...new Set(((ordRes.data || []) as any[]).map(o => String(o.lab_no || '').trim().toUpperCase()).filter(v => v && v !== '-'))].sort())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const indentById = (id: string) => indents.find(ind => ind.id === id)

  const q = search.trim().toLowerCase()
  const hit = (vals: any[]) => !q || vals.some(v => String(v ?? '').toLowerCase().includes(q))
  const manualShown = manual.filter(m => hit([m.lab_no, m.party, m.shade, m.article, m.remarks, ...(m.recipe || []).map((i: any) => i.name)]))
  const flowShown = requests.filter(r => hit([r.id, r.party, r.shade_pantone, r.fms_data?.chartNumber, r.fms_data?.approvedLabNumber,
    ...(r.fms_data?.recipe || []).map((i: any) => i.name)]))

  // ── Add / edit a manual recipe ───────────────────────────────────────────
  const openNew = () => setForm({ ...EMPTY, rows: [{ name: '', qty: '' }] })
  const openEdit = (m: any) => setForm({ id: m.id, labNo: m.lab_no, party: m.party || '', shade: m.shade || '', article: m.article || '',
    remarks: m.remarks || '', rows: (m.recipe || []).length ? m.recipe.map((i: any) => ({ name: i.name, qty: i.qty || '' })) : [{ name: '', qty: '' }] })
  const setRow = (i: number, k: keyof Ing, v: string) => setForm(f => f && ({ ...f, rows: f.rows.map((r, j) => j === i ? { ...r, [k]: v } : r) }))
  const addRow = () => setForm(f => f && ({ ...f, rows: [...f.rows, { name: '', qty: '' }] }))
  const removeRow = (i: number) => setForm(f => f && ({ ...f, rows: f.rows.filter((_, j) => j !== i) }))

  const save = async () => {
    if (!form) return
    const labNo = form.labNo.trim().toUpperCase()
    if (!labNo) { alert('Enter the Lab No.'); return }
    const rows = form.rows.map(r => ({ name: r.name.trim(), qty: r.qty.trim() })).filter(r => r.name)
    if (!rows.length) { alert('Add at least one colour / chemical.'); return }
    setSaving(true)
    try {
      const body = { action: 'save_recipe', id: form.id, labNo, party: form.party, shade: form.shade, article: form.article, remarks: form.remarks, recipe: rows }
      let res = await labPost(body)
      if (!res.ok && res.exists) {
        if (!confirm(`${labNo} already has a recipe — replace it?`)) return
        res = await labPost({ ...body, replace: true })
      }
      if (!res.ok) { alert('Not saved: ' + (res.error || 'Unknown error')); return }
      showToast(`✓ Recipe saved for ${labNo}`)
      setForm(null); load()
    } finally { setSaving(false) }
  }

  const remove = async (m: any) => {
    if (!confirm(`Delete the recipe of ${m.lab_no}?`)) return
    const res = await labPost({ action: 'delete_recipe', id: m.id })
    if (!res.ok) { alert('Not deleted: ' + (res.error || 'Unknown error')); return }
    showToast(`Recipe of ${m.lab_no} deleted`); load()
  }

  // Only blank the page on the true first load; actions here call load()
  // again afterward, which would otherwise wipe the whole page every time.
  if (loading && requests.length === 0 && manual.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  const Chips = ({ list }: { list: any[] }) => (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {(list || []).map((ing: any, idx: number) => (
        <span key={idx} style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 6, background: '#6A1B9A', color: '#fff' }}>
          {ing.name}{ing.qty ? ` (${ing.qty})` : ''}
        </span>
      ))}
    </div>
  )
  const total = manual.length + requests.length

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      {toast && <div style={{ position: 'fixed', top: 60, right: 20, zIndex: 1000, background: 'var(--success)', color: '#fff',
        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>{toast}</div>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <StatCard label="Recipes" value={total} color="var(--purple)" />
        <StatCard label="By Lab No." value={manual.length} color="var(--accent)" />
        <StatCard label="From Lab Requests" value={requests.length} color="var(--text-tertiary)" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search lab no, party, shade, chemical…"
          style={{ width: 260, padding: '6px 10px', fontSize: 12, marginLeft: 'auto',
            border: '1px solid var(--border-medium)', borderRadius: 5,
            background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
        {search && <button className="xs" onClick={() => setSearch('')}>✕</button>}
        <button className="small" onClick={load}>⟳</button>
        {perm.canEdit && <button className="small primary" onClick={openNew}>➕ Add Recipe</button>}
      </div>

      {/* ── Manual recipes by Lab No. ── */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'auto', marginBottom: 16 }}>
        <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
          borderBottom: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
          Recipes by Lab No. · {manualShown.length}
        </div>
        {manualShown.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 28, color: 'var(--text-tertiary)', fontSize: 13 }}>
            {manual.length === 0 ? 'No recipes added yet — click "➕ Add Recipe" and enter a Lab No. with its recipe.' : 'No recipe matches your search.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>{['Lab No.', 'Party', 'Shade / Colour', 'Article', 'Recipe', 'Remarks', 'Updated', 'By', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {manualShown.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontWeight: 800, color: 'var(--accent)', fontSize: 13 }}>{m.lab_no}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{m.party || '-'}</td>
                  <td style={td}>{m.shade || '-'}</td>
                  <td style={td}>{m.article || '-'}</td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 200, cursor: perm.canEdit ? 'pointer' : undefined }}
                    title={perm.canEdit ? 'Click to edit' : undefined} onClick={() => perm.canEdit && openEdit(m)}>
                    <Chips list={m.recipe} />
                  </td>
                  <td style={{ ...td, whiteSpace: 'normal', maxWidth: 220, color: 'var(--text-secondary)' }}>{m.remarks || '-'}</td>
                  <td style={{ ...td, color: 'var(--text-tertiary)' }}>{fmtDateTime(m.updated_at || m.created_at)}</td>
                  <td style={{ ...td, color: 'var(--text-tertiary)' }}>{m.updated_by || m.created_by || '-'}</td>
                  <td style={td}>
                    {perm.canEdit && <button className="xs" onClick={() => openEdit(m)}>Edit</button>}
                    {perm.isAdmin && <button className="xs danger" style={{ marginLeft: 4 }} onClick={() => remove(m)}>Del</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Recipes from the lab request flow ── */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'auto' }}>
        <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
          borderBottom: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
          Recipes from Lab Requests · {flowShown.length}
        </div>
        {flowShown.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 28, color: 'var(--text-tertiary)', fontSize: 13 }}>
            {requests.length === 0 ? 'No lab request recipes yet. Add one on the Approved Lab page.' : 'No recipes match your search.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1300, fontSize: 11 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Chart No','Request No','Indent No','Date','Unit','Party','Request Given By','Order Status','Branch',
                  'Shade/Pantone','Fastness','Approved Lab No','Recipe','L*','a*','b*','ΔE','Delivery'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {flowShown.map((r, i) => {
                const fd = r.fms_data || {}
                return (
                <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ ...td, fontWeight: 800, color: 'var(--accent)', fontSize: 13 }}>{fd.chartNumber || '-'}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.id}</td>
                  <td style={td}>{r.indent_id || '-'}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(r.confirmed_at || r.created_at)}</td>
                  <td style={td}>{r.unit || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.party || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.request_given_by || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.order_status || '-'}</td>
                  <td style={td}>{indentById(r.indent_id)?.branch || '-'}</td>
                  <td style={td}>{r.shade_pantone || '-'}</td>
                  <td style={td}>{r.fastness_type || '-'}</td>
                  <td style={td}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--success)', color: '#fff' }}>{fd.approvedLabNumber || '-'}</span>
                  </td>
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 160 }}><Chips list={fd.recipe} /></td>
                  <td style={td}>{fd.lValue || '-'}</td>
                  <td style={td}>{fd.aValue || '-'}</td>
                  <td style={td}>{fd.bValue || '-'}</td>
                  <td style={{ ...td, fontWeight: 700, color: parseFloat(fd.deValue) <= 1 ? 'var(--success)' : 'var(--warning)' }}>{fd.deValue || '-'}</td>
                  <td style={td}>{fd.deliveryDate || '-'}</td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add / edit window ── */}
      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{form.id ? `Recipe — ${form.labNo}` : '➕ Add Recipe'}</span>
              <button className="small" onClick={() => setForm(null)}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <label style={lbl}>Lab No. *
                <input list="order-lab-nos" value={form.labNo} autoFocus={!form.id} placeholder="e.g. HF-5459"
                  onChange={e => setForm(f => f && ({ ...f, labNo: e.target.value.toUpperCase() }))} style={inp} />
                <datalist id="order-lab-nos">{labNos.map(v => <option key={v} value={v} />)}</datalist>
              </label>
              <label style={lbl}>Party<input value={form.party} onChange={e => setForm(f => f && ({ ...f, party: e.target.value }))} style={inp} /></label>
              <label style={lbl}>Shade / Colour<input value={form.shade} onChange={e => setForm(f => f && ({ ...f, shade: e.target.value }))} style={inp} /></label>
              <label style={lbl}>Article<input value={form.article} onChange={e => setForm(f => f && ({ ...f, article: e.target.value }))} style={inp} /></label>
              <label style={{ ...lbl, gridColumn: '1 / -1' }}>Remarks<input value={form.remarks} onChange={e => setForm(f => f && ({ ...f, remarks: e.target.value }))} style={inp} /></label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              <div style={{ flex: 1 }}>Colour / Chemical</div>
              <div style={{ width: 100 }}>Qty</div>
              <div style={{ width: 28 }} />
            </div>
            {form.rows.map((row, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input list="chemical-master-list" value={row.name} placeholder="Select or type…"
                  onChange={e => setRow(idx, 'name', e.target.value)}
                  style={{ flex: 1, padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-medium)', borderRadius: 6 }} />
                <input value={row.qty} placeholder="e.g. 5 g/l" onChange={e => setRow(idx, 'qty', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && idx === form.rows.length - 1) { e.preventDefault(); addRow() } }}
                  style={{ width: 100, padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-medium)', borderRadius: 6 }} />
                <button className="xs" onClick={() => removeRow(idx)} disabled={form.rows.length === 1}
                  style={{ opacity: form.rows.length === 1 ? 0.3 : 1 }}>✕</button>
              </div>
            ))}
            <datalist id="chemical-master-list">
              {chemicals.map((c: any) => <option key={c.id} value={c.name} />)}
            </datalist>
            <button className="small" onClick={addRow} style={{ marginBottom: 14 }}>+ Add Another</button>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)}>Cancel</button>
              <button className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : '✓ Save Recipe'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '7px 10px', fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap' }
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }
const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-medium)', borderRadius: 6, fontWeight: 400, textTransform: 'none', color: 'var(--text-primary)', background: 'var(--bg-primary)' }
