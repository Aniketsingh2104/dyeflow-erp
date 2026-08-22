/**
 * scripts/import-historical-data.js
 *
 * One-time import of the pre-DyeFlow Excel history (Order/Faulty/FOB sheets)
 * into the historical_batches / historical_faulty / historical_fob tables in
 * Supabase (see the migration create_historical_learning_tables).
 *
 * Runs entirely on YOUR machine — reads the .xlsx with the `xlsx` package
 * (already a project dependency) and writes to Supabase over your own
 * network connection via the REST API. Nothing routes through Claude; this
 * is why it's a script instead of Claude inserting rows one at a time.
 *
 * Usage:
 *   node scripts/import-historical-data.js "C:\path\to\Order_Details.xlsx"
 *
 * Safe to re-run: each run TRUNCATEs the three historical_* tables first
 * (they exist only to hold this import — nothing else writes to them), so
 * re-running with an updated Excel file just replaces the data cleanly.
 */

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

// ── Load .env.local manually (no dotenv dependency in this project) ─────────
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  const env = {}
  if (!fs.existsSync(envPath)) return env
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    env[key] = value
  }
  return env
}

const env = loadEnvLocal()
const SUPABASE_URL = env.SUPABASE_URL
const SUPABASE_KEY =
  env.SUPABASE_SECRET_KEY && !env.SUPABASE_SECRET_KEY.includes('YOUR_')
    ? env.SUPABASE_SECRET_KEY
    : env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_KEY in .env.local')
  process.exit(1)
}

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node scripts/import-historical-data.js "path\\to\\Order_Details.xlsx"')
  process.exit(1)
}
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

// ── Cleaning helpers (same logic verified against this exact file) ──────────

/** Handles the three date formats actually present in this workbook:
 *  MM/DD/YYYY (slash), DD-MM-YYYY (dash), YYYY-MM-DD (ISO). Rejects bare
 *  numbers (leftover live-formula values for still-pending FOB rows). */
function smartParseDate(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return null // leftover formula value, not a real date
  let s = String(v).trim()
  if (!s || s.toLowerCase() === 'nan') return null
  s = s.split(' ')[0] // drop time-of-day if present

  let m
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    const [, mo, d, y] = m // MM/DD/YYYY
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if ((m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/))) {
    const [, d, mo, y] = m // DD-MM-YYYY
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

function cleanStr(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s || s.toLowerCase() === 'nan') return null
  return s.length > 500 ? s.slice(0, 500) : s
}

function cleanNum(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function daysBetween(a, b) {
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86400000
  return Number.isFinite(d) ? Math.round(d) : null
}

// ── Supabase REST bulk insert ────────────────────────────────────────────────

async function truncateTable(table) {
  // No REST DELETE-all shortcut without a filter, so page-delete by a always-true filter.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=not.is.null`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=minimal',
    },
  })
  if (!res.ok && res.status !== 204) {
    console.warn(`  Warning: could not clear ${table} (${res.status}) — continuing anyway`)
  }
}

async function bulkInsert(table, rows, batchSize = 500) {
  let inserted = 0
  let failed = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(batch),
    })
    if (res.ok) {
      inserted += batch.length
    } else {
      failed += batch.length
      const text = await res.text().catch(() => '')
      console.warn(`  Batch ${i}-${i + batch.length} failed (${res.status}): ${text.slice(0, 300)}`)
    }
    process.stdout.write(`\r  ${table}: ${inserted + failed}/${rows.length} processed (${failed} failed)`)
  }
  process.stdout.write('\n')
  return { inserted, failed }
}

// ── Sheet → row transforms ───────────────────────────────────────────────────

function transformOrders(rows) {
  return rows.map((r) => ({
    order_number: cleanStr(r['Order Number']),
    batch_no: cleanStr(r['Batch No.']),
    article: cleanStr(r['Article']),
    colour: cleanStr(r['Colour']),
    qty_kg: cleanNum(r['Qty (Kg)']),
    process_route: cleanStr(r['Process Route']),
    full_process_route: cleanStr(r['Full Process Route']),
    dyeing_machine: cleanStr(r['DYG MCN']),
    scq_machine: cleanStr(r['SCQ MCN']),
    other_machine: cleanStr(r['RC/Wash /Add/Lev/FixMCN']),
    supervisor: cleanStr(r['Master Name']),
    current_stage: cleanStr(r['Current Stage']),
    order_date: smartParseDate(r['Time Stamp']),
  }))
}

function transformFaulty(rows) {
  return rows.map((r) => ({
    order_number: cleanStr(r['Order Number']),
    batch_no: cleanStr(r['Batch No.']),
    article: cleanStr(r['Article']),
    colour: cleanStr(r['Colour']),
    process_name: cleanStr(r['Process Name']),
    faulty_type: cleanStr(r['Type of faulty']),
    faulty_remark: cleanStr(r['Faulty Remark']) || cleanStr(r['Remark.']),
    fault_date: smartParseDate(r['Date']),
  }))
}

function transformFob(rows) {
  return rows.map((r) => {
    const sent = smartParseDate(r['Sent Timing'])
    const approved = smartParseDate(r['Approved Timing'])
    let dwell = null
    if (sent && approved) {
      const d = daysBetween(sent, approved)
      if (d !== null && d >= 0 && d <= 365) dwell = d
    }
    // 'Comments' is the primary reason field (mostly populated, but often just
    // a placeholder '-'); fall back to 'Faulty Remark' on this sheet, which is
    // sparse but genuinely descriptive when present.
    const comments = cleanStr(r['Comments'])
    const fobReason = comments && comments !== '-' ? comments : cleanStr(r['Faulty Remark'])
    return {
      order_number: cleanStr(r['Order Number']),
      batch_no: cleanStr(r['Batch No.']),
      article: cleanStr(r['Article']),
      colour: cleanStr(r['Colour']),
      process_name: cleanStr(r['Process Name']),
      sent_date: sent,
      approved_date: approved,
      dwell_days: dwell,
      fob_reason: fobReason,
    }
  })
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Reading ${filePath} ...`)
  const wb = XLSX.readFile(filePath)

  const orderRows = XLSX.utils.sheet_to_json(wb.Sheets['Order'] || {})
  const faultyRows = XLSX.utils.sheet_to_json(wb.Sheets['Faulty'] || {})
  const fobRows = XLSX.utils.sheet_to_json(wb.Sheets['FOB'] || {})

  console.log(`Found: ${orderRows.length} Order rows, ${faultyRows.length} Faulty rows, ${fobRows.length} FOB rows`)

  const batches = transformOrders(orderRows).filter((r) => r.order_number)
  const faulty = transformFaulty(faultyRows).filter((r) => r.order_number)
  const fob = transformFob(fobRows).filter((r) => r.order_number)

  console.log('\nClearing existing historical_* tables...')
  await truncateTable('historical_batches')
  await truncateTable('historical_faulty')
  await truncateTable('historical_fob')

  console.log('\nImporting historical_batches...')
  const b = await bulkInsert('historical_batches', batches)
  console.log('\nImporting historical_faulty...')
  const f = await bulkInsert('historical_faulty', faulty)
  console.log('\nImporting historical_fob...')
  const o = await bulkInsert('historical_fob', fob)

  console.log('\n── Summary ──────────────────────────────')
  console.log(`historical_batches: ${b.inserted} inserted, ${b.failed} failed`)
  console.log(`historical_faulty:  ${f.inserted} inserted, ${f.failed} failed`)
  console.log(`historical_fob:     ${o.inserted} inserted, ${o.failed} failed`)
}

main().catch((err) => {
  console.error('Import failed:', err)
  process.exit(1)
})
