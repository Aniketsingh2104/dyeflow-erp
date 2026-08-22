const fs = require('fs')
let c = fs.readFileSync('app/splitted-orders/page.tsx', 'utf8')

// Fix: exclude repair batches by checking batch_id ends with -R pattern
// AND by checking status = 'repairing' OR batch has a repairing_order linked
// Simplest reliable fix: exclude any batch whose batch_id contains '-R' suffix pattern
// (repair batches are DYE26-XXXX-BX-R or DYE26-XXXX-BX-RR etc)
// BUT also allow split batches -S1, -S2 to show

const OLD = `      // Exclude 'repairing' batches — they only appear after Split/Full Split is done
      const splitBatches = batches.filter((b: any) => b.status !== 'repairing')`

const NEW = `      // Exclude repair batches that haven't been split yet:
      // - status = 'repairing' (not yet assigned by supervisor)
      // - batch_id ends with -R or -RR etc (repair batch, not yet split/full-split)
      //   UNLESS it also has -S suffix (split batch - should show)
      // - status = 'pending' AND batch_id matches repair pattern (assigned but not split)
      const isRepairUnsplit = (b: any) => {
        const id: string = b.batch_id || ''
        // Has -R suffix (repair batch) but NOT -S suffix (not yet split)
        const isRepairBatch = /-R+$/.test(id) || (/-R+-/.test(id) && !/-S\d+$/.test(id))
        // Only exclude if still pending/repairing (not yet through full split)
        return isRepairBatch && (b.status === 'repairing' || b.status === 'pending')
      }
      const splitBatches = batches.filter((b: any) => !isRepairUnsplit(b))`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync('app/splitted-orders/page.tsx', c, 'utf8')
  console.log('✓ Splitted Orders: excludes unsplit repair batches by batch_id pattern + status')
} else console.error('✗ Pattern not found')
