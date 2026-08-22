const fs = require('fs')
const filePath = 'app/first-process-batch/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: Move checkbox to ACTIONS column — remove select from COLUMNS, keep actions
// Replace select column definition with just putting checkbox in actions

// Remove select from COLUMNS
const OLD_COLS = `const COLUMNS = [
  { key: 'select',          label: '',               defaultWidth: 40  },
  { key: 'batch_id',        label: 'BATCH ID',       defaultWidth: 140 },`

const NEW_COLS = `const COLUMNS = [
  { key: 'batch_id',        label: 'BATCH ID',       defaultWidth: 140 },`

if (c.includes(OLD_COLS)) {
  c = c.replace(OLD_COLS, NEW_COLS)
  console.log('✓ Removed select from COLUMNS')
} else console.error('✗ COLS pattern not found')

// Fix 2: Change actions column label and defaultWidth
const OLD_ACTIONS_COL = `  { key: 'actions',         label: 'ACTIONS',         defaultWidth: 150 },`
const NEW_ACTIONS_COL = `  { key: 'actions',         label: 'SELECT',          defaultWidth: 80  },`

if (c.includes(OLD_ACTIONS_COL)) {
  c = c.replace(OLD_ACTIONS_COL, NEW_ACTIONS_COL)
  console.log('✓ Changed ACTIONS column to SELECT')
} else console.error('✗ actions col pattern not found')

// Fix 3: Remove select-all from filter row (was in select column)
const OLD_SELECT_ALL = `                    {col.key === 'select' && (
                      <input type="checkbox"
                        checked={filtered.length > 0 && filtered.every(b => selectedBatches.has(b.id))}
                        onChange={e => {
                          if (e.target.checked) setSelectedBatches(new Set(filtered.map(b => b.id)))
                          else setSelectedBatches(new Set())
                        }}
                        style={{ cursor:'pointer', accentColor:'var(--accent)' }} />
                    )}`

if (c.includes(OLD_SELECT_ALL)) {
  c = c.replace(OLD_SELECT_ALL, ``)
  console.log('✓ Removed select-all from filter row')
}

// Fix 4: Also remove select case from switch
const OLD_SELECT_CASE = `                      case 'select': return (
                        <td key={col.key} style={{...tdStyle, textAlign:'center', padding:'9px 6px'}}>
                          <input type="checkbox"
                            checked={selectedBatches.has(b.id)}
                            onChange={e => setSelectedBatches(prev => {
                              const n = new Set(prev)
                              e.target.checked ? n.add(b.id) : n.delete(b.id)
                              return n
                            })}
                            style={{ cursor:'pointer', accentColor:'var(--accent)', width:15, height:15 }} />
                        </td>
                      )`

if (c.includes(OLD_SELECT_CASE)) {
  c = c.replace(OLD_SELECT_CASE, ``)
  console.log('✓ Removed select case from switch')
}

// Fix 5: Replace actions case — checkbox only, no Dispatch/FMS buttons
const OLD_ACTIONS_CASE = `                      case 'actions': return (
                        <td key={col.key} style={{...tdStyle,whiteSpace:'nowrap'}}>
                          <div style={{ display:'flex', gap:4 }}>
                            <button className="xs primary" onClick={() => handleDispatch(b)} disabled={saving}>
                              🚀 Dispatch
                            </button>
                            <button className="xs"
                              onClick={() => window.open(\`/machines/\${b.id}\`, '_blank')}
                              style={{ fontSize:11 }}>
                              FMS →
                            </button>
                          </div>
                        </td>
                      )`

const NEW_ACTIONS_CASE = `                      case 'actions': return (
                        <td key={col.key} style={{...tdStyle, textAlign:'center', padding:'9px 6px'}}>
                          <input type="checkbox"
                            checked={selectedBatches.has(b.id)}
                            onChange={e => setSelectedBatches(prev => {
                              const n = new Set(prev)
                              e.target.checked ? n.add(b.id) : n.delete(b.id)
                              return n
                            })}
                            style={{ cursor:'pointer', accentColor:'var(--accent)', width:16, height:16 }} />
                        </td>
                      )`

if (c.includes(OLD_ACTIONS_CASE)) {
  c = c.replace(OLD_ACTIONS_CASE, NEW_ACTIONS_CASE)
  console.log('✓ Actions column now shows checkbox only')
} else console.error('✗ actions case not found')

// Fix 6: Add select-all checkbox in the ACTIONS filter header cell
const OLD_FILTER_CHECK = `                  {col.key !== 'actions' && col.key !== 'select' && (
                      <input value={colFilters[col.key]||''} placeholder="Filter…"
                        onChange={e => setColFilters(p => ({...p,[col.key]:e.target.value}))}
                        style={{ width:'100%', padding:'3px 6px', fontSize:11,
                          border:'1px solid var(--border-medium)', borderRadius:4,
                          background:'var(--bg-primary)', color:'var(--text-primary)' }} />
                    )}`

const NEW_FILTER_CHECK = `                  {col.key !== 'actions' && (
                      <input value={colFilters[col.key]||''} placeholder="Filter…"
                        onChange={e => setColFilters(p => ({...p,[col.key]:e.target.value}))}
                        style={{ width:'100%', padding:'3px 6px', fontSize:11,
                          border:'1px solid var(--border-medium)', borderRadius:4,
                          background:'var(--bg-primary)', color:'var(--text-primary)' }} />
                    )}
                    {col.key === 'actions' && (
                      <input type="checkbox"
                        checked={filtered.length > 0 && filtered.every(b => selectedBatches.has(b.id))}
                        onChange={e => {
                          if (e.target.checked) setSelectedBatches(new Set(filtered.map(b => b.id)))
                          else setSelectedBatches(new Set())
                        }}
                        title="Select All"
                        style={{ cursor:'pointer', accentColor:'var(--accent)', width:15, height:15 }} />
                    )}`

if (c.includes(OLD_FILTER_CHECK)) {
  c = c.replace(OLD_FILTER_CHECK, NEW_FILTER_CHECK)
  console.log('✓ Select-all checkbox added to actions filter header')
} else console.error('✗ filter check pattern not found')

// Fix 7: Move Send to Process button to be visible always in header (not just when selected)
const OLD_SEND_BTN = `          {selectedBatches.size > 0 && (
            <button onClick={handleSendToProcess} disabled={sending}
              style={{ padding:'6px 16px', fontSize:12, fontWeight:700, border:'none',
                borderRadius:6, background:'var(--accent)', color:'white', cursor:'pointer' }}>
              {sending ? 'Sending…' : \`🚀 Send to Process (\${selectedBatches.size})\`}
            </button>
          )}`

const NEW_SEND_BTN = `          <button onClick={handleSendToProcess} disabled={sending || selectedBatches.size === 0}
            style={{ padding:'6px 16px', fontSize:12, fontWeight:700, border:'none',
              borderRadius:6, cursor: selectedBatches.size > 0 ? 'pointer' : 'not-allowed',
              background: selectedBatches.size > 0 ? 'var(--accent)' : '#CBD5E0',
              color:'white', transition:'background 0.2s' }}>
            {sending ? 'Sending…' : \`🚀 Send to Process\${selectedBatches.size > 0 ? \` (\${selectedBatches.size})\` : ''}\`}
          </button>`

if (c.includes(OLD_SEND_BTN)) {
  c = c.replace(OLD_SEND_BTN, NEW_SEND_BTN)
  console.log('✓ Send to Process button always visible, grey when nothing selected')
} else console.error('✗ send btn pattern not found')

fs.writeFileSync(filePath, c, 'utf8')
console.log('\n✓ All fixes applied')
