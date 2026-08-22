const fs = require('fs')
const filePath = 'components/BatchCollaborationModal.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// The real fix: Body must be overflow:hidden, not overflow:auto
// And the grid children must have height constraints
const OLD = `        {/* Body */}
        <div style={{ flex:1, overflow:'auto', padding:20 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>`

const NEW = `        {/* Body */}
        <div style={{ flex:1, overflow:'hidden', padding:20 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, height:'100%' }}>`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Body overflow:hidden, grid height:100%')
} else {
  console.error('✗ Body pattern not found')
}
