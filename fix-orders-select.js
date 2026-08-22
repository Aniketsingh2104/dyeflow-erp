// Run from C:\dyeflow-react: node fix-orders-select.js

const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'api', 'orders', 'route.ts')
let content = fs.readFileSync(filePath, 'utf8')

const old = `    'id,order_number,challan_no,party,article,color,shade_group,blend,' +
    'qty_kg,qty_mtr,no_of_taka,gsm,width,lab_no,lot_no,sub_party,sales_person,' +
    'type_of_finish,type_of_packing,delivery_date,' +
    'status,supervisor_id,machine_id,process_route,planned_dates,hold_reason,' +
    'hold_approval,remarks,priority,dyeing_fob,rolling_fob,' +
    'created_at,updated_at,supervisors(id,name),machines(id,name,capacity)'`

const fixed = `    'id,order_number,challan_no,party,article,color,shade_group,blend,' +
    'qty_kg,qty_mtr,no_of_taka,gsm,width,lab_no,lot_no,sub_party,sales_person,' +
    'type_of_finish,type_of_packing,delivery_date,' +
    'status,supervisor_id,machine_id,process_route,planned_dates,hold_reason,' +
    'hold_approval,remarks,priority,dyeing_fob,rolling_fob,' +
    'supervisor_confirmed,supervisor_confirmed_at,' +
    'created_at,updated_at,supervisors(id,name),machines(id,name,capacity)'`

if (content.includes(old)) {
  content = content.replace(old, fixed)
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('✓ Added supervisor_confirmed to orders GET select')
} else {
  console.error('✗ Pattern not found')
  console.log('Looking for select string...')
  const idx = content.indexOf('supervisor_id,machine_id')
  console.log('Found at:', idx)
  console.log(content.substring(idx - 10, idx + 200))
}
