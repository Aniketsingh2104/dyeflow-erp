const fs = require('fs')
let c = fs.readFileSync('app/api/batches/route.ts', 'utf8')

// Add last_process to SELECT
const OLD_SELECT = `      'id,batch_id,order_id,machine_id,batch_number,kg,mtr,taka,status,current_process,' +
      'is_done,is_faulty,planned_date,actual_date,notes,process_route,' +
      'date_calc_plan,dc_generated_once,dc_regenerate,' +
      'fms_enter_at,fms_actual_dates,sent_at,' +
      'created_at,updated_at,' +
      'machines(id,name,capacity),' +
      'batch_processes(id,process_code,status,sent_at,received_at,done_at)'`

const NEW_SELECT = `      'id,batch_id,order_id,machine_id,batch_number,kg,mtr,taka,status,current_process,last_process,' +
      'is_done,is_faulty,planned_date,actual_date,notes,process_route,' +
      'date_calc_plan,dc_generated_once,dc_regenerate,' +
      'fms_enter_at,fms_actual_dates,sent_at,' +
      'created_at,updated_at,' +
      'machines(id,name,capacity),' +
      'batch_processes(id,process_code,status,sent_at,received_at,done_at)'`

if (c.includes(OLD_SELECT)) {
  c = c.replace(OLD_SELECT, NEW_SELECT)
  fs.writeFileSync('app/api/batches/route.ts', c, 'utf8')
  console.log('✓ Batches API: last_process added to SELECT')
} else console.error('✗ SELECT pattern not found')
