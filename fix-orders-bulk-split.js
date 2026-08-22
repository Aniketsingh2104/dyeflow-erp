const fs = require('fs')
const path = 'app/orders/page.tsx'
let c = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

// Fix 1: Add bulkFullSplit state and function after applyBulk
const OLD_FULL = `  // ── Full Split — one click creates single batch with full order qty ────────
  const doFullSplit = async (order: any) => {`

const NEW_FULL = `  // ── Bulk Full Split — full split all selected orders at once ──────────────
  const doBulkFullSplit = async () => {
    const toProcess = filtered.filter(o => selectedIds.has(o.id) && (o.process_route || []).length > 0)
    const skipped   = filtered.filter(o => selectedIds.has(o.id) && !(o.process_route || []).length)
    if (toProcess.length === 0) {
      alert('No selected orders have a route assigned. Assign routes first.')
      return
    }
    const msg = 'Full Split ' + toProcess.length + ' order(s) as single batches?' +
      (skipped.length > 0 ? '\n(' + skipped.length + ' skipped — no route assigned)' : '')
    if (!confirm(msg)) return
    setSaving(true)
    let done = 0, failed = 0
    try {
      for (const order of toProcess) {
        const allocated = allocations[order.id] || 0
        const remaining = (parseFloat(order.qty_kg) || 0) - allocated
        if (remaining < 0.5) { done++; continue }
        try {
          const res = await fetch('/api/batches', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'full_split',
              order_id:      order.id,
              order_number:  order.order_number,
              qty_kg:        remaining,
              qty_mtr:       order.qty_mtr    || 0,
              no_of_taka:    order.no_of_taka || 0,
              machine_id:    order.machine_id || null,
              process_route: order.process_route || [],
            }),
          }).then(r => r.json())
          if (res.ok) done++; else failed++
        } catch { failed++ }
      }
      showToast(
        done + ' order(s) Full Split successfully' +
        (failed  > 0 ? ', ' + failed  + ' failed'  : '') +
        (skipped.length > 0 ? ', ' + skipped.length + ' skipped (no route)' : '')
      )
      deselectAll()
      loadAll()
    } finally { setSaving(false) }
  }

  // ── Full Split — one click creates single batch with full order qty ────────
  const doFullSplit = async (order: any) => {`

if (c.includes(OLD_FULL)) {
  c = c.replace(OLD_FULL, NEW_FULL)
  console.log('✓ Added doBulkFullSplit function')
} else console.error('✗ doFullSplit pattern not found')

// Fix 2: Add Bulk Full Split button to the bulk action bar
const OLD_BAR = `          <div style={{ width: 1, height: 20, background: 'var(--border-light)' }} />
          <button className="small danger" onClick={() => { setBulkAction('delete'); setShowBulkModal(true) }}>
            🗑 Delete
          </button>`

const NEW_BAR = `          <button
            className="small"
            style={{ background:'#7C3AED', color:'#fff', border:'none', cursor:'pointer', fontWeight:700 }}
            onClick={doBulkFullSplit}
            disabled={saving}>
            ⚡ Full Split All ({selectedIds.size})
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--border-light)' }} />
          <button className="small danger" onClick={() => { setBulkAction('delete'); setShowBulkModal(true) }}>
            🗑 Delete
          </button>`

if (c.includes(OLD_BAR)) {
  c = c.replace(OLD_BAR, NEW_BAR)
  console.log('✓ Added Bulk Full Split button to bulk action bar')
} else console.error('✗ Bulk bar pattern not found')

fs.writeFileSync(path, c, 'utf8')
console.log('Done')
