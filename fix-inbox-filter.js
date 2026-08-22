// Run from C:\dyeflow-react using: node fix-inbox-filter.js

const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'supervisor', '[name]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// ── Fix 1: getInboxOrders — include 'splitting' and all active statuses ──────
// Order should stay in inbox until it's 'done' or 'hold'
// 'splitting' = route assigned, batches being processed — still needs supervisor attention
const oldInbox = `  const getInboxOrders = () => orders.filter(o => o.status === 'assigned')`

const newInbox = `  // Show all orders that still need supervisor attention
  // Remove only when done or cancelled
  const getInboxOrders = () => orders.filter(o =>
    o.status !== 'done' && o.status !== 'cancelled'
  )`

if (content.includes(oldInbox)) {
  content = content.replace(oldInbox, newInbox)
  console.log('✓ Fix 1: getInboxOrders now shows all active orders (not just assigned)')
} else {
  console.error('✗ Fix 1 pattern not found')
}

// ── Fix 2: stats.inbox — update count to match new filter ────────────────────
const oldInboxCount = `      const inbox = mappedOrders.filter((o: any) =>
        o.status === 'assigned' || o.status === 'new'
      ).length`

const newInboxCount = `      const inbox = mappedOrders.filter((o: any) =>
        o.status !== 'done' && o.status !== 'cancelled'
      ).length`

if (content.includes(oldInboxCount)) {
  content = content.replace(oldInboxCount, newInboxCount)
  console.log('✓ Fix 2: inbox count matches new filter')
} else {
  console.error('✗ Fix 2 pattern not found')
}

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ Inbox filter fixed — orders stay visible after route/machine assignment.')
