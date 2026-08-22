const fs = require('fs')
const path = 'app/supervisor/[name]/page.tsx'

let c = fs.readFileSync(path, 'utf8')

// Normalize line endings for matching
const cNorm = c.replace(/\r\n/g, '\n')

const searchStr = "const allRepairs: any[] = repairApiRes.data || []\n      setFaultyBatches(allRepairs)\n      setStats({ inbox, faulty: allRepairs.length })"

const replaceStr = "const allRepairs: any[] = (repairApiRes.data || []).filter((r) => {\n        const isMyOrder = mappedOrders.some((o) => o.id === r.order_id)\n        const isMyBatch = r.supervisor_id === resolvedId\n        return isMyOrder || isMyBatch\n      })\n      setFaultyBatches(allRepairs)\n      setStats({ inbox, faulty: allRepairs.length })"

if (cNorm.includes(searchStr)) {
  const fixed = cNorm.replace(searchStr, replaceStr)
  fs.writeFileSync(path, fixed, 'utf8')
  console.log('SUCCESS: supervisor repair queue filter applied')
} else {
  console.log('PATTERN NOT FOUND')
  const idx = cNorm.indexOf('const allRepairs')
  if (idx >= 0) {
    console.log('Found allRepairs at:', idx)
    console.log(cNorm.substring(idx, idx + 300))
  }
}
