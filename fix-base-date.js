const fs = require('fs')
const path = require('path')

// ── Fix 1: machines API — add numbering_base_date to select + update support ──
const machApiPath = path.join('app', 'api', 'machines', 'route.ts')
let machApi = fs.readFileSync(machApiPath, 'utf8')

// Add numbering_base_date to GET select
const OLD_SEL = `'id,name,machine_type,capacity,status,is_active,created_at'`
const NEW_SEL = `'id,name,machine_type,capacity,status,is_active,numbering_base_date,created_at'`
if (machApi.includes(OLD_SEL)) {
  machApi = machApi.replace(OLD_SEL, NEW_SEL)
  console.log('✓ machines API select includes numbering_base_date')
} else console.error('✗ machines API select pattern not found')

fs.writeFileSync(machApiPath, machApi, 'utf8')

// ── Fix 2: machine master page — show base date column + editable date input ──
const masterPath = path.join('app', 'setup', 'machine-master', 'page.tsx')
let master = fs.readFileSync(masterPath, 'utf8')

// Update Machine interface
const OLD_IFACE = `interface Machine { id: string; name: string; machine_type?: string; capacity: number; status: string }`
const NEW_IFACE = `interface Machine { id: string; name: string; machine_type?: string; capacity: number; status: string; numbering_base_date?: string }`
if (master.includes(OLD_IFACE)) {
  master = master.replace(OLD_IFACE, NEW_IFACE)
  console.log('✓ Machine interface updated')
} else console.error('✗ Machine interface pattern not found')

// Add Base Date column to table header
const OLD_TH = `{['Machine Name','Type','Capacity (Kg)','Status','Actions'].map(h => (`
const NEW_TH = `{['Machine Name','Type','Capacity (Kg)','Numbering Base Date','Status','Actions'].map(h => (`
if (master.includes(OLD_TH)) {
  master = master.replace(OLD_TH, NEW_TH)
  console.log('✓ Added Base Date column header')
} else console.error('✗ Table header pattern not found')

// Add Base Date cell after Capacity cell
const OLD_CELL = `                    <td style={{ padding: '12px 14px', fontSize: 13 }}>{m.capacity} Kg</td>
                    <td style={{ padding: '12px 14px' }}>
                      <select value={m.status || 'idle'}`
const NEW_CELL = `                    <td style={{ padding: '12px 14px', fontSize: 13 }}>{m.capacity} Kg</td>
                    <td style={{ padding: '12px 14px' }}>
                      <input
                        type="date"
                        value={m.numbering_base_date?.slice(0,10) || ''}
                        onChange={async (e) => {
                          await fetch('/api/machines', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'update', id: m.id, numbering_base_date: e.target.value || null })
                          })
                          load()
                        }}
                        style={{ fontSize: 12, padding: '3px 8px', border: '1px solid var(--border-medium)',
                          borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                      />
                      {!m.numbering_base_date && (
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          Not set — uses today
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <select value={m.status || 'idle'}`

if (master.includes(OLD_CELL)) {
  master = master.replace(OLD_CELL, NEW_CELL)
  console.log('✓ Added Base Date editable cell to machine table')
} else console.error('✗ Capacity cell pattern not found')

fs.writeFileSync(masterPath, master, 'utf8')

// ── Fix 3: machine detail page — use machine.numbering_base_date ──────────
const detailPath = path.join('app', 'machines', '[machineId]', 'page.tsx')
let detail = fs.readFileSync(detailPath, 'utf8')

// Replace all occurrences of getPlannedDateByNumber where baseDate is new Date()
// Use machine.numbering_base_date if set, else today
const OLD_BASE1 = `              return getPlannedDateByNumber(num, new Date().toISOString().slice(0, 10), newHolidaySet)`
const NEW_BASE1 = `              const baseDate = foundMachine?.numbering_base_date?.slice(0,10) || new Date().toISOString().slice(0,10)
              return getPlannedDateByNumber(num, baseDate, newHolidaySet)`

if (detail.includes(OLD_BASE1)) {
  detail = detail.replace(OLD_BASE1, NEW_BASE1)
  console.log('✓ plannedDate IIFE uses machine.numbering_base_date')
} else console.error('✗ plannedDate IIFE pattern not found')

const OLD_BASE2 = `      byProcessDates[processCode] = getPlannedDateByNumber(planNum, new Date().toISOString().slice(0, 10), holidaySet)`
const NEW_BASE2 = `      const _baseDate = machine?.numbering_base_date?.slice(0,10) || new Date().toISOString().slice(0,10)
      byProcessDates[processCode] = getPlannedDateByNumber(planNum, _baseDate, holidaySet)`

if (detail.includes(OLD_BASE2)) {
  detail = detail.replace(OLD_BASE2, NEW_BASE2)
  console.log('✓ updatePlanNumber uses machine.numbering_base_date')
} else console.error('✗ updatePlanNumber base pattern not found')

const OLD_BASE3 = `    const baseDate = new Date().toISOString().slice(0, 10)`
const NEW_BASE3 = `    const baseDate = machine?.numbering_base_date?.slice(0,10) || new Date().toISOString().slice(0,10)`

if (detail.includes(OLD_BASE3)) {
  detail = detail.replace(OLD_BASE3, NEW_BASE3)
  console.log('✓ handleCollaborationConfirm uses machine.numbering_base_date')
} else console.error('✗ handleCollaborationConfirm baseDate pattern not found')

fs.writeFileSync(detailPath, detail, 'utf8')
console.log('\n✓ All fixes done.')
