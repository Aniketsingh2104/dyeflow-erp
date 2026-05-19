'use client'

import { useState, useEffect } from 'react'
import {
  MACHINE_REQUIRED,
  getSmartMachine,
  getArticleIntelligence,
  isSupervisorOrderLabRecheckBlocked,
  getMachineDisplayNameWithQty
} from './route-helpers'

interface RouteAssignmentProps {
  order: any
  onUpdate: () => void
}

// ── Build a unified list of route templates from two sources:
//    1. db.processRouteMaster  — named templates with steps[]
//    2. db.articleProcessMap   — article → string[] routes (the main source from Process & Machine Map setup)
// Returns objects shaped like processRouteMaster entries so the rest of the component is unchanged.
function buildRouteOptions(db: any, article?: string): { name: string; steps: { processCode: string; name: string }[] }[] {
  const options: { name: string; steps: { processCode: string; name: string }[] }[] = []

  // Source 1: named processRouteMaster templates
  for (const rt of (db.processRouteMaster || [])) {
    if (!rt.name || !(rt.steps || []).length) continue
    options.push(rt)
  }

  // Source 2: db.articleProcessMap — each article → [code, code, ...] entry becomes a route option
  // De-duplicate by route string so the same sequence isn't listed twice
  const seen = new Set(options.map(o => (o.steps || []).map((s: any) => s.processCode).join('/')))

  // Build a process name lookup from db.processList
  const processNames: Record<string, string> = {}
  for (const p of (db.processList || [])) {
    processNames[p.code] = p.name || p.code
  }

  // Order: put the current order's article route first if it exists
  const articleMap = db.articleProcessMap || {}
  const orderedArticles: string[] = []
  if (article && articleMap[article]) orderedArticles.push(article)
  for (const a of Object.keys(articleMap)) {
    if (!orderedArticles.includes(a)) orderedArticles.push(a)
  }

  for (const a of orderedArticles) {
    const codes: string[] = Array.isArray(articleMap[a]) ? articleMap[a] : []
    if (codes.length === 0) continue
    const routeKey = codes.join('/')
    if (seen.has(routeKey)) continue
    seen.add(routeKey)
    options.push({
      name: `${routeKey}  [${a}]`,
      steps: codes.map(code => ({ processCode: code, name: processNames[code] || code })),
    })
  }

  return options
}

