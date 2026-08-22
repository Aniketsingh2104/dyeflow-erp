const fs = require('fs')
const f = 'app/api/batches/route.ts'
let c = fs.readFileSync(f, 'utf8')

const OLD1 = `    const order_id   = searchParams.get('order_id')`
const NEW1 = `    const uuid_id    = searchParams.get('id')\n    const order_id   = searchParams.get('order_id')`
const OLD2 = `    if (order_id)   query['order_id']   = \`eq.\${order_id}\``
const NEW2 = `    if (uuid_id)    query['id']         = \`eq.\${uuid_id}\`\n    if (order_id)   query['order_id']   = \`eq.\${order_id}\``

let changed = 0
if (c.includes(OLD1)) { c = c.replace(OLD1, NEW1); changed++; console.log('✓ id param added') }
else console.log('✓ id param already exists')
if (c.includes(OLD2)) { c = c.replace(OLD2, NEW2); changed++; console.log('✓ id filter added') }
else console.log('✓ id filter already exists')

fs.writeFileSync(f, c, 'utf8')
console.log('Done. Changed:', changed)
