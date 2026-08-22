const fs = require('fs')
const filePath = 'app/fms/[process]/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: Add handleRollback function after handleDone
const OLD_FAULTY_FN = `  const handleFaulty = async () => {`

const NEW_ROLLBACK = `  // ── Rollback — send batch back to previous process ──────────────────────
  const handleRollback = async (row: any) => {
    const route: string[] = row.process_route || row.routeStr?.split('/') || []
    const currentIdx = route.findIndex((c: string) =>
      c.toUpperCase() === processCode || c === row.current_process
    )

    let prevProcess: string | null = null
    let newStatus = 'in-process'

    if (currentIdx <= 0) {
      // First process — rollback to pending (back to First Process page)
      prevProcess = null
      newStatus   = 'pending'
    } else {
      // Not first — rollback to previous process
      prevProcess = route[currentIdx - 1]
      newStatus   = 'in-process'
    }

    const msg = prevProcess
      ? \`Roll back \${row.batch_id} from \${processCode} to \${prevProcess}?\`
      : \`Roll back \${row.batch_id} from \${processCode} to First Process page (pending)?\`

    if (!confirm(msg)) return
    setSaving(true)
    try {
      // 1. Update batch: set current_process to previous, clear sent_at
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:          'update',
          id:              row.id,
          current_process: prevProcess,
          status:          newStatus,
          sent_at:         null,
        })
      })

      // 2. Reset current process's batch_process row: clear done_at, set status pending
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:       'reset_process',
          batch_id:     row.id,
          process_code: row.current_process || processCode,
        })
      })

      showToast(prevProcess
        ? \`↩ \${row.batch_id} rolled back to \${prevProcess}\`
        : \`↩ \${row.batch_id} returned to First Process page\`)
      loadRows()
    } finally { setSaving(false) }
  }

  const handleFaulty = async () => {`

if (c.includes(OLD_FAULTY_FN)) {
  c = c.replace(OLD_FAULTY_FN, NEW_ROLLBACK)
  console.log('✓ Added handleRollback function')
} else console.error('✗ handleFaulty pattern not found')

// Fix 2: Add ↩ Rollback button in actions column
const OLD_FOB_BTN = `                                <button onClick={() => { setFobModal(row); setFobType('dyeing'); setFobReason('') }}
                                  disabled={done || saving}
                                  style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                    border: '1px solid var(--purple)', borderRadius: 4,
                                    cursor: done ? 'not-allowed' : 'pointer',
                                    background: 'transparent', color: 'var(--purple)', opacity: done ? 0.4 : 1 }}>
                                  + FOB
                                </button>`

const NEW_FOB_BTN = `                                <button onClick={() => { setFobModal(row); setFobType('dyeing'); setFobReason('') }}
                                  disabled={done || saving}
                                  style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                    border: '1px solid var(--purple)', borderRadius: 4,
                                    cursor: done ? 'not-allowed' : 'pointer',
                                    background: 'transparent', color: 'var(--purple)', opacity: done ? 0.4 : 1 }}>
                                  + FOB
                                </button>
                                <button onClick={() => handleRollback(row)}
                                  disabled={saving}
                                  style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                    border: '1px solid #DC2626', borderRadius: 4,
                                    cursor: 'pointer', background: 'transparent',
                                    color: '#DC2626' }}
                                  title="Roll back to previous process">
                                  ↩ Delete
                                </button>`

if (c.includes(OLD_FOB_BTN)) {
  c = c.replace(OLD_FOB_BTN, NEW_FOB_BTN)
  console.log('✓ Added ↩ Delete (rollback) button in actions column')
} else console.error('✗ FOB button pattern not found')

// Fix 3: Update actions column width to fit new button
const OLD_WIDTH = `  { id: 'actions',          label: 'ACTIONS',          visible: true,  width: 220, minWidth: 160 },`
const NEW_WIDTH = `  { id: 'actions',          label: 'ACTIONS',          visible: true,  width: 290, minWidth: 200 },`

if (c.includes(OLD_WIDTH)) {
  c = c.replace(OLD_WIDTH, NEW_WIDTH)
  console.log('✓ Increased actions column width to fit rollback button')
} else console.error('✗ actions width not found')

fs.writeFileSync(filePath, c, 'utf8')
console.log('\n✓ All rollback changes applied')
