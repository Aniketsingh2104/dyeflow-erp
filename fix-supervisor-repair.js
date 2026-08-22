const fs = require('fs')

// ── Fix 1: Add /api/repair-assign route ──────────────────────────────────────
fs.mkdirSync('app/api/repair-assign', { recursive: true })
fs.writeFileSync('app/api/repair-assign/route.ts', `import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate } from '@/lib/supabase'

// GET: fetch all repairing batches (status = 'repairing')
export async function GET() {
  try {
    const { data: batches, error } = await dbSelect('batches',
      { status: 'eq.repairing', limit: '1000' },
      'id,batch_id,kg,mtr,taka,status,process_route,machine_id,supervisor_id,order_id,machines(id,name),supervisors(id,name)'
    )
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    // Get order details
    const orderIds = [...new Set((batches||[]).map((b:any) => b.order_id).filter(Boolean))]
    let orderMap: Record<string,any> = {}
    if (orderIds.length) {
      const { data: orders } = await dbSelect('orders',
        { id: \`in.(\${orderIds.join(',')})\`, limit: '1000' },
        'id,order_number,party,article,color,gsm,blend'
      )
      for (const o of orders||[]) orderMap[o.id] = o
    }

    // Get repairing order details (for source info)
    const batchIds = (batches||[]).map((b:any) => b.id).filter(Boolean)
    let repairMap: Record<string,any> = {}
    if (batchIds.length) {
      const { data: repairs } = await dbSelect('repairing_orders',
        { batch_id: \`in.(\${batchIds.join(',')})\`, status: 'eq.pending', limit: '1000' },
        'id,batch_id,repair_kg,source_type,reprocess_type,notes'
      )
      for (const r of repairs||[]) repairMap[r.batch_id] = r
    }

    const enriched = (batches||[]).map((b:any) => {
      const order  = orderMap[b.order_id] || {}
      const repair = repairMap[b.id] || {}
      return {
        ...b,
        order_number:  order.order_number || '-',
        party:         order.party        || '-',
        article:       order.article      || '-',
        color:         order.color        || '-',
        gsm:           order.gsm          || '-',
        blend:         order.blend        || '-',
        machine_name:  b.machines?.name   || '-',
        supervisor_name: b.supervisors?.name || '-',
        repair_id:     repair.id          || null,
        repair_kg:     repair.repair_kg   || b.kg,
        source_type:   repair.source_type || '-',
        reprocess_type: repair.reprocess_type || '-',
        repair_notes:  repair.notes       || '-',
      }
    })

    return NextResponse.json({ ok: true, data: enriched })
  } catch (err:any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// POST: assign repair batch to supervisor + route + machine
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, batch_id, repair_id, supervisor_id, machine_id, process_route } = body

  if (action === 'assign') {
    if (!batch_id || !supervisor_id || !machine_id || !process_route?.length) {
      return NextResponse.json({ ok: false, error: 'batch_id, supervisor_id, machine_id, process_route all required' }, { status: 400 })
    }

    // 1. Update batch: assign supervisor, machine, route, set pending
    const { error: bErr } = await dbUpdate('batches', { id: batch_id }, {
      supervisor_id,
      machine_id,
      process_route,
      status:          'pending',
      current_process: null,
    })
    if (bErr) return NextResponse.json({ ok: false, error: bErr }, { status: 500 })

    // 2. Update repairing order status to 'In Repair'
    if (repair_id) {
      await dbUpdate('repairing_orders', { id: repair_id }, {
        status: 'In Repair',
      })
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
`)
console.log('✓ Created /api/repair-assign/route.ts')

// ── Fix 2: Add Pending Repairs section to Supervisor page ────────────────────
let sup = fs.readFileSync('app/supervisor/page.tsx', 'utf8')

// Add repair states after existing states
const OLD_STATES = `  // Assign modal
  const [assignModal,  setAssignModal]  = useState<any>(null)
  const [assignTo,     setAssignTo]     = useState('')
  const [assignSaving, setAssignSaving] = useState(false)`

