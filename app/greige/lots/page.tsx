'use client'
// Greige Lots — view and manage lots per greige entry
import { useEffect, useState, useCallback } from 'react'

async function greigeApi(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`/api/greige${qs}`, { cache: 'no-store' })
  return res.json()
}
async function greigePost(body: Record<string, any>) {
  const res = await fetch('/api/greige', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export default function GreigeLotsPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [lots,    setLots]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState('')
  const [addModal, setAddModal] = useState<any>(null) // entry
  const [lotForm,  setLotForm]  = useState({ lotNumber: '', meters: '' })
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [entriesRes, lotsRes] = await Promise.all([
        greigeApi(),
        greigeApi({ type: 'lots' }),
      ])
      if (entriesRes.ok) setEntries(entriesRes.data || [])
      if (lotsRes.ok)    setLots(lotsRes.data    || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const entryLots = (entryId: string) => lots.filter(l => l.entry_id === entryId)

  const filtered = search.trim()
    ? entries.filter(e => [e.party, e.challan_no]
        .some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
    : entries

  const addLot = async () => {
    if (!lotForm.lotNumber.trim()) { alert('Lot number is required'); return }
    if (!addModal) return
    setSaving(true)
    try {
      const res = await greigePost({
        action: 'create_lot',
        entryId: addModal.id,
        lotNumber: lotForm.lotNumber.trim(),
        meters: lotForm.meters,
      })
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast('✓ Lot added')
      setAddModal(null)
      setLotForm({ lotNumber: '', meters: '' })
      load()
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div className="content" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Greige Lots</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search party / challan…"
            style={{ width: 200, padding: '6px 10px', fontSize: 12,
              border: '1px solid var(--border-medium)', borderRadius: 5,
              background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          {search && <button className="xs" onClick={() => setSearch('')}>✕</button>}
          <button className="small" onClick={load}>⟳</button>
        </div>
      </div>

      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)', fontSize: 14 }}>
          No greige entries yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(e => {
            const eLots = entryLots(e.id)
            return (
              <div key={e.id} style={{ background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{e.challan_no}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 8 }}>{e.party}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                      {e.no_of_taka} taka · {eLots.length} lot{eLots.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button className="xs primary" onClick={() => { setAddModal(e); setLotForm({ lotNumber: '', meters: '' }) }}>
                    + Add Lot
                  </button>
                </div>
                {eLots.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>
                    ⚠ No lots added yet
                    {!e.lot_done_at && ' — must be done within 6 hours of entry'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {eLots.map(lot => (
                      <span key={lot.id} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px',
                        background: lot.status === 'done' ? 'var(--success-light)' : 'var(--accent-light)',
                        color: lot.status === 'done' ? 'var(--success)' : 'var(--accent)',
                        borderRadius: 6, border: `1px solid ${lot.status === 'done' ? 'var(--success)' : 'var(--accent)'}` }}>
                        {lot.lot_number} {lot.meters ? `· ${lot.meters}m` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {addModal && (
        <div className="modal-overlay" onClick={() => setAddModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Lot — {addModal.challan_no}</span>
              <button className="small" onClick={() => setAddModal(null)}>✕</button>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
              {addModal.party} · {addModal.no_of_taka} taka
            </div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label>Lot Number *</label>
                <input value={lotForm.lotNumber} placeholder="e.g. LOT-001" autoFocus
                  onChange={e => setLotForm(p => ({ ...p, lotNumber: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Metres</label>
                <input type="number" min="0" step="0.1" value={lotForm.meters}
                  onChange={e => setLotForm(p => ({ ...p, meters: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={addLot} disabled={saving}>
                {saving ? 'Saving…' : '✓ Add Lot'}
              </button>
              <button onClick={() => setAddModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