export default function RouteAssignment({ order, onUpdate }: RouteAssignmentProps) {
  const [db, setDb] = useState<any>(null)
  const [routeOptions, setRouteOptions] = useState<ReturnType<typeof buildRouteOptions>>([])
  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState<number>(-1)
  const [machineInputs, setMachineInputs] = useState<{[key: string]: string}>({})
  const [showMachines, setShowMachines] = useState(false)

  useEffect(() => {
    loadDb()
  }, [])

  useEffect(() => {
    if (db) {
      const opts = buildRouteOptions(db, order.article)
      setRouteOptions(opts)
      initializeTemplate(db, opts)
    }
  }, [db, order.id])

  const loadDb = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return
    const database = JSON.parse(stored)
    setDb(database)
  }

  const initializeTemplate = (
    database: any,
    opts: ReturnType<typeof buildRouteOptions>
  ) => {
    if (opts.length === 0) return

    let defaultIdx = -1

    // Priority 1: Order already has a confirmed route template name
    if (order.routeTemplateName) {
      defaultIdx = opts.findIndex(rt => rt.name === order.routeTemplateName)
    }

    // Priority 2: Match current processRoute array to a template
    if (defaultIdx < 0 && Array.isArray(order.processRoute) && order.processRoute.length) {
      const routeKey = order.processRoute.join('/')
      defaultIdx = opts.findIndex(rt =>
        (rt.steps || []).map((s: any) => s.processCode).join('/') === routeKey
      )
    }

    // Priority 3: Article-based match from articleProcessMap
    if (defaultIdx < 0 && order.article) {
      const articleMap = database.articleProcessMap || {}
      const codes: string[] = Array.isArray(articleMap[order.article]) ? articleMap[order.article] : []
      if (codes.length > 0) {
        const routeKey = codes.join('/')
        defaultIdx = opts.findIndex(rt =>
          (rt.steps || []).map((s: any) => s.processCode).join('/') === routeKey
        )
      }
    }

    // Priority 4: article intelligence
    if (defaultIdx < 0) {
      const intel = getArticleIntelligence(order.article, database)
      if (intel?.route) {
        const routeKey = intel.route.split('/').map((c: string) => c.trim()).filter(Boolean).join('/')
        defaultIdx = opts.findIndex(rt =>
          (rt.steps || []).map((s: any) => s.processCode).join('/') === routeKey
        )
      }
    }

    // Priority 5: Only one option — auto-select it
    if (defaultIdx < 0 && opts.length === 1) defaultIdx = 0

    if (defaultIdx >= 0) {
      setSelectedTemplateIdx(defaultIdx)
      applyTemplate(defaultIdx, database, opts)
    }
  }

  const applyTemplate = (
    idx: number,
    database: any,
    opts: ReturnType<typeof buildRouteOptions>
  ) => {
    if (idx < 0) {
      setShowMachines(false)
      setMachineInputs({})
      return
    }

    const rt = opts[idx]
    if (!rt) return

    const articleIntel = getArticleIntelligence(order.article, database)
    const qtyKg = parseFloat(order.qtyKg) || 0
    const steps = rt.steps || []
    const machineSteps = steps.filter((s: any) => MACHINE_REQUIRED.includes(s.processCode))

    const inputs: {[key: string]: string} = {}
    for (const step of machineSteps) {
      const existing = order.processMachines?.[step.processCode]?.[0] || ''
      const smart = getSmartMachine(step.processCode, qtyKg, articleIntel, database)
      inputs[step.processCode] = existing || smart || ''
    }

    setMachineInputs(inputs)
    setShowMachines(machineSteps.length > 0)
  }

  const handleTemplateChange = (idx: number) => {
    setSelectedTemplateIdx(idx)
    if (db) applyTemplate(idx, db, routeOptions)
  }

  const handleMachineInputChange = (processCode: string, value: string) => {
    setMachineInputs(prev => ({ ...prev, [processCode]: value }))
  }

  const handleConfirm = () => {
    if (selectedTemplateIdx < 0) {
      alert('Please select a process route')
      return
    }

    if (isSupervisorOrderLabRecheckBlocked(order)) {
      alert('Lab Recheck is pending. Process and machine are stopped until Lab Receive is ticked.')
      return
    }

    const rt = routeOptions[selectedTemplateIdx]
    if (!rt) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const database = JSON.parse(stored)

    let orderToUpdate = database.orders?.find((o: any) => o.id === order.id)
    let isRepairingOrder = false

    if (!orderToUpdate) {
      orderToUpdate = database.repairingOrders?.find((r: any) => r.id === order.id)
      isRepairingOrder = true
    }

    if (!orderToUpdate) {
      alert('Order not found in database')
      return
    }

    const codes = rt.steps.map((s: any) => s.processCode)
    orderToUpdate.processRoute = isRepairingOrder ? codes.join('/') : codes
    orderToUpdate.routeTemplateName = rt.name

    // Machine assignments
    const processMachines: {[key: string]: string[]} = {}
    const articleIntel = getArticleIntelligence(order.article, database)
    const qtyKg = parseFloat(order.qtyKg) || 0
    let primaryMachine = ''

    for (const step of rt.steps) {
      if (!MACHINE_REQUIRED.includes(step.processCode)) continue
      let machine = machineInputs[step.processCode] || ''
      if (!machine) machine = getSmartMachine(step.processCode, qtyKg, articleIntel, database)
      if (machine) {
        processMachines[step.processCode] = [machine]
        if (!primaryMachine) primaryMachine = machine
      }
    }

    orderToUpdate.processMachines = processMachines
    orderToUpdate.machine = primaryMachine
    orderToUpdate.supervisorConfirmed = true
    orderToUpdate.supervisorConfirmedAt = new Date().toISOString()

    localStorage.setItem('dyeflow_db', JSON.stringify(database))
    onUpdate()
  }

  if (!db) return <div style={{ padding: '8px', color: '#9CA3AF', fontSize: '12px' }}>Loading...</div>

  // Lab recheck blocking
  if (isSupervisorOrderLabRecheckBlocked(order)) {
    const msg = order.inHouseLabRecheckDone
      ? 'InHouse Lab Recheck is done. Tick Lab Receive to enable process and machine.'
      : 'Lab Recheck is pending. Process and machine are stopped.'
    return (
      <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E', borderRadius: '6px', padding: '10px', fontSize: '12px', fontWeight: 600 }}>
        {msg}
      </div>
    )
  }

  if (routeOptions.length === 0) {
    return (
      <div style={{ color: '#DC2626', fontSize: '12px', padding: '8px 0' }}>
        ⚠ No route templates. Go to{' '}
        <a href="/setup/process-machine-master" style={{ color: '#185FA5', textDecoration: 'underline' }}>
          Process &amp; Machine Map
        </a>{' '}
        to configure article routes first.
      </div>
    )
  }

  // Already confirmed — show readonly
  if (order.supervisorConfirmed) {
    return (
      <div style={{ fontSize: '12px' }}>
        <div style={{ padding: '6px 10px', background: '#D1FAE5', color: '#065F46', borderRadius: '4px', fontWeight: 600, marginBottom: '8px', display: 'inline-block' }}>
          ✓ {order.routeTemplateName || (Array.isArray(order.processRoute) ? order.processRoute.join('/') : order.processRoute)}
        </div>
        {order.processMachines && Object.keys(order.processMachines).length > 0 && (
          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
            Machines: {Object.entries(order.processMachines).map(([proc, machines]: [string, any]) =>
              `${proc}: ${machines[0]}`
            ).join(', ')}
          </div>
        )}
      </div>
    )
  }

  const selectedRoute = routeOptions[selectedTemplateIdx]

  return (
    <div style={{ width: '100%' }}>
      <select
        value={selectedTemplateIdx}
        onChange={e => handleTemplateChange(parseInt(e.target.value))}
        style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '4px', marginBottom: showMachines ? '8px' : 0 }}
      >
        <option value="-1">-- Select Route --</option>
        {routeOptions.map((rt, idx) => {
          const codes = (rt.steps || []).map((s: any) => s.processCode).join('/')
          // Show just the code sequence if the name already contains it (articleProcessMap entries),
          // otherwise show "Name (codes)"
          const label = rt.name.startsWith(codes) ? rt.name : `${rt.name}  (${codes})`
          return (
            <option key={idx} value={idx}>{label}</option>
          )
        })}
      </select>

      {showMachines && selectedRoute && (
        <div style={{ background: '#F9FAFB', borderRadius: '6px', padding: '10px', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
            Machine Assignment:
          </div>

          {selectedRoute.steps
            .filter((s: any) => MACHINE_REQUIRED.includes(s.processCode))
            .map((step: any) => {
              const articleIntel = getArticleIntelligence(order.article, db)
              const qtyKg = parseFloat(order.qtyKg) || 0
              const smartMcn = getSmartMachine(step.processCode, qtyKg, articleIntel, db)
              const smartLabel = smartMcn ? getMachineDisplayNameWithQty(smartMcn, db) : ''

              return (
                <div key={step.processCode} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#1F2937', marginBottom: '3px' }}>
                    {step.name || step.processCode}
                  </div>
                  {smartLabel && (
                    <div style={{ fontSize: '10px', color: '#10B981', marginBottom: '4px' }}>
                      suggest: {smartLabel}
                    </div>
                  )}
                  <input
                    type="text"
                    list={`machines-${order.id}-${step.processCode}`}
                    value={machineInputs[step.processCode] || ''}
                    onChange={e => handleMachineInputChange(step.processCode, e.target.value)}
                    placeholder="Type machine name"
                    style={{ width: '100%', padding: '5px 8px', fontSize: '11px', border: '1px solid #D1D5DB', borderRadius: '4px' }}
                  />
                  <datalist id={`machines-${order.id}-${step.processCode}`}>
                    {(db.machines || []).map((m: any) => (
                      <option key={m.id} value={m.name}>
                        {m.name} {m.capacity ? `(${m.capacity}kg)` : ''}
                      </option>
                    ))}
                  </datalist>
                </div>
              )
            })}

          <button
            onClick={handleConfirm}
            style={{ width: '100%', padding: '6px 12px', background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginTop: '6px' }}
          >
            ✓ Confirm Route &amp; Machines
          </button>
        </div>
      )}

      {/* Show confirm button even when no machine assignment is needed */}
      {!showMachines && selectedTemplateIdx >= 0 && (
        <button
          onClick={handleConfirm}
          style={{ width: '100%', padding: '6px 12px', background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginTop: '6px' }}
        >
          ✓ Confirm Route
        </button>
      )}
    </div>
  )
}
