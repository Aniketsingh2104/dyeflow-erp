// Run from C:\dyeflow-react: node fix-machine-faulty.js
// Fixes the broken toggleFaulty function in machine page

const fs   = require('fs')
const path = require('path')
const filePath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// Find and replace the broken toggleFaulty block
// The broken version starts with the async toggleFaulty and has unclosed dead code
const brokenStart = `  const toggleFaulty = async (batchId: string, _orderId: string, currentFaulty: boolean) => {
    // batchId here is the UUID (b.id), not the batch_id string
    await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: batchId, is_faulty: !currentFaulty })
    })
    loadData()
    if (false) { // dead code to satisfy linter
    const db = {} as any`

const cleanToggleFaulty = `  const toggleFaulty = async (batchId: string, _orderId: string, currentFaulty: boolean) => {
    await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: batchId, is_faulty: !currentFaulty })
    })
    loadData()
  }`

if (content.includes(brokenStart)) {
  // Find the end of the broken block - it ends with "  }" before getNumberingReview
  const brokenEnd = `          }
  }

  const getNumberingReview`
  const cleanEnd = `\n\n  const getNumberingReview`

  // Replace from broken start through the broken end
  const startIdx = content.indexOf(brokenStart)
  const endMarker = '  const getNumberingReview'
  const endIdx = content.indexOf(endMarker)

  if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + cleanToggleFaulty + '\n\n' + content.substring(endIdx)
    fs.writeFileSync(filePath, content, 'utf8')
    console.log('✓ toggleFaulty fixed — removed broken dead code block')
  } else {
    console.error('✗ Could not find boundaries', startIdx, endIdx)
  }
} else {
  console.log('✓ toggleFaulty already clean (no broken block found)')
}
