'use client'

import { useState, useEffect } from 'react'
import {
  MACHINE_REQUIRED,
  isSupervisorOrderLabRecheckBlocked,
  getMachineDisplayNameWithQty
} from './route-helpers'
import { sameCode, canonicalCode } from '@/lib/processCodes'
import { articleForMaster } from '@/lib/articleMatch'
import { workRoute, fullRoute, routeHasQa } from '@/lib/routeTail'
import { getActiveUserRecord, isAdminUser } from '@/lib/permissions'

// ── Route to pre-fill, per article (app/api/route-suggest): Master → Master
// by article code → history. Every row on the page asks; the asks are
// gathered and sent as ONE request.
type Suggestion = { route: string[] | null; qa?: boolean; source: 'master' | 'master-code' | 'history' | null; matched: string | null; count: number; machines: Record<string, string> }
const suggestCache = new Map<string, Promise<Suggestion | null>>()
let pending: { article: string; resolve: (s: Suggestion | null) => void }[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
function flushSuggestions() {
  const batch = pending; pending = []; flushTimer = null
  const articles = [...new Set(batch.map(b => b.article))]
  fetch('/api/route-suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articles }) })
    .then(r => r.json()).catch(() => ({ ok: false }))
    .then(j => { for (const b of batch) b.resolve(j?.ok ? (j.data?.[b.article] || null) : null) })
}
function suggestRoute(article: string): Promise<Suggestion | null> {
  const a = String(article || '').trim()
  if (!a) return Promise.resolve(null)
  if (!suggestCache.has(a)) {
    suggestCache.set(a, new Promise(resolve => {
      pending.push({ article: a, resolve })
      if (!flushTimer) flushTimer = setTimeout(flushSuggestions, 60)
    }))
    // a failed answer is not kept — the next page load asks again
    suggestCache.get(a)!.then(v => { if (!v) suggestCache.delete(a) })
  }
  return suggestCache.get(a)!
}
const routeKeyOf = (codes: string[]) => codes.map(c => canonicalCode(c)).join('/')

// ── Master data: loaded ONCE per page for every order row (was 4 requests per
// row). Kept for a minute so a refresh after saving sees new rules.
let masterCache: { at: number; p: Promise<any> } | null = null
function loadMaster(): Promise<any> {
  if (masterCache && Date.now() - masterCache.at < 60_000) return masterCache.p
  const get = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] }))
  const p = Promise.all([get('/api/machines'), get('/api/processes'), get('/api/route-templates'),
                         get('/api/article-routes'), get('/api/orders')])
    .then(([machRes, procRes, routeRes, articleRouteRes, orderRes]) => {
      const processList = procRes.data || []
      // every machine for names / saved ids (a switched-off machine may still be
      // on an order); only active ones are suggested or listed
      const allMachines = machRes.data || []
      const machines = allMachines.filter((m: any) => m.is_active !== false)
      const byId: Record<string, any> = {}
      for (const m of allMachines) byId[m.id] = m
      // What the factory has really done: which machine TYPES ran each process,
      // and which machines each article used last (orders.process_machines)
      const typesFor: Record<string, Set<string>> = {}
      const articleMachines: Record<string, Record<string, string>> = {}
      const orders = [...(orderRes.data || [])].sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))
      for (const o of orders) {
        const pm = o.process_machines && typeof o.process_machines === 'object' ? o.process_machines : null
        if (!pm) continue
        const art = String(o.article || '').trim().toLowerCase()
        for (const [code, ids] of Object.entries(pm) as [string, any][]) {
          const first = Array.isArray(ids) ? ids[0] : ids
          const m = byId[first]
          if (!m) continue
          ;(typesFor[code] ||= new Set()).add(String(m.machine_type || '').toLowerCase())
          if (art) (articleMachines[art] ||= {})[code] = m.name     // newest wins
        }
      }
      return {
        machines,
        allMachines,
        processList,
        typesFor,
        articleMachines,
        processRouteMaster: (routeRes.data || []).map((t: any) => ({
          name:  t.name || t.template_name,
          steps: (t.steps || []).map((s: any) => ({
            processCode: s.processCode || s.process_code || s,
            name: s.name || processList.find((p: any) => p.code === (s.processCode || s))?.name || s.processCode || s,
          })),
        })),
        // article names are stored lower-case — look them up the same way
        articleProcessMap: (articleRouteRes.data || []).reduce((acc: any, r: any) => {
          if (r.article && r.route) {
            acc[String(r.article).trim().toLowerCase()] = typeof r.route === 'string'
              ? r.route.split('/').map((c: string) => c.trim()).filter(Boolean)
              : r.route
          }
          return acc
        }, {}),
      }
    })
  masterCache = { at: Date.now(), p }
  return p
}

