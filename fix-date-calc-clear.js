const fs = require('fs')

// Fix 1: /api/date-plans GET — include d_* fixed columns in select so loadData can read them
const apiPath = 'app/api/date-plans/route.ts'
let api = fs.readFileSync(apiPath, 'utf8')

const OLD_SELECT = `    const { data, error } = await dbSelect('batch_date_plans', query,
      'id,batch_id,batch_id_str,dates,anchors,dc_generated_once,dc_regenerate,pushed,created_at,updated_at')`

const NEW_SELECT = `    const { data, error } = await dbSelect('batch_date_plans', query,
      'id,batch_id,batch_id_str,dates,anchors,' +
      'd_c,d_s,d_h,d_d,d_s2,d_rx,d_o,d_g,d_f,d_co,d_tu,d_add,d_level,d_rc,d_fix,d_wash,d_dry,d_b,d_r,d_k,d_qa,d_packing,d_dispatch,d_finaldispatch,' +
      'dc_generated_once,dc_regenerate,pushed,created_at,updated_at')`

if (api.includes(OLD_SELECT)) {
  api = api.replace(OLD_SELECT, NEW_SELECT)
  console.log('✓ date-plans GET now includes d_* fixed columns')
} else console.error('✗ GET select pattern not found')

// Fix 2: clear action — also wipe all fixed d_* columns
const OLD_CLEAR = `    // ── Clear: wipe dates but keep anchors ────────────────────────────────────
    if (action === 'clear') {
      const { batch_id } = body
      const row = {
        batch_id,
        dates:             {},
        dc_generated_once: false,
        dc_regenerate:     false,
        pushed:            false,
        updated_at:        new Date().toISOString(),
      }
      const { data, error } = await dbUpsert('batch_date_plans', row, 'batch_id')
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true, data })
    }`

const NEW_CLEAR = `    // ── Clear: wipe dates JSONB AND all fixed d_* columns, keep anchors ────────
    if (action === 'clear') {
      const { batch_id } = body
      const row: Record<string, any> = {
        batch_id,
        dates:             {},
        dc_generated_once: false,
        dc_regenerate:     false,
        pushed:            false,
        updated_at:        new Date().toISOString(),
        // Also clear all fixed d_* columns (legacy)
        d_c: null, d_s: null, d_h: null, d_d: null, d_s2: null,
        d_rx: null, d_o: null, d_g: null, d_f: null, d_co: null,
        d_tu: null, d_add: null, d_level: null, d_rc: null, d_fix: null,
        d_wash: null, d_dry: null, d_b: null, d_r: null, d_k: null,
        d_qa: null, d_packing: null, d_dispatch: null, d_finaldispatch: null,
      }
      const { data, error } = await dbUpsert('batch_date_plans', row, 'batch_id')
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true, data })
    }`

if (api.includes(OLD_CLEAR)) {
  api = api.replace(OLD_CLEAR, NEW_CLEAR)
  console.log('✓ clear action now also wipes fixed d_* columns')
} else console.error('✗ clear pattern not found')

fs.writeFileSync(apiPath, api, 'utf8')

// Fix 3: Date Calculator loadData — merge d_* fixed columns into dates if dates JSONB is empty
const pagePath = 'app/date-calculator/page.tsx'
let page = fs.readFileSync(pagePath, 'utf8')

const OLD_DATES = `        // Dates and anchors stored as JSONB in batch_date_plans
        const dates:   Record<string,string> = dp.dates   || {}
        const anchors: Record<string,string> = dp.anchors || {}`

const NEW_DATES = `        // Dates from JSONB column (new) — merge with legacy d_* fixed columns
        const datesJSONB: Record<string,string> = dp.dates || {}
        // Legacy fixed column map for migration
        const LEGACY_MAP: Record<string,string> = {
          C:'d_c',S:'d_s',H:'d_h',D:'d_d',S2:'d_s2',Rx:'d_rx',O:'d_o',
          G:'d_g',F:'d_f',Co:'d_co',Tu:'d_tu',Add:'d_add',Level:'d_level',
          Rc:'d_rc',Fix:'d_fix',Wash:'d_wash',Dry:'d_dry',B:'d_b',R:'d_r',
          K:'d_k',QA:'d_qa',Packing:'d_packing',Dispatch:'d_dispatch',FinalDispatch:'d_finaldispatch'
        }
        const dates: Record<string,string> = { ...datesJSONB }
        // Fill from legacy d_* columns only where JSONB is empty
        for (const [proc, col] of Object.entries(LEGACY_MAP)) {
          if (!dates[proc] && dp[col]) dates[proc] = dp[col].slice(0,10)
        }
        const anchors: Record<string,string> = dp.anchors || {}`

if (page.includes(OLD_DATES)) {
  page = page.replace(OLD_DATES, NEW_DATES)
  fs.writeFileSync(pagePath, page, 'utf8')
  console.log('✓ loadData merges JSONB dates with legacy d_* columns')
} else console.error('✗ loadData dates pattern not found')

console.log('\n✓ All fixes done')
