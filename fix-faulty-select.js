const fs = require('fs')
const f = 'app/api/faulty/route.ts'
let c = fs.readFileSync(f, 'utf8')

// Fix: remove newline and extra spaces from the select string
const OLD = `    const { data: records, error } = await dbSelect(
      'faulty_records',
      { order: 'created_at.desc', limit: '2000' },
      \`id,batch_id,order_id,order_number,party,color,faulty_type,faulty_kg,
       process_code,status,if_ok,notes,reported_by,resolved_at,created_at,updated_at\`
    )`

const NEW = `    const { data: records, error } = await dbSelect(
      'faulty_records',
      { order: 'created_at.desc', limit: '2000' },
      'id,batch_id,order_id,order_number,party,color,faulty_type,faulty_kg,process_code,status,if_ok,notes,reported_by,resolved_at,created_at,updated_at'
    )`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(f, c, 'utf8')
  console.log('✓ Fixed select string — removed newline')
} else console.error('✗ Pattern not found')
