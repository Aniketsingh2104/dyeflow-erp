const fs = require('fs')
const filePath = 'app/first-process-batch/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: Add selectedBatches state
const OLD_STATE = `  const [resizing, setResizing] = useState<{key:string;startX:number;startW:number}|null>(null)
  const colMenuRef = useRef<HTMLDivElement>(null)`

const NEW_STATE = `  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [resizing, setResizing] = useState<{key:string;startX:number;startW:number}|null>(null)
  const colMenuRef = useRef<HTMLDivElement>(null)`

if (c.includes(OLD_STATE)) {
  c = c.replace(OLD_STATE, NEW_STATE)
  console.log('✓ Added selectedBatches state')
} else console.error('✗ state pattern not found')

// Fix 2: Add "Send to Process" handler
const OLD_DISPATCH = `  // ── Dispatch ──────────────────────────────────────────────────────────────
  const handleDispatch = async (batch: any) => {`

const NEW_DISPATCH = `  // ── Send to First Process ────────────────────────────────────────────────
  const handleSendToProcess = async () => {
    const selected = batches.filter(b => selectedBatches.has(b.id))
    if (!selected.length) { alert('Select at least one batch'); return }
    if (!confirm(\`Send \${selected.length} batch(es) to their first process?\`)) return
    setSending(true)
    try {
      await Promise.all(selected.map(b =>
        fetch('/api/batches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action:          'update',
            id:              b.id,
            current_process: b.first_process,
            status:          'in-process',
          })
        })
      ))
      setSelectedBatches(new Set())
      await load()
      // Group by process for toast message
      const byProcess: Record<string,number> = {}
      selected.forEach(b => { byProcess[b.first_process] = (byProcess[b.first_process]||0)+1 })
      const msg = Object.entries(byProcess).map(([p,n]) => \`\${n} → \${p}\`).join(', ')
      alert(\`✓ Sent: \${msg}\`)
    } finally { setSending(false) }
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────
  const handleDispatch = async (batch: any) => {`

if (c.includes(OLD_DISPATCH)) {
  c = c.replace(OLD_DISPATCH, NEW_DISPATCH)
  console.log('✓ Added handleSendToProcess')
} else console.error('✗ dispatch pattern not found')

// Fix 3: Add Send button in header
const OLD_BTNS = `          <button onClick={() => window.location.href = '/'}
            style={{ padding:'6px 12px', fontSize:12, border:'1px solid var(--border-medium)',
              borderRadius:6, background:'var(--bg-primary)', cursor:'pointer',
              color:'var(--text-primary)', fontWeight:500 }}>
            ⚡ Dispatch All ({filtered.length})
          </button>`

const NEW_BTNS = `          {selectedBatches.size > 0 && (
            <button onClick={handleSendToProcess} disabled={sending}
              style={{ padding:'6px 16px', fontSize:12, fontWeight:700, border:'none',
                borderRadius:6, background:'var(--accent)', color:'white', cursor:'pointer' }}>
              {sending ? 'Sending…' : \`🚀 Send to Process (\${selectedBatches.size})\`}
            </button>
          )}`

if (c.includes(OLD_BTNS)) {
  c = c.replace(OLD_BTNS, NEW_BTNS)
  console.log('✓ Added Send to Process button')
} else console.error('✗ buttons pattern not found')

// Fix 4: Add checkbox column to COLUMNS definition
const OLD_COLS = `const COLUMNS = [
  { key: 'batch_id',        label: 'BATCH ID',       defaultWidth: 140 },`

const NEW_COLS = `const COLUMNS = [
  { key: 'select',          label: '',               defaultWidth: 40  },
  { key: 'batch_id',        label: 'BATCH ID',       defaultWidth: 140 },`

if (c.includes(OLD_COLS)) {
  c = c.replace(OLD_COLS, NEW_COLS)
  console.log('✓ Added select column to COLUMNS')
} else console.error('✗ COLUMNS pattern not found')

// Fix 5: Handle select column in filter row (no filter input)
const OLD_FILTER_TH = `                  {col.key !== 'actions' && (
                      <input value={colFilters[col.key]||''} placeholder="Filter…"
                        onChange={e => setColFilters(p => ({...p,[col.key]:e.target.value}))}
                        style={{ width:'100%', padding:'3px 6px', fontSize:11,
                          border:'1px solid var(--border-medium)', borderRadius:4,
                          background:'var(--bg-primary)', color:'var(--text-primary)' }} />
                    )}`

const NEW_FILTER_TH = `                  {col.key !== 'actions' && col.key !== 'select' && (
                      <input value={colFilters[col.key]||''} placeholder="Filter…"
                        onChange={e => setColFilters(p => ({...p,[col.key]:e.target.value}))}
                        style={{ width:'100%', padding:'3px 6px', fontSize:11,
                          border:'1px solid var(--border-medium)', borderRadius:4,
                          background:'var(--bg-primary)', color:'var(--text-primary)' }} />
                    )}
                    {col.key === 'select' && (
                      <input type="checkbox"
                        checked={filtered.length > 0 && filtered.every(b => selectedBatches.has(b.id))}
                        onChange={e => {
                          if (e.target.checked) setSelectedBatches(new Set(filtered.map(b => b.id)))
                          else setSelectedBatches(new Set())
                        }}
                        style={{ cursor:'pointer', accentColor:'var(--accent)' }} />
                    )}`

if (c.includes(OLD_FILTER_TH)) {
  c = c.replace(OLD_FILTER_TH, NEW_FILTER_TH)
  console.log('✓ Added select-all checkbox in filter row')
} else console.error('✗ filter th pattern not found')

// Fix 6: Add select case in switch statement
const OLD_SWITCH = `                    switch(col.key) {
                      case 'batch_id': return (`

const NEW_SWITCH = `                    switch(col.key) {
                      case 'select': return (
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
                      )
                      case 'batch_id': return (`

if (c.includes(OLD_SWITCH)) {
  c = c.replace(OLD_SWITCH, NEW_SWITCH)
  console.log('✓ Added select case in switch')
} else console.error('✗ switch pattern not found')

fs.writeFileSync(filePath, c, 'utf8')
console.log('\n✓ All done')
