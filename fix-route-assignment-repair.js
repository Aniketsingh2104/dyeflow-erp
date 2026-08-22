const fs = require('fs')

// Fix RouteAssignment to handle repair batches (isRepair flag)
const raPath = 'app/supervisor/[name]/RouteAssignment.tsx'
let ra = fs.readFileSync(raPath, 'utf8')

// Replace the handleConfirm function to support repair batches
const OLD_CONFIRM = `    try {
      const res = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update', id: order.id,
          process_route:           codes,
          machine_id:              primaryMachineId,
          process_machines:        processMachinesById,
          status:                  'splitting',
          supervisor_confirmed:    true,
          supervisor_confirmed_at: new Date().toISOString(),
        }),
      })
      const data = await res.json()
      if (!data.ok) { alert('Error: ' + (data.error || 'Unknown')); return }
      setEditMode(false)
      onUpdate()
    } catch (err: any) { alert('Network error: ' + err.message) }`

const NEW_CONFIRM = `    try {
      // Repair batch: use /api/repair-assign to update batch + repairing order
      if (order.isRepair) {
        const res = await fetch('/api/repair-assign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action:        'assign',
            batch_id:      order.batch_id || order.id,
            repair_id:     order.repair_id,
            supervisor_id: order.supervisor_id || null,
            machine_id:    primaryMachineId,
            process_route: codes,
          }),
        })
        const data = await res.json()
        if (!data.ok) { alert('Error: ' + (data.error || 'Unknown')); return }
        setEditMode(false)
        onUpdate()
        return
      }

      // Normal order: use /api/orders
      const res = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update', id: order.id,
          process_route:           codes,
          machine_id:              primaryMachineId,
          process_machines:        processMachinesById,
          status:                  'splitting',
          supervisor_confirmed:    true,
          supervisor_confirmed_at: new Date().toISOString(),
        }),
      })
      const data = await res.json()
      if (!data.ok) { alert('Error: ' + (data.error || 'Unknown')); return }
      setEditMode(false)
      onUpdate()
    } catch (err: any) { alert('Network error: ' + err.message) }`

if (ra.includes(OLD_CONFIRM)) {
  ra = ra.replace(OLD_CONFIRM, NEW_CONFIRM)
  fs.writeFileSync(raPath, ra, 'utf8')
  console.log('✓ RouteAssignment now handles repair batches via /api/repair-assign')
} else console.error('✗ handleConfirm pattern not found')

// Now run the supervisor tab fix
let c = fs.readFileSync('app/supervisor/[name]/page.tsx', 'utf8')
const script2 = require('./fix-sup-repair-tab.js')
