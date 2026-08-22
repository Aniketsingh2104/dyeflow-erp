// Run from C:\dyeflow-react: node fix-nav-machine-links.js

const fs   = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'components', 'Navigation.tsx')
let content = fs.readFileSync(filePath, 'utf8')

const old = `          path: \`/machines/\${(m.name || '').toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9-]/g, '')}\`,`

const fixed = `          path: \`/machines/\${m.id}\`,   // use UUID, not name slug`

if (content.includes(old)) {
  content = content.replace(old, fixed)
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('✓ Navigation machine links now use UUID instead of name slug')
} else {
  console.error('✗ Pattern not found')
  // Show what's there
  const idx = content.indexOf('/machines/')
  console.log('machines path found at:', idx)
  console.log(content.substring(idx - 20, idx + 120))
}
