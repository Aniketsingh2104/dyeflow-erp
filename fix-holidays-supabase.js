const fs   = require('fs')
const path = require('path')

// ── Step 1: Create /api/holidays route ───────────────────────────────────
const apiDir = path.join('app', 'api', 'holidays')
if (!fs.existsSync(apiDir)) fs.mkdirSync(apiDir, { recursive: true })

fs.writeFileSync(path.join(apiDir, 'route.ts'), `import { NextRequest, NextResponse } from 'next/server'
import { dbSelect } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const machineId = searchParams.get('machine_id')

    const query: Record<string, string> = { order: 'holiday_date.asc', limit: '1000' }

    // Fetch global holidays (machine_id IS NULL) + machine-specific holidays
    // We fetch all and filter client side since PostgREST OR needs special syntax
    const { data, error } = await dbSelect('holidays', query, 'id,holiday_date,name,type,machine_id,reason')
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    // Filter: global (machine_id null) OR matches this machine
    const filtered = (data || []).filter((h: any) =>
      !h.machine_id || (machineId && h.machine_id === machineId)
    )

    return NextResponse.json({ ok: true, data: filtered })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
`)
console.log('✓ Created /api/holidays/route.ts')

// ── Step 2: Fix machine page to load holidays from Supabase ──────────────
const pagePath = path.join('app', 'machines', '[machineId]', 'page.tsx')
let page = fs.readFileSync(pagePath, 'utf8')

// Fix 1: addWorkingDays currently reads from localStorage — replace with parameter-based holidays
const OLD_ADD = `const addWorkingDays = (dateStr: string, daysToAdd: number, machineId?: string): string => {
  if (!dateStr || daysToAdd < 0) return dateStr
  
  const date = new Date(dateStr)
  let daysAdded = 0
  
  // Get holidays from database
  const stored = localStorage.getItem('dyeflow_db')
  const holidays: Set<string> = new Set()
  
  if (stored) {
    const db = JSON.parse(stored)
    
    // Add global holidays (array of strings)
    const globalHolidays = db.holidays || []
    globalHolidays.forEach((date: string) => {
      holidays.add(date)
    })
    
    // Add machine-specific holidays (array of objects)
    const machineHolidays = db.machineHolidays || []
    machineHolidays.forEach((holiday: any) => {
      if (machineId && holiday.machineId === machineId) {
        holidays.add(holiday.date)
      }
    })
  }
  
  while (daysAdded < daysToAdd) {
    date.setDate(date.getDate() + 1)
    const dateString = date.toISOString().slice(0, 10)
    
    // Skip Sundays (day 0) and holidays
    if (date.getDay() !== 0 && !holidays.has(dateString)) {
      daysAdded++
    }
  }
  
  return date.toISOString().slice(0, 10)
}`

const NEW_ADD = `// holidaySet is now passed as parameter (loaded from Supabase, not localStorage)
const addWorkingDays = (dateStr: string, daysToAdd: number, holidaySet: Set<string>): string => {
  if (!dateStr || daysToAdd < 0) return dateStr
  const date = new Date(dateStr)
  let daysAdded = 0
  while (daysAdded < daysToAdd) {
    date.setDate(date.getDate() + 1)
    const dateString = date.toISOString().slice(0, 10)
    if (date.getDay() !== 0 && !holidaySet.has(dateString)) {
      daysAdded++
    }
  }
  return date.toISOString().slice(0, 10)
}`

if (page.includes(OLD_ADD)) {
  page = page.replace(OLD_ADD, NEW_ADD)
  console.log('✓ addWorkingDays now uses passed holidaySet instead of localStorage')
} else {
  console.error('✗ addWorkingDays pattern not found')
}

// Fix 2: getPlannedDateByNumber — pass holidaySet through
const OLD_GET = `const getPlannedDateByNumber = (planNumber: number, baseDate: string, machineId?: string): string => {
  if (!planNumber || planNumber < 1) return ''
  
  // Calculate day offset (3 batches per day)
  const dayOffset = Math.floor((planNumber - 1) / 3)
  
  // Use provided base date or today
  const base = baseDate || new Date().toISOString().slice(0, 10)
  
  // CRITICAL: Always start from the NEXT working day, not today
  // This ensures Plan #1 starts on the first available working day
  // Add 1 extra day to offset to skip today and start from tomorrow
  return addWorkingDays(base, dayOffset + 1, machineId)
}`

const NEW_GET = `const getPlannedDateByNumber = (planNumber: number, baseDate: string, holidaySet: Set<string>): string => {
  if (!planNumber || planNumber < 1) return ''
  const dayOffset = Math.floor((planNumber - 1) / 3)
  const base = baseDate || new Date().toISOString().slice(0, 10)
  return addWorkingDays(base, dayOffset + 1, holidaySet)
}`

if (page.includes(OLD_GET)) {
  page = page.replace(OLD_GET, NEW_GET)
  console.log('✓ getPlannedDateByNumber now uses holidaySet parameter')
} else {
  console.error('✗ getPlannedDateByNumber pattern not found')
}

// Fix 3: Add holidaySet state to component
const OLD_STATE = `  const [showCollabModal, setShowCollabModal] = useState(false)
  const [collabBatches, setCollabBatches] = useState<any[]>([])`

const NEW_STATE = `  const [showCollabModal, setShowCollabModal] = useState(false)
  const [collabBatches, setCollabBatches] = useState<any[]>([])
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set())`

if (page.includes(OLD_STATE)) {
  page = page.replace(OLD_STATE, NEW_STATE)
  console.log('✓ Added holidaySet state')
} else {
  console.error('✗ state pattern not found')
}

