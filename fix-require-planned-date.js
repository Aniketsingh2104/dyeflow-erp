const fs = require('fs')
const filePath = 'app/first-process-batch/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: Block Send to Process if any selected batch has no planned date
const OLD_SEND = `  // ── Send to First Process ────────────────────────────────────────────────
  const handleSendToProcess = async () => {
    const selected = batches.filter(b => selectedBatches.has(b.id))
    if (!selected.length) { alert('Select at least one batch'); return }
    if (!confirm(\`Send \${selected.length} batch(es) to their first process?\`)) return`

const NEW_SEND = `  // ── Send to First Process ────────────────────────────────────────────────
  const handleSendToProcess = async () => {
    const selected = batches.filter(b => selectedBatches.has(b.id))
    if (!selected.length) { alert('Select at least one batch'); return }

    // Block if any selected batch has no planned date
    const noDates = selected.filter(b => !b.planned_date || b.planned_date === '-')
    if (noDates.length > 0) {
      const ids = noDates.map(b => b.batch_id).join(', ')
      alert(\`Cannot send — planned date not generated for:\\n\${ids}\\n\\nPlease generate dates in Date Calculator first.\`)
      return
    }

    if (!confirm(\`Send \${selected.length} batch(es) to their first process?\`)) return`

if (c.includes(OLD_SEND)) {
  c = c.replace(OLD_SEND, NEW_SEND)
  console.log('✓ handleSendToProcess blocks batches without planned date')
} else console.error('✗ handleSendToProcess pattern not found')

// Fix 2: Show planned_date warning on rows with no date
// Grey out the checkbox and show tooltip on rows missing planned date
const OLD_CHECKBOX = `                          <input type="checkbox"
                            checked={selectedBatches.has(b.id)}
                            onChange={e => setSelectedBatches(prev => {
                              const n = new Set(prev)
                              e.target.checked ? n.add(b.id) : n.delete(b.id)
                              return n
                            })}
                            style={{ cursor:'pointer', accentColor:'var(--accent)', width:16, height:16 }} />`

const NEW_CHECKBOX = `                          <input type="checkbox"
                            checked={selectedBatches.has(b.id)}
                            disabled={!b.planned_date || b.planned_date === '-'}
                            title={!b.planned_date || b.planned_date === '-' ? 'Generate planned date first in Date Calculator' : ''}
                            onChange={e => setSelectedBatches(prev => {
                              const n = new Set(prev)
                              e.target.checked ? n.add(b.id) : n.delete(b.id)
                              return n
                            })}
                            style={{
                              cursor: (!b.planned_date || b.planned_date === '-') ? 'not-allowed' : 'pointer',
                              accentColor:'var(--accent)', width:16, height:16,
                              opacity: (!b.planned_date || b.planned_date === '-') ? 0.3 : 1
                            }} />`

if (c.includes(OLD_CHECKBOX)) {
  c = c.replace(OLD_CHECKBOX, NEW_CHECKBOX)
  console.log('✓ Checkbox disabled and greyed out when no planned date')
} else console.error('✗ Checkbox pattern not found')

// Fix 3: Highlight planned_date cell in red/orange when missing
const OLD_PD_CELL = `                      case 'planned_date': return (
                        <td key={col.key} style={{...tdStyle, fontWeight:700,
                          color: b.planned_date !== '-' ? 'var(--success)' : 'var(--text-tertiary)'}}>
                          {b.planned_date}
                        </td>
                      )`

const NEW_PD_CELL = `                      case 'planned_date': return (
                        <td key={col.key} style={{...tdStyle, fontWeight:700,
                          color: b.planned_date && b.planned_date !== '-' ? 'var(--success)' : 'var(--danger)',
                          background: (!b.planned_date || b.planned_date === '-') ? 'var(--danger-light)' : ''}}>
                          {b.planned_date && b.planned_date !== '-' ? b.planned_date : '⚠ No Date'}
                        </td>
                      )`

if (c.includes(OLD_PD_CELL)) {
  c = c.replace(OLD_PD_CELL, NEW_PD_CELL)
  console.log('✓ Planned date cell shows red warning when missing')
} else console.error('✗ Planned date cell pattern not found')

// Fix 4: Select-all checkbox only selects batches WITH planned date
const OLD_ALL = `                      if (e.target.checked) setSelectedBatches(new Set(filtered.map(b => b.id)))
                          else setSelectedBatches(new Set())`

const NEW_ALL = `                      if (e.target.checked) {
                            // Only select batches that have a planned date
                            const eligible = filtered.filter(b => b.planned_date && b.planned_date !== '-')
                            setSelectedBatches(new Set(eligible.map(b => b.id)))
                          } else setSelectedBatches(new Set())`

if (c.includes(OLD_ALL)) {
  c = c.replace(OLD_ALL, NEW_ALL)
  console.log('✓ Select-all only selects batches with planned date')
} else console.error('✗ Select-all pattern not found')

// Fix 5: Send button shows count of eligible batches only
const OLD_BTN = `          <button onClick={handleSendToProcess} disabled={sending || selectedBatches.size === 0}
            style={{ padding:'6px 16px', fontSize:12, fontWeight:700, border:'none',
              borderRadius:6, cursor: selectedBatches.size > 0 ? 'pointer' : 'not-allowed',
              background: selectedBatches.size > 0 ? '#2563EB' : '#CBD5E0',
              color:'white' }}>
            {sending ? 'Sending…' : \`🚀 Send to Process\${selectedBatches.size > 0 ? \` (\${selectedBatches.size})\` : ''}\`}
          </button>`

const NEW_BTN = `          <button onClick={handleSendToProcess} disabled={sending || selectedBatches.size === 0}
            style={{ padding:'6px 16px', fontSize:12, fontWeight:700, border:'none',
              borderRadius:6, cursor: selectedBatches.size > 0 ? 'pointer' : 'not-allowed',
              background: selectedBatches.size > 0 ? '#2563EB' : '#CBD5E0',
              color:'white' }}
            title={selectedBatches.size === 0 ? 'Select batches with planned dates to send' : ''}>
            {sending ? 'Sending…' : \`🚀 Send to Process\${selectedBatches.size > 0 ? \` (\${selectedBatches.size})\` : ''}\`}
          </button>`

if (c.includes(OLD_BTN)) {
  c = c.replace(OLD_BTN, NEW_BTN)
  console.log('✓ Send button tooltip updated')
} else console.error('✗ Send button pattern not found')

fs.writeFileSync(filePath, c, 'utf8')
console.log('\n✓ All fixes applied')
