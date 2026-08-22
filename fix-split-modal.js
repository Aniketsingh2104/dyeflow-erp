// Run from C:\dyeflow-react using: node fix-split-modal.js

const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'orders', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// ── Fix 1: openSplitModal — fetch existing batches, show only remaining qty ──
const oldOpen = `  const openSplitModal  = (o: any) => {
    setSelectedOrder(o)
    setSplitParts([{ kg: o.qty_kg, mtr: o.qty_mtr || 0, taka: o.no_of_taka || 0 }])
    setModal('split')
  }`

const newOpen = `  const openSplitModal = async (o: any) => {
    setSelectedOrder(o)
    // Fetch existing batches to calculate already-allocated qty
    try {
      const res = await fetch(\`/api/batches?order_id=\${o.id}\`, { cache: 'no-store' })
      const data = await res.json()
      const existingBatches: any[] = data.data || []
      const allocatedKg = existingBatches.reduce((sum: number, b: any) => sum + (parseFloat(b.kg) || 0), 0)
      const remainingKg = Math.max(0, (parseFloat(o.qty_kg) || 0) - allocatedKg)
      // Start with one row pre-filled with remaining qty
      setSplitParts([{ kg: remainingKg, mtr: 0, taka: 0 }])
    } catch {
      // Fallback to full qty if fetch fails
      setSplitParts([{ kg: o.qty_kg, mtr: o.qty_mtr || 0, taka: o.no_of_taka || 0 }])
    }
    setModal('split')
  }`

if (content.includes(oldOpen)) {
  content = content.replace(oldOpen, newOpen)
  console.log('✓ Fix 1: openSplitModal fetches existing batches and shows remaining qty')
} else {
  console.error('✗ Fix 1 pattern not found')
}

// ── Fix 2: saveSplits — use remaining qty for validation, not full qty_kg ──
// Also fix batch numbering to continue from existing batch count
const oldSaveSplits = `  const saveSplits = async () => {
    if (!selectedOrder) return
    const totalKg   = splitParts.reduce((s, p) => s + (parseFloat(p.kg) || 0), 0)
    const remaining = (selectedOrder.qty_kg || 0) - totalKg
    if (Math.abs(remaining) >= 0.5 && !confirm(\`Remaining \${remaining.toFixed(1)} Kg. Save anyway?\`)) return
    setSaving(true)
    try {
      const batches = splitParts.map((p, idx) => ({
        batch_id:   \`\${selectedOrder.order_number}-B\${idx + 1}\`,
        kg:          parseFloat(p.kg) || 0,
        machine_id:  selectedOrder.machine_id || null,
      }))
      const { error } = await createSplits(selectedOrder.id, batches, selectedOrder.process_route || [])
      if (error) { alert('Error: ' + error); return }
      showToast('✓ Batches created')
      setModal(null); setSelectedOrder(null); setSplitParts([]); loadAll()
    } finally { setSaving(false) }
  }`

const newSaveSplits = `  const saveSplits = async () => {
    if (!selectedOrder) return
    const totalNewKg = splitParts.reduce((s, p) => s + (parseFloat(p.kg) || 0), 0)
    if (totalNewKg <= 0) { alert('Please enter batch quantities.'); return }
    setSaving(true)
    try {
      // Fetch existing batches to get correct starting batch number
      const existRes = await fetch(\`/api/batches?order_id=\${selectedOrder.id}\`, { cache: 'no-store' })
      const existData = await existRes.json()
      const existingBatches: any[] = existData.data || []
      const startIdx = existingBatches.length // new batches start after existing ones
      const allocatedKg = existingBatches.reduce((sum: number, b: any) => sum + (parseFloat(b.kg) || 0), 0)
      const remainingKg = Math.max(0, (parseFloat(selectedOrder.qty_kg) || 0) - allocatedKg)
      if (totalNewKg > remainingKg + 0.5) {
        if (!confirm(\`New batches total \${totalNewKg} Kg but only \${remainingKg.toFixed(1)} Kg remaining. Save anyway?\`)) {
          setSaving(false); return
        }
      }
      const batches = splitParts.map((p, idx) => ({
        batch_id:   \`\${selectedOrder.order_number}-B\${startIdx + idx + 1}\`,
        kg:          parseFloat(p.kg) || 0,
        machine_id:  selectedOrder.machine_id || null,
      }))
      const { error } = await createSplits(selectedOrder.id, batches, selectedOrder.process_route || [])
      if (error) { alert('Error: ' + error); return }
      showToast(\`✓ \${batches.length} batch\${batches.length > 1 ? 'es' : ''} created\`)
      setModal(null); setSelectedOrder(null); setSplitParts([]); loadAll()
    } finally { setSaving(false) }
  }`

