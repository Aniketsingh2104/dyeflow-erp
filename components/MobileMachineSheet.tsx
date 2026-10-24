'use client'
// Phone layout of the machine sheet: one card per batch row (a batch shows once
// per process it runs here). Same data and actions as the desktop table —
// plan number, Done, Faulty, Run Numbering — just laid out for a thumb.
import { useState } from 'react'
import Link from 'next/link'
import { SubProdTag } from '@/components/SubProd'
import { BatchTextCell } from '@/components/BatchTextCell'
import MachineNav from '@/components/MachineNav'

const SHADE_BG: Record<string, string> = { light: '#FEF9C3', medium: '#DBEAFE', dark: '#E0E7FF', 'extra dark': '#1F2937' }

export default function MobileMachineSheet({ machine, rows, canEdit, shadeFilter, setShadeFilter, showDone, setShowDone,
  counts, onPlanNumber, onDone, onFaulty, onRunNumbering, onRefresh }: {
  machine: any
  rows: any[]
  canEdit: boolean
  shadeFilter: string; setShadeFilter: (v: string) => void
  showDone: boolean; setShowDone: (v: boolean) => void
  counts: { total: number; active: number; numbered: number; unnumbered: number; done: number }
  onPlanNumber: (row: any, value: string) => void
  onDone: (row: any) => void
  onFaulty: (row: any) => void
  onRunNumbering: () => void
  onRefresh: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const s = q.trim().toLowerCase()
  const shown = s ? rows.filter(r => [r.batchId, r.subProdNo, r.bookNo, r.planningNo, r.orderNo, r.party, r.color, r.article, r.labNo].some(v => String(v || '').toLowerCase().includes(s))) : rows
  const num = (r: any) => (r.planNumber ? `#${r.planNumber}` : '—')

  return (
    <div style={{ padding: '10px 10px 80px' }}>
      {/* header */}
      <div style={{ background: 'var(--bg-primary)', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#FC8181', color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
            {(machine.name || '').match(/\d+$/)?.[0] ? '#' + (machine.name || '').match(/\d+$/)![0] : (machine.name || 'M').slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{machine.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{machine.capacity ? `${machine.capacity} Kg` : 'no size'} · {counts.active} active · {counts.unnumbered} to number</div>
          </div>
          <button className="small" onClick={onRefresh} style={{ minWidth: 40 }}>⟳</button>
        </div>
        <div style={{ marginTop: 8 }}><MachineNav currentId={machine.id} /></div>
        {canEdit && counts.unnumbered > 0 && (
          <button className="primary" onClick={onRunNumbering} style={{ width: '100%', marginTop: 10, padding: 12, fontSize: 15, fontWeight: 700, background: '#48BB78', borderColor: '#48BB78' }}>
            # Run Numbering ({counts.unnumbered})
          </button>
        )}
      </div>

      {/* filters */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6 }}>
        {['all', 'light', 'medium', 'dark'].map(f => (
          <button key={f} onClick={() => setShadeFilter(f)}
            style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', border: '1px solid var(--border-medium)',
              background: shadeFilter === f ? '#2D3748' : 'var(--bg-primary)', color: shadeFilter === f ? '#fff' : 'var(--text-secondary)' }}>
            {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button onClick={() => setShowDone(!showDone)}
          style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', border: '1px solid var(--border-medium)',
            background: showDone ? '#48BB78' : 'var(--bg-primary)', color: showDone ? '#fff' : 'var(--text-secondary)' }}>
          {showDone ? '✓ ' : ''}Done ({counts.done})
        </button>
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search batch, sub prod, party, colour…"
        style={{ width: '100%', marginBottom: 10, borderRadius: 10 }} />

      {shown.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>No batches here.</div>}

      {shown.map(r => {
        const isOpen = open === r.rowKey
        const shade = String(r.shadeType || '').toLowerCase()
        return (
          <div key={r.rowKey} style={{ background: 'var(--bg-primary)', border: '1px solid ' + (r.faulty ? '#FCA5A5' : 'var(--border-light)'), borderRadius: 12, marginBottom: 10,
            borderLeft: '5px solid ' + (r.procDone ? '#48BB78' : r.faulty ? '#EF4444' : r.atThisProcess ? '#3B82F6' : '#CBD5E1'), overflow: 'hidden' }}>
            <div onClick={() => setOpen(isOpen ? null : r.rowKey)} style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ minWidth: 44, height: 44, borderRadius: 8, background: r.planNumber ? '#1E40AF' : 'var(--bg-secondary)', color: r.planNumber ? '#fff' : 'var(--text-tertiary)',
                  fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{num(r)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.batchId}<SubProdTag value={r.subProdNo} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.party} · {r.article}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{r.kg} <span style={{ fontSize: 11, fontWeight: 500 }}>Kg</span></div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.processName}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: SHADE_BG[shade] || 'var(--bg-secondary)', color: shade === 'extra dark' ? '#fff' : 'var(--text-primary)' }}>{r.color}</span>
                {r.procDone ? <span style={pill('#DCFCE7', '#166534')}>✓ Done</span>
                  : r.faulty ? <span style={pill('#FEE2E2', '#991B1B')}>⚠ Faulty</span>
                  : r.atThisProcess ? <span style={pill('#DBEAFE', '#1E40AF')}>● Running here</span>
                  : <span style={pill('var(--bg-secondary)', 'var(--text-tertiary)')}>{r.current_process ? `at ${r.current_process}` : 'waiting'}</span>}
                {r.plannedDate && <span style={pill('#FEF3C7', '#92400E')}>📅 {r.plannedDate}</span>}
                {r.params && <span style={pill('var(--bg-secondary)', 'var(--text-secondary)')}>{r.params}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border-light)', padding: '10px 12px', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', fontSize: 13, marginBottom: 10 }}>
                  {[['Order', r.orderNo], ['Lab No.', r.labNo], ['Lot', r.lotNo], ['Challan', r.challanNo], ['Mtr', r.qtyMtr || '-'], ['Taka', r.noOfTaka || '-'],
                    ['Supervisor', r.supervisor], ['Sub party', r.subParty]].map(([k, v]) => (
                    <div key={String(k)}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{k} </span><strong>{String(v ?? '-')}</strong></div>
                  ))}
                  <div><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Book No. </span><BatchTextCell batchId={r.id} field="book_no" value={r.bookNo} canEdit={canEdit && !r.procDone} width={120} /></div>
                  <div><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Planning No. </span><BatchTextCell batchId={r.id} field="planning_no" value={r.planningNo} canEdit={canEdit && !r.procDone} width={120} /></div>
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Finish </span>{r.typeOfFinish}</div>
                  {r.remarks && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Remarks </span>{r.remarks}</div>}
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Route </span>{(r.processRoute || []).join(' → ')}</div>
                </div>
                {canEdit && !r.procDone && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
                      No.
                      <input type="number" min={1} defaultValue={r.planNumber || ''} placeholder="-" inputMode="numeric"
                        onBlur={e => { if (e.target.value !== String(r.planNumber || '')) onPlanNumber(r, e.target.value) }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        style={{ width: 80, fontWeight: 800, textAlign: 'center' }} />
                    </label>
                    {r.atThisProcess && (
                      <button onClick={() => onDone(r)} style={{ flex: 1, minHeight: 42, fontSize: 15, fontWeight: 800, border: 'none', borderRadius: 8, background: '#48BB78', color: '#fff' }}>✓ Done</button>
                    )}
                    {!r.faulty && r.current_process && (
                      <button onClick={() => onFaulty(r)} style={{ minHeight: 42, fontSize: 14, fontWeight: 700, borderRadius: 8, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', padding: '0 14px' }}>⚠ Faulty</button>
                    )}
                  </div>
                )}
                <Link href={`/batches/${encodeURIComponent(r.batchId)}`} style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Batch trace →</Link>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const pill = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: bg, color: fg, whiteSpace: 'nowrap' })
