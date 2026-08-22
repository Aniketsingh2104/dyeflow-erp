// Run from C:\dyeflow-react: node fix-process-route-fallback.js
const fs   = require('fs')
const path = require('path')
const filePath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

const old = `          const processRoute: string[] = b.process_route || o.process_route || []
          const currentProcess = b.current_process || processRoute[0] || ''`

const fixed = `          // Use batch route if non-empty, else fall back to order route ([] is truthy so must check length)
          const processRoute: string[] = (b.process_route?.length ? b.process_route : null) || (o.process_route?.length ? o.process_route : null) || []
          const currentProcess = b.current_process || processRoute[0] || ''`

if (content.includes(old)) {
  content = content.replace(old, fixed)
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('✓ processRoute fallback fixed — empty array no longer blocks order route fallback')
} else {
  console.error('✗ Pattern not found')
}