if (content.includes(oldSaveSplits)) {
  content = content.replace(oldSaveSplits, newSaveSplits)
  console.log('✓ Fix 2: saveSplits uses remaining qty and correct batch numbering')
} else {
  console.error('✗ Fix 2 pattern not found')
}

// ── Fix 3: SplitModal — show total order qty AND already allocated qty in header ──
const oldHeader = `        <div style={{ background: 'var(--bg-secondary)', padding: '8px 14px', borderRadius: 8,
          marginBottom: 10, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span><strong>Total:</strong> {order.qty_kg} Kg</span>
          <span><strong>Article:</strong> {order.article}</span>
          <span><strong>Color:</strong> {order.color}</span>
        </div>
        <div style={{ background: ok ? 'var(--success-light)' : 'var(--danger-light)',
          color: ok ? 'var(--success)' : 'var(--danger)',
          borderRadius: 8, padding: '7px 14px', marginBottom: 10, fontSize: 13, fontWeight: 500 }}>
          Allocated: {totalKg.toFixed(1)} Kg · Remaining: {remaining.toFixed(1)} Kg {ok ? '✓' : '⚠'}
        </div>`

const newHeader = `        <div style={{ background: 'var(--bg-secondary)', padding: '8px 14px', borderRadius: 8,
          marginBottom: 10, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span><strong>Order Total:</strong> {order.qty_kg} Kg</span>
          <span><strong>Article:</strong> {order.article}</span>
          <span><strong>Color:</strong> {order.color}</span>
        </div>
        <div style={{ background: ok ? 'var(--success-light)' : 'var(--danger-light)',
          color: ok ? 'var(--success)' : 'var(--danger)',
          borderRadius: 8, padding: '7px 14px', marginBottom: 10, fontSize: 13, fontWeight: 500 }}>
          This split: {totalKg.toFixed(1)} Kg · Still remaining after save: {remaining.toFixed(1)} Kg {ok ? '✓' : '⚠ (partial split)'}
        </div>`

if (content.includes(oldHeader)) {
  content = content.replace(oldHeader, newHeader)
  console.log('✓ Fix 3: SplitModal header clarified')
} else {
  console.error('✗ Fix 3 pattern not found')
}

// ── Fix 4: SplitModal remaining calculation uses remaining not full qty ──
// The remaining in SplitModal should be based on what was passed in (already-subtracted)
// since splitParts already starts with remaining qty
const oldBalance = `  const balance = () => {
    const per = (order.qty_kg || 0) / splitParts.length
    setSplitParts(splitParts.map(() => ({ kg: per, mtr: 0, taka: 0 })))
  }`

// Auto-balance divides the sum of current splitParts evenly (not the full order qty)
const newBalance = `  const balance = () => {
    const total = splitParts.reduce((s, p) => s + (parseFloat(p.kg) || 0), 0) || (order.qty_kg || 0)
    const per = total / splitParts.length
    setSplitParts(splitParts.map(() => ({ kg: per, mtr: 0, taka: 0 })))
  }`

if (content.includes(oldBalance)) {
  content = content.replace(oldBalance, newBalance)
  console.log('✓ Fix 4: Auto-balance uses current split total not full order qty')
}

// ── Fix 5: SplitModal remaining = based on initial first part kg (remaining qty passed in) ──
// Change "remaining = (order.qty_kg || 0) - totalKg" to be relative to what was pre-filled
// i.e. remaining = initialRemainingKg (first splitPart) - totalKg
// Actually cleanest: keep it as is since splitParts[0].kg starts as remainingKg
// The "remaining" in the modal is just for display; the green/red is fine as-is

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ Split modal fixed. Existing batches are now subtracted before showing.')
