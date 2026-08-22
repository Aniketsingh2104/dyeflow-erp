const fs = require('fs')
const path = require('path')

// Read supervisor page
const supPath = 'app/supervisor/[name]/page.tsx'
let sup = fs.readFileSync(supPath, 'utf8')

// ── Fix 1: Add new state variables for repair modals ─────────────────────────
const OLD_STATES = `  const [resizing, setResizing] = useState<{ columnId: string; startX: number; startWidth: number } | null>(null)
  const [filters, setFilters] = useState<{ [key: string]: string }>({})`

const NEW_STATES = `  const [resizing, setResizing] = useState<{ columnId: string; startX: number; startWidth: number } | null>(null)
  const [filters, setFilters] = useState<{ [key: string]: string }>({})
  
  // Repair Queue modals
  const [repairSplitModal,    setRepairSplitModal]    = useState<any>(null)
  const [repairSplitParts,    setRepairSplitParts]    = useState<any[]>([])
  const [repairAssignModal,   setRepairAssignModal]   = useState<any>(null)
  const [repairSaving,        setRepairSaving]        = useState(false)
  const [repairToast,         setRepairToast]         = useState('')
  const [supervisorsList,     setSupervisorsList]     = useState<any[]>([])
  const [machinesList,        setMachinesList]        = useState<any[]>([])`

if (sup.includes(OLD_STATES)) {
  sup = sup.replace(OLD_STATES, NEW_STATES)
  console.log('✓ Added repair modal states')
} else console.error('✗ States pattern not found')

// ── Fix 2: Add supervisor/machine fetch to loadData ──────────────────────────
const OLD_REPAIR_LOAD = `      // Show ALL repair batches — both unassigned (repairing) and assigned (pending/In Repair)
      const allRepairs: any[] = repairApiRes.data || []
      setFaultyBatches(allRepairs)
      setStats({ inbox, faulty: allRepairs.length })`

const NEW_REPAIR_LOAD = `      // Load supervisors and machines for repair modals
      const [supListRes, machListRes] = await Promise.all([
        fetch('/api/supervisors', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/machines',    { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])
      setSupervisorsList(supListRes.data || [])
      setMachinesList(machListRes.data || [])

      // Show ALL repair batches — both unassigned (repairing) and assigned (pending/In Repair)
      const allRepairs: any[] = repairApiRes.data || []
      setFaultyBatches(allRepairs)
      setStats({ inbox, faulty: allRepairs.length })`

if (sup.includes(OLD_REPAIR_LOAD)) {
  sup = sup.replace(OLD_REPAIR_LOAD, NEW_REPAIR_LOAD)
  console.log('✓ Added supervisor/machine fetch to loadData')
} else console.error('✗ Repair load pattern not found')

// ── Fix 3: Add repair action handlers before updateFaultyStatus ──────────────
const OLD_FAULTY_STATUS = `  const updateFaultyStatus = async (repairId: string, status: string) => {`

