const fs = require('fs')
const path = require('path')
const filePath = path.join('app', 'first-process-batch', 'page.tsx')
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: Add missing fields to batch map (blend, width, sales_person)
const OLD_SUB = `          sub_party:     order.sub_party     || '-',`
const NEW_SUB = `          sub_party:     order.sub_party     || '-',
          sales_person:  order.sales_person   || '-',
          blend:         order.blend          || '-',
          width:         order.width          || '-',`

if (c.includes(OLD_SUB)) {
  c = c.replace(OLD_SUB, NEW_SUB)
  console.log('✓ Added blend, width, sales_person to map')
} else console.error('✗ sub_party pattern not found')

// Fix 2: Replace entire header list with correct sequence
const OLD_TH = `{['Batch ID','Order #','Party','Sub Party','Article','GSM','Color','Lab No','Lot No','Challan No','Qty (KG)','Qty (MTR)','Taka','Route','First Process','Planned Date','Delivery Date','Finish','Packing','Supervisor','Machine','Remarks','Actions'].map(h => (`
const NEW_TH = `{['Batch ID','Order #','Party','Sub Party','Sales Person','Article','Blend','Width','GSM','Color','Lab No','Lot No','Challan No','Qty (KG)','Qty (MTR)','Taka','Finish','Packing','Remarks','Route','First Process','Planned Date','Delivery Date','Supervisor','Machine','Actions'].map(h => (`

if (c.includes(OLD_TH)) {
  c = c.replace(OLD_TH, NEW_TH)
  console.log('✓ Updated headers to correct sequence')
} else console.error('✗ TH pattern not found')

// Fix 3: Replace entire row cells with correct sequence
const OLD_CELLS = `                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{b.batch_id}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{b.order_number}</td>
                  <td style={td}>{b.party}</td>
                  <td style={td}>{b.sub_party || '-'}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{b.article}</td>
                  <td style={td}>{b.gsm}</td>
                  <td style={td}>{b.color}</td>
                  <td style={td}>{b.lab_no}</td>
                  <td style={td}>{b.lot_no}</td>
                  <td style={td}>{b.challan_no}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{b.kg} Kg</td>
                  <td style={td}>{b.qty_mtr}</td>
                  <td style={td}>{b.no_of_taka}</td>
                  <td style={{ ...td, fontSize: 11, maxWidth: 200 }}>
                    {(b.process_route || []).join(' → ')}
                  </td>`

const NEW_CELLS = `                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{b.batch_id}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{b.order_number}</td>
                  <td style={{ ...td, color:'var(--accent)', fontWeight:600 }}>{b.party}</td>
                  <td style={td}>{b.sub_party}</td>
                  <td style={{ ...td, color:'var(--accent)' }}>{b.sales_person}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{b.article}</td>
                  <td style={{ ...td, color:'var(--warning)' }}>{b.blend}</td>
                  <td style={td}>{b.width}</td>
                  <td style={{ ...td, color:'var(--accent)', fontWeight:700 }}>{b.gsm}</td>
                  <td style={td}>{b.color}</td>
                  <td style={{ ...td, color:'var(--accent)' }}>{b.lab_no}</td>
                  <td style={td}>{b.lot_no}</td>
                  <td style={{ ...td, color:'var(--accent)' }}>{b.challan_no}</td>
                  <td style={{ ...td, fontWeight: 700, color:'var(--accent)' }}>{b.kg} Kg</td>
                  <td style={{ ...td, fontWeight:700, color:'var(--accent)' }}>{b.qty_mtr}</td>
                  <td style={{ ...td, fontWeight:700, color:'var(--accent)' }}>{b.no_of_taka}</td>
                  <td style={td}>{b.type_of_finish}</td>
                  <td style={{ ...td, color:'var(--accent)' }}>{b.type_of_packing}</td>
                  <td style={{ ...td, fontSize:11, maxWidth:120 }}>{b.remarks !== '-' ? b.remarks : ''}</td>
                  <td style={{ ...td, fontSize: 11, maxWidth: 200, whiteSpace:'normal' }}>
                    {(b.process_route || []).join(' → ')}
                  </td>`

if (c.includes(OLD_CELLS)) {
  c = c.replace(OLD_CELLS, NEW_CELLS)
  console.log('✓ Updated row cells to correct sequence')
} else console.error('✗ Cells pattern not found')

// Fix 4: Fix Planned Date + Delivery Date + remove duplicate remarks
const OLD_AFTER = `                  <td style={{ ...td, fontWeight: 700,
                    color: b.planned_date !== '-' ? 'var(--success)' : 'var(--text-tertiary)' }}>
                    {b.planned_date}
                  </td>
                  <td style={{ ...td, color: 'var(--warning)', fontWeight: 600 }}>
                    {b.delivery_date}
                  </td>
                  <td style={td}>{b.type_of_finish}</td>
                  <td style={td}>{b.type_of_packing}</td>
                  <td style={td}>{b.supervisor}</td>`

const NEW_AFTER = `                  <td style={{ ...td, fontWeight: 700,
                    color: b.planned_date !== '-' ? 'var(--success)' : 'var(--text-tertiary)' }}>
                    {b.planned_date}
                  </td>
                  <td style={{ ...td, color: 'var(--warning)', fontWeight: 600 }}>
                    {b.delivery_date !== '-' ? b.delivery_date : '-'}
                  </td>
                  <td style={td}>{b.supervisor}</td>`

if (c.includes(OLD_AFTER)) {
  c = c.replace(OLD_AFTER, NEW_AFTER)
  console.log('✓ Fixed planned date, delivery date, removed duplicate finish/packing')
} else console.error('✗ After pattern not found')

// Fix 5: Remove duplicate remarks cell (already added in correct position above)
const OLD_REMARKS = `                  <td style={{ ...td, maxWidth: 150, whiteSpace: 'normal', fontSize: 11 }}>
                    {b.remarks !== '-' ? b.remarks : ''}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button className="xs primary" disabled={!b.first_process || saving}`

const NEW_REMARKS = `                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button className="xs primary" disabled={!b.first_process || saving}`

if (c.includes(OLD_REMARKS)) {
  c = c.replace(OLD_REMARKS, NEW_REMARKS)
  console.log('✓ Removed duplicate remarks cell')
} else console.error('✗ Duplicate remarks pattern not found')

fs.writeFileSync(filePath, c, 'utf8')
console.log('\n✓ All sequence fixes applied')
