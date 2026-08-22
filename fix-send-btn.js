const fs = require('fs')
const filePath = 'app/first-process-batch/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Replace Dispatch All button with Send to Process
const OLD = `          <button onClick={() => window.location.href = '/'}
            style={{ padding:'6px 12px', fontSize:12, border:'1px solid var(--border-medium)',
              borderRadius:6, background:'var(--bg-primary)', cursor:'pointer' }}>
            ⚡ Dispatch All ({filtered.length})
          </button>`

const NEW = `          <button onClick={handleSendToProcess} disabled={sending || selectedBatches.size === 0}
            style={{ padding:'6px 16px', fontSize:12, fontWeight:700, border:'none',
              borderRadius:6, cursor: selectedBatches.size > 0 ? 'pointer' : 'not-allowed',
              background: selectedBatches.size > 0 ? '#2563EB' : '#CBD5E0',
              color:'white' }}>
            {sending ? 'Sending…' : \`🚀 Send to Process\${selectedBatches.size > 0 ? \` (\${selectedBatches.size})\` : ''}\`}
          </button>`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Replaced Dispatch All with Send to Process button')
} else {
  console.error('✗ Pattern not found')
}
