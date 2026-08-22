const fs = require('fs')

// Fix 1: First Process page — set sent_at when sending batch to process
const fpPath = 'app/first-process-batch/page.tsx'
let fp = fs.readFileSync(fpPath, 'utf8')

const OLD_SEND = `      await Promise.all(selected.map(b =>
        fetch('/api/batches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action:          'update',
            id:              b.id,
            current_process: b.first_process,
            status:          'in-process',
          })
        })
      ))`

const NEW_SEND = `      const now = new Date().toISOString()
      await Promise.all(selected.map(b =>
        fetch('/api/batches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action:          'update',
            id:              b.id,
            current_process: b.first_process,
            status:          'in-process',
            sent_at:         now,           // timestamp when batch arrived at process
          })
        })
      ))`

if (fp.includes(OLD_SEND)) {
  fp = fp.replace(OLD_SEND, NEW_SEND)
  fs.writeFileSync(fpPath, fp, 'utf8')
  console.log('✓ First Process: sent_at saved when batch sent to process')
} else console.error('✗ First Process send pattern not found')

// Fix 2: FMS page — use sent_at as timestamp, load date-plans for planned/delivery date
const fmsPath = 'app/fms/[process]/page.tsx'
let fms = fs.readFileSync(fmsPath, 'utf8')

// Add date-plans fetch to loadRows
const OLD_LOAD = `      const [batchRes, orderRes] = await Promise.all([
        getBatches({ status: 'in-process' }),
        getOrders({ limit: 1000 }),
      ])`

const NEW_LOAD = `      const [batchRes, orderRes, dpRes] = await Promise.all([
        getBatches({ status: 'in-process' }),
        getOrders({ limit: 1000 }),
        fetch('/api/date-plans', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])`

if (fms.includes(OLD_LOAD)) {
  fms = fms.replace(OLD_LOAD, NEW_LOAD)
  console.log('✓ FMS: added date-plans fetch')
} else console.error('✗ FMS load pattern not found')

// Add dpMap build after orderMap
const OLD_OMAP = `      const orderMap: Record<string, any> = {}
      for (const o of orders) orderMap[o.id] = o`

const NEW_OMAP = `      const orderMap: Record<string, any> = {}
      for (const o of orders) orderMap[o.id] = o

      // Date plans map: batch UUID → date plan row
      const datePlans: any[] = dpRes.data || []
      const dpMap: Record<string, any> = {}
      for (const dp of datePlans) dpMap[dp.batch_id] = dp

      // Map process code to d_* column in batch_date_plans
      const PROC_COL: Record<string, string> = {
        C:'d_c', S:'d_s', H:'d_h', D:'d_d', S2:'d_s2', Rx:'d_rx', O:'d_o',
        G:'d_g', F:'d_f', Co:'d_co', Tu:'d_tu', Add:'d_add', Level:'d_level',
        Rc:'d_rc', Fix:'d_fix', Wash:'d_wash', Dry:'d_dry', B:'d_b',
        R:'d_r', K:'d_k', QA:'d_qa', Qa:'d_qa', Packing:'d_packing',
        Dispatch:'d_dispatch'
      }`

if (fms.includes(OLD_OMAP)) {
  fms = fms.replace(OLD_OMAP, NEW_OMAP)
  console.log('✓ FMS: added dpMap and PROC_COL')
} else console.error('✗ FMS oMap pattern not found')

// Fix planned date, actual date, and delivery date in enriched object
const OLD_PLANNED = `        // Find planned date from batch_processes array (nested from getBatches)
        const bp = (b.batch_processes || []).find((p: any) =>
          p.process_code?.toUpperCase() === processCode
        )
        const planned = bp?.planned_date || ''
        const actual  = bp?.done_at ? bp.done_at.split('T')[0] : ''
        const delay   = delayMeta(planned, actual, now)`

const NEW_PLANNED = `        // Planned date from batch_date_plans for THIS process
        const dp = dpMap[b.id] || {}
        const procColKey = PROC_COL[processCode] || PROC_COL[
          Object.keys(PROC_COL).find(k => k.toUpperCase() === processCode) || ''
        ] || ''
        const planned = procColKey && dp[procColKey]
          ? dp[procColKey].slice(0, 10)  // YYYY-MM-DD
          : ''
        // Delivery date = d_dispatch from batch_date_plans
        const dispatchDate = dp.d_dispatch ? dp.d_dispatch.slice(0, 10) : ''
        // Actual date from batch_processes
        const bp = (b.batch_processes || []).find((p: any) =>
          p.process_code?.toUpperCase() === processCode ||
          p.process_code === processCode
        )
        const actual = bp?.done_at ? bp.done_at.split('T')[0] : ''
        const delay  = delayMeta(planned, actual, now)
        // Timestamp = sent_at on batch (when it arrived at this process)
        const sentAt = b.sent_at || b.updated_at || b.created_at || ''`

if (fms.includes(OLD_PLANNED)) {
  fms = fms.replace(OLD_PLANNED, NEW_PLANNED)
  console.log('✓ FMS: planned date from batch_date_plans, sent_at as timestamp')
} else console.error('✗ FMS planned pattern not found')

// Fix enriched object to include sentAt and dispatchDate
const OLD_ENRICHED = `        return {
          ...b,
          orderNo:         order.order_number    || '-',`

const NEW_ENRICHED = `        return {
          ...b,
          sentAt,          // when batch arrived at this process
          orderNo:         order.order_number    || '-',`

if (fms.includes(OLD_ENRICHED)) {
  fms = fms.replace(OLD_ENRICHED, NEW_ENRICHED)
  console.log('✓ FMS: added sentAt to enriched object')
} else console.error('✗ FMS enriched start pattern not found')

const OLD_DELIVERY = `          delivery_date:   order.delivery_date   || '-',`
const NEW_DELIVERY = `          delivery_date:   dispatchDate || order.delivery_date || '-',`

if (fms.includes(OLD_DELIVERY)) {
  fms = fms.replace(OLD_DELIVERY, NEW_DELIVERY)
  console.log('✓ FMS: delivery_date from d_dispatch')
} else console.error('✗ delivery_date pattern not found')

// Fix TIMESTAMP column to use sentAt instead of created_at
const OLD_TS = `                        case 'created_at':    return <td key={col.id} style={{ ...s, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(row.created_at)}</td>`
const NEW_TS = `                        case 'created_at':    return <td key={col.id} style={{ ...s, fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtDateTime(row.sentAt || row.created_at)}</td>`

if (fms.includes(OLD_TS)) {
  fms = fms.replace(OLD_TS, NEW_TS)
  console.log('✓ FMS: timestamp shows sentAt (when batch arrived at process)')
} else console.error('✗ timestamp render pattern not found')

// Fix planned_date render to format correctly from YYYY-MM-DD
const OLD_PD = `                        case 'planned_date':  return <td key={col.id} style={{ ...s, fontWeight: 700, color: row.plannedDate ? 'var(--accent)' : 'var(--text-tertiary)' }}>{fmtDate(row.plannedDate)}</td>`
const NEW_PD = `                        case 'planned_date':  return <td key={col.id} style={{ ...s, fontWeight: 700, color: row.plannedDate ? 'var(--success)' : 'var(--text-tertiary)' }}>{row.plannedDate ? fmtDate(row.plannedDate) : '-'}</td>`

if (fms.includes(OLD_PD)) {
  fms = fms.replace(OLD_PD, NEW_PD)
  console.log('✓ FMS: planned date renders correctly')
} else console.error('✗ planned date render not found')

fs.writeFileSync(fmsPath, fms, 'utf8')
console.log('\n✓ All fixes done')