const NEW_HANDLERS = `  // ── Repair toast ─────────────────────────────────────────────────────────
  const showRepairToast = (msg: string) => {
    setRepairToast(msg)
    setTimeout(() => setRepairToast(''), 3500)
  }

  // ── Generate split batch ID for repair batches ────────────────────────────
  // DYE26-0001-B1-R → DYE26-0001-B1-R-S1, DYE26-0001-B1-R-S2...
  const getRepairSplitId = (baseBatchId: string, splitIdx: number) => {
    return \`\${baseBatchId}-S\${splitIdx + 1}\`
  }

  // ── Open split modal for repair batch ────────────────────────────────────
  const openRepairSplitModal = (batch: any) => {
    const totalKg  = parseFloat(batch.kg)  || 0
    const totalMtr = parseFloat(batch.qty_mtr) || 0
    const totalTaka= parseInt(batch.no_of_taka) || 0
    setRepairSplitModal(batch)
    setRepairSplitParts([
      { kg: totalKg / 2, mtr: Math.round(totalMtr / 2), taka: Math.round(totalTaka / 2), machine_id: batch.machine_id || '' },
      { kg: totalKg / 2, mtr: Math.round(totalMtr / 2), taka: Math.round(totalTaka / 2), machine_id: batch.machine_id || '' },
    ])
  }

  // ── Full split for repair batch ────────────────────────────────────────────
  const doRepairFullSplit = async (batch: any) => {
    if (!batch.process_route?.length) { alert('Assign process route first.'); return }
    if (!confirm(\`Full split \${batch.batch_id} as single batch?\`)) return
    setRepairSaving(true)
    try {
      // Original batch keeps its ID, just confirm it's set up correctly
      const res = await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update', id: batch.id,
          status: 'pending', process_route: batch.process_route,
        })
      }).then(r => r.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      showRepairToast(\`✓ \${batch.batch_id} ready as single batch\`)
      loadData()
    } finally { setRepairSaving(false) }
  }

  // ── Save repair splits ────────────────────────────────────────────────────
  const saveRepairSplits = async () => {
    if (!repairSplitModal) return
    const totalNewKg = repairSplitParts.reduce((s, p) => s + (parseFloat(p.kg) || 0), 0)
    if (totalNewKg <= 0) { alert('Enter batch quantities.'); return }
    setRepairSaving(true)
    try {
      const baseBatchId   = repairSplitModal.batch_id  // e.g. DYE26-0001-B1-R
      const baseProcessRoute = repairSplitModal.process_route || []
      const baseMachineId    = repairSplitModal.machine_id    || null

      // Update original batch with first split's kg
      const firstPart = repairSplitParts[0]
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update', id: repairSplitModal.id,
          kg: parseFloat(firstPart.kg) || 0,
          mtr: parseFloat(firstPart.mtr) || 0,
          taka: parseInt(firstPart.taka) || 0,
          machine_id: firstPart.machine_id || baseMachineId,
        })
      })

      // Create new batches for remaining splits (with -S1, -S2 suffix)
      for (let i = 1; i < repairSplitParts.length; i++) {
        const part   = repairSplitParts[i]
        const newId  = getRepairSplitId(baseBatchId, i) // DYE26-0001-B1-R-S1, -S2...
        await fetch('/api/batches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action:        'create',
            batch_id:      newId,
            order_id:      repairSplitModal.order_id,
            kg:            parseFloat(part.kg)  || 0,
            mtr:           parseFloat(part.mtr) || 0,
            taka:          parseInt(part.taka)  || 0,
            machine_id:    part.machine_id || baseMachineId,
            process_route: baseProcessRoute,
            status:        'pending',
          })
        })
      }

      showRepairToast(\`✓ Split into \${repairSplitParts.length} batches\`)
      setRepairSplitModal(null)
      setRepairSplitParts([])
      loadData()
    } finally { setRepairSaving(false) }
  }

  // ── Reassign repair batch to different supervisor ─────────────────────────
  const doRepairReassign = async (supervisorName: string) => {
    if (!supervisorName || !repairAssignModal) return
    const sup = supervisorsList.find((s: any) => s.name === supervisorName)
    if (!sup) { alert('Supervisor not found.'); return }
    setRepairSaving(true)
    try {
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: repairAssignModal.id, supervisor_id: sup.id })
      })
      showRepairToast(\`✓ Reassigned to \${supervisorName}\`)
      setRepairAssignModal(null)
      loadData()
    } finally { setRepairSaving(false) }
  }

  const updateFaultyStatus = async (repairId: string, status: string) => {`

if (sup.includes(OLD_FAULTY_STATUS)) {
  sup = sup.replace(OLD_FAULTY_STATUS, NEW_HANDLERS)
  console.log('✓ Added repair action handlers')
} else console.error('✗ updateFaultyStatus pattern not found')

// ── Fix 4: Add action buttons column to repair queue table ───────────────────
const OLD_HEADERS = `                    {['BATCH #','ORDER #','PARTY','SUB PARTY','SALES PERSON','ARTICLE',
                      'BLEND','WIDTH','GSM','COLOR','LAB NO.','LOT NO.','CHALLAN NO.',
                      'QTY(KG)','QTY(MTR)','TAKA','FINISH','PACKING','REMARKS',
                      'REPAIR KG','REPAIR MTR','REPAIR TAKA','SOURCE','TYPE','NOTES','ASSIGN'].map(h => (`

const NEW_HEADERS = `                    {['BATCH #','ORDER #','PARTY','SUB PARTY','SALES PERSON','ARTICLE',
                      'BLEND','WIDTH','GSM','COLOR','LAB NO.','LOT NO.','CHALLAN NO.',
                      'QTY(KG)','QTY(MTR)','TAKA','FINISH','PACKING','REMARKS',
                      'REPAIR KG','REPAIR MTR','REPAIR TAKA','SOURCE','TYPE','NOTES','ASSIGN','ACTIONS'].map(h => (`

if (sup.includes(OLD_HEADERS)) {
  sup = sup.replace(OLD_HEADERS, NEW_HEADERS)
  console.log('✓ Added ACTIONS column header')
} else console.error('✗ Headers pattern not found')

