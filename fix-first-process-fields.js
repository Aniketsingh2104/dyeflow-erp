const fs = require('fs')
const path = require('path')
const filePath = path.join('app', 'first-process-batch', 'page.tsx')
let c = fs.readFileSync(filePath, 'utf8')

// Fix: Add all order fields to the batch map and table
const OLD_MAP = `          first_process: route[0] || '',
          supervisor:    order.supervisors?.name || '-',
          machine_name:  b.machines?.name || '-',
          // Planned date of first process from batch_date_plans
          planned_date:  (() => {
            const dp = dpMap[b.id] || {}
            const firstProc = route[0] || ''
            // Map process code to d_* column name
            const colMap: Record<string,string> = {
              C:'d_c', S:'d_s', H:'d_h', D:'d_d', S2:'d_s2', Rx:'d_rx',
              O:'d_o', G:'d_g', F:'d_f', Co:'d_co', Tu:'d_tu', Add:'d_add',
              Level:'d_level', Rc:'d_rc', Fix:'d_fix', Wash:'d_wash',
              Dry:'d_dry', B:'d_b', R:'d_r', K:'d_k',
              QA:'d_qa', Packing:'d_packing', Dispatch:'d_dispatch'
            }
            const col = colMap[firstProc]
            if (!col || !dp[col]) return '-'
            // Format date: 2026-08-06 → 06/08/2026
            const ymd = String(dp[col]).slice(0,10)
            const parts = ymd.split('-')
            return parts.length === 3 ? \`\${parts[2]}/\${parts[1]}/\${parts[0]}\` : ymd
          })(),`

const NEW_MAP = `          first_process: route[0] || '',
          supervisor:    order.supervisors?.name || '-',
          machine_name:  b.machines?.name || '-',
          // All order fields filled at time of order entry
          gsm:           order.gsm          || '-',
          lab_no:        order.lab_no       || '-',
          lot_no:        order.lot_no       || '-',
          challan_no:    order.challan_no   || '-',
          qty_mtr:       order.qty_mtr      || '-',
          no_of_taka:    order.no_of_taka   || '-',
          type_of_finish:  order.type_of_finish  || '-',
          type_of_packing: order.type_of_packing || '-',
          remarks:       order.remarks      || '-',
          delivery_date: order.delivery_date ? (() => {
            const parts = String(order.delivery_date).slice(0,10).split('-')
            return parts.length === 3 ? \`\${parts[2]}/\${parts[1]}/\${parts[0]}\` : order.delivery_date
          })() : '-',
          // Planned date of first process from batch_date_plans
          planned_date:  (() => {
            const dp = dpMap[b.id] || {}
            const firstProc = route[0] || ''
            const colMap: Record<string,string> = {
              C:'d_c', S:'d_s', H:'d_h', D:'d_d', S2:'d_s2', Rx:'d_rx',
              O:'d_o', G:'d_g', F:'d_f', Co:'d_co', Tu:'d_tu', Add:'d_add',
              Level:'d_level', Rc:'d_rc', Fix:'d_fix', Wash:'d_wash',
              Dry:'d_dry', B:'d_b', R:'d_r', K:'d_k',
              QA:'d_qa', Packing:'d_packing', Dispatch:'d_dispatch'
            }
            const col = colMap[firstProc]
            if (!col || !dp[col]) return '-'
            const ymd = String(dp[col]).slice(0,10)
            const parts = ymd.split('-')
            return parts.length === 3 ? \`\${parts[2]}/\${parts[1]}/\${parts[0]}\` : ymd
          })(),`

if (c.includes(OLD_MAP)) {
  c = c.replace(OLD_MAP, NEW_MAP)
  console.log('✓ Added all order fields to batch map')
} else {
  console.error('✗ Map pattern not found')
}

