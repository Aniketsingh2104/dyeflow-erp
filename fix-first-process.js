const fs = require('fs')
const path = require('path')
const filePath = path.join('app', 'first-process-batch', 'page.tsx')
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: Load date plans alongside batches and orders
const OLD_LOAD = `      const [batchRes, orderRes] = await Promise.all([
        getBatches(),
        getOrders({ limit: 1000 }),
      ])

      const batches: any[] = batchRes.data  || []
      const orders:  any[] = orderRes.data  || []
      const oMap: Record<string, any> = {}
      for (const o of orders) oMap[o.id] = o`

const NEW_LOAD = `      const [batchRes, orderRes, dpRes] = await Promise.all([
        getBatches(),
        getOrders({ limit: 1000 }),
        fetch('/api/date-plans', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])

      const batches: any[] = batchRes.data  || []
      const orders:  any[] = orderRes.data  || []
      const datePlans: any[] = dpRes.data   || []

      const oMap: Record<string, any> = {}
      for (const o of orders) oMap[o.id] = o

      // Build date plan map: batch UUID → date plan row
      const dpMap: Record<string, any> = {}
      for (const dp of datePlans) dpMap[dp.batch_id] = dp`

if (c.includes(OLD_LOAD)) {
  c = c.replace(OLD_LOAD, NEW_LOAD)
  console.log('✓ Added date-plans fetch to load()')
} else {
  console.error('✗ Load pattern not found')
}

// Fix 2: Add planned_date to each batch object
const OLD_MAP = `          first_process: route[0] || '',
          supervisor:    order.supervisors?.name || '-',
          machine_name:  b.machines?.name || '-',`

const NEW_MAP = `          first_process: route[0] || '',
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

if (c.includes(OLD_MAP)) {
  c = c.replace(OLD_MAP, NEW_MAP)
  console.log('✓ Added planned_date to batch object')
} else {
  console.error('✗ Map pattern not found')
}

// Fix 3: Add Process Route and Planned Date columns to table header
const OLD_HEADERS = `{['Batch ID','Order #','Party','Article','Color','Kg','First Process','Supervisor','Machine','Actions'].map(h => (`
const NEW_HEADERS = `{['Batch ID','Order #','Party','Article','Color','Kg','Route','First Process','Planned Date','Supervisor','Machine','Actions'].map(h => (`

if (c.includes(OLD_HEADERS)) {
  c = c.replace(OLD_HEADERS, NEW_HEADERS)
  console.log('✓ Added Route and Planned Date column headers')
} else {
  console.error('✗ Headers pattern not found')
}

// Fix 4: Add Process Route and Planned Date cells in table row
const OLD_CELLS = `                  <td style={{ ...td, fontWeight: 700 }}>{b.kg} Kg</td>
                  <td style={td}>
                    {b.first_process ? (`

const NEW_CELLS = `                  <td style={{ ...td, fontWeight: 700 }}>{b.kg} Kg</td>
                  <td style={{ ...td, fontSize: 11 }}>
                    {(b.process_route || []).join(' → ')}
                  </td>
                  <td style={td}>
                    {b.first_process ? (`

if (c.includes(OLD_CELLS)) {
  c = c.replace(OLD_CELLS, NEW_CELLS)
  console.log('✓ Added Route cell to table row')
} else {
  console.error('✗ Cells pattern not found')
}

// Fix 5: Add Planned Date cell after First Process cell
const OLD_AFTER_FP = `                  </td>
                  <td style={td}>{b.supervisor}</td>`

const NEW_AFTER_FP = `                  </td>
                  <td style={{ ...td, fontWeight: 700,
                    color: b.planned_date !== '-' ? 'var(--success)' : 'var(--text-tertiary)' }}>
                    {b.planned_date}
                  </td>
                  <td style={td}>{b.supervisor}</td>`

if (c.includes(OLD_AFTER_FP)) {
  c = c.replace(OLD_AFTER_FP, NEW_AFTER_FP)
  console.log('✓ Added Planned Date cell')
} else {
  console.error('✗ After FP pattern not found')
}

fs.writeFileSync(filePath, c, 'utf8')
console.log('\n✓ All changes applied to first-process-batch/page.tsx')
