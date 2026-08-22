// Run from C:\dyeflow-react: node fix-batches-select.js

const fs   = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'api', 'batches', 'route.ts')
let content = fs.readFileSync(filePath, 'utf8')

const old = `      'id,batch_id,order_id,machine_id,batch_number,kg,status,current_process,' +
      'is_done,is_faulty,planned_date,actual_date,notes,process_route,' +
      'date_calc_plan,dc_generated_once,dc_regenerate,' +
      'fms_enter_at,fms_actual_dates,' +
      'created_at,updated_at,' +
      'machines(id,name,capacity),' +
      'batch_processes(id,process_code,status,sent_at,received_at,done_at)'`

const fixed = `      'id,batch_id,order_id,machine_id,batch_number,kg,mtr,taka,status,current_process,' +
      'is_done,is_faulty,planned_date,actual_date,notes,process_route,' +
      'date_calc_plan,dc_generated_once,dc_regenerate,' +
      'fms_enter_at,fms_actual_dates,' +
      'created_at,updated_at,' +
      'machines(id,name,capacity),' +
      'batch_processes(id,process_code,status,sent_at,received_at,done_at)'`

if (content.includes(old)) {
  content = content.replace(old, fixed)
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('✓ Added mtr,taka to batches GET select')
} else {
  console.error('✗ Pattern not found')
  // Show context around kg in select
  const idx = content.indexOf("'id,batch_id")
  console.log('Select found at:', idx)
  console.log(content.substring(idx, idx + 300))
}
