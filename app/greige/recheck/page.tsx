'use client'
// Greige Recheck — entries where lots have been rechecked/rejected
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

export default function GreigeRecheckPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [lots,    setLots]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState('')
  const [saving,  setSaving]  = useState(false)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [entriesRes, lotsRes] = await Promise.all([
        greigeApi(),
        greigeApi({ type: 'lots' }),
      ])
      const allLots = lotsRes.data || []
      setLots(allLots)
      // Show entries that have at least one rejected/recheck lot
      const recheckEntries = (entriesRes.data || []).filter((e: any) =>
        allLots.some((l: any) => l.entry_id === e.id && l.status === 'recheck')
      )
      setEntries(recheckEntries)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const markResolved = async (lotId: string) => {
    setSaving(true)
    try {
      await greigePost({ action: 'update_lot', id: lotId, status: 'done', notes: 'Recheck resolved' })
      showToast('✓ Marked resolved')
      load()
    } finally { setSaving(false) }
  }

  const markRecheck = async (lotId: string) => {
    setSaving(true)
    try {
      await greigePost({ action: 'update_lot', id: lotId, status: 'recheck' })
      showToast('✓ Marked for recheck')
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
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Greige Recheck</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Lots marked for recheck inspection
          </div>
        </div>
        <button className="small" onClick={load}>⟳ Refresh</button>
      </div>

      {toast && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)',
          border: '1px solid var(--success)', borderRadius: 8, padding: '8px 14px',
          marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--success)', fontSize: 15, fontWeight: 600 }}>
          ✓ No entries pending recheck.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map(e => {
            const recheckLots = lots.filter(l => l.entry_id === e.id && l.status === 'recheck')
            return (
              <div key={e.id} style={{ background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px',
                borderLeft: '4px solid var(--warning)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{e.challan_no}</span>
                  <span style={{ fontSize: 13 }}>{e.party}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {recheckLots.length} lot{recheckLots.length !== 1 ? 's' : ''} for recheck
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {recheckLots.map(lot => (
                    <div key={lot.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                      background: 'var(--warning-light)', border: '1px solid var(--warning)',
                      borderRadius: 8, padding: '8px 12px' }}>
                      <span style={{ fontWeight: 700 }}>{lot.lot_number}</span>
                      {lot.meters && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{lot.meters}m</span>}
                      {lot.notes && <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>{lot.notes}</span>}
                      <button className="xs" style={{ background: 'var(--success)', color: '#fff',
                        border: 'none', cursor: 'pointer', fontWeight: 600 }}
                        disabled={saving} onClick={() => markResolved(lot.id)}>
                        ✓ Resolved
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