// Add actions cell after the assign cell
const OLD_ASSIGN_CELL = `                      <td style={cellStyle}>
                        {r.ro_status === 'In Repair' ? (
                          <div>
                            <span style={{ display:'block', fontSize:11, fontWeight:700,
                              padding:'3px 8px', borderRadius:4, background:'#DCFCE7',
                              color:'#166534', marginBottom:4 }}>
                              ✓ Assigned
                            </span>
                            <span style={{ fontSize:10, color:'#6B7280' }}>
                              {r.machine_name !== '-' ? r.machine_name : ''}
                            </span>
                          </div>
                        ) : (
                          <RouteAssignment
                            order={{ ...r, id:r.id, batch_id:r.id, repair_id:r.repair_id, isRepair:true }}
                            onUpdate={loadData}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>`

const NEW_ASSIGN_CELL = `                      <td style={cellStyle}>
                        {r.ro_status === 'In Repair' ? (
                          <div>
                            <span style={{ display:'block', fontSize:11, fontWeight:700,
                              padding:'3px 8px', borderRadius:4, background:'#DCFCE7',
                              color:'#166534', marginBottom:4 }}>
                              ✓ Assigned
                            </span>
                            <span style={{ fontSize:10, color:'#6B7280' }}>
                              {r.machine_name !== '-' ? r.machine_name : ''}
                            </span>
                          </div>
                        ) : (
                          <RouteAssignment
                            order={{ ...r, id:r.id, batch_id:r.id, repair_id:r.repair_id, isRepair:true }}
                            onUpdate={loadData}
                          />
                        )}
                      </td>
                      {/* Actions: Split, Full Split, Reassign */}
                      <td style={{ ...cellStyle, whiteSpace:'nowrap' }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          <button onClick={() => openRepairSplitModal(r)} disabled={repairSaving}
                            style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                              border:'1px solid var(--accent)', borderRadius:4,
                              cursor:'pointer', background:'transparent', color:'var(--accent)' }}>
                            ✂ Split
                          </button>
                          <button onClick={() => doRepairFullSplit(r)} disabled={repairSaving}
                            style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                              border:'none', borderRadius:4, cursor:'pointer',
                              background:'#7C3AED', color:'white' }}>
                            ⚡ Full Split
                          </button>
                          <button onClick={() => setRepairAssignModal(r)} disabled={repairSaving}
                            style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                              border:'1px solid #D97706', borderRadius:4,
                              cursor:'pointer', background:'#FFFBEB', color:'#92400E' }}>
                            👤 Reassign
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>`

if (sup.includes(OLD_ASSIGN_CELL)) {
  sup = sup.replace(OLD_ASSIGN_CELL, NEW_ASSIGN_CELL)
  console.log('✓ Added Split/Full Split/Reassign action buttons')
} else console.error('✗ Assign cell pattern not found')

// ── Fix 5: Add toast and modals before closing tag ───────────────────────────
const OLD_CLOSE = `      {showColumnSettings && (
        <ColumnSettingsModal columns={columns} onSave={handleSaveColumns} onClose={() => setShowColumnSettings(false)} onReset={handleResetColumns} />
      )}
    </div>
  )
}`

