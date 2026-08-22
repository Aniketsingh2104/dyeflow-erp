// Run from C:\dyeflow-react: node fix-batches-id-filter.js
// Add ?id= filter support to batches API GET so machine page can fetch single batch

const fs   = require('fs')
const path = require('path')
const filePath = path.join(__dirname, 'app', 'api', 'batches', 'route.ts')
let content = fs.readFileSync(filePath, 'utf8')

const OLD = `    const orderId   = url.searchParams.get('order_id')`
const NEW = `    const batchUUID = url.searchParams.get('id')
    const orderId   = url.searchParams.get('order_id')`

if (content.includes(OLD)) {
  content = content.replace(OLD, NEW)
  console.log('✓ Added id param extraction')
} else {
  console.error('✗ id param pattern not found')
}

// Add filter by id in the params build
const OLD2 = `    if (orderId)   params['order_id'] = \`eq.\${orderId}\``
const NEW2 = `    if (batchUUID) params['id']       = \`eq.\${batchUUID}\`
    if (orderId)   params['order_id'] = \`eq.\${orderId}\``

if (content.includes(OLD2)) {
  content = content.replace(OLD2, NEW2)
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('✓ Added id filter to batches GET params')
} else {
  console.error('✗ orderId filter pattern not found')
}
