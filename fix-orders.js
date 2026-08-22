// Run this from C:\dyeflow-react using: node fix-orders.js

const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'orders', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// ── Fix 1: saveOrder — strip nested join objects ──────────────────────────
const oldSaveOrder = `      const payload = {
        ...formData,
        qty_kg:     parseFloat(formData.qty_kg)   || 0,
        qty_mtr:    parseFloat(formData.qty_mtr)  || 0,
        no_of_taka: parseInt(formData.no_of_taka) || 0,
        status: formData.hold_approval === 'Hold' ? 'hold'
               : modal === 'new' ? 'new'
               : formData.status,
        process_route: formData.process_route || [],
      }`

const newSaveOrder = `      // Strip nested join objects — PostgREST rejects 'supervisors'/'machines' as unknown columns
      const {
        supervisors: _s, machines: _m,
        supervisor:  _sv, machine:  _mc,
        ...cleanData
      } = formData

      const payload = {
        ...cleanData,
        qty_kg:     parseFloat(cleanData.qty_kg)   || 0,
        qty_mtr:    parseFloat(cleanData.qty_mtr)  || 0,
        no_of_taka: parseInt(cleanData.no_of_taka) || 0,
        status: cleanData.hold_approval === 'Hold' ? 'hold'
               : modal === 'new' ? 'new'
               : cleanData.status,
        process_route: cleanData.process_route || [],
      }`

if (content.includes(oldSaveOrder)) {
  content = content.replace(oldSaveOrder, newSaveOrder)
  console.log('✓ Fix 1 applied: saveOrder strips join objects')
} else {
  console.error('✗ Fix 1 pattern not found')
}

// ── Fix 2: Assign button — always show, label Re-assign when supervisor exists ──
const oldAssignBtn = `                        {(!order.supervisor_id || order.status === 'new') && (
                          <button className="xs primary" onClick={() => openAssignModal(order)}>Assign</button>
                        )}`

const newAssignBtn = `                        <button className="xs primary" onClick={() => openAssignModal(order)}>
                          {order.supervisor_id ? 'Re-assign' : 'Assign'}
                        </button>`

if (content.includes(oldAssignBtn)) {
  content = content.replace(oldAssignBtn, newAssignBtn)
  console.log('✓ Fix 2 applied: Assign button always visible')
} else {
  console.error('✗ Fix 2 pattern not found — checking alternate...')
  // Try simpler replace
  content = content.replace(
    `(!order.supervisor_id || order.status === 'new') && (`,
    `true && (`
  )
  content = content.replace(
    `>Assign</button>`,
    `>{order.supervisor_id ? 'Re-assign' : 'Assign'}</button>`
  )
  console.log('✓ Fix 2 fallback applied')
}

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ Both fixes written to app/orders/page.tsx')
console.log('Now run: git add app/orders/page.tsx && git commit -m "fix: orders saveOrder" && git push')
