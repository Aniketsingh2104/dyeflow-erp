const fs = require('fs')
const filePath = 'app/api/batches/route.ts'
let c = fs.readFileSync(filePath, 'utf8')

// Add sent_at to the batches GET select string
const OLD = `      'id,batch_id,order_id,machine_id,batch_number,kg,mtr,taka,status,current_process,' +
      'is_done,is_faulty,planned_date,actual_date,notes,process_route,' +
      'date_calc_plan,dc_generated_once,dc_regenerate,' +
      'fms_enter_at,fms_actual_dates,' +
      'created_at,updated_at,' +
      'machines(id,name,capacity),' +
      'batch_processes(id,process_code,status,sent_at,received_at,done_at)'`

const NEW = `      'id,batch_id,order_id,machine_id,batch_number,kg,mtr,taka,status,current_process,' +
      'is_done,is_faulty,planned_date,actual_date,notes,process_route,' +
      'date_calc_plan,dc_generated_once,dc_regenerate,' +
      'fms_enter_at,fms_actual_dates,sent_at,' +
      'created_at,updated_at,' +
      'machines(id,name,capacity),' +
      'batch_processes(id,process_code,status,sent_at,received_at,done_at)'`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Added sent_at to batches GET select')
} else {
  console.error('✗ Pattern not found')
}
