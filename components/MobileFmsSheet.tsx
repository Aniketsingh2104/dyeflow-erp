'use client'
// Phone layout of an FMS process sheet: one card per batch with Done / Faulty /
// FOB / Rollback. Same rows and actions as the desktop table.
import { useState } from 'react'
import Link from 'next/link'
import { SubProdTag } from '@/components/SubProd'
import { getUrgency } from '@/lib/dateUrgency'
import { sameCode } from '@/lib/processCodes'
import { getCollabInfo } from '@/lib/collab'

export default function MobileFmsSheet({ processCode, rows, allBatches, saving, now, delay, canEdit, counts, search, setSearch,
  onDone, onFaulty, onFob, onRollback, onRefresh, fmt }: {
  processCode: string
  rows: any[]
  allBatches: any[]
  saving: boolean
  now: Date
  delay: (planned: string, actual: string, now: Date) => { text: string; late: boolean }
  canEdit: boolean
  counts: { overdue: number; dueSoon: number }
  search: string; setSearch: (v: string) => void
  onDone: (row: any) => void
  onFaulty: (row: any) => void
  onFob: (row: any) => void
  onRollback: (row: any) => void
  onRefresh: () => void
  fmt: (d: any) => string
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [tab, setTab] = useState<'open' | 'done' | 'all'>('open')
  const list = rows.filter(r => tab === 'all' ? true : tab === 'done' ? r.bpStatus !== 'pending' || r.hasFob : r.bpStatus === 'pending' && !r.hasFob)
  const openCount = rows.filter(r => r.bpStatus === 'pending' && !r.hasFob).length

  return (
    <div style={{ padding: '10px 10px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{processCode}-FMS <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>{rows.length} batches</span></div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {counts.overdue > 0 && <span style={pill('var(--danger)', '#fff')}>🔴 {counts.overdue} missed</span>}
            {counts.dueSoon > 0 && <span style={pill('#FEF3C7', '#7C2D12')}>🟡 {counts.dueSoon} due soon</span>}
          </div>
        </div>
        <button className="small" onClick={onRefresh} style={{ minWidth: 40 }}>⟳</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {([['open', `Open (${openCount})`], ['done', `Done (${rows.length - openCount})`], ['all', 'All']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: 9, borderRadius: 20, fontSize: 13, fontWeight: 700, border: '1px solid var(--border-medium)',
            background: tab === k ? '#2D3748' : 'var(--bg-primary)', color: tab === k ? '#fff' : 'var(--text-secondary)' }}>{label}</button>
        ))}
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search batch, sub prod, order, party…"
        style={{ width: '100%', marginBottom: 10, borderRadius: 10 }} />

      {list.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>Nothing here.</div>}

      {list.map(row => {
        const isOpen = open === row.id
        const isDone = row.bpStatus === 'done', isFaulty = row.bpStatus === 'faulty', hasFob = row.hasFob
        const anyDone = isDone || isFaulty || hasFob || row.status === 'reprocessed'
        const running = sameCode(row.current_process, processCode) && row.status === 'in-process' && !row.is_faulty
        const urg = row.bpStatus === 'pending' ? getUrgency(row.plannedDate).status : ''
        const d = delay(row.plannedDate, row.actualDate, now)
        const collab = getCollabInfo(row, processCode, allBatches)
        const edge = isDone ? '#16A34A' : isFaulty ? '#DC2626' : hasFob ? '#7C3AED' : urg === 'overdue' ? '#DC2626' : urg === 'due_soon' ? '#F59E0B' : '#3B82F6'
        return (
          <div key={row.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderLeft: `5px solid ${edge}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => setOpen(isOpen ? null : row.id)} style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.batch_id}<SubProdTag value={row.sub_prod_no} />
                    {row.status === 'reprocessed' && row.reprocessed_to && <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)' }}>⟳ Reprocessed → {row.reprocessed_to}</span>}
                    {collab.hasCollab && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8, background: '#DBEAFE', color: '#1E40AF' }}>COLLAB</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.orderNo} · {row.party}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.article} · <strong>{row.color}</strong></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{row.kg} <span style={{ fontSize: 11, fontWeight: 500 }}>Kg</span></div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{row.machineName}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                {isDone ? <span style={pill('#DCFCE7', '#16A34A')}>✓ Done {row.actualDate ? fmt(row.actualDate) : ''}</span>
                  : isFaulty ? <span style={pill('#FEE2E2', '#DC2626')}>⚠ Faulty</span>
                  : hasFob ? <span style={pill('#F3E8FF', '#7C3AED')}>FOB sent</span>
                  : <span style={pill(urg === 'overdue' ? '#FEE2E2' : urg === 'due_soon' ? '#FEF3C7' : '#DBEAFE', urg === 'overdue' ? '#991B1B' : urg === 'due_soon' ? '#92400E' : '#1E40AF')}>
                      📅 {row.plannedDate ? fmt(row.plannedDate) : 'no date'}{urg === 'overdue' ? ' · missed' : urg === 'due_soon' ? ' · due soon' : ''}
                    </span>}
                {d.text !== '-' && <span style={pill('var(--bg-secondary)', d.late ? 'var(--danger)' : 'var(--success)')}>⏱ {d.text}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border-light)', padding: '10px 12px', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', fontSize: 13, marginBottom: 10 }}>
                  {[['Arrived', fmt(row.sentAt)], ['Lab No.', row.lab_no], ['Lot', row.lot_no], ['Challan', row.challan_no], ['Mtr', row.qty_mtr], ['Taka', row.no_of_taka],
                    ['Blend', row.blend], ['GSM', row.gsm], ['Supervisor', row.supervisorName], ['Delivery', row.delivery_date]].map(([k, v]) => (
                    <div key={String(k)}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{k} </span><strong>{String(v ?? '-')}</strong></div>
                  ))}
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Finish </span>{row.type_of_finish}</div>
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Route </span>{row.routeStr}</div>
                  {row.remarks && row.remarks !== '-' && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Remarks </span>{row.remarks}</div>}
                  {collab.hasCollab && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Collab with </span>{collab.partners.map((p: any) => p.batchId).join(', ')}</div>}
                </div>
                {canEdit && (
                  <div className="edit-only" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={() => !anyDone && onDone(row)} disabled={anyDone || saving}
                      style={{ ...btn, gridColumn: anyDone ? undefined : '1 / -1', background: isDone ? '#DCFCE7' : anyDone ? '#F3F4F6' : '#16A34A', color: isDone ? '#16A34A' : anyDone ? '#9CA3AF' : '#fff' }}>
                      {isDone ? '✓ Done' : '✓ Mark Done'}
                    </button>
                    <button onClick={() => !anyDone && onFaulty(row)} disabled={anyDone || saving}
                      style={{ ...btn, background: isFaulty ? '#FEE2E2' : 'var(--bg-primary)', color: anyDone && !isFaulty ? '#9CA3AF' : '#DC2626', border: `1px solid ${anyDone && !isFaulty ? '#E5E7EB' : '#DC2626'}` }}>
                      {isFaulty ? '⚠ Faulty' : '⚠ Faulty'}
                    </button>
                    <button onClick={() => !anyDone && onFob(row)} disabled={anyDone || saving}
                      style={{ ...btn, background: hasFob ? '#F3E8FF' : 'var(--bg-primary)', color: anyDone && !hasFob ? '#9CA3AF' : '#7C3AED', border: `1px solid ${anyDone && !hasFob ? '#E5E7EB' : '#7C3AED'}` }}>
                      {hasFob ? '✓ FOB' : '+ FOB'}
                    </button>
                    {running && !anyDone && (
                      <button onClick={() => onRollback(row)} disabled={saving} style={{ ...btn, gridColumn: '1 / -1', background: 'var(--bg-primary)', color: '#DC2626', border: '1px solid #DC2626' }}>
                        ↩ Roll back to previous process
                      </button>
                    )}
                  </div>
                )}
                <Link href={`/batches/${encodeURIComponent(row.batch_id)}`} style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Batch trace →</Link>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const pill = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: bg, color: fg, whiteSpace: 'nowrap' })
const btn: React.CSSProperties = { minHeight: 44, fontSize: 14, fontWeight: 800, borderRadius: 8, border: 'none' }
