// Run from C:\dyeflow-react: node fix-all-machine-process.js
// Fixes process name display in BOTH machines pages

const fs   = require('fs')
const path = require('path')

// ── Fix 1: machines/page.tsx (list page) ─────────────────────────────────
const listPath = path.join(__dirname, 'app', 'machines', 'page.tsx')
let list = fs.readFileSync(listPath, 'utf8')

// 1a. Add process_machines and process_route to enriched batches
const oldEnrich = `      // Enrich batches with order info
      const enriched = batchList.map(b => ({
        ...b,
        orderNo:      orderMap[b.order_id]?.order_number || '-',
        party:        orderMap[b.order_id]?.party        || '-',
        article:      orderMap[b.order_id]?.article      || '-',
        color:        orderMap[b.order_id]?.color        || '-',
        blend:        orderMap[b.order_id]?.blend        || '',
        processRoute: orderMap[b.order_id]?.process_route || [],
      }))`

const newEnrich = `      // Process name lookup
      const procRes = await fetch('/api/processes', { cache: 'no-store' }).then(r => r.json())
      const procMap: Record<string, string> = {}
      for (const p of (procRes.data || [])) procMap[p.code] = p.name || p.code

      // Enrich batches with order info
      const enriched = batchList.map(b => {
        const o = orderMap[b.order_id] || {}
        // Find which process this machine handles using process_machines map
        const processMachinesMap: Record<string, string[]> = o.process_machines || {}
        const machineProcessCode = (() => {
          for (const [code, ids] of Object.entries(processMachinesMap)) {
            if ((ids as string[]).includes(b.machine_id)) return code
          }
          return null
        })()
        const batchRoute: string[] = b.process_route?.length ? b.process_route : (o.process_route || [])
        const displayProcess = b.current_process || machineProcessCode || batchRoute[0] || ''
        const processName = displayProcess ? (procMap[displayProcess] || displayProcess) : '—'

        return {
          ...b,
          orderNo:      o.order_number || '-',
          party:        o.party        || '-',
          article:      o.article      || '-',
          color:        o.color        || '-',
          blend:        o.blend        || '',
          processRoute: batchRoute,
          processName,
          displayProcess,
        }
      })`

if (list.includes(oldEnrich)) {
  list = list.replace(oldEnrich, newEnrich)
  console.log('✓ machines/page.tsx: enriched batches now compute processName via process_machines')
} else {
  console.error('✗ machines/page.tsx: enrich pattern not found')
}

// 1b. Show processName in the Process column instead of raw current_process
const oldProcessCell = `                            <td style={td}>
                              {b.current_process ? (
                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px',
                                  borderRadius: 4, background: 'var(--accent)', color: '#fff' }}>
                                  {b.current_process}
                                </span>
                              ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                            </td>`

const newProcessCell = `                            <td style={td}>
                              {b.displayProcess ? (
                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px',
                                  borderRadius: 4,
                                  background: b.current_process ? 'var(--accent)' : 'var(--accent-light)',
                                  color: b.current_process ? '#fff' : 'var(--accent)' }}>
                                  {b.processName}
                                </span>
                              ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                            </td>`

if (list.includes(oldProcessCell)) {
  list = list.replace(oldProcessCell, newProcessCell)
  console.log('✓ machines/page.tsx: Process column now shows processName not current_process code')
} else {
  console.error('✗ machines/page.tsx: process cell pattern not found')
}

fs.writeFileSync(listPath, list, 'utf8')

// ── Fix 2: machines/[machineId]/page.tsx (detail page) ───────────────────
const detailPath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let detail = fs.readFileSync(detailPath, 'utf8')

const oldDetailProcess = `          // Use batch route if non-empty, else fall back to order route ([] is truthy so must check .length)
          const processRoute: string[] = (b.process_route?.length ? b.process_route : null) || (o.process_route?.length ? o.process_route : null) || []
          const shadeType = getShadeTypeByColor(o.color || '')

          // Find which process code in the route is assigned to THIS machine.
          // process_machines on the order: { processCode: [machineId1, machineId2] }
          // We look for any process whose machine list includes foundMachine.id
          const processMachinesMap: Record<string, string[]> = o.process_machines || {}
          const machineProcessCode = (() => {
            for (const [code, machineIds] of Object.entries(processMachinesMap)) {
              if ((machineIds as string[]).includes(foundMachine.id)) return code
            }
            return null
          })()

          // Priority: actual current_process > machine-matched process from order > first route step
          const displayProcess = b.current_process || machineProcessCode || processRoute[0] || ''
          const processName = displayProcess ? (procMap[displayProcess] || displayProcess) : '-'`

const newDetailProcess = `          // Use batch route if non-empty, else fall back to order route ([] is truthy so must check .length)
          const processRoute: string[] = (b.process_route?.length ? b.process_route : null) || (o.process_route?.length ? o.process_route : null) || []
          const shadeType = getShadeTypeByColor(o.color || '')

          // Find which process code this machine handles using process_machines map on the order
          // process_machines: { processCode: [machineId1, machineId2] }
          const processMachinesMap: Record<string, string[]> = o.process_machines || {}
          const machineProcessCode = (() => {
            for (const [code, machineIds] of Object.entries(processMachinesMap)) {
              if ((machineIds as string[]).includes(foundMachine.id)) return code
            }
            return null
          })()

          // Priority: actual current_process > machine-matched process from order > first route step
          const displayProcess = b.current_process || machineProcessCode || processRoute[0] || ''
          const processName = displayProcess ? (procMap[displayProcess] || displayProcess) : '-'`

if (detail.includes(oldDetailProcess)) {
  detail = detail.replace(oldDetailProcess, newDetailProcess)
  console.log('✓ machines/[machineId]/page.tsx: already has correct process_machines lookup (no change needed)')
} else {
  // Try inserting it fresh if not already there
  const altOld = `          const processRoute: string[] = (b.process_route?.length ? b.process_route : null) || (o.process_route?.length ? o.process_route : null) || []
          const currentProcess = b.current_process || processRoute[0] || ''
          const shadeType = getShadeTypeByColor(o.color || '')

          // For pending batches with no current process, show first route step as "next"
          const displayProcess = currentProcess || processRoute[0] || ''
          const processName = displayProcess
            ? (procMap[displayProcess] || displayProcess)
            : '-'`

  const altNew = `          const processRoute: string[] = (b.process_route?.length ? b.process_route : null) || (o.process_route?.length ? o.process_route : null) || []
          const shadeType = getShadeTypeByColor(o.color || '')

          // Find which process code this machine handles using process_machines map on the order
          const processMachinesMap: Record<string, string[]> = o.process_machines || {}
          const machineProcessCode = (() => {
            for (const [code, machineIds] of Object.entries(processMachinesMap)) {
              if ((machineIds as string[]).includes(foundMachine.id)) return code
            }
            return null
          })()

          // Priority: actual current_process > machine-matched process > first route step
          const displayProcess = b.current_process || machineProcessCode || processRoute[0] || ''
          const processName = displayProcess ? (procMap[displayProcess] || displayProcess) : '-'`

  if (detail.includes(altOld)) {
    detail = detail.replace(altOld, altNew)
    console.log('✓ machines/[machineId]/page.tsx: process_machines lookup applied (alt pattern)')
  } else {
    console.error('✗ machines/[machineId]/page.tsx: no pattern matched — check file manually')
  }
}

fs.writeFileSync(detailPath, detail, 'utf8')
console.log('\n✓ Both machine pages fixed.')
