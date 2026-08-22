const fs = require('fs')

// The page code is correct — shows ALL repairing batches
// The issue is the /api/repair-assign GET might be failing
// Let's check what it returns by reading it

const api = fs.readFileSync('app/api/repair-assign/route.ts', 'utf8')
const hasOrderId = api.includes('order_id')
const hasRepairing = api.includes("status: 'eq.repairing'")
console.log('Has order_id:', hasOrderId)
console.log('Has repairing filter:', hasRepairing)
console.log('\nFirst 500 chars of GET:')
const i = api.indexOf('export async function GET')
console.log(api.substring(i, i + 500))
