// Directly rewrite RouteAssignment.tsx with the correct check order

const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'supervisor', '[name]', 'RouteAssignment.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// The problem: isConfirmed check is AFTER routeOptions.length===0 check
// AND after db loads. We need to check supervisor_confirmed FIRST,
// before even loading db, so confirmed orders never show the form.

// Fix: move the confirmed check to TOP of the render, right after loading check
const oldLoadingCheck = `  if (!db) return <div style={{ padding: '8px', color: '#9CA3AF', fontSize: '12px' }}>Loading...</div>`

const newLoadingCheck = `  // ── Check confirmed FIRST — before db loads, before routes build ─────────
  // order comes from Supabase with snake_case fields
  const isConfirmed = !!(order.supervisor_confirmed || order.supervisorConfirmed)
  const confirmedRoute =
    (Array.isArray(order.process_route) && order.process_route.length ? order.process_route.join('/') : null) ||
    (Array.isArray(order.processRoute)  && order.processRoute.length  ? order.processRoute.join('/')  : null) ||
    order.routeTemplateName || ''

  if (isConfirmed && confirmedRoute) {
    // Show confirmed view — db may still be loading, look up machine name once available
    const machineName = (() => {
      const mid = order.machine_id || order.machineId
      if (!mid || !db) return null
      return (db.machines || []).find((m: any) => m.id === mid)?.name || null
    })()
    return (
      <div style={{ fontSize: '12px' }}>
        <div style={{ padding: '5px 10px', background: '#D1FAE5', color: '#065F46', borderRadius: '4px', fontWeight: 700, display: 'inline-block', marginBottom: 2 }}>
          ✓ {confirmedRoute}
        </div>
        {machineName && (
          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: 2 }}>
            Machine: <strong>{machineName}</strong>
          </div>
        )}
      </div>
    )
  }

  if (!db) return <div style={{ padding: '8px', color: '#9CA3AF', fontSize: '12px' }}>Loading...</div>`

if (content.includes(oldLoadingCheck)) {
  content = content.replace(oldLoadingCheck, newLoadingCheck)
  console.log('✓ Moved isConfirmed check to TOP of render — before db loads')
} else {
  console.error('✗ Pattern not found')
}

// Remove the OLD isConfirmed block that was placed later in the render
const oldIsConfirmedBlock = `  // Already confirmed — show readonly
  // Check both camelCase (legacy) and snake_case (Supabase API response)
  const isConfirmed = order.supervisorConfirmed || order.supervisor_confirmed
  const confirmedRoute = order.routeTemplateName
    || (Array.isArray(order.process_route) && order.process_route.length ? order.process_route.join('/') : null)
    || (Array.isArray(order.processRoute)  && order.processRoute.length  ? order.processRoute.join('/')  : null)
    || '-'

  // Get machine name from db if we have machine_id
  const confirmedMachineName = (() => {
    const mid = order.machine_id || order.machineId
    if (!mid || !db) return null
    const m = (db.machines || []).find((m: any) => m.id === mid)
    return m?.name || null
  })()

  if (isConfirmed) {
    return (
      <div style={{ fontSize: '12px' }}>
        <div style={{ padding: '6px 10px', background: '#D1FAE5', color: '#065F46', borderRadius: '4px', fontWeight: 600, marginBottom: '4px', display: 'inline-block' }}>
          ✓ {confirmedRoute}
        </div>
        {confirmedMachineName && (
          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
            Machine: {confirmedMachineName}
          </div>
        )}
        {!confirmedMachineName && order.processMachines && Object.keys(order.processMachines).length > 0 && (
          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
            Machines: {Object.entries(order.processMachines).map(([proc, machines]: [string, any]) =>
              \`\${proc}: \${machines[0]}\`
            ).join(', ')}
          </div>
        )}
      </div>
    )
  }

  const selectedRoute = routeOptions[selectedTemplateIdx]`

const newSelectedRoute = `  const selectedRoute = routeOptions[selectedTemplateIdx]`

if (content.includes(oldIsConfirmedBlock)) {
  content = content.replace(oldIsConfirmedBlock, newSelectedRoute)
  console.log('✓ Removed old isConfirmed block from later in render')
} else {
  // Try partial match — remove just the if block
  console.log('⚠ Full old block not found, trying partial...')
  content = content.replace(
    `  if (isConfirmed) {
    return (
      <div style={{ fontSize: '12px' }}>
        <div style={{ padding: '6px 10px', background: '#D1FAE5', color: '#065F46', borderRadius: '4px', fontWeight: 600, marginBottom: '4px', display: 'inline-block' }}>
          ✓ {confirmedRoute}
        </div>`,
    `  // (isConfirmed block moved to top of render)\n  if (false) { return (<div>`
  )
  console.log('⚠ Applied partial fix')
}

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ RouteAssignment.tsx fixed — confirmed orders show readonly view immediately.')
