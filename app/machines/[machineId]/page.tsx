'use client'

import { SubProdCell } from '@/components/SubProd'
import { withSubProd } from '@/lib/subProd'
import { batchMachineMap } from '@/lib/machineMap'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import BatchCollaborationModal from '@/components/BatchCollaborationModal'
import { usePermission, useSupervisorFilter } from '@/lib/permissions'
import { AccessDenied } from '@/lib/AccessDenied'
import { buildHolidaySet, plannedDateForNumber, sundayOffFrom } from '@/lib/workdays'
import { todayIST } from '@/lib/istDate'
import { machinePaths } from '@/lib/pageAccess'
import { isBatchFinished } from '@/lib/batchStatus'
import { sameCode } from '@/lib/processCodes'
import { collabBlockMessage } from '@/lib/collab'
import { markProcessDone } from '@/lib/db'

// Helper functions
const getShadeTypeByColor = (color: string): string => {
  const c = (color || '').toLowerCase()
  if (c.includes('white') || c.includes('bleach') || c.includes('optical')) return 'White'
  if (c.includes('light') || c.includes('pale') || c.includes('cream') || c.includes('beige') || c.includes('pastel')) return 'Light'
  if (c.includes('dark') || c.includes('black') || c.includes('navy') || c.includes('deep')) return 'Dark'
  if (c.includes('medium') || c.includes('normal')) return 'Medium'
  return 'Medium'
}

const getShadeTypeRank = (color: string): number => {
  const shade = getShadeTypeByColor(color)
  if (shade === 'Light') return 1
  if (shade === 'Medium') return 2
  if (shade === 'Dark') return 3
  if (shade === 'Extra Dark') return 4
  return 99  // For White and others
}


