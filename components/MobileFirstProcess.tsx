'use client'
// Phone layout of the First Process page: one card per batch waiting to be
// sent; tap to select, one big "Send" button. Same rules as desktop (a batch
// with no planned date cannot be sent).
import { useState } from 'react'
import { SubProdTag } from '@/components/SubProd'
import { getCollabInfo } from '@/lib/collab'

type Urg = { status: 'overdue' | 'due_soon' | 'on_track' | 'no_date'; daysDiff: number | null; label: string }

export default function MobileFirstProcess({ rows, allBatches, selected, setSelected, sending, urgency, onSend, onRefresh }: {
  rows: any[]; allBatches: any[]
  selected: Set<string>; setSelected: (s: Set<string>) => void
  sending: boolean
  urgency: (raw: string | null) => Urg
  onSend: () => void; onRefresh: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'all' | 'overdue' | 'due_soon' | 'no_date'>('all')
  const s = q.trim().toLowerCase()
  const list = rows.filter(b => (tab === 'all' || urgency(b.planned_date_raw).status === tab)
    && (!s || [b.batch_id, b.sub_prod_no, b.order_number, b.party, b.article, b.color, b.lab_no].some(v => String(v || '').toLowerCase().includes(s))))
  const n = (st: string) => rows.filter(b => urgency(b.planned_date_raw).status === st).length
  const canPick = (b: any) => !!b.planned_date && b.planned_date !== '-'
  const toggle = (b: any) => { if (!canPick(b)) return; const nx = new Set(selected); nx.has(b.id) ? nx.delete(b.id) : nx.add(b.id); setSelected(nx) }
  const selectAllShown = () => setSelected(new Set(list.filter(canPick).map(b => b.id)))
  const EDGE = { overdue: '#DC2626', due_soon: '#F59E0B', on_track: '#16A34A', no_date: '#9CA3AF' }
  const TINT = { overdue: ['#FEE2E2', '#991B1B'], due_soon: ['#FEF3C7', '#92400E'], on_track: ['#DCFCE7', '#166534'], no_date: ['var(--bg-secondary)', 'var(--text-tertiary)'] }

  return (
    <div style={{ padding: '10px 10px 90px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>First Process <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>{rows.length} waiting</span></div>
        </div>
        <button className="small" onClick={selectAllShown} style={{ minHeight: 36 }}>Select all</button>
        <button className="small" onClick={onRefresh} style={{ minWidth: 40 }}>⟳</button>
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6 }}>
        {([['all', `All (${rows.length})`], ['overdue', `🔴 Overdue (${n('overdue')})`], ['due_soon', `🟡 Due soon (${n('due_soon')})`], ['no_date', `⚠ No date (${n('no_date')})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', border: '1px solid var(--border-medium)',
            background: tab === k ? '#2D3748' : 'var(--bg-primary)', color: tab === k ? '#fff' : 'var(--text-secondary)' }}>{label}</button>
        ))}
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search batch, sub prod, order, party…" style={{ width: '100%', marginBottom: 10, borderRadius: 10 }} />

      {list.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>Nothing waiting here.</div>}
      {list.map(b => {
        const u = urgency(b.planned_date_raw); const isOpen = open === b.id; const on = selected.has(b.id); const ok = canPick(b)
        const collab = getCollabInfo(b, b.first_process, allBatches)
        return (
          <div key={b.id} style={{ background: on ? '#EFF6FF' : 'var(--bg-primary)', border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border-light)'), borderLeft: `5px solid ${EDGE[u.status]}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <div onClick={() => toggle(b)} style={{ width: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border-light)', opacity: ok ? 1 : 0.35 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, border: '2px solid ' + (on ? 'var(--accent)' : 'var(--border-medium)'), background: on ? 'var(--accent)' : 'var(--bg-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{on ? '✓' : ''}</div>
              </div>
              <div onClick={() => setOpen(isOpen ? null : b.id)} style={{ flex: 1, minWidth: 0, padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.batch_id}<SubProdTag value={b.sub_prod_no} />
                      {collab.hasCollab && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8, background: '#DBEAFE', color: '#1E40AF' }}>COLLAB</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.order_number} · {b.party}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.article} · <strong>{b.color}</strong></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{b.qty_kg} <span style={{ fontSize: 11, fontWeight: 500 }}>Kg</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{b.machine}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                  <span style={pill('#E0E7FF', '#3730A3')}>→ {b.first_process || '?'}</span>
                  <span style={pill(TINT[u.status][0], TINT[u.status][1])}>📅 {u.status === 'no_date' ? 'No date — generate in Date Calculator' : u.status === 'on_track' ? u.label : `${b.planned_date} · ${u.label}`}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>
            </div>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border-light)', padding: '10px 12px', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', fontSize: 13 }}>
                  {[['Lab No.', b.lab_no], ['Lot', b.lot_no], ['Challan', b.challan_no], ['Blend', b.blend], ['Width', b.width], ['GSM', b.gsm], ['Mtr', b.qty_mtr], ['Taka', b.no_of_taka],
                    ['Supervisor', b.supervisor], ['Delivery', b.delivery_date]].map(([k, v]) => (
                    <div key={String(k)}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{k} </span><strong>{String(v ?? '-')}</strong></div>
                  ))}
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Route </span>{(b.route || []).join(' → ')}</div>
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Finish </span>{b.type_of_finish}</div>
                  {b.remarks && b.remarks !== '-' && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Remarks </span>{b.remarks}</div>}
                  {collab.hasCollab && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Collab with </span>{collab.partners.map((p: any) => p.batchId).join(', ')}</div>}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* send bar */}
      <div className="edit-only" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '10px 12px', background: 'var(--bg-primary)', borderTop: '1px solid var(--border-light)', zIndex: 50 }}>
        <button onClick={onSend} disabled={sending || selected.size === 0}
          style={{ width: '100%', minHeight: 48, fontSize: 16, fontWeight: 800, border: 'none', borderRadius: 10, background: selected.size ? 'var(--accent)' : 'var(--bg-secondary)', color: selected.size ? '#fff' : 'var(--text-tertiary)' }}>
          {sending ? 'Sending…' : selected.size ? `▶ Send ${selected.size} batch${selected.size > 1 ? 'es' : ''} to first process` : 'Select batches to send'}
        </button>
      </div>
    </div>
  )
}

const pill = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: bg, color: fg, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' })
