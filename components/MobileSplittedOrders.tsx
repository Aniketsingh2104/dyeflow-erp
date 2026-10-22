'use client'
// Phone layout of Splitted Orders: one card per batch with the Sub Prod No.
// box (Excel-like, Enter moves to the next card), status, machines per
// process, and Done / Delete / FMS actions.
import { useState } from 'react'
import Link from 'next/link'
import { SubProdEdit } from '@/components/SubProd'
import { isBatchFinished } from '@/lib/batchStatus'

const STATUS: Record<string, [string, string, string]> = {
  pending: ['#FEF3C7', '#92400E', 'Pending'], 'in-process': ['#DBEAFE', '#1E40AF', 'In process'], done: ['#DCFCE7', '#166534', 'Done'],
  faulty: ['#FEE2E2', '#991B1B', 'Faulty'], repairing: ['#FEF3C7', '#D97706', 'Repairing'], 'written-off': ['var(--bg-secondary)', 'var(--text-tertiary)', 'Written off'], hold: ['#FEE2E2', '#991B1B', 'On hold'],
}

export default function MobileSplittedOrders({ rows, total, canEdit, onSubProd, onDone, onDelete, onRefresh, toast }: {
  rows: any[]; total: number; canEdit: boolean
  onSubProd: (row: any, v: string | null) => void
  onDone: (row: any) => void; onDelete: (row: any) => void; onRefresh: () => void
  toast: { msg: string; err?: boolean } | null
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'all' | 'nosub' | 'active' | 'done'>('all')
  const s = q.trim().toLowerCase()
  const list = rows.filter(r => (tab === 'all' || (tab === 'nosub' && !r.sub_prod_no) || (tab === 'active' && !isBatchFinished(r)) || (tab === 'done' && isBatchFinished(r)))
    && (!s || [r.batch_id, r.sub_prod_no, r.order_number, r.party, r.article, r.color, r.lab_no].some(v => String(v || '').toLowerCase().includes(s))))
  const noSub = rows.filter(r => !r.sub_prod_no).length

  return (
    <div style={{ padding: '10px 10px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 800 }}>Splitted Orders <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>{total} batches</span></div>
        <button className="small" onClick={onRefresh} style={{ minWidth: 40 }}>⟳</button>
      </div>
      {toast && <div style={{ borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 13, fontWeight: 600, background: toast.err ? 'var(--danger-light)' : 'var(--success-light)', color: toast.err ? 'var(--danger)' : 'var(--success)' }}>{toast.msg}</div>}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6 }}>
        {([['all', `All (${rows.length})`], ['nosub', `No Sub Prod (${noSub})`], ['active', 'Active'], ['done', 'Done']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', border: '1px solid var(--border-medium)',
            background: tab === k ? '#2D3748' : 'var(--bg-primary)', color: tab === k ? '#fff' : 'var(--text-secondary)' }}>{label}</button>
        ))}
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search batch, sub prod, order, party…" style={{ width: '100%', marginBottom: 10, borderRadius: 10 }} />

      {list.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>No batches here.</div>}
      {list.map(r => {
        const isOpen = open === r.id
        const st = STATUS[r.is_faulty ? 'faulty' : r.status] || ['var(--bg-secondary)', 'var(--text-secondary)', r.status]
        const edge = r.is_faulty ? '#DC2626' : r.status === 'done' ? '#16A34A' : r.status === 'in-process' ? '#3B82F6' : '#CBD5E1'
        return (
          <div key={r.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderLeft: `5px solid ${edge}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px' }}>
              <div onClick={() => setOpen(isOpen ? null : r.id)} style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.batch_id}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.order_number} · {r.party}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.article} · <strong>{r.color}</strong></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{r.kg} <span style={{ fontSize: 11, fontWeight: 500 }}>Kg</span></div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: st[0], color: st[1] }}>{st[2]}{r.current_process ? ` · ${r.current_process}` : ''}</span>
                </div>
              </div>
              {/* Sub Prod No. — always a box, Enter / ↓ moves to the next card */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Sub Prod</span>
                <SubProdEdit batchId={r.id} value={r.sub_prod_no} canEdit={canEdit} onSaved={v => onSubProd(r, v)} style={{ flex: 1, width: 'auto', minHeight: 40, fontSize: 15 }} />
                <span onClick={() => setOpen(isOpen ? null : r.id)} style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: 6 }}>{isOpen ? '▲' : '▼'}</span>
              </div>
              {(r.machine_lines || []).length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {r.machine_lines.map((l: any) => <span key={l.code} style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: 'var(--purple-light)', color: 'var(--purple)' }}>{l.code ? l.code + ' ' : ''}{l.names.join(', ')}</span>)}
                </div>
              )}
            </div>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border-light)', padding: '10px 12px', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', fontSize: 13, marginBottom: 10 }}>
                  {[['Mtr', r.mtr], ['Taka', r.taka], ['Lab No.', r.lab_no], ['Lot', r.lot_no], ['Challan', r.challan_no], ['Blend', r.blend], ['Width', r.width], ['GSM', r.gsm],
                    ['Supervisor', r.supervisor], ['Order kg', r.order_qty_kg]].map(([k, v]) => (
                    <div key={String(k)}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{k} </span><strong>{String(v ?? '-')}</strong></div>
                  ))}
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Route </span>{(r.process_route || []).join(' → ')}</div>
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Finish </span>{r.type_of_finish} · <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Packing </span>{r.type_of_packing}</div>
                </div>
                {canEdit && (
                  <div className="edit-only" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {r.current_process && <Link href={`/fms/${r.current_process}`} style={{ ...btn, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)' }}>FMS →</Link>}
                    {r.status !== 'done' && r.current_process && <button onClick={() => onDone(r)} style={{ ...btn, background: 'var(--success)', color: '#fff' }}>✓ Done</button>}
                    {!isBatchFinished(r) && r.status !== 'in-process' && <button onClick={() => onDelete(r)} style={{ ...btn, gridColumn: '1 / -1', background: 'var(--danger-light)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>🗑 Delete batch</button>}
                  </div>
                )}
                <Link href={`/batches/${encodeURIComponent(r.batch_id)}`} style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Batch trace →</Link>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const btn: React.CSSProperties = { minHeight: 44, fontSize: 14, fontWeight: 800, borderRadius: 8, border: 'none' }
