const fs = require('fs')
const filePath = 'components/BatchCollaborationModal.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix the Body section - give left and right panels fixed scroll areas
const OLD_BODY = `        {/* Body */}
        <div style={{ flex:1, overflow:'auto', padding:20 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>`

const NEW_BODY = `        {/* Body */}
        <div style={{ flex:1, overflow:'hidden', padding:20, display:'flex', flexDirection:'column' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, flex:1, minHeight:0 }}>`

if (c.includes(OLD_BODY)) {
  c = c.replace(OLD_BODY, NEW_BODY)
  console.log('✓ Body set to flex column with overflow hidden')
} else console.error('✗ Body pattern not found')

// Fix left panel — give it proper flex structure with scrollable groups
const OLD_LEFT_PANEL = `            {/* LEFT — Available Batches */}
            <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>
                📦 Available Batches ({freeBatches.length})
              </div>`

const NEW_LEFT_PANEL = `            {/* LEFT — Available Batches */}
            <div style={{ display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden' }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:8, flexShrink:0 }}>
                📦 Available Batches ({freeBatches.length})
              </div>`

if (c.includes(OLD_LEFT_PANEL)) {
  c = c.replace(OLD_LEFT_PANEL, NEW_LEFT_PANEL)
  console.log('✓ Left panel overflow hidden')
} else console.error('✗ Left panel pattern not found')

// Fix process lock banner to not shrink
const OLD_BANNER = `              {selectedIds.size > 0 && (() => {`
const NEW_BANNER = `              {selectedIds.size > 0 && (() => {`
// No change needed there

// Fix scrollable groups wrapper
const OLD_SCROLL = `              <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>`
const NEW_SCROLL = `              <div style={{ flex:1, overflowY:'auto', minHeight:0, paddingRight:4 }}>`

if (c.includes(OLD_SCROLL)) {
  c = c.replace(OLD_SCROLL, NEW_SCROLL)
  console.log('✓ Groups scroll area adjusted')
} else console.error('✗ Scroll area pattern not found')

// Fix right panel — also scrollable
const OLD_RIGHT = `            {/* RIGHT — Collab Groups */}
            <div>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>
                🤝 Collaboration Groups ({collabGroups.length})
              </div>`

const NEW_RIGHT = `            {/* RIGHT — Collab Groups */}
            <div style={{ display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden' }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:8, flexShrink:0 }}>
                🤝 Collaboration Groups ({collabGroups.length})
              </div>
              <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>`

if (c.includes(OLD_RIGHT)) {
  c = c.replace(OLD_RIGHT, NEW_RIGHT)
  console.log('✓ Right panel now scrollable')
} else console.error('✗ Right panel pattern not found')

// Close the right panel scroll div before closing the right panel div
const OLD_RIGHT_CLOSE = `            </div>\n\n          </div>\n        </div>`
const NEW_RIGHT_CLOSE = `            </div>{/* end right scroll */}\n            </div>{/* end right panel */}\n\n          </div>\n        </div>`

if (c.includes(OLD_RIGHT_CLOSE)) {
  c = c.replace(OLD_RIGHT_CLOSE, NEW_RIGHT_CLOSE)
  console.log('✓ Right panel scroll div closed')
} else {
  // Try alternate closing pattern
  console.error('✗ Right close pattern not found - checking file end...')
}

fs.writeFileSync(filePath, c, 'utf8')
console.log('\n✓ Done')
