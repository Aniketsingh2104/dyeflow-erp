const fs = require('fs')
const filePath = 'app/api/batches/route.ts'
let c = fs.readFileSync(filePath, 'utf8')

// Remove ALL duplicate uuid_id declarations - keep only one
// Replace the entire block of duplicate lines with a single clean version
const lines = c.split('\n')
const newLines = []
let uuidIdSeen = false

for (const line of lines) {
  if (line.includes("const uuid_id") && line.includes("searchParams.get('id')")) {
    if (!uuidIdSeen) {
      newLines.push("    const uuid_id    = searchParams.get('id')")
      uuidIdSeen = true
    }
    // skip duplicates
  } else {
    newLines.push(line)
  }
}

c = newLines.join('\n')
fs.writeFileSync(filePath, c, 'utf8')
console.log('✓ Removed duplicate uuid_id declarations')

// Verify
const count = (c.match(/const uuid_id/g) || []).length
console.log('uuid_id declarations remaining:', count)
if (count === 1) console.log('✓ Exactly one declaration - build will succeed')
else console.error('✗ Still has duplicates!')
