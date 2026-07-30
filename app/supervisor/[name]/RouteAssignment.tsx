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

function buildRouteOptions(db: any, article?: string): { name: string; steps: { processCode: string; name: string }[] }[] {
  const options: { name: string; steps: { processCode: string; name: string }[] }[] = []

  for (const rt of (db.processRouteMaster || [])) {
    if (!rt.name || !(rt.steps || []).length) continue
    options.push(rt)
  }

  const seen = new Set(options.map(o => (o.steps || []).map((s: any) => s.processCode).join('/')))
  const processNames: Record<string, string> = {}
  for (const p of (db.processList || [])) processNames[p.code] = p.name || p.code

  const articleMap = db.articleProcessMap || {}
  const orderedArticles: string[] = []
  if (article && articleMap[article]) orderedArticles.push(article)
  for (const a of Object.keys(articleMap)) {
    if (!orderedArticles.includes(a)) orderedArticles.push(a)
  }

  for (const a of orderedArticles) {
    const codes: string[] = Array.isArray(articleMap[a]) ? articleMap[a] : []
    if (!codes.length) continue
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
  const [db,                  setDb]                  = useState<any>(null)
  const [routeOptions,        setRouteOptions]        = useState<ReturnType<typeof buildRouteOptions>>([])
  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState<number>(-1)
  const [machineInputs,       setMachineInputs]       = useState<{[key: string]: string}>({})
  const [showMachines,        setShowMachines]        = useState(false)

  // Edit-mode state
  const [editMode,        setEditMode]        = useState(false)
  const [batchLockStatus, setBatchLockStatus] = useState<'loading' | 'editable' | 'locked'>('loading')
  const [lockReason,      setLockReason]      = useState('')

  // ── Confirmed check (top, before db loads) ─────────────────────────────────
  const isConfirmed = !!(order.supervisor_confirmed || order.supervisorConfirmed)
  const confirmedRoute =
    (Array.isArray(order.process_route) && order.process_route.length ? order.process_route.join('/') : '') ||
    (Array.isArray(order.processRoute)  && order.processRoute.length  ? order.processRoute.join('/')  : '') ||
    order.routeTemplateName || ''

  // ── Load db (routes / machines) ────────────────────────────────────────────
  useEffect(() => { loadDb() }, [])

  useEffect(() => {
    if (db) {
      const opts = buildRouteOptions(db, order.article)
      setRouteOptions(opts)
      if (!isConfirmed || editMode) initializeTemplate(db, opts)
    }
  }, [db, order.id, editMode])

  // ── Check batch lock status when confirmed ─────────────────────────────────
  useEffect(() => {
    if (!isConfirmed) { setBatchLockStatus('editable'); return }
    checkBatchLock()
  }, [order.id, isConfirmed])

  const checkBatchLock = async () => {
    setBatchLockStatus('loading')
    try {
      const res  = await fetch(`/api/batches?order_id=${order.id}`, { cache: 'no-store' })
      const data = await res.json()
      const batches: any[] = data.data || []

      if (batches.length === 0) {
        // No batches created yet — editable
        setBatchLockStatus('editable')
        return
      }

      // Find any batch that has started or is done
      const lockedBatch = batches.find(b =>
        b.is_done || b.status === 'done' || b.status === 'in-process' || b.current_process
      )

      if (lockedBatch) {
        setBatchLockStatus('locked')
        setLockReason(
          lockedBatch.is_done || lockedBatch.status === 'done'
            ? `Batch ${lockedBatch.batch_id} is completed`
            : `Batch ${lockedBatch.batch_id} is in process`
        )
      } else {
        // All batches are pending — editable
        setBatchLockStatus('editable')
      }
    } catch {
      setBatchLockStatus('editable') // default to editable on error
    }
  }

  const loadDb = async () => {
    try {
      const [machRes, procRes, routeRes, articleRouteRes] = await Promise.all([
        fetch('/api/machines',        { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/processes',       { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/route-templates', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/article-routes',  { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])
      const processList = procRes.data || []
      setDb({
        machines:    machRes.data || [],
        processList,
        processRouteMaster: (routeRes.data || []).map((t: any) => ({
          name:  t.name || t.template_name,
          steps: (t.steps || []).map((s: any) => ({
            processCode: s.processCode || s.process_code || s,
            name: s.name || processList.find((p: any) => p.code === (s.processCode || s))?.name || s.processCode || s,
          })),
        })),
        articleProcessMap: (articleRouteRes.data || []).reduce((acc: any, r: any) => {
          if (r.article && r.route) {
            acc[r.article] = typeof r.route === 'string'
              ? r.route.split('/').map((c: string) => c.trim()).filter(Boolean)
              : r.route
          }
          return acc
        }, {}),
      })
    } catch (err) {
      console.error('RouteAssignment loadDb error:', err)
    }
  }

  const initializeTemplate = (database: any, opts: ReturnType<typeof buildRouteOptions>) => {
    if (!opts.length) return
    let defaultIdx = -1

    if (order.routeTemplateName)
      defaultIdx = opts.findIndex(rt => rt.name === order.routeTemplateName)

    const existingRoute = order.process_route || order.processRoute
    if (defaultIdx < 0 && Array.isArray(existingRoute) && existingRoute.length) {
      const routeKey = existingRoute.join('/')
      defaultIdx = opts.findIndex(rt =>
        (rt.steps || []).map((s: any) => s.processCode).join('/') === routeKey
      )
    }

    if (defaultIdx < 0 && order.article) {
      const codes: string[] = database.articleProcessMap?.[order.article] || []
      if (codes.length) {
        defaultIdx = opts.findIndex(rt =>
          (rt.steps || []).map((s: any) => s.processCode).join('/') === codes.join('/')
        )
      }
    }

    if (defaultIdx < 0 && opts.length === 1) defaultIdx = 0

    if (defaultIdx >= 0) {
      setSelectedTemplateIdx(defaultIdx)
      applyTemplate(defaultIdx, database, opts)
    }
  }

  const applyTemplate = (idx: number, database: any, opts: ReturnType<typeof buildRouteOptions>) => {
    if (idx < 0) { setShowMachines(false); setMachineInputs({}); return }
    const rt = opts[idx]
    if (!rt) return
    const articleIntel = getArticleIntelligence(order.article, database)
    const qtyKg = parseFloat(order.qtyKg || order.qty_kg) || 0
    const machineSteps = (rt.steps || []).filter((s: any) => MACHINE_REQUIRED.includes(s.processCode))
    const inputs: {[key: string]: string} = {}
    for (const step of machineSteps) {
      const existing = order.processMachines?.[step.processCode]?.[0] || ''
      const smart    = getSmartMachine(step.processCode, qtyKg, articleIntel, database)
      inputs[step.processCode] = existing || smart || ''
    }
    setMachineInputs(inputs)
    setShowMachines(machineSteps.length > 0)
  }

  const handleTemplateChange = (idx: number) => {
    setSelectedTemplateIdx(idx)
    if (db) applyTemplate(idx, db, routeOptions)
  }

  const handleConfirm = async () => {
    if (selectedTemplateIdx < 0) { alert('Please select a process route'); return }
    if (isSupervisorOrderLabRecheckBlocked(order)) {
      alert('Lab Recheck is pending. Tick Lab Receive to enable.')
      return
    }
    const rt = routeOptions[selectedTemplateIdx]
    if (!rt) return

    const codes = rt.steps.map((s: any) => s.processCode)
    const articleIntel = db ? getArticleIntelligence(order.article, db) : null
    const qtyKg = parseFloat(order.qtyKg || order.qty_kg) || 0
    let primaryMachine = ''

    for (const step of rt.steps) {
      if (!MACHINE_REQUIRED.includes(step.processCode)) continue
      let machine = machineInputs[step.processCode] || ''
      if (!machine && db) machine = getSmartMachine(step.processCode, qtyKg, articleIntel, db) || ''
      if (machine && !primaryMachine) primaryMachine = machine
    }

    const machineRecord = (db?.machines || []).find((m: any) => m.name === primaryMachine || m.id === primaryMachine)
    const machineId = machineRecord?.id || null

    try {
      const res = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update', id: order.id,
          process_route: codes, machine_id: machineId,
          status: 'splitting', supervisor_confirmed: true,
          supervisor_confirmed_at: new Date().toISOString(),
        }),
      })
      const data = await res.json()
      if (!data.ok) { alert('Error: ' + (data.error || 'Unknown')); return }
      setEditMode(false)
      onUpdate()
    } catch (err: any) { alert('Network error: ' + err.message) }
  }

  // ── Render: confirmed + locked (production started) ────────────────────────
  const machineName = (() => {
    const mid = order.machine_id || order.machineId
    if (!mid || !db) return null
    return (db.machines || []).find((m: any) => m.id === mid)?.name || null
  })()

  if (isConfirmed && confirmedRoute && !editMode) {
    return (
      <div style={{ fontSize: '12px' }}>
        {/* Confirmed view */}
        <div style={{ padding: '5px 10px', background: '#D1FAE5', color: '#065F46', borderRadius: '4px', fontWeight: 700, display: 'inline-block', marginBottom: 4 }}>
          ✓ {confirmedRoute}
        </div>
        {machineName && (
          <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: 6 }}>
            Machine: <strong>{machineName}</strong>
          </div>
        )}

        {/* Edit / Lock state */}
        {batchLockStatus === 'loading' && (
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Checking…</div>
        )}
        {batchLockStatus === 'editable' && (
          <button
            onClick={() => setEditMode(true)}
            style={{ padding: '3px 10px', fontSize: '11px', fontWeight: 600, border: '1px solid #D97706', borderRadius: '4px', background: '#FFFBEB', color: '#92400E', cursor: 'pointer', marginTop: 2 }}>
            ✏️ Edit Route & Machine
          </button>
        )}
        {batchLockStatus === 'locked' && (
          <div style={{ fontSize: '11px', color: '#DC2626', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            🔒 Locked — {lockReason}
          </div>
        )}
      </div>
    )
  }

  // ── Render: loading db ──────────────────────────────────────────────────────
  if (!db) return <div style={{ padding: '8px', color: '#9CA3AF', fontSize: '12px' }}>Loading...</div>

  // ── Render: lab recheck block ───────────────────────────────────────────────
  if (isSupervisorOrderLabRecheckBlocked(order)) {
    return (
      <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E', borderRadius: '6px', padding: '10px', fontSize: '12px', fontWeight: 600 }}>
        {order.inHouseLabRecheckDone
          ? 'InHouse Lab Recheck done. Tick Lab Receive to enable.'
          : 'Lab Recheck pending. Process and machine stopped.'}
      </div>
    )
  }

  // ── Render: no routes configured ───────────────────────────────────────────
  if (routeOptions.length === 0) {
    return (
      <div style={{ color: '#DC2626', fontSize: '12px', padding: '8px 0' }}>
        ⚠ No route templates.{' '}
        <a href="/setup/process-machine-master" style={{ color: '#185FA5', textDecoration: 'underline' }}>Configure routes</a>
      </div>
    )
  }

  // ── Render: assignment form (new OR edit mode) ──────────────────────────────
  const selectedRoute = routeOptions[selectedTemplateIdx]

  return (
    <div style={{ width: '100%' }}>
      {/* Edit mode header */}
      {editMode && (
        <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '6px', padding: '6px 10px', marginBottom: '8px', fontSize: '11px', fontWeight: 600, color: '#92400E', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✏️ Editing: {confirmedRoute}</span>
          <button
            onClick={() => { setEditMode(false); onUpdate() }}
            style={{ fontSize: '11px', background: 'none', border: '1px solid #D97706', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', color: '#92400E' }}>
            Cancel
          </button>
        </div>
      )}

      <select
        value={selectedTemplateIdx}
        onChange={e => handleTemplateChange(parseInt(e.target.value))}
        style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '4px', marginBottom: showMachines ? '8px' : 0 }}>
        <option value="-1">-- Select Route --</option>
        {routeOptions.map((rt, idx) => {
          const codes = (rt.steps || []).map((s: any) => s.processCode).join('/')
          return <option key={idx} value={idx}>{rt.name.startsWith(codes) ? rt.name : `${rt.name}  (${codes})`}</option>
        })}
      </select>

      {showMachines && selectedRoute && (
        <div style={{ background: '#F9FAFB', borderRadius: '6px', padding: '10px', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Machine Assignment:</div>
          {selectedRoute.steps.filter((s: any) => MACHINE_REQUIRED.includes(s.processCode)).map((step: any) => {
            const articleIntel = getArticleIntelligence(order.article, db)
            const qtyKg = parseFloat(order.qtyKg || order.qty_kg) || 0
            const smartMcn   = getSmartMachine(step.processCode, qtyKg, articleIntel, db)
            const smartLabel = smartMcn ? getMachineDisplayNameWithQty(smartMcn, db) : ''
            return (
              <div key={step.processCode} style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#1F2937', marginBottom: '3px' }}>{step.name || step.processCode}</div>
                {smartLabel && <div style={{ fontSize: '10px', color: '#10B981', marginBottom: '4px' }}>suggest: {smartLabel}</div>}
                <input type="text" list={`machines-${order.id}-${step.processCode}`}
                  value={machineInputs[step.processCode] || ''}
                  onChange={e => setMachineInputs(prev => ({ ...prev, [step.processCode]: e.target.value }))}
                  placeholder="Type machine name"
                  style={{ width: '100%', padding: '5px 8px', fontSize: '11px', border: '1px solid #D1D5DB', borderRadius: '4px' }} />
                <datalist id={`machines-${order.id}-${step.processCode}`}>
                  {(db.machines || []).map((m: any) => (
                    <option key={m.id} value={m.name}>{m.name}{m.capacity ? ` (${m.capacity}kg)` : ''}</option>
                  ))}
                </datalist>
              </div>
            )
          })}
          <button onClick={handleConfirm}
            style={{ width: '100%', padding: '6px 12px', background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginTop: '6px' }}>
            {editMode ? '✓ Update Route & Machines' : '✓ Confirm Route & Machines'}
          </button>
        </div>
      )}

      {!showMachines && selectedTemplateIdx >= 0 && (
        <button onClick={handleConfirm}
          style={{ width: '100%', padding: '6px 12px', background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginTop: '6px' }}>
          {editMode ? '✓ Update Route' : '✓ Confirm Route'}
        </button>
      )}
    </div>
  )
}