const formatDate = (dateStr: string) => {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}-${month}-${year}`
  } catch {
    return dateStr
  }
}

// Working days: lib/workdays.ts (holidays + "Sunday is a holiday" setting —
// the same rule the Date Calculator uses). 3 plan numbers per working day.
const getPlannedDateByNumber = (planNumber: number, baseDate: string, holidaySet: Set<string>): string =>
  plannedDateForNumber(planNumber, baseDate || todayIST(), holidaySet)

// Column definitions
const COLUMNS = [
  { key: 'batchId', label: 'BATCH ID', defaultWidth: 120, canHide: false },
  { key: 'subProdNo', label: 'SUB PROD NO.', defaultWidth: 110, canHide: true },
  { key: 'shadeType', label: 'SHADE', defaultWidth: 100, canHide: true },
  { key: 'timeStamp', label: 'TIME STAMP', defaultWidth: 110, canHide: true },
  { key: 'orderNo', label: 'ORDER NUMBER', defaultWidth: 130, canHide: true },
  { key: 'party', label: 'PARTY', defaultWidth: 150, canHide: true },
  { key: 'subParty', label: 'SUB PARTY', defaultWidth: 150, canHide: true },
  { key: 'salesPerson', label: 'SALES PERSON', defaultWidth: 140, canHide: true },
  { key: 'article', label: 'ARTICLE', defaultWidth: 180, canHide: true },
  { key: 'color', label: 'COLOR', defaultWidth: 150, canHide: true },
  { key: 'labNo', label: 'LAB NO.', defaultWidth: 100, canHide: true },
  { key: 'lotNo', label: 'LOT NO.', defaultWidth: 100, canHide: true },
  { key: 'challanNo', label: 'CHALLAN NO.', defaultWidth: 110, canHide: true },
  { key: 'kg', label: 'QTY (KG)', defaultWidth: 90, canHide: true },
  { key: 'qtyMtr', label: 'QTY (MTR.)', defaultWidth: 100, canHide: true },
  { key: 'noOfTaka', label: 'NO. OF TA', defaultWidth: 90, canHide: true },
  { key: 'typeOfFinish', label: 'TYPE OF FINISH', defaultWidth: 180, canHide: true },
  { key: 'typeOfPacking', label: 'TYPE OF PACKING', defaultWidth: 180, canHide: true },
  { key: 'remarks', label: 'REMARKS', defaultWidth: 200, canHide: true },
  { key: 'supervisor', label: 'SUPERVISOR', defaultWidth: 120, canHide: true },
  { key: 'processName', label: 'PROCESS NAME', defaultWidth: 150, canHide: true },
  { key: 'params', label: 'NOZZLE · PUMP · PRESS.', defaultWidth: 150, canHide: true },
  { key: 'plannedDate', label: 'PLANNED DATE', defaultWidth: 120, canHide: true },
  { key: 'planNumber', label: 'NO.', defaultWidth: 80, canHide: false },
  { key: 'faulty', label: 'FAULTY', defaultWidth: 80, canHide: true },
  { key: 'status', label: 'STATUS', defaultWidth: 110, canHide: true },
  { key: 'action', label: 'ACTION', defaultWidth: 150, canHide: false }
]


export default function MachinePage() {
  const params = useParams()
  const router = useRouter()
  const machineId = params.machineId as string

  // Permission guard — the sheet counts by its id OR its name slug (User
  // Management stores the slug; the menu links by id). Same rule as the server.
  const machinePath = `/machines/${machineId}`
  const [permPaths, setPermPaths] = useState<string[] | null>(null)
  useEffect(() => {
    let off = false
    fetch('/api/machines', { cache: 'no-store' }).then(r => r.json()).then(j => {
      if (off) return
      const m = (j.data || []).find((x: any) => x.id === machineId
        || (x.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-') === machineId.toLowerCase()
        || (x.name || '').toLowerCase() === machineId.toLowerCase())
      setPermPaths(machinePaths(m, machineId))
    }).catch(() => { if (!off) setPermPaths([machinePath]) })
    return () => { off = true }
  }, [machineId, machinePath])
  const perm = usePermission(permPaths || [machinePath])
  const { canView, canEdit } = perm
  const permLoading = perm.loading || permPaths === null
  const supervisorFilter = useSupervisorFilter()
  
  const [machine, setMachine] = useState<any>(null)
  const [batches, setBatches] = useState<any[]>([])
  const [filters, setFilters] = useState<{ [key: string]: string }>({})
  const [shadeFilter, setShadeFilter] = useState<string>('all')
  const [filteredBatches, setFilteredBatches] = useState<any[]>([])
  const [columnWidths, setColumnWidths] = useState<{ [key: number]: number }>({})
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  // finished rows (this process done) are hidden unless asked for
  const [showDone, setShowDone] = useState(false)
  const [rawBatches, setRawBatches] = useState<any[]>([])   // every batch — for the collab check
  const enterSaved = useRef<Set<string>>(new Set())          // Enter saved this cell — skip the blur save
  
  // Batch Collaboration Modal state
  const [showCollabModal, setShowCollabModal] = useState(false)
  const [collabBatches, setCollabBatches] = useState<any[]>([])
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!permLoading && !canView) return
    loadData()  // now async — fires and forgets
    loadColumnWidths()
    loadHiddenColumns()
  }, [machineId, canView, permLoading])

  useEffect(() => {
    applyFilters()
  }, [batches, filters, shadeFilter, showDone])

  const loadHiddenColumns = () => {
    try {
      const stored = localStorage.getItem('dyeflow_hidden_columns')
      if (stored) {
        const state = JSON.parse(stored)
        const key = `machines::${machineId}`
        if (state[key]) {
          setHiddenColumns(new Set(state[key]))
        }
      }
    } catch (e) {
      console.error('Failed to load hidden columns:', e)
    }
  }

  const toggleColumnVisibility = (columnKey: string) => {
    const newHidden = new Set(hiddenColumns)
    if (newHidden.has(columnKey)) {
      newHidden.delete(columnKey)
    } else {
      newHidden.add(columnKey)
    }
    setHiddenColumns(newHidden)
    
    try {
      const stored = localStorage.getItem('dyeflow_hidden_columns')
      const state = stored ? JSON.parse(stored) : {}
      const key = `machines::${machineId}`
      state[key] = Array.from(newHidden)
      localStorage.setItem('dyeflow_hidden_columns', JSON.stringify(state))
    } catch (e) {
      console.error('Failed to save hidden columns:', e)
    }
  }

  const loadColumnWidths = () => {
    try {
      const stored = localStorage.getItem('dyeflow_col_widths')
      if (stored) {
        const state = JSON.parse(stored)
        const key = `machines::${machineId}`
        if (state[key]) {
          // widths are kept by column position: once, move the ones saved before the
          // SUB PROD NO. column (position 1) was added one place to the right
          if (!state[`${key}::v2`]) {
            const moved: Record<string, number> = {}
            for (const [i, w] of Object.entries(state[key] as Record<string, number>)) moved[Number(i) >= 1 ? Number(i) + 1 : Number(i)] = w
            state[key] = moved; state[`${key}::v2`] = true
            localStorage.setItem('dyeflow_col_widths', JSON.stringify(state))
          }
          setColumnWidths(state[key])
        }
      }
    } catch (e) {
      console.error('Failed to load column widths:', e)
    }
  }

  const saveColumnWidth = (colIndex: number, width: number) => {
    try {
      const stored = localStorage.getItem('dyeflow_col_widths')
      const state = stored ? JSON.parse(stored) : {}
      const key = `machines::${machineId}`
      if (!state[key]) { state[key] = {}; state[`${key}::v2`] = true }
      state[key][colIndex] = width
      localStorage.setItem('dyeflow_col_widths', JSON.stringify(state))
      setColumnWidths(prev => ({ ...prev, [colIndex]: width }))
    } catch (e) {
      console.error('Failed to save column width:', e)
    }
  }

  const handleColumnResize = (colIndex: number, startX: number, startWidth: number) => {
    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(60, startWidth + (e.clientX - startX))
      saveColumnWidth(colIndex, newWidth)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const loadData = async () => {
    try {
      // Fetch machine, batches, and orders from Supabase APIs
      const [machRes, batchRes, orderRes, procRes, holRes0, repairRes, factoryRes] = await Promise.all([
        fetch('/api/machines', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/batches', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/orders', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/processes', { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/holidays?machine_id=${machineId}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/repairing-orders', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/setup/settings?key=factory', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ value: null })),
      ])
      // Build set of batch UUIDs in repairing_orders with status='pending' (not yet split)
      const repairPendingUUIDs = new Set(
        ((repairRes.data || []) as any[])
          .filter((r: any) => r.status === 'pending')
          .map((r: any) => r.batch_id)
          .filter(Boolean)
      )

      const machinesList: any[] = machRes.data  || []
      const allBatches:   any[] = batchRes.data  || []
      const allOrders:    any[] = orderRes.data  || []
      const processes:    any[] = procRes.data   || []

      // Resolve machine from URL param (could be UUID or name-slug)
      const foundMachine = machinesList.find((m: any) => {
        if (m.id === machineId) return true
        const nameSlug = (m.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-')
        const urlSlug  = machineId.toLowerCase()
        return nameSlug === urlSlug || m.name?.toLowerCase() === urlSlug
      })

      if (!foundMachine) { setMachine(null); return }

      // Holiday set (global + this machine's own, plus Sundays when the
      // factory setting says so) — lib/workdays.ts
      const holRes = foundMachine.id === machineId ? holRes0
        : await fetch(`/api/holidays?machine_id=${foundMachine.id}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] }))
      const newHolidaySet = buildHolidaySet(holRes.data || [], sundayOffFrom(factoryRes?.value))
      setHolidaySet(newHolidaySet)
      setMachine(foundMachine)

      // Build order lookup
      const oMap: Record<string, any> = {}
      for (const o of allOrders) oMap[o.id] = o

      // Build process name lookup
      const procMap: Record<string, string> = {}
      for (const p of processes) procMap[p.code] = p.name || p.code

      // Filter batches that belong to this machine.
      // KEY RULE: if machine handles MULTIPLE processes (e.g. SCQ + Dyeing),
      // the batch appears ONCE PER PROCESS on this machine sheet.
      const MACHINE_REQUIRED = ['S', 'D', 'S2', 'Add', 'Lev', 'Fix', 'Wash', 'Rc']
      const machineBatches: any[] = []

      for (const b of allBatches) {
        // Skip repairing batches not yet split/full-split, and written-off
        // ones (finished — they must not take a plan number or a day slot)
        if (b.status === 'repairing' || b.status === 'written-off') continue
        if (repairPendingUUIDs.has(b.id)) continue

        const o = oMap[b.order_id] || {}
        const processRoute: string[] = (b.process_route?.length ? b.process_route : null)
          || (o.process_route?.length ? o.process_route : null) || []
        const shadeType = getShadeTypeByColor(o.color || '')

        // Which processes of THIS batch run on THIS machine — from the batch's
        // own machine-per-process map (lib/machineMap.ts). A batch whose D runs
        // on another machine now shows its D row on that machine's sheet.
        const pmMap = batchMachineMap(b, o)
        const machineProcessCodes: string[] = Object.entries(pmMap)
          .filter(([, mid]) => mid === foundMachine.id)
          .map(([code]) => code)
          .sort((a, c) => processRoute.indexOf(a) - processRoute.indexOf(c))

        // Fallback (no machine processes known at all): the batch's own machine
        if (machineProcessCodes.length === 0) {
          if (b.machine_id !== foundMachine.id || Object.keys(pmMap).length) continue
          const fallback = b.current_process
            || processRoute.find((c: string) => MACHINE_REQUIRED.includes(c))
            || ''
          if (fallback) machineProcessCodes.push(fallback)
        }

        // Create one row per process (SCQ → row1, Dyeing → row2 for same batch)
        for (const displayProcess of machineProcessCodes) {
          const processName = displayProcess ? (procMap[displayProcess] || displayProcess) : '-'
          // this row's process is finished (or the whole batch is) → a "done" row
          const procDone = isBatchFinished(b) || (b.batch_processes || []).some((bp: any) =>
            sameCode(bp.process_code, displayProcess) && bp.status === 'done')
          // the batch is running at THIS process right now → it can be marked Done here
          const atThisProcess = !procDone && sameCode(b.current_process, displayProcess)
            && b.status === 'in-process' && !b.is_faulty
          machineBatches.push({
            procDone,
            atThisProcess,
            // machine settings saved by Auto Split (nozzle / pump rpm / pressure)
            params:         b.process_params && b.process_params.nozzle
              ? `${b.process_params.nozzle} · ${b.process_params.pumpRpm ?? '-'} rpm · ${b.process_params.pressure ?? '-'}`
              : '',
            current_process: b.current_process,
            rowKey:         `${b.batch_id}-${displayProcess}`,   // unique per process
            batchId:        b.batch_id,
            subProdNo:      b.sub_prod_no || '',
            id:             b.id,
            kg:             b.kg,
            mtr:            b.mtr,
            taka:           b.taka,
            status:         b.status || 'pending',
            currentProcess: displayProcess,
            // CRITICAL: read ONLY from byProcess[process] — never fall back to top-level planNumber
            // Fallback causes both SCQ and Dyeing rows to show the same number
            planNumber:     b.date_calc_plan?.byProcess?.[displayProcess] ?? null,
            // plannedDate also per-process: read from byProcessDates[processCode] if exists
            plannedDate_db: b.date_calc_plan?.byProcessDates?.[displayProcess] || '',
            date_calc_plan_raw: b.date_calc_plan || null,
            faulty:         b.is_faulty || false,
            orderId:        b.order_id,
            processRoute,
            orderNo:        o.order_number   || '-',
            timeStamp:      o.created_at     || '',
            party:          o.party          || '-',
            subParty:       o.sub_party      || '-',
            salesPerson:    o.sales_person   || '-',
            article:        o.article        || '-',
            color:          o.color          || '-',
            labNo:          o.lab_no         || '-',
            lotNo:          o.lot_no         || '-',
            challanNo:      o.challan_no     || '-',
            qtyMtr:         b.mtr            || o.qty_mtr    || '',
            noOfTaka:       b.taka           || o.no_of_taka || '',
            typeOfFinish:   o.type_of_finish  || '-',
            typeOfPacking:  o.type_of_packing || '-',
            remarks:        o.remarks        || '',
            supervisor:     o.supervisors?.name || '-',
            processName,
            // RULE: no plan number = no date. Date recalculates on every load using latest holidays.
            // If a holiday is added/removed, just refresh the page - all dates update automatically.
            plannedDate:    (() => {
              const num = b.date_calc_plan?.byProcess?.[displayProcess]
              if (!num) return ''
              const baseDate = foundMachine?.numbering_base_date?.slice(0,10) || todayIST()
              return getPlannedDateByNumber(num, baseDate, newHolidaySet)
            })(),
            shadeType,
            shadeMasterType: shadeType,
          })
        }
      }

      setBatches(machineBatches)
      setRawBatches(allBatches)
    } catch (err) {
      console.error('Machine page loadData error:', err)
    }
  }

  // ── Plan numbers are saved by the server (action 'plan_numbers'): it works
  // out each planned date and merges the number into the batch's plan in the
  // database, so two pages saving at once never undo each other.
  const savePlanNumbers = async (body: Record<string, any>): Promise<{ ok: boolean; plans: Record<string, any>; error?: string }> => {
    if (!machine?.id) return { ok: false, plans: {}, error: 'Machine not loaded' }
    const res = await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'plan_numbers', machine_id: machine.id, ...body }),
    }).then(r => r.json()).catch(() => ({ ok: false, error: 'Network error' }))
    return { ok: !!res.ok, plans: res.plans || {}, error: res.error }
  }

  // Anchor dates for the Date Calculator (batch_date_plans) from the saved plans
  const saveAnchors = async (plans: Record<string, any>) => {
    await Promise.all(Object.entries(plans).map(([uuid, plan]: [string, any]) => {
      const batchRow = batches.find(b => b.id === uuid)
      const anchors: Record<string, string> = {}
      for (const [code, isoDate] of Object.entries(plan?.byProcessDates || {})) {
        if (isoDate) anchors[code] = String(isoDate).slice(0, 10)
      }
      if (!batchRow || !Object.keys(anchors).length) return null
      return fetch('/api/date-plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_anchors', batch_id: uuid, batch_id_str: batchRow.batchId, anchors }),
      }).catch(() => {})
    }))
  }

  const updatePlanNumber = async (batchUUID: string, processCode: string, value: string, _existingPlan: any) => {
    const n = parseInt(value, 10)
    const planNum = (!n || n < 1) ? null : n
    const r = await savePlanNumbers({ set: [{ batch: batchUUID, code: processCode, num: planNum }] })
    if (!r.ok) { alert('Plan number not saved: ' + (r.error || 'Unknown error')); loadData(); return }
    if (planNum) await saveAnchors(r.plans)
    loadData()
  }

  // Ticking "Faulty" raises a proper faulty record at the batch's current
  // process (same as the FMS page). A faulty batch is cleared on the Faulty
  // page (Mark OK / Reprocess), not by unticking here.
  // Done on the machine sheet = the same server step as Done on the FMS page
  // (process_done): only for a batch running at this row's process, and only
  // when its collab partners have arrived too.
  const handleDone = async (row: any) => {
    const raw = rawBatches.find(b => b.id === row.id)
    if (!raw || !sameCode(raw.current_process, row.currentProcess) || raw.status !== 'in-process') {
      alert(`${row.batchId} is not running at ${row.currentProcess} any more — refresh the page.`); loadData(); return
    }
    const block = collabBlockMessage(raw, row.currentProcess, rawBatches)
    if (block) { alert(block); return }
    if (!confirm(`Mark ${row.batchId} done in ${row.currentProcess}?`)) return
    const { error, next_process } = await markProcessDone(row.id, row.currentProcess)
    if (error) alert('Not marked done: ' + error)
    else if (next_process) alert(`✓ ${row.batchId} → ${next_process}`)
    loadData()
  }

  const toggleFaulty = async (batchId: string, _orderId: string, currentFaulty: boolean) => {
    if (currentFaulty) { alert('This batch is faulty — clear it on the Faulty page (Mark OK or Reprocess).'); return }
    const row = batches.find(b => b.id === batchId)
    const fresh = await fetch(`/api/batches?id=${batchId}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null)
    const cur = fresh?.data?.[0]
    if (!cur?.current_process || cur.status !== 'in-process') {
      alert(`${row?.batchId || 'This batch'} is not running at a process right now — it can't be marked faulty here.`); return
    }
    const reason = prompt(`Mark ${cur.batch_id} faulty at ${cur.current_process}? Enter the fault:`)
    if (!reason || !reason.trim()) return
    const res = await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_faulty', batch_id: batchId, process_code: cur.current_process,
        faulty_type: reason.trim(), faulty_kg: parseFloat(cur.kg) || 0 }),
    }).then(r => r.json()).catch(() => ({ ok: false, error: 'Network error' }))
    if (!res.ok) alert('Error: ' + res.error)
    loadData()
  }

  // Handle collaboration confirmation — saves to Supabase
  // Plan numbers are stored PER PROCESS: date_calc_plan = { planNumber: N, byProcess: { S: N1, D: N2 } }
  // This way SCQ and Dyeing rows for the same batch get independent plan numbers
  const handleCollaborationConfirm = async (
    collabGroups: any[],
    skipBatchIds: string[]
  ) => {
    // Each group (collab) gets ONE number, then every other unnumbered row its
    // own — the numbers themselves are handed out by the server while this
    // machine is locked (the next free ones after the highest on this machine).
    const rowFor = (key: string) => batches.find(b => b.rowKey === key || b.batchId === key)
    const groups: { batch: string; code: string }[][] = []
    const used = new Set<string>()
    for (const group of collabGroups) {
      const g: { batch: string; code: string }[] = []
      for (const item of group.batches || []) {
        const row = rowFor(item.batchId)
        if (!row || used.has(row.rowKey)) continue
        used.add(row.rowKey); g.push({ batch: row.id, code: row.currentProcess })
      }
      if (g.length) groups.push(g)
    }
    for (const b of batches) {
      if (b.planNumber || b.procDone || used.has(b.rowKey)) continue
      if (skipBatchIds.includes(b.rowKey) || skipBatchIds.includes(b.batchId)) continue
      used.add(b.rowKey); groups.push([{ batch: b.id, code: b.currentProcess }])
    }
    const members = batches.filter(b => b.currentProcess).map(b => ({ batch: b.id, code: b.currentProcess }))
    const r = await savePlanNumbers({ auto: { members, groups } })
    if (!r.ok) alert('Numbering not saved: ' + (r.error || 'Unknown error'))
    else await saveAnchors(r.plans)

    await loadData()
    setShowCollabModal(false)
  }

  const runNumbering = () => {
    const unnumbered = batches.filter(b => !b.planNumber && !b.procDone)
    if (unnumbered.length === 0) { alert('No batches to number'); return }

    // Sort by shade type (Light → Medium → Dark → Extra Dark) before opening modal
    // This ensures Run Numbering assigns numbers in shade sequence
    const maxExisting = Math.max(0, ...batches.map(b => b.planNumber || 0))
    const lastNumberedBatch = batches.find(b => b.planNumber === maxExisting)
    const lastShadeRank = lastNumberedBatch ? getShadeTypeRank(lastNumberedBatch.color) : 1
    const shadeCycle = [1, 2, 3, 4]
    const circularWeight = (rank: number) => {
      if (!shadeCycle.includes(rank)) return 99
      const startIdx = Math.max(0, shadeCycle.indexOf(lastShadeRank))
      const idx = shadeCycle.indexOf(rank)
      return (idx - startIdx + shadeCycle.length) % shadeCycle.length
    }

    const sorted = [...unnumbered].sort((a, b) => {
      // Primary: shade sequence (circular from last numbered shade)
      const shadeDiff = circularWeight(getShadeTypeRank(a.color)) - circularWeight(getShadeTypeRank(b.color))
      if (shadeDiff !== 0) return shadeDiff
      // Secondary: same shade → group by process (SCQ before Dyeing within same shade)
      const procA = a.currentProcess || ''
      const procB = b.currentProcess || ''
      if (procA !== procB) return procA.localeCompare(procB)
      // Tertiary: by batch id
      return (a.batchId || '').localeCompare(b.batchId || '')
    })

    setCollabBatches(sorted)
    setShowCollabModal(true)
  }

  const clearNumbering = async () => {
    if (!confirm('Are you sure you want to clear all plan numbers for this machine?')) return
    // Only the numbers of THIS machine's processes are removed (one server
    // step) — a batch numbered on another machine keeps that number.
    const set = batches.filter(b => b.planNumber && b.currentProcess)
      .map(b => ({ batch: b.id, code: b.currentProcess, num: null }))
    if (!set.length) { alert('Nothing to clear.'); return }
    const r = await savePlanNumbers({ set })
    await loadData()
    alert(r.ok ? '✅ Numbering cleared for this machine' : '⚠ Not cleared: ' + (r.error || 'Unknown error'))
  }

  const applyFilters = () => {
    let filtered = showDone ? [...batches] : batches.filter(b => !b.procDone)
    
    if (shadeFilter !== 'all') {
      filtered = filtered.filter(b => b.shadeType.toLowerCase() === shadeFilter.toLowerCase())
    }
    
    Object.keys(filters).forEach(key => {
      const filterValue = filters[key].toLowerCase().trim()
      if (filterValue) {
        filtered = filtered.filter(batch => {
          const value = String(batch[key] || '').toLowerCase()
          return value.includes(filterValue)
        })
      }
    })
    
    setFilteredBatches(filtered)
  }

  const handleFilterChange = (column: string, value: string) => {
    setFilters(prev => ({ ...prev, [column]: value }))
  }

  const getStatusBadge = (status: string) => {
    const badges: any = {
      new: { bg: '#DBEAFE', color: '#1E40AF', label: 'New' },
      pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
      'in-process': { bg: '#DBEAFE', color: '#1E40AF', label: 'In Process' },
      done: { bg: '#D1FAE5', color: '#065F46', label: 'Done' }
    }
    const badge = badges[status] || { bg: '#F3F4F6', color: '#6B7280', label: status }
    return (
      <span style={{
        padding: '4px 10px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 600,
        background: badge.bg,
        color: badge.color,
        whiteSpace: 'nowrap'
      }}>
        {badge.label}
      </span>
    )
  }

  const getColumnWidth = (index: number, defaultWidth: number = 120) => {
    return columnWidths[index] || defaultWidth
  }

  const visibleColumns = COLUMNS.filter(col => !hiddenColumns.has(col.key))

  if (permLoading) return <div className="content"><div className="card"><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div></div></div>
  if (!canView) return <AccessDenied pageName={machine?.name || machineId} />

  if (!machine) {
    return (
      <div className="content">
        <div className="card">
          <div className="empty-state" style={{ padding: '60px' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🏭</div>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
              Machine Not Found
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>
              Machine ID "{machineId}" does not exist.
            </div>
            <button className="primary" onClick={() => router.push('/machines')}>
              ← Back to All Machines
            </button>
          </div>
        </div>
      </div>
    )
  }

  const totalBatches = batches.length
  const activeBatches = batches.filter(b => !b.procDone).length
  const numberedBatches = batches.filter(b => b.planNumber && b.planNumber > 0).length
  const unnumberedBatches = batches.filter(b => !b.procDone && !(b.planNumber > 0)).length
  const doneRows = batches.filter(b => b.procDone).length

  return (
    <div className="content">
      {/* Machine Header */}
      <div className="card" style={{ marginBottom: '12px', background: 'linear-gradient(135deg, #FFF5F5 0%, #FED7D7 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '8px',
              background: '#FC8181',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '13px',
              fontWeight: 700,
              textAlign: 'center',
              lineHeight: 1.2,
            }}>
              {(() => {
                // Extract number from name e.g. "Long Tube Jet No. 28" → "28"
                const match = (machine.name || '').match(/\d+$/)
                return match ? '#' + match[0] : (machine.name || 'M').substring(0, 2).toUpperCase()
              })()}
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#2D3748', marginBottom: '4px' }}>
                {machine.name}
              </div>
              <div style={{ fontSize: '12px', color: '#718096' }}>
                Type: {machine.type || 'N/A'} &nbsp;•&nbsp; Capacity: {machine.capacity} Kg &nbsp;•&nbsp; 
                Max 3 batches per day
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#FC8181' }}>{totalBatches}</div>
              <div style={{ fontSize: '11px', color: '#718096', textTransform: 'uppercase' }}>BATCHES</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#48BB78' }}>{activeBatches}</div>
              <div style={{ fontSize: '11px', color: '#718096', textTransform: 'uppercase' }}>ACTIVE</div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: '12px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#718096', marginRight: '8px' }}>
              Shade sequence:
            </div>
            {['all', 'light', 'medium', 'dark'].map(filter => (
              <button
                key={filter}
                onClick={() => setShadeFilter(filter)}
                style={{
                  padding: '6px 14px',
                  fontSize: '11px',
                  fontWeight: 600,
                  borderRadius: '20px',
                  border: '1px solid #E2E8F0',
                  background: shadeFilter === filter ? (filter === 'all' ? '#2D3748' : filter === 'dark' ? '#2D3748' : '#DBEAFE') : 'white',
                  color: shadeFilter === filter ? (filter === 'all' || filter === 'dark' ? 'white' : '#1E40AF') : '#718096',
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {filter === 'dark' ? 'Extra Dark' : filter}
              </button>
            ))}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
            <button
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              style={{
                padding: '6px 14px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '4px',
                border: '1px solid #E2E8F0',
                background: 'white',
                color: '#718096',
                cursor: 'pointer'
              }}
            >
              ⚙️ Columns ({visibleColumns.length}/{COLUMNS.length})
            </button>
            {showColumnMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                background: 'white',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                padding: '8px',
                zIndex: 100,
                minWidth: '200px'
              }}>
                {COLUMNS.filter(col => col.canHide).map(col => (
                  <label key={col.key} style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 8px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    borderRadius: '4px'
                  }}>
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.has(col.key)}
                      onChange={() => toggleColumnVisibility(col.key)}
                      style={{ marginRight: '8px' }}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
            <label style={{ fontSize: '11px', color: '#718096', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
              Show done ({doneRows})
            </label>
            {canEdit && <button
              onClick={runNumbering}
              style={{
                padding: '6px 14px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '4px',
                border: 'none',
                background: unnumberedBatches > 0 ? '#48BB78' : '#94A3B8',
                color: 'white',
                cursor: unnumberedBatches > 0 ? 'pointer' : 'not-allowed'
              }}
              disabled={unnumberedBatches === 0}
            >
              🔢 Run Numbering {unnumberedBatches > 0 ? `(${unnumberedBatches})` : ''}
            </button>}
            {canEdit && numberedBatches > 0 && (
              <button
                onClick={clearNumbering}
                style={{
                  padding: '6px 14px',
                  fontSize: '11px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: '1px solid #E2E8F0',
                  background: 'white',
                  color: '#718096',
                  cursor: 'pointer'
                }}
              >
                Clear All
              </button>
            )}
          </div>
        </div>
        <div style={{ fontSize: '11px', color: '#718096', marginTop: '8px' }}>
          {numberedBatches} numbered • {unnumberedBatches} pending • Drag column edges to resize • Colors must be in Shade Master
        </div>
      </div>

      {/* Batch Register - (Rest of the table code remains the same as before) */}
      <div className="card">
        <div className="card-header" style={{ background: '#FC8181', color: 'white', padding: '10px 16px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>📋 Batch Register - {filteredBatches.length} batches</span>
          <button 
            onClick={() => router.push('/machines')}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '4px',
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            ← Back
          </button>
        </div>

        {filteredBatches.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📋</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>No batches found</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Try adjusting your filters</div>
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#F7FAFC', zIndex: 10 }}>
                <tr>
                  {visibleColumns.map((col, visIdx) => {
                    const realIdx = COLUMNS.indexOf(col)
                    return (
                      <th key={col.key} style={{ ...filterHeaderStyle, width: `${getColumnWidth(realIdx, col.defaultWidth)}px`, position: 'relative' }}>
                        <input 
                          placeholder="Filter" 
                          style={filterInputStyle}
                          onChange={(e) => handleFilterChange(col.key, e.target.value)}
                        />
                        {visIdx < visibleColumns.length - 1 && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              right: -4,
                              width: 8,
                              height: '100%',
                              cursor: 'col-resize',
                              zIndex: 3
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              const th = e.currentTarget.parentElement as HTMLElement
                              const startX = e.clientX
                              const startWidth = th.getBoundingClientRect().width
                              handleColumnResize(realIdx, startX, startWidth)
                            }}
                          >
                            <div style={{
                              position: 'absolute',
                              top: '20%',
                              bottom: '20%',
                              right: 3,
                              width: 2,
                              background: 'rgba(24,95,165,0.35)',
                              borderRadius: 2
                            }} />
                          </div>
                        )}
                      </th>
                    )
                  })}
                </tr>
                <tr style={{ background: '#EDF2F7' }}>
                  {visibleColumns.map((col, visIdx) => {
                    const realIdx = COLUMNS.indexOf(col)
                    return (
                      <th key={col.key} style={{ ...thStyle, width: `${getColumnWidth(realIdx, col.defaultWidth)}px` }}>
                        {col.label}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map((batch, idx) => (
                  <tr 
                    key={batch.rowKey || batch.batchId + idx}
                    style={{
                      background: idx % 2 === 0 ? 'white' : '#F7FAFC',
                      borderBottom: '1px solid #E2E8F0'
                    }}
                  >
                    {visibleColumns.map((col, visIdx) => {
                      const realIdx = COLUMNS.indexOf(col)
                      const width = getColumnWidth(realIdx, col.defaultWidth)
                      
                      if (col.key === 'planNumber') {
                        return (
                          <td key={col.key} style={{ ...tdStyle, width: `${width}px` }}>
                            <input
                              type="number"
                              min="1"
                              key={batch.rowKey + '-' + (batch.planNumber || 'empty')}
                              defaultValue={batch.planNumber || ''}
                              data-plan-idx={idx}
                              data-batch-id={batch.id}
                              data-process={batch.currentProcess}
                              disabled={!canEdit || batch.procDone}
                              onBlur={(e) => {
                                // Enter already saved this cell (focus moving on blurs it)
                                if (enterSaved.current.delete(batch.rowKey)) return
                                const val = e.target.value
                                if (val !== String(batch.planNumber || '')) {
                                  updatePlanNumber(batch.id, batch.currentProcess, val, batch.date_calc_plan_raw)
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  const val = (e.target as HTMLInputElement).value
                                  if (val !== String(batch.planNumber || '')) {
                                    enterSaved.current.add(batch.rowKey)
                                    updatePlanNumber(batch.id, batch.currentProcess, val, batch.date_calc_plan_raw)
                                  }
                                  const nextInput = document.querySelector<HTMLInputElement>(
                                    `input[data-plan-idx="${idx + 1}"]`
                                  )
                                  // moving focus fires this cell's blur right now (skipped by the flag);
                                  // the flag is then cleared so a LATER edit here saves normally
                                  if (nextInput && !nextInput.disabled) { nextInput.focus(); nextInput.select() }
                                  enterSaved.current.delete(batch.rowKey)
                                }
                              }}
                              placeholder="-"
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: batch.planNumber ? '#10B981' : '#94A3B8',
                                border: '1px solid #E2E8F0',
                                borderRadius: '3px',
                                textAlign: 'center',
                                background: 'white'
                              }}
                            />
                          </td>
                        )
                      }
                      
                      if (col.key === 'subProdNo') {
                        return <td key={col.key} style={{ ...tdStyle, width: `${width}px` }}><SubProdCell value={batch.subProdNo} /></td>
                      }
                      if (col.key === 'batchId') {
                        return <td key={col.key} style={{ ...tdStyle, fontWeight: 700, color: '#E53E3E', width: `${width}px` }}>{batch.batchId}</td>
                      }
                      
                      if (col.key === 'shadeType') {
                        return (
                          <td key={col.key} style={{ ...tdStyle, width: `${width}px` }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '10px',
                              fontWeight: 600,
                              background: batch.shadeType === 'Light' ? '#DBEAFE' : batch.shadeType === 'Dark' ? '#2D3748' : '#DBEAFE',
                              color: batch.shadeType === 'Light' ? '#1E40AF' : batch.shadeType === 'Dark' ? 'white' : '#1E40AF'
                            }}>
                              {batch.shadeType}
                            </span>
                          </td>
                        )
                      }
                      
                      if (col.key === 'timeStamp' || col.key === 'plannedDate') {
                        return (
                          <td key={col.key} style={{ 
                            ...tdStyle, 
                            fontSize: col.key === 'timeStamp' ? '10px' : '11px',
                            fontWeight: col.key === 'plannedDate' && batch.planNumber ? 600 : 400,
                            color: col.key === 'plannedDate' && batch.planNumber ? '#10B981' : '#2D3748',
                            width: `${width}px`
                          }}>
                            {formatDate(batch[col.key])}
                          </td>
                        )
                      }
                      
                      if (col.key === 'status') {
                        return <td key={col.key} style={{ ...tdStyle, width: `${width}px` }}>{getStatusBadge(batch.status)}</td>
                      }
                      
                      if (col.key === 'faulty') {
                        return (
                          <td key={col.key} style={{ ...tdStyle, textAlign: 'center', width: `${width}px` }}>
                            <input
                              type="checkbox"
                              checked={batch.faulty || false}
                              disabled={!canEdit}
                              onChange={() => toggleFaulty(batch.id, batch.orderId, batch.faulty || false)}
                              style={{
                                width: '16px',
                                height: '16px',
                                cursor: 'pointer',
                                accentColor: '#EF4444'
                              }}
                              title="Mark as Faulty"
                            />
                          </td>
                        )
                      }
                      
                      if (col.key === 'action') {
                        return (
                          <td key={col.key} style={{ ...tdStyle, whiteSpace: 'nowrap', width: `${width}px` }}>
                            {batch.procDone ? (
                              <span style={{ fontSize: '10px', color: '#48BB78', fontWeight: 600 }}>✓ Done</span>
                            ) : canEdit && batch.atThisProcess ? (
                              <button onClick={() => handleDone(batch)} style={{
                                padding: '4px 10px',
                                fontSize: '10px',
                                fontWeight: 600,
                                border: 'none',
                                borderRadius: '4px',
                                background: '#48BB78',
                                color: 'white',
                                cursor: 'pointer'
                              }}>
                                Done
                              </button>
                            ) : (
                              <span style={{ fontSize: '10px', color: '#A0AEC0' }}
                                title={batch.current_process ? `Now at ${batch.current_process}` : 'Not sent yet'}>
                                {batch.current_process ? `at ${batch.current_process}` : 'waiting'}
                              </span>
                            )}
                          </td>
                        )
                      }
                      
                      // long texts wrap inside the column, so the column can be dragged narrower
                      if (col.key === 'remarks' || col.key === 'typeOfFinish' || col.key === 'typeOfPacking') {
                        return (
                          <td key={col.key} style={{ 
                            ...tdStyle, 
                            width: `${width}px`,
                            maxWidth: `${width}px`,
                            whiteSpace: 'normal',
                            wordWrap: 'break-word',
                            ...(col.key !== 'remarks' ? { fontSize: '10px' } : {})
                          }}>
                            {batch[col.key] || '-'}
                          </td>
                        )
                      }
                      
                      if (col.key === 'article' || col.key === 'processName') {
                        return (
                          <td key={col.key} style={{ 
                            ...tdStyle, 
                            fontWeight: col.key === 'article' ? 500 : 600,
                            color: col.key === 'processName' ? '#2563EB' : '#2D3748',
                            width: `${width}px`
                          }}>
                            {batch[col.key] || '-'}
                          </td>
                        )
                      }
                      
                      if (col.key === 'kg') {
                        return <td key={col.key} style={{ ...tdStyle, fontWeight: 600, width: `${width}px` }}>{batch.kg}</td>
                      }
                      
                      if (['labNo', 'lotNo', 'challanNo'].includes(col.key)) {
                        return <td key={col.key} style={{ ...tdStyle, fontSize: '10px', width: `${width}px` }}>{batch[col.key] || '-'}</td>
                      }
                      
                      return <td key={col.key} style={{ ...tdStyle, width: `${width}px` }}>{batch[col.key] || '-'}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Batch Collaboration Modal */}
      <BatchCollaborationModal
        isOpen={showCollabModal}
        onClose={() => setShowCollabModal(false)}
        availableBatches={collabBatches.map(b => ({
          batchId:      b.rowKey || b.batchId,  // use rowKey (batchId-processCode) as unique id
          batchIdLabel: withSubProd(b.batchId, b.subProdNo),   // display label (without process suffix) · Sub Prod No.
          orderNumber:  b.orderNo,
          orderId:      b.orderId,
          color:        b.color,
          processCode:  b.currentProcess,        // e.g. 'S', 'D'
          processName:  b.processName,           // e.g. 'SCQ', 'Dyeing'
          kg:           parseFloat(b.kg) || 0,
          type:         b.type,
          note:         b.note || ''
        }))}
        machineCapacity={machine?.capacity || 500}
        machineName={machine?.name || machineId}
        onConfirm={handleCollaborationConfirm}
      />
    </div>
  )
}

const filterHeaderStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderBottom: '1px solid #E2E8F0',
  textAlign: 'left',
  background: 'white'
}

const filterInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  fontSize: '10px',
  border: '1px solid #E2E8F0',
  borderRadius: '3px',
  outline: 'none'
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontSize: '9px',
  fontWeight: 700,
  color: '#4A5568',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '2px solid #CBD5E0',
  borderRight: '1px solid #E2E8F0',
  whiteSpace: 'nowrap'
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '11px',
  color: '#2D3748',
  borderRight: '1px solid #F7FAFC',
  whiteSpace: 'nowrap'
}