// Fix: Update table headers to show all fields
const OLD_HEADERS = `{['Batch ID','Order #','Party','Article','Color','Kg','Route','First Process','Planned Date','Supervisor','Machine','Actions'].map(h => (`
const NEW_HEADERS = `{['Batch ID','Order #','Party','Sub Party','Article','GSM','Color','Lab No','Lot No','Challan No','Qty (KG)','Qty (MTR)','Taka','Route','First Process','Planned Date','Delivery Date','Finish','Packing','Supervisor','Machine','Remarks','Actions'].map(h => (`

if (c.includes(OLD_HEADERS)) {
  c = c.replace(OLD_HEADERS, NEW_HEADERS)
  console.log('✓ Updated table headers with all fields')
} else {
  console.error('✗ Headers pattern not found')
}

// Fix: Update table rows to show all fields
const OLD_ROWS = `                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{b.batch_id}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{b.order_number}</td>
                  <td style={td}>{b.party}</td>
                  <td style={{ ...td, fontWeight: 500 }}>{b.article}</td>
                  <td style={td}>{b.color}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{b.kg} Kg</td>
                  <td style={{ ...td, fontSize: 11 }}>
                    {(b.process_route || []).join(' → ')}
                  </td>`

const NEW_ROWS = `                  <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{b.batch_id}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{b.order_number}</td>
                  <td style={td}>{b.party}</td>
                  <td style={td}>{order.sub_party || '-'}</td>
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

if (c.includes(OLD_ROWS)) {
  c = c.replace(OLD_ROWS, NEW_ROWS)
  console.log('✓ Updated table rows with all order fields')
} else {
  console.error('✗ Rows pattern not found')
}

// Fix: Add delivery date, finish, packing, remarks after planned date
const OLD_AFTER = `                  <td style={{ ...td, fontWeight: 700,
                    color: b.planned_date !== '-' ? 'var(--success)' : 'var(--text-tertiary)' }}>
                    {b.planned_date}
                  </td>
                  <td style={td}>{b.supervisor}</td>`

const NEW_AFTER = `                  <td style={{ ...td, fontWeight: 700,
                    color: b.planned_date !== '-' ? 'var(--success)' : 'var(--text-tertiary)' }}>
                    {b.planned_date}
                  </td>
                  <td style={{ ...td, color: 'var(--warning)', fontWeight: 600 }}>
                    {b.delivery_date}
                  </td>
                  <td style={td}>{b.type_of_finish}</td>
                  <td style={td}>{b.type_of_packing}</td>
                  <td style={td}>{b.supervisor}</td>`

if (c.includes(OLD_AFTER)) {
  c = c.replace(OLD_AFTER, NEW_AFTER)
  console.log('✓ Added delivery date, finish, packing columns')
} else {
  console.error('✗ After pattern not found')
}

// Fix: Add remarks before Actions
const OLD_BEFORE_ACTIONS = `                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button className="xs primary" disabled={!b.first_process || saving}`

const NEW_BEFORE_ACTIONS = `                  <td style={{ ...td, maxWidth: 150, whiteSpace: 'normal', fontSize: 11 }}>
                    {b.remarks !== '-' ? b.remarks : ''}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button className="xs primary" disabled={!b.first_process || saving}`

if (c.includes(OLD_BEFORE_ACTIONS)) {
  c = c.replace(OLD_BEFORE_ACTIONS, NEW_BEFORE_ACTIONS)
  console.log('✓ Added remarks column before Actions')
} else {
  console.error('✗ Before actions pattern not found')
}

// Fix: sub_party reference — need to get it from oMap in map function
// sub_party is on the order object, not the batch - fix the reference
c = c.replace(
  `                  <td style={td}>{order.sub_party || '-'}</td>`,
  `                  <td style={td}>{b.sub_party || '-'}</td>`
)

// Add sub_party to the batch map
c = c.replace(
  `          first_process: route[0] || '',`,
  `          first_process: route[0] || '',
          sub_party:     order.sub_party     || '-',`
)

fs.writeFileSync(filePath, c, 'utf8')
console.log('\n✓ All fields added to First Process Batch page')
