// Run from C:\dyeflow-react: node fix-machine-links.js

const fs   = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'machines', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// Add Open button to machine header that navigates using UUID
const oldMachineHeader = `              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Load bar */}
                <div style={{ width: 80, height: 8, background: 'var(--border-light)',
                  borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4,
                    width: \`\${loadPct}%\`,
                    background: loadPct > 80 ? 'var(--danger)' : loadPct > 50 ? 'var(--warning)' : 'var(--success)',
                    transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                  background: mach.status === 'running' ? 'var(--success-light)' : 'var(--bg-secondary)',
                  color:      mach.status === 'running' ? 'var(--success)'       : 'var(--text-tertiary)' }}>
                  {mach.status === 'running' ? 'Running' : 'Idle'}
                </span>
              </div>`

const newMachineHeader = `              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Load bar */}
                <div style={{ width: 80, height: 8, background: 'var(--border-light)',
                  borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4,
                    width: \`\${loadPct}%\`,
                    background: loadPct > 80 ? 'var(--danger)' : loadPct > 50 ? 'var(--warning)' : 'var(--success)',
                    transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                  background: mach.status === 'running' ? 'var(--success-light)' : 'var(--bg-secondary)',
                  color:      mach.status === 'running' ? 'var(--success)'       : 'var(--text-tertiary)' }}>
                  {mach.status === 'running' ? 'Running' : 'Idle'}
                </span>
                {/* Open machine detail page using UUID */}
                <button
                  onClick={() => window.location.href = \`/machines/\${mach.id}\`}
                  style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600,
                    border: '1px solid var(--border-medium)', borderRadius: 6,
                    background: 'var(--bg-primary)', color: 'var(--accent)',
                    cursor: 'pointer' }}>
                  Open Sheet →
                </button>
              </div>`

if (content.includes(oldMachineHeader)) {
  content = content.replace(oldMachineHeader, newMachineHeader)
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('✓ Added "Open Sheet" button with UUID-based navigation to each machine')
} else {
  console.error('✗ Pattern not found')
}