const NEW_STATES = `  // Assign modal (for orders)
  const [assignModal,  setAssignModal]  = useState<any>(null)
  const [assignTo,     setAssignTo]     = useState('')
  const [assignSaving, setAssignSaving] = useState(false)

  // Repair assignment
  const [repairBatches,   setRepairBatches]   = useState<any[]>([])
  const [repairModal,     setRepairModal]      = useState<any>(null)
  const [repairSup,       setRepairSup]        = useState('')
  const [repairMachine,   setRepairMachine]    = useState('')
  const [repairRoute,     setRepairRoute]      = useState<string[]>([])
  const [repairSaving,    setRepairSaving]     = useState(false)
  const [machines,        setMachines]         = useState<any[]>([])
  const [processList,     setProcessList]      = useState<any[]>([])
  const [inRepairBatches, setInRepairBatches]  = useState<any[]>([])`

if (sup.includes(OLD_STATES)) {
  sup = sup.replace(OLD_STATES, NEW_STATES)
  console.log('✓ Added repair states')
} else console.error('✗ States pattern not found')

// Update loadData to also fetch repair batches, machines, processes
const OLD_LOAD_INNER = `      const [supRes, orderRes] = await Promise.all([
        getSupervisors(),
        getOrders({ limit: 1000 }),
      ])`

const NEW_LOAD_INNER = `      const [supRes, orderRes, repairRes, machineRes, procRes] = await Promise.all([
        getSupervisors(),
        getOrders({ limit: 1000 }),
        fetch('/api/repair-assign', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/machines',      { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/processes',     { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])

      // Split repair batches into pending (needs assignment) and in-repair (assigned)
      const allRepair: any[] = repairRes.data || []
      setRepairBatches(allRepair.filter((b: any) => b.status === 'repairing'))
      setInRepairBatches(allRepair.filter((b: any) => ['pending','in-process'].includes(b.status)))
      setMachines(machineRes.data || [])
      setProcessList((procRes.data || []).filter((p: any) => p.is_enabled))`

if (sup.includes(OLD_LOAD_INNER)) {
  sup = sup.replace(OLD_LOAD_INNER, NEW_LOAD_INNER)
  console.log('✓ loadData now fetches repair batches, machines, processes')
} else console.error('✗ Load inner pattern not found')

// Add confirmRepairAssign handler before confirmAssign
const OLD_CONFIRM = `  // ── Assign ────────────────────────────────────────────────────────────────

  const confirmAssign = async () => {`

const NEW_CONFIRM = `  // ── Repair Assign ─────────────────────────────────────────────────────────

  const openRepairModal = (batch: any) => {
    setRepairModal(batch)
    setRepairSup(batch.supervisor_id || '')
    setRepairMachine(batch.machine_id || '')
    setRepairRoute(batch.process_route || [])
  }

  const toggleRepairProcess = (code: string) => {
    setRepairRoute(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  const confirmRepairAssign = async () => {
    if (!repairModal || !repairSup || !repairMachine || !repairRoute.length) {
      alert('Please select Supervisor, Machine and at least one Process')
      return
    }
    setRepairSaving(true)
    try {
      const res = await fetch('/api/repair-assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:       'assign',
          batch_id:     repairModal.id,
          repair_id:    repairModal.repair_id,
          supervisor_id: repairSup,
          machine_id:   repairMachine,
          process_route: repairRoute,
        })
      }).then(r => r.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      setRepairModal(null)
      setRepairSup(''); setRepairMachine(''); setRepairRoute([])
      loadData()
    } finally { setRepairSaving(false) }
  }

  // ── Assign ────────────────────────────────────────────────────────────────

  const confirmAssign = async () => {`

if (sup.includes(OLD_CONFIRM)) {
  sup = sup.replace(OLD_CONFIRM, NEW_CONFIRM)
  console.log('✓ Added repair assign handlers')
} else console.error('✗ Confirm pattern not found')