// Fix 4: Load holidays in loadData alongside other fetches
const OLD_LOAD = `      const [machRes, batchRes, orderRes, procRes] = await Promise.all([
        fetch('/api/machines', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/batches?limit=5000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/orders?limit=2000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/processes', { cache: 'no-store' }).then(r => r.json()),
      ])

      const machinesList: any[] = machRes.data  || []
      const allBatches:   any[] = batchRes.data  || []
      const allOrders:    any[] = orderRes.data  || []
      const processes:    any[] = procRes.data   || []`

const NEW_LOAD = `      const [machRes, batchRes, orderRes, procRes, holRes] = await Promise.all([
        fetch('/api/machines', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/batches?limit=5000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/orders?limit=2000', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/processes', { cache: 'no-store' }).then(r => r.json()),
        fetch(\`/api/holidays?machine_id=\${machineId}\`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])

      const machinesList: any[] = machRes.data  || []
      const allBatches:   any[] = batchRes.data  || []
      const allOrders:    any[] = orderRes.data  || []
      const processes:    any[] = procRes.data   || []

      // Build holiday set from Supabase (global + machine-specific)
      const newHolidaySet = new Set<string>(
        (holRes.data || []).map((h: any) => h.holiday_date?.slice(0, 10)).filter(Boolean)
      )
      setHolidaySet(newHolidaySet)`

if (page.includes(OLD_LOAD)) {
  page = page.replace(OLD_LOAD, NEW_LOAD)
  console.log('✓ loadData now fetches holidays from Supabase')
} else {
  console.error('✗ loadData pattern not found')
}

// Fix 5: plannedDate IIFE — use holidaySet from closure (foundMachine scope)
// The IIFE runs inside loadData where foundMachine and newHolidaySet are in scope
const OLD_PLANNED = `            // RULE: no plan number for this process = no planned date, period
            plannedDate:    (() => {
              const num = b.date_calc_plan?.byProcess?.[displayProcess]
              if (!num) return ''
              return getPlannedDateByNumber(num, new Date().toISOString().slice(0, 10), foundMachine.id)
            })(),`

const NEW_PLANNED = `            // RULE: no plan number = no date. Date recalculates on every load using latest holidays.
            // If a holiday is added/removed, just refresh the page - all dates update automatically.
            plannedDate:    (() => {
              const num = b.date_calc_plan?.byProcess?.[displayProcess]
              if (!num) return ''
              return getPlannedDateByNumber(num, new Date().toISOString().slice(0, 10), newHolidaySet)
            })(),`

if (page.includes(OLD_PLANNED)) {
  page = page.replace(OLD_PLANNED, NEW_PLANNED)
  console.log('✓ plannedDate now uses newHolidaySet for auto-recalculation')
} else {
  console.error('✗ plannedDate IIFE pattern not found')
}

// Fix 6: updatePlanNumber — use holidaySet state
const OLD_UPD_DATE = `      byProcessDates[processCode] = getPlannedDateByNumber(planNum, new Date().toISOString().slice(0, 10), machine?.id)`
const NEW_UPD_DATE = `      byProcessDates[processCode] = getPlannedDateByNumber(planNum, new Date().toISOString().slice(0, 10), holidaySet)`

if (page.includes(OLD_UPD_DATE)) {
  page = page.replace(OLD_UPD_DATE, NEW_UPD_DATE)
  console.log('✓ updatePlanNumber uses holidaySet')
} else {
  console.error('✗ updatePlanNumber date pattern not found')
}

// Fix 7: handleCollaborationConfirm — use holidaySet
const OLD_CONF_DATE1 = `        byProcessDates[code] = getPlannedDateByNumber(num as number, baseDate, machine?.id)`
const NEW_CONF_DATE1 = `        byProcessDates[code] = getPlannedDateByNumber(num as number, baseDate, holidaySet)`

if (page.includes(OLD_CONF_DATE1)) {
  page = page.replace(OLD_CONF_DATE1, NEW_CONF_DATE1)
  console.log('✓ handleCollaborationConfirm byProcessDates uses holidaySet')
} else {
  console.error('✗ handleCollaborationConfirm byProcessDates pattern not found')
}

const OLD_CONF_DATE2 = `      const plannedDate = byProcessDates[primaryCode] || getPlannedDateByNumber(primaryPlan, baseDate, machine?.id)`
const NEW_CONF_DATE2 = `      const plannedDate = byProcessDates[primaryCode] || getPlannedDateByNumber(primaryPlan, baseDate, holidaySet)`

if (page.includes(OLD_CONF_DATE2)) {
  page = page.replace(OLD_CONF_DATE2, NEW_CONF_DATE2)
  console.log('✓ handleCollaborationConfirm plannedDate uses holidaySet')
} else {
  console.error('✗ handleCollaborationConfirm plannedDate pattern not found')
}

// Fix 8: updatePlanNumber primaryDate plannedDate
const OLD_PRIMARY = `    const plannedDate = primaryDate ? byProcessDates[primaryDate] : null`
const NEW_PRIMARY  = `    const plannedDate = primaryDate ? byProcessDates[primaryDate] : null
    // Note: plannedDate displayed on screen is recalculated live from holidaySet in loadData
    // This saved plannedDate is just for reference/backup`

if (page.includes(OLD_PRIMARY)) {
  page = page.replace(OLD_PRIMARY, NEW_PRIMARY)
  console.log('✓ Added note about live recalculation')
} else {
  console.error('✗ primary plannedDate pattern not found')
}

fs.writeFileSync(pagePath, page, 'utf8')
console.log('\n✓ All fixes applied. Holidays now loaded from Supabase and planned dates recalculate on every page load.')
