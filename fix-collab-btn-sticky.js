const fs = require('fs')
const filePath = 'components/BatchCollaborationModal.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix: Make left panel a flex column with sticky Create Collab button at bottom
// Currently: scrollable div → color groups → button at bottom (hidden when scrolled)
// Fix: wrap in flex column, groups area scrolls, button stays pinned at bottom

const OLD_LEFT = `            {/* LEFT — Available Batches */}
            <div>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>
                📦 Available Batches ({freeBatches.length})
              </div>`

const NEW_LEFT = `            {/* LEFT — Available Batches */}
            <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>
                📦 Available Batches ({freeBatches.length})
              </div>`

if (c.includes(OLD_LEFT)) {
  c = c.replace(OLD_LEFT, NEW_LEFT)
  console.log('✓ Left panel set to flex column')
} else console.error('✗ Left panel open pattern not found')

// Make the scrollable groups area flex:1 so it takes remaining space
const OLD_GROUPS_AREA = `              {colorGroups.length === 0 && (
                <div style={{ padding:30, textAlign:'center', color:'#9CA3AF', fontSize:12 }}>
                  All batches are in collab groups
                </div>
              )}`

const NEW_GROUPS_AREA = `              <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
              {colorGroups.length === 0 && (
                <div style={{ padding:30, textAlign:'center', color:'#9CA3AF', fontSize:12 }}>
                  All batches are in collab groups
                </div>
              )}`

if (c.includes(OLD_GROUPS_AREA)) {
  c = c.replace(OLD_GROUPS_AREA, NEW_GROUPS_AREA)
  console.log('✓ Groups area wrapped in scrollable flex:1 div')
} else console.error('✗ Groups area pattern not found')

// Close the scrollable div before the Create Collab button
const OLD_BTN = `              <button onClick={createGroup} disabled={selectedIds.size < 2}`

const NEW_BTN = `              </div>{/* end scrollable groups */}
              <button onClick={createGroup} disabled={selectedIds.size < 2}`

if (c.includes(OLD_BTN)) {
  c = c.replace(OLD_BTN, NEW_BTN)
  console.log('✓ Create Collab button pinned below scrollable area')
} else console.error('✗ Button pattern not found')

fs.writeFileSync(filePath, c, 'utf8')
console.log('\n✓ Done — Create Collab button always visible at bottom of left panel')