// Add Pending Repairs section before Unassigned Orders section
const OLD_UNASSIGNED = `      {/* Unassigned orders */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'hidden' }}>`

const NEW_REPAIR_SECTION = `      {/* ── Pending Repairs ── */}
      <div style={{ background: 'var(--bg-primary)', border: '2px solid #FCA5A5',
        borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #FCA5A5',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#FFF5F5' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#DC2626' }}>
            🔧 Pending Repair Assignment ({repairBatches.length})
          </div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>
            These batches need supervisor, machine and process route assigned
          </div>
        </div>
        {repairBatches.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--success)', fontSize: 13 }}>
            ✓ No repair batches pending assignment
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#FFF5F5' }}>
                  {['Batch #','Order #','Party','Color','Blend','GSM','Repair KG','Source','Route','Machine','Supervisor','Action'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10,
                      fontWeight: 700, color: '#DC2626', textTransform: 'uppercase',
                      letterSpacing: '0.05em', borderBottom: '1px solid #FCA5A5' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {repairBatches.map((b: any, i: number) => (
                  <tr key={b.id} style={{ background: i%2===0 ? '#FFF' : '#FFF5F5',
                    borderBottom: '1px solid #FEE2E2' }}>
                    <td style={{ ...td, fontWeight: 700, color: '#DC2626' }}>{b.batch_id}</td>
                    <td style={{ ...td, fontWeight: 600, color: 'var(--accent)' }}>{b.order_number}</td>
                    <td style={td}>{b.party}</td>
                    <td style={{ ...td, color: 'var(--accent)' }}>{b.color}</td>
                    <td style={td}>{b.blend}</td>
                    <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{b.gsm}</td>
                    <td style={{ ...td, fontWeight: 700, color: '#DC2626' }}>{b.repair_kg} Kg</td>
                    <td style={td}>
                      <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: b.source_type==='fob'?'#F3E8FF':'#FEE2E2',
                        color: b.source_type==='fob'?'#7C3AED':'#DC2626' }}>
                        {b.source_type || 'faulty'}
                      </span>
                    </td>
                    <td style={{ ...td, fontSize: 11, color: '#6B7280' }}>
                      {b.process_route?.join('→') || '-'}
                    </td>
                    <td style={td}>{b.machine_name}</td>
                    <td style={td}>{b.supervisor_name}</td>
                    <td style={td}>
                      <button className="xs primary" onClick={() => openRepairModal(b)}>
                        📋 Assign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── In Repair (assigned, in progress) ── */}
      {inRepairBatches.length > 0 && (
        <div style={{ background: 'var(--bg-primary)', border: '1px solid #FCD34D',
          borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #FCD34D',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#FFFBEB' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#D97706' }}>
              🔄 In Repair ({inRepairBatches.length})
            </div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>Already assigned — flowing through production</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#FFFBEB' }}>
                  {['Batch #','Order #','Color','Repair KG','Route','Current Process','Supervisor','Machine'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10,
                      fontWeight: 700, color: '#D97706', textTransform: 'uppercase',
                      letterSpacing: '0.05em', borderBottom: '1px solid #FCD34D' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inRepairBatches.map((b: any, i: number) => (
                  <tr key={b.id} style={{ background: i%2===0?'#FFF':'#FFFBEB',
                    borderBottom: '1px solid #FEF3C7' }}>
                    <td style={{ ...td, fontWeight: 700, color: '#D97706' }}>{b.batch_id}</td>
                    <td style={{ ...td, fontWeight: 600, color: 'var(--accent)' }}>{b.order_number}</td>
                    <td style={{ ...td, color: 'var(--accent)' }}>{b.color}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{b.repair_kg} Kg</td>
                    <td style={{ ...td, fontSize: 11 }}>{b.process_route?.join('→') || '-'}</td>
                    <td style={td}>
                      {b.current_process ? (
                        <span style={{ padding:'2px 8px', borderRadius:'50%', background:'var(--accent)',
                          color:'white', fontSize:11, fontWeight:700 }}>{b.current_process}</span>
                      ) : <span style={{ color:'#6B7280' }}>First Process</span>}
                    </td>
                    <td style={td}>{b.supervisor_name}</td>
                    <td style={td}>{b.machine_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unassigned orders */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, overflow: 'hidden' }}>`