// Machine suggestion for one process of an order:
//   1. the machine this article used for that process last time
//   2. else the smallest machine (capacity ≥ qty) of a TYPE that has run this
//      process before (machine_type — e.g. LJET / Ujet for Dyeing)
function suggestMachine(code: string, qtyKg: number, article: string, master: any, fromHistory = ''): string {
  if (!master || !MACHINE_REQUIRED.includes(code)) return ''
  const art = String(article || '').trim().toLowerCase()
  const last = master.articleMachines?.[art]
  const hit = last && Object.entries(last).find(([c]) => sameCode(c, code))
  if (hit) return hit[1] as string
  if (fromHistory) return fromHistory
  const types: Set<string> | undefined = Object.entries(master.typesFor || {}).find(([c]) => sameCode(c, code))?.[1] as any
  if (!types?.size) return ''
  const cands = (master.machines || []).filter((m: any) => types.has(String(m.machine_type || '').toLowerCase()))
  const cap = (m: any) => parseFloat(m.capacity) || 0
  const fits = cands.filter((m: any) => cap(m) > 0 && cap(m) >= qtyKg).sort((a: any, b: any) => cap(a) - cap(b))
  return (fits[0] || cands[0])?.name || ''
}

const findMachine = (machines: any[], typed: string) => {
  const t = String(typed || '').trim().toLowerCase()
  return t ? machines.find((m: any) => m.id === typed || String(m.name || '').trim().toLowerCase() === t) : undefined
}

interface RouteAssignmentProps {
  order: any
  onUpdate: () => void
}

