const fs = require('fs')
const filePath = 'app/first-process-batch/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

const OLD = `          delivery_date:   order.delivery_date ? toDisplay(order.delivery_date) : '-',`

const NEW = `          // Delivery date = FinalDispatch date from batch_date_plans, fallback to Dispatch, then order delivery_date
          delivery_date:   (() => {
            if (dp.d_finaldispatch) return toDisplay(dp.d_finaldispatch)
            if (dp.d_dispatch)      return toDisplay(dp.d_dispatch)
            if (order.delivery_date) return toDisplay(order.delivery_date)
            return '-'
          })(),`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ delivery_date now reads from batch_date_plans.d_finaldispatch')
} else {
  console.error('✗ Pattern not found')
}