if (sup.includes(OLD_UNASSIGNED)) {
  sup = sup.replace(OLD_UNASSIGNED, NEW_REPAIR_SECTION)
  console.log('✓ Added Pending Repairs section to Supervisor page')
} else console.error('✗ Unassigned section pattern not found')

// Add repair assign modal before the existing assign modal
const OLD_MODAL = `      {/* Assign modal */}
      {assignModal && (`

const NEW_MODAL = `      {/* ── Repair Assign Modal ── */}
      {repairModal && (
        <div className="modal-overlay" onClick={() => setRepairModal(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🔧 Assign Repair Batch</span>
              <button className="small" onClick={() => setRepairModal(null)}>✕</button>
            </div>

            {/* Batch info */}
            <div style={{ background: '#FFF5F5', borderRadius: 8, padding: '10px 14px',
              marginBottom: 14, fontSize: 13, border: '1px solid #FCA5A5' }}>
              <strong style={{ color: '#DC2626' }}>{repairModal.batch_id}</strong>
              <span style={{ marginLeft: 8, color: '#374151' }}>
                {repairModal.party} · {repairModal.color} · {repairModal.repair_kg} Kg
              </span>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                Source: {repairModal.source_type} · Notes: {repairModal.repair_notes}
              </div>
            </div>

            {/* Supervisor */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Supervisor *</label>
              <select value={repairSup} onChange={e => setRepairSup(e.target.value)}>
                <option value="">— Select Supervisor —</option>
                {supervisors.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Machine */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Machine *</label>
              <select value={repairMachine} onChange={e => setRepairMachine(e.target.value)}>
                <option value="">— Select Machine —</option>
                {machines.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* Process Route */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                display: 'block', marginBottom: 8 }}>
                Repair Process Route * <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 400 }}>
                  (select processes in order)
                </span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {processList.map((p: any) => {
                  const selected = repairRoute.includes(p.code)
                  const idx      = repairRoute.indexOf(p.code)
                  return (
                    <button key={p.code} onClick={() => toggleRepairProcess(p.code)}
                      style={{ padding: '5px 12px', fontSize: 12, fontWeight: selected ? 700 : 400,
                        border: `2px solid ${selected ? 'var(--accent)' : 'var(--border-medium)'}`,
                        borderRadius: 6, cursor: 'pointer',
                        background: selected ? 'var(--accent)' : 'var(--bg-primary)',
                        color: selected ? 'white' : 'var(--text-primary)',
                        position: 'relative' }}>
                      {selected && (
                        <span style={{ position: 'absolute', top: -8, right: -6, background: '#16A34A',
                          color: 'white', borderRadius: '50%', width: 16, height: 16,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 700 }}>{idx + 1}</span>
                      )}
                      {p.code}
                    </button>
                  )
                })}
              </div>
              {repairRoute.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>
                  Route: {repairRoute.join(' → ')}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setRepairModal(null)}>Cancel</button>
              <button className="primary" onClick={confirmRepairAssign}
                disabled={!repairSup || !repairMachine || !repairRoute.length || repairSaving}>
                {repairSaving ? 'Assigning…' : '✓ Assign for Repair'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign modal */}
      {assignModal && (`

if (sup.includes(OLD_MODAL)) {
  sup = sup.replace(OLD_MODAL, NEW_MODAL)
  console.log('✓ Added repair assign modal')
} else console.error('✗ Modal pattern not found')

fs.writeFileSync('app/supervisor/page.tsx', sup, 'utf8')
console.log('\n✓ All supervisor page changes applied')
