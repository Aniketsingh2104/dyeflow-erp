const fs = require('fs')
const filePath = 'app/splitted-orders/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix: Add 'repairing' status to STATUS_MAP
const OLD_STATUS = `const STATUS_MAP: Record<string, { bg: string; color: string; label: string }> = {
  new:          { bg: 'var(--accent-light)',   color: 'var(--accent)',   label: 'New'        },
  pending:      { bg: 'var(--warning-light)',  color: 'var(--warning)',  label: 'Pending'    },
  'in-process': { bg: 'var(--accent-light)',   color: 'var(--accent)',   label: 'In Process' },
  done:         { bg: 'var(--success-light)',  color: 'var(--success)',  label: 'Done'       },
  faulty:       { bg: 'var(--danger-light)',   color: 'var(--danger)',   label: 'Faulty'     },
  hold:         { bg: 'var(--danger-light)',   color: 'var(--danger)',   label: 'On Hold'    },
}`

const NEW_STATUS = `const STATUS_MAP: Record<string, { bg: string; color: string; label: string }> = {
  new:          { bg: 'var(--accent-light)',   color: 'var(--accent)',   label: 'New'        },
  pending:      { bg: 'var(--warning-light)',  color: 'var(--warning)',  label: 'Pending'    },
  'in-process': { bg: 'var(--accent-light)',   color: 'var(--accent)',   label: 'In Process' },
  done:         { bg: 'var(--success-light)',  color: 'var(--success)',  label: 'Done'       },
  faulty:       { bg: 'var(--danger-light)',   color: 'var(--danger)',   label: 'Faulty'     },
  hold:         { bg: 'var(--danger-light)',   color: 'var(--danger)',   label: 'On Hold'    },
  repairing:    { bg: '#FEF3C7',              color: '#D97706',          label: '🔄 Repairing'},
}`

if (c.includes(OLD_STATUS)) {
  c = c.replace(OLD_STATUS, NEW_STATUS)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Added repairing status to STATUS_MAP in Splitted Orders page')
} else {
  console.error('✗ Pattern not found')
}