function buildRouteOptions(db: any, article?: string, extra: { codes: string[]; label: string }[] = []): { name: string; steps: { processCode: string; name: string }[] }[] {
  const options: { name: string; steps: { processCode: string; name: string }[] }[] = []
  const processNames: Record<string, string> = {}
  for (const p of (db.processList || [])) processNames[p.code] = p.name || p.code
  // the order's own saved route and the route pre-filled from the Master come
  // first (so they can always be selected, even if no template has them)
  const seen = new Set<string>()
  // routes are shown WITHOUT QA / Packing / Dispatch — those are added on Confirm
  for (const x of extra) {
    const codes = workRoute(x.codes)
    const key = routeKeyOf(codes)
    if (!codes.length || seen.has(key)) continue
    seen.add(key)
    options.push({ name: `${codes.join('/')}  [${x.label}]`, steps: codes.map(code => ({ processCode: code, name: processNames[code] || code })) })
  }
  for (const rt0 of (db.processRouteMaster || [])) {
    const work = workRoute((rt0.steps || []).map((s: any) => s.processCode))
    if (!rt0.name || !work.length) continue
    const rt = { ...rt0, steps: (rt0.steps || []).filter((s: any) => work.includes(canonicalCode(s.processCode))) }
    const key = routeKeyOf(work)
    if (seen.has(key)) continue
    seen.add(key)
    options.push(rt)
  }
  const articleMap = db.articleProcessMap || {}
  const orderedArticles: string[] = []
  const artKey = String(article || '').trim().toLowerCase()
  if (artKey && articleMap[artKey]) orderedArticles.push(artKey)
  for (const a of Object.keys(articleMap)) {
    if (!orderedArticles.includes(a)) orderedArticles.push(a)
  }
  for (const a of orderedArticles) {
    const codes: string[] = workRoute(Array.isArray(articleMap[a]) ? articleMap[a] : [])
    if (!codes.length) continue
    const routeKey = codes.join('/')
    if (seen.has(routeKeyOf(codes))) continue
    seen.add(routeKeyOf(codes))
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
  // machineInputs: { processCode: [machine1, machine2] } — up to 2 machines per process
  const [machineInputs,       setMachineInputs]       = useState<{[key: string]: [string, string]}>({})
  const [showMachines,        setShowMachines]        = useState(false)
  const [editMode,            setEditMode]            = useState(false)
  const [batchLockStatus,     setBatchLockStatus]     = useState<'loading'|'editable'|'locked'>('loading')
  const [lockReason,          setLockReason]          = useState('')
  const [suggestion,          setSuggestion]          = useState<Suggestion | null | undefined>(undefined)  // undefined = still looking
  const [saveToMaster,        setSaveToMaster]        = useState(true)
  // QA before Packing → Dispatch: from the Master for this article (or the saved route)
  const [qa,                  setQa]                  = useState(false)
  const [isAdmin,             setIsAdmin]             = useState(false)

  // ── Confirmed check — top of render ───────────────────────────────────────
  const isConfirmed = !!(order.supervisor_confirmed || order.supervisorConfirmed)
  const confirmedRoute =
    (Array.isArray(order.process_route) && order.process_route.length ? order.process_route.join('/') : '') ||
    (Array.isArray(order.processRoute)  && order.processRoute.length  ? order.processRoute.join('/')  : '') ||
    order.routeTemplateName || ''

  useEffect(() => { loadDb(); setIsAdmin(isAdminUser(getActiveUserRecord())) }, [])

  // the route for this order's article (Master → article code → history)
  useEffect(() => {
    let off = false
    setSuggestion(undefined)
    suggestRoute(order.article).then(sg => { if (!off) setSuggestion(sg) })
    return () => { off = true }
  }, [order.id, order.article])

  const savedRoute: string[] = (Array.isArray(order.process_route) && order.process_route.length ? order.process_route
    : Array.isArray(order.processRoute) ? order.processRoute : []) || []

  const selRoute = routeOptions[selectedTemplateIdx]
  // where the pre-filled route came from (shown under the dropdown)
  const selKey = selRoute ? routeKeyOf((selRoute.steps || []).map((s: any) => s.processCode)) : ''
  const fromSuggestion = !!(suggestion?.route?.length && selKey === routeKeyOf(suggestion.route))
  const offerMaster = isAdmin && !order.isRepair && suggestion !== undefined
    && !(suggestion?.source === 'master' || suggestion?.source === 'master-code')

  useEffect(() => {
    if (db && suggestion !== undefined) {
      const extra: { codes: string[]; label: string }[] = []
      if (savedRoute.length) extra.push({ codes: savedRoute, label: 'saved' })
      if (suggestion?.route?.length) extra.push({ codes: suggestion.route,
        label: suggestion.source === 'history' ? 'history' : `Master: ${suggestion.matched}` })
      const opts = buildRouteOptions(db, order.article, extra)
      setRouteOptions(opts)
      setQa(savedRoute.length ? routeHasQa(savedRoute) : !!suggestion?.qa)
      if (!isConfirmed || editMode) initializeTemplate(db, opts)
    }
  }, [db, order.id, editMode, suggestion])

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
      if (!batches.length) { setBatchLockStatus('editable'); return }
      const locked = batches.find(b => b.is_done || b.status === 'done' || b.status === 'in-process' || b.current_process)
      if (locked) {
        setBatchLockStatus('locked')
        setLockReason(locked.is_done || locked.status === 'done'
          ? `Batch ${locked.batch_id} is completed`
          : `Batch ${locked.batch_id} is in process`)
      } else {
        setBatchLockStatus('editable')
      }
    } catch { setBatchLockStatus('editable') }
  }

  const loadDb = async () => {
    try { setDb(await loadMaster()) }
    catch (err) { console.error('RouteAssignment loadDb error:', err) }
  }

  const initializeTemplate = (database: any, opts: ReturnType<typeof buildRouteOptions>) => {
    if (!opts.length) return
    let defaultIdx = -1
    if (order.routeTemplateName)
      defaultIdx = opts.findIndex(rt => rt.name === order.routeTemplateName)
    const existingRoute = order.process_route || order.processRoute
    // 1. the order's own saved route  2. the route from the Master / history
    if (defaultIdx < 0 && Array.isArray(existingRoute) && existingRoute.length) {
      defaultIdx = opts.findIndex(rt => routeKeyOf((rt.steps || []).map((s: any) => s.processCode)) === routeKeyOf(workRoute(existingRoute)))
    }
    if (defaultIdx < 0 && suggestion?.route?.length) {
      const key = routeKeyOf(suggestion.route)
      defaultIdx = opts.findIndex(rt => routeKeyOf((rt.steps || []).map((s: any) => s.processCode)) === key)
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
    const machineSteps = (rt.steps || []).filter((s: any) => MACHINE_REQUIRED.includes(s.processCode))
    const inputs: {[key: string]: [string, string]} = {}
    // Load existing process_machines if in edit mode — these are stored as machine IDs,
    // so resolve each one to its machine name before putting it in the input field.
    const existingPM = order.process_machines || order.processMachines || {}
    const resolveMachineName = (idOrName: string) => {
      if (!idOrName) return ''
      const rec = (database.allMachines || database.machines || []).find((m: any) => m.id === idOrName)
      return rec ? rec.name : idOrName
    }
    // Machines are NEVER filled in automatically — the supervisor picks them.
    // Only machines already saved on this order are shown again.
    for (const step of machineSteps) {
      const existing = existingPM[step.processCode] || []
      inputs[step.processCode] = [
        resolveMachineName(existing[0]) || '',
        resolveMachineName(existing[1]) || '',
      ]
    }
    setMachineInputs(inputs)
    setShowMachines(machineSteps.length > 0)
  }

  const handleTemplateChange = (idx: number) => {
    setSelectedTemplateIdx(idx)
    if (db) applyTemplate(idx, db, routeOptions)
  }

  // Update one of the two machine slots
  const setMachine = (processCode: string, slot: 0|1, value: string) => {
    setMachineInputs(prev => {
      const pair: [string,string] = [...(prev[processCode] || ['',''])] as [string,string]
      pair[slot] = value
      return { ...prev, [processCode]: pair }
    })
  }

  const handleConfirm = async () => {
    if (selectedTemplateIdx < 0) { alert('Please select a process route'); return }
    if (isSupervisorOrderLabRecheckBlocked(order)) {
      alert('Lab Recheck is pending. Tick Lab Receive to enable.')
      return
    }
    const rt = routeOptions[selectedTemplateIdx]
    if (!rt) return
    // the work route picked here + (QA →) Packing → Dispatch
    const workCodes = workRoute(rt.steps.map((s: any) => s.processCode))
    const codes = fullRoute(workCodes, qa)

    // Build process_machines: { processCode: [machineId1, machineId2?] }
    // also determine primary machine_id (first machine of first required process)
    const processMachinesById: Record<string, string[]> = {}
    let primaryMachineId: string | null = null

    const unknown: string[] = []
    for (const step of rt.steps) {
      if (!MACHINE_REQUIRED.includes(step.processCode)) continue
      const [m1name, m2name] = machineInputs[step.processCode] || ['', '']
      const ids: string[] = []
      for (const mname of [m1name, m2name]) {
        if (!mname.trim()) continue
        // case / spaces don't matter; a name that matches no machine is NOT
        // dropped silently any more — the save stops and says which one
        const rec = findMachine(db?.allMachines || db?.machines || [], mname)
        if (!rec) { unknown.push(`${step.processCode}: "${mname.trim()}"`); continue }
        if (!ids.includes(rec.id)) ids.push(rec.id)
        if (!primaryMachineId) primaryMachineId = rec.id
      }
      if (ids.length) processMachinesById[step.processCode] = ids
    }
    if (unknown.length) {
      alert('No machine with this name — pick one from the list:\n' + unknown.join('\n'))
      return
    }

    try {
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
      if (!data.ok) {
        alert('Error: ' + (data.error || 'Unknown'))
        if (data.stale) { checkBatchLock(); onUpdate() }
        return
      }
      // admin: the article had no Master route → keep this one in the Master
      if (offerMaster && saveToMaster && order.article) {
        const m = await fetch('/api/article-routes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'upsert', article: articleForMaster(order.article), route: workCodes, qa_required: qa }) })
          .then(r => r.json()).catch(() => ({ ok: false, error: 'Network error' }))
        if (!m.ok) alert('Route confirmed, but not saved to the Master: ' + (m.error || 'Unknown error'))
        else suggestCache.delete(String(order.article).trim())
      }
      setEditMode(false)
      onUpdate()
    } catch (err: any) { alert('Network error: ' + err.message) }
  }

  // ── Confirmed readonly view ────────────────────────────────────────────────
  const confirmedMachineNames = (() => {
    if (!db) return []
    const pm = order.process_machines || order.processMachines || {}
    const names: string[] = []
    // Collect all unique machine names from process_machines
    for (const ids of Object.values(pm) as string[][]) {
      for (const mid of (ids || [])) {
        const m = (db.allMachines || db.machines || []).find((m: any) => m.id === mid)
        if (m && !names.includes(m.name)) names.push(m.name)
      }
    }
    // Fallback to machine_id
    if (!names.length) {
      const mid = order.machine_id || order.machineId
      if (mid) {
        const m = (db.allMachines || db.machines || []).find((m: any) => m.id === mid)
        if (m) names.push(m.name)
      }
    }
    return names
  })()

  if (isConfirmed && confirmedRoute && !editMode) {
    return (
      <div style={{ fontSize: '12px' }}>
        <div style={{ padding: '5px 10px', background: '#D1FAE5', color: '#065F46', borderRadius: '4px', fontWeight: 700, display: 'inline-block', marginBottom: 4 }}>
          ✓ {confirmedRoute}
        </div>
        {confirmedMachineNames.length > 0 && (
          <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: 6 }}>
            {confirmedMachineNames.length === 1
              ? <>Machine: <strong>{confirmedMachineNames[0]}</strong></>
              : <>Machines: <strong>{confirmedMachineNames.join(' · ')}</strong></>
            }
          </div>
        )}
        {batchLockStatus === 'loading' && <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Checking…</div>}
        {batchLockStatus === 'editable' && (
          <button onClick={() => setEditMode(true)}
            style={{ padding: '3px 10px', fontSize: '11px', fontWeight: 600, border: '1px solid #D97706', borderRadius: '4px', background: '#FFFBEB', color: '#92400E', cursor: 'pointer', marginTop: 2 }}>
            ✏️ Edit Route & Machine
          </button>
        )}
        {batchLockStatus === 'locked' && (
          <div style={{ fontSize: '11px', color: '#DC2626', marginTop: 2 }}>🔒 Locked — {lockReason}</div>
        )}
      </div>
    )
  }

  if (!db) return <div style={{ padding: '8px', color: '#9CA3AF', fontSize: '12px' }}>Loading...</div>

  if (isSupervisorOrderLabRecheckBlocked(order)) {
    return (
      <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E', borderRadius: '6px', padding: '10px', fontSize: '12px', fontWeight: 600 }}>
        {order.inHouseLabRecheckDone ? 'InHouse Lab Recheck done. Tick Lab Receive to enable.' : 'Lab Recheck pending. Process and machine stopped.'}
      </div>
    )
  }

  if (routeOptions.length === 0) {
    return (
      <div style={{ color: '#DC2626', fontSize: '12px', padding: '8px 0' }}>
        ⚠ No route templates. <a href="/setup/process-machine-master" style={{ color: '#185FA5', textDecoration: 'underline' }}>Configure routes</a>
      </div>
    )
  }

  const selectedRoute = routeOptions[selectedTemplateIdx]

  return (
    <div style={{ width: '100%' }}>
      {editMode && (
        <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '6px', padding: '6px 10px', marginBottom: '8px', fontSize: '11px', fontWeight: 600, color: '#92400E', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✏️ Editing: {confirmedRoute}</span>
          <button onClick={() => { setEditMode(false); onUpdate() }}
            style={{ fontSize: '11px', background: 'none', border: '1px solid #D97706', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', color: '#92400E' }}>
            Cancel
          </button>
        </div>
      )}

      <select value={selectedTemplateIdx} onChange={e => handleTemplateChange(parseInt(e.target.value))}
        style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '4px', marginBottom: showMachines ? '8px' : 0 }}>
        <option value="-1">-- Select Route --</option>
        {routeOptions.map((rt, idx) => {
          const codes = (rt.steps || []).map((s: any) => s.processCode).join('/')
          return <option key={idx} value={idx}>{rt.name.startsWith(codes) ? rt.name : `${rt.name}  (${codes})`}</option>
        })}
      </select>

      {/* where the pre-filled route came from */}
      {suggestion === undefined ? (
        <div style={{ fontSize: '10px', color: '#9CA3AF', margin: '2px 0 6px' }}>Looking up the Master…</div>
      ) : fromSuggestion ? (
        <div style={{ fontSize: '10px', margin: '2px 0 6px', color: suggestion?.source === 'history' ? '#B45309' : '#059669', fontWeight: 600 }}>
          {suggestion?.source === 'history'
            ? `From history (${suggestion.count} batch${suggestion.count === 1 ? '' : 'es'}) — not in the Master`
            : `✓ From Master: ${suggestion?.matched}`}
        </div>
      ) : !suggestion?.route?.length && selectedTemplateIdx < 0 ? (
        <div style={{ fontSize: '10px', color: '#DC2626', margin: '2px 0 6px' }}>No Master route for this article — pick one</div>
      ) : null}
      {selectedTemplateIdx >= 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '11px', margin: '0 0 6px', color: '#374151' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontWeight: 600 }}
            title="Ticked from the Master for this article — change it for this order if needed">
            <input type="checkbox" checked={qa} onChange={e => setQa(e.target.checked)} /> QA
          </label>
          <span style={{ color: '#6B7280' }}>then {qa ? 'QA → ' : ''}Packing → Dispatch (added automatically)</span>
        </div>
      )}
      {offerMaster && selectedTemplateIdx >= 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px', color: '#374151', margin: '0 0 6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={saveToMaster} onChange={e => setSaveToMaster(e.target.checked)} />
          Also save to Master for "{articleForMaster(order.article)}" (route{qa ? ' + QA' : ''})
        </label>
      )}

      {showMachines && selectedRoute && (
        <div style={{ background: '#F9FAFB', borderRadius: '6px', padding: '10px', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Machine Assignment:</div>
          {selectedRoute.steps.filter((s: any) => MACHINE_REQUIRED.includes(s.processCode)).map((step: any) => {
            const qtyKg = parseFloat(order.qtyKg || order.qty_kg) || 0
            const smartMcn   = suggestMachine(step.processCode, qtyKg, order.article, db)
            const smartLabel = smartMcn ? getMachineDisplayNameWithQty(smartMcn, db) : ''
            const pair = machineInputs[step.processCode] || ['', '']

            return (
              <div key={step.processCode} style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#1F2937', marginBottom: '4px' }}>
                  {step.name || step.processCode}
                </div>
                {smartLabel && <div style={{ fontSize: '10px', color: '#10B981', marginBottom: '4px' }}>suggest: {smartLabel}</div>}

                {/* Machine 1 */}
                <div style={{ fontSize: '10px', color: '#6B7280', marginBottom: '2px' }}>Machine 1</div>
                <input type="text" list={`m1-${order.id}-${step.processCode}`}
                  value={pair[0]}
                  onChange={e => setMachine(step.processCode, 0, e.target.value)}
                  placeholder="Primary machine"
                  style={{ width: '100%', padding: '5px 8px', fontSize: '11px', border: '1px solid #D1D5DB', borderRadius: '4px', marginBottom: '6px' }} />
                <datalist id={`m1-${order.id}-${step.processCode}`}>
                  {(db.machines || []).map((m: any) => <option key={m.id} value={m.name}>{m.name}{m.capacity ? ` (${m.capacity}kg)` : ''}</option>)}
                </datalist>

                {/* Machine 2 */}
                <div style={{ fontSize: '10px', color: '#6B7280', marginBottom: '2px' }}>Machine 2 <span style={{ color: '#9CA3AF' }}>(optional)</span></div>
                <input type="text" list={`m2-${order.id}-${step.processCode}`}
                  value={pair[1]}
                  onChange={e => setMachine(step.processCode, 1, e.target.value)}
                  placeholder="Second machine (optional)"
                  style={{ width: '100%', padding: '5px 8px', fontSize: '11px', border: '1px solid #D1D5DB', borderRadius: '4px',
                    borderStyle: pair[1] ? 'solid' : 'dashed', opacity: pair[1] ? 1 : 0.7 }} />
                <datalist id={`m2-${order.id}-${step.processCode}`}>
                  {(db.machines || []).map((m: any) => <option key={m.id} value={m.name}>{m.name}{m.capacity ? ` (${m.capacity}kg)` : ''}</option>)}
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
