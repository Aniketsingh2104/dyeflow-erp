// Run from C:\dyeflow-react: node fix-machine-icon.js

const fs   = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// Fix the icon to show machine number from name instead of UUID
const old = `            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '8px',
              background: '#FC8181',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '14px',
              fontWeight: 700
            }}>
              {machine.id || 'M'}
            </div>`

const fixed = `            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '8px',
              background: '#FC8181',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '13px',
              fontWeight: 700,
              textAlign: 'center',
              lineHeight: 1.2,
            }}>
              {(() => {
                // Extract number from name e.g. "Long Tube Jet No. 28" → "28"
                const match = (machine.name || '').match(/\\d+$/)
                return match ? '#' + match[0] : (machine.name || 'M').substring(0, 2).toUpperCase()
              })()}
            </div>`

if (content.includes(old)) {
  content = content.replace(old, fixed)
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('✓ Machine icon now shows number from name (e.g. #28) instead of UUID')
} else {
  console.error('✗ Pattern not found')
}