const NEW_CLOSE = `      {showColumnSettings && (
        <ColumnSettingsModal columns={columns} onSave={handleSaveColumns} onClose={() => setShowColumnSettings(false)} onReset={handleResetColumns} />
      )}

      {/* Repair toast */}
      {repairToast && (
        <div style={{ position:'fixed', bottom:24, right:24, zIndex:9999,
          background:'var(--success)', color:'white', borderRadius:8,
          padding:'10px 18px', fontSize:13, fontWeight:600,
          boxShadow:'0 4px 16px rgba(0,0,0,0.15)' }}>
          {repairToast}
        </div>
      )}

      {/* Repair Split Modal */}
      {repairSplitModal && (
        <div className="modal-overlay" onClick={() => setRepairSplitModal(null)}>
          <div className="modal" style={{ maxWidth:600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">✂ Split Repair Batch — {repairSplitModal.batch_id}</span>
              <button className="small" onClick={() => setRepairSplitModal(null)}>✕</button>
            </div>
            <div style={{ background:'#FFF5F5', borderRadius:8, padding:'10px 14px',
              marginBottom:14, fontSize:13, border:'1px solid #FCA5A5' }}>
              <strong style={{ color:'#DC2626' }}>{repairSplitModal.batch_id}</strong>
              <span style={{ marginLeft:8, color:'#374151' }}>
                {repairSplitModal.color} · Total: <strong>{repairSplitModal.kg} Kg</strong>
              </span>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>
                Original batch keeps its ID · New splits get -S1, -S2... suffix
              </div>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:10 }}>
              <thead>
                <tr style={{ background:'var(--bg-secondary)' }}>
                  {['BATCH ID','KG','MTR','TAKA','MACHINE',''].map(h => (
                    <th key={h} style={{ padding:'6px 8px', fontSize:11, textAlign:'left',
                      borderBottom:'1px solid var(--border-light)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {repairSplitParts.map((part, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid var(--border-light)' }}>
                    <td style={{ padding:'6px 8px', fontSize:12, fontWeight:700, color:'#DC2626' }}>
                      {i === 0 ? repairSplitModal.batch_id : getRepairSplitId(repairSplitModal.batch_id, i)}
                    </td>
                    {(['kg','mtr','taka'] as const).map(f => (
                      <td key={f} style={{ padding:'6px 8px' }}>
                        <input type="number" value={part[f]}
                          onChange={e => setRepairSplitParts(p => p.map((b,j) => j===i?{...b,[f]:e.target.value}:b))}
                          style={{ width:75, padding:'4px 6px', fontSize:12,
                            border:'1px solid var(--border-medium)', borderRadius:4 }} />
                      </td>
                    ))}
                    <td style={{ padding:'6px 8px' }}>
                      <select value={part.machine_id||''} 
                        onChange={e => setRepairSplitParts(p => p.map((b,j) => j===i?{...b,machine_id:e.target.value}:b))}
                        style={{ padding:'4px 8px', fontSize:11, border:'1px solid var(--border-medium)',
                          borderRadius:4, minWidth:120 }}>
                        <option value="">— Machine —</option>
                        {machinesList.map((m:any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding:'6px 8px' }}>
                      {repairSplitParts.length > 2 && (
                        <button className="xs danger"
                          onClick={() => setRepairSplitParts(p => p.filter((_,j) => j!==i))}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              <button className="small"
                onClick={() => setRepairSplitParts(p => [...p, { kg:0, mtr:0, taka:0, machine_id:repairSplitModal.machine_id||'' }])}>
                ➕ Add Batch
              </button>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="primary" onClick={saveRepairSplits} disabled={repairSaving}>
                {repairSaving ? 'Saving…' : '✓ Save Splits'}
              </button>
              <button onClick={() => setRepairSplitModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Repair Reassign Modal */}
      {repairAssignModal && (
        <div className="modal-overlay" onClick={() => setRepairAssignModal(null)}>
          <div className="modal" style={{ maxWidth:440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">👤 Reassign — {repairAssignModal.batch_id}</span>
              <button className="small" onClick={() => setRepairAssignModal(null)}>✕</button>
            </div>
            <div style={{ background:'var(--bg-secondary)', borderRadius:8,
              padding:'10px 14px', marginBottom:14, fontSize:13 }}>
              <strong>{repairAssignModal.batch_id}</strong>
              <span style={{ marginLeft:8, color:'var(--text-secondary)' }}>
                {repairAssignModal.party} · {repairAssignModal.color} · {repairAssignModal.repair_kg} Kg
              </span>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>
                Current: {repairAssignModal.supervisor_name || 'Unassigned'}
              </div>
            </div>
            <RepairReassignPicker
              supervisors={supervisorsList}
              current={repairAssignModal.supervisor_name}
              onAssign={doRepairReassign}
              onClose={() => setRepairAssignModal(null)}
              saving={repairSaving}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Repair Reassign Picker ─────────────────────────────────────────────────────
function RepairReassignPicker({ supervisors, current, onAssign, onClose, saving }: any) {
  const [chosen, setChosen] = useState(current || '')
  return (<>
    <div className="form-group" style={{ marginBottom:16 }}>
      <label>Select New Supervisor</label>
      <select value={chosen} onChange={e => setChosen(e.target.value)}>
        <option value="">— Select —</option>
        {supervisors.map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}
      </select>
    </div>
    <div style={{ display:'flex', gap:8 }}>
      <button className="primary" onClick={() => onAssign(chosen)} disabled={saving || !chosen}>
        {saving ? 'Saving…' : '✓ Reassign'}
      </button>
      <button onClick={onClose}>Cancel</button>
    </div>
  </>)
}`

if (sup.includes(OLD_CLOSE)) {
  sup = sup.replace(OLD_CLOSE, NEW_CLOSE)
  console.log('✓ Added Split/Reassign modals and RepairReassignPicker')
} else console.error('✗ Closing tag pattern not found')

// Add useState import if needed
if (!sup.includes("import { use, useEffect, useState, useMemo } from 'react'")) {
  console.log('- useState already imported')
}

// Add missing import for useState in RepairReassignPicker
// It's used in RepairReassignPicker which is at file level - needs React import
sup = sup.replace(
  `import { use, useEffect, useState, useMemo } from 'react'`,
  `import { use, useEffect, useState, useMemo, useCallback } from 'react'`
)

// Add useState at top level for RepairReassignPicker component
// It already imports useState so it's fine

fs.writeFileSync(supPath, sup, 'utf8')
console.log('\n✓ All changes applied to supervisor page')
