const fs = require('fs')
const f = 'app/api/machines/route.ts'
let c = fs.readFileSync(f, 'utf8')

const OLD = `'id,name,capacity,status,machine_type,is_active,created_at'`
const NEW = `'id,name,capacity,status,machine_type,is_active,numbering_base_date,created_at'`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(f, c, 'utf8')
  console.log('✓ numbering_base_date added to machines API select')
} else {
  console.log('Current select line:')
  const i = c.indexOf('dbSelect')
  console.log(c.substring(i, i + 150))
}
