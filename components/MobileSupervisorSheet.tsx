'use client'
// Phone layout of a supervisor's sheet: Inbox orders and the Repair Queue as
// cards. Route + machines are set with the same RouteAssignment box as on
// desktop (it stacks inside the card).
import { useState } from 'react'
import RouteAssignment from '@/app/supervisor/[name]/RouteAssignment'
import { SubProdTag } from '@/components/SubProd'

export default function MobileSupervisorSheet({ name, color, tab, setTab, stats, orders, repairs, search, setSearch,
  onToggle, onUpdate, fmt, repairSaving, onRepairSplit, onRepairFullSplit, onRepairReassign }: {
  name: string; color: string
  tab: string; setTab: (t: string) => void
  stats: { inbox: number; faulty: number }
  orders: any[]; repairs: any[]
  search: string; setSearch: (v: string) => void
  onToggle: (orderId: string, field: string, checked: boolean) => void
  onUpdate: () => void
  fmt: (d: any) => string
  repairSaving: boolean
  onRepairSplit: (r: any) => void; onRepairFullSplit: (r: any) => void; onRepairReassign: (r: any) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const s = search.trim().toLowerCase()
  const hit = (vals: any[]) => !s || vals.some(v => String(v ?? '').toLowerCase().includes(s))
  const list = orders.filter(o => hit([o.orderNumber, o.party, o.article, o.color, o.labNo, o.lotNo, o.challanNo]))
  const rlist = repairs.filter(r => hit([r.batch_id, r.sub_prod_no, r.order_number, r.party, r.article, r.color]))

  const Check = ({ label, on, at, onChange }: { label: string; on: boolean; at?: any; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!on)} style={{ flex: 1, minHeight: 44, borderRadius: 8, fontSize: 12, fontWeight: 700, padding: '4px 6px',
      border: '1px solid ' + (on ? color : 'var(--border-medium)'), background: on ? color : 'var(--bg-primary)', color: on ? '#fff' : 'var(--text-secondary)' }}>
      {on ? '✓ ' : ''}{label}{on && at ? <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.85 }}>{fmt(at)}</div> : null}
    </button>
  )

  return (
    <div style={{ padding: '10px 10px 80px' }}>
      <div style={{ background: color + '12', border: `1px solid ${color}33`, borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color }}>{name}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {([['inbox', `📬 Inbox (${stats.inbox})`], ['faulty', `🔧 Repair (${stats.faulty})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: 10, borderRadius: 20, fontSize: 13, fontWeight: 700, border: '1px solid ' + color,
              background: tab === k ? color : 'var(--bg-primary)', color: tab === k ? '#fff' : color }}>{label}</button>
          ))}
          <button className="small" onClick={onUpdate} style={{ minWidth: 40 }}>⟳</button>
        </div>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order, party, article, colour, lab…"
        style={{ width: '100%', marginBottom: 10, borderRadius: 10 }} />

      {tab === 'inbox' && (list.length === 0
        ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>No orders in the inbox.</div>
        : list.map(o => {
          const isOpen = open === o.id
          const confirmed = !!(o.supervisorConfirmed || o.supervisor_confirmed)
          return (
            <div key={o.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderLeft: `5px solid ${o.holdApproval === 'Hold' ? '#DC2626' : confirmed ? '#16A34A' : color}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
              <div onClick={() => setOpen(isOpen ? null : o.id)} style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.orderNumber}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.party}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.article} · <strong>{o.color}</strong></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{o.qtyKg} <span style={{ fontSize: 11, fontWeight: 500 }}>Kg</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmt(o.timestamp)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                  {o.holdApproval === 'Hold' && <span style={pill('#FEE2E2', '#991B1B')}>⏸ Hold{o.holdReason ? ` · ${o.holdReason}` : ''}</span>}
                  <span style={pill(confirmed ? '#DCFCE7' : '#FEF3C7', confirmed ? '#166534' : '#92400E')}>{confirmed ? '✓ Route confirmed' : 'Route not confirmed'}</span>
                  {(o.processRoute || o.process_route || []).length > 0 && <span style={pill('var(--bg-secondary)', 'var(--text-secondary)')}>{(o.processRoute || o.process_route).join('/')}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border-light)', padding: '10px 12px', background: 'var(--bg-secondary)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', fontSize: 13, marginBottom: 10 }}>
                    {[['Lab No.', o.labNo], ['Lot', o.lotNo], ['Challan', o.challanNo], ['Blend', o.blend], ['Width', o.width], ['GSM', o.gsm], ['Mtr', o.qtyMtr], ['Taka', o.noOfTaka],
                      ['Sub party', o.subParty], ['Sales', o.salesPerson]].map(([k, v]) => (
                      <div key={String(k)}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{k} </span><strong>{String(v || '-')}</strong></div>
                    ))}
                    <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Finish </span>{o.typeOfFinish || '-'} · <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Packing </span>{o.typeOfPacking || '-'}</div>
                    {o.remarks && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Remarks </span>{o.remarks}</div>}
                    {o.greigeRecheckFailReason && <div style={{ gridColumn: '1 / -1', color: '#991B1B' }}><span style={{ fontSize: 11 }}>Greige recheck </span>{o.greigeRecheckFailReason}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <Check label="Lab recheck" on={!!o.labRecheck} at={o.labRecheckAt} onChange={v => onToggle(o.id, 'labRecheck', v)} />
                    <Check label="Lab receive" on={!!o.labReceive} at={o.labReceiveAt} onChange={v => onToggle(o.id, 'labReceive', v)} />
                    <Check label="Greige check" on={!!o.greigeCheck} at={o.greigeCheckAt} onChange={v => onToggle(o.id, 'greigeCheck', v)} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Process route & machines</div>
                  <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: 8, border: '1px solid var(--border-light)' }}>
                    <RouteAssignment order={o} onUpdate={onUpdate} />
                  </div>
                </div>
              )}
            </div>
          )
        }))}

      {tab === 'faulty' && (rlist.length === 0
        ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>No batches waiting in repair.</div>
        : rlist.map(r => {
          const isOpen = open === r.id
          return (
            <div key={r.id} style={{ background: 'var(--bg-primary)', border: '1px solid #FECACA', borderLeft: '5px solid #DC2626', borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
              <div onClick={() => setOpen(isOpen ? null : r.id)} style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#DC2626', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.batch_id}<SubProdTag value={r.sub_prod_no} /></div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.order_number} · {r.party}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.article} · <strong>{r.color}</strong></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{r.repair_kg ?? r.kg} <span style={{ fontSize: 11, fontWeight: 500 }}>Kg</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.source_type === 'fob' ? 'FOB' : 'Faulty'} · {r.reprocess_type || ''}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                  <span style={pill(r.ro_status === 'In Repair' ? '#DCFCE7' : '#FEF3C7', r.ro_status === 'In Repair' ? '#166534' : '#92400E')}>{r.ro_status === 'In Repair' ? '✓ Assigned' : 'Waiting for route'}</span>
                  {r.repair_notes && <span style={pill('var(--bg-secondary)', 'var(--text-secondary)')}>{r.repair_notes}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border-light)', padding: '10px 12px', background: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Process route & machine</div>
                  <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: 8, border: '1px solid var(--border-light)', marginBottom: 10 }}>
                    <RouteAssignment order={{ ...r, id: r.id, batch_id: r.id, repair_id: r.repair_id, isRepair: true,
                      supervisor_confirmed: r.ro_status === 'In Repair', supervisorConfirmed: r.ro_status === 'In Repair',
                      process_route: r.process_route || [], processRoute: r.process_route || [], machine_id: r.machine_id || null, machineId: r.machine_id || null }}
                      onUpdate={onUpdate} />
                  </div>
                </div>
              )}
            </div>
          )
        }))}
    </div>
  )
}

const pill = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: bg, color: fg, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' })
const btn: React.CSSProperties = { minHeight: 44, fontSize: 14, fontWeight: 800, borderRadius: 8, border: 'none' }
