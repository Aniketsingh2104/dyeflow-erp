const fs = require('fs')

// ── Fix 1: FOB API create — update batch_processes when FOB is created ──────
let fob = fs.readFileSync('app/api/fob/route.ts', 'utf8')

const OLD_FOB_CREATE = `  // ── Create FOB ────────────────────────────────────────────────────────────
  if (action === 'create') {
    const { data, error } = await dbInsert('fob_records', {
      batch_id:     payload.batch_id,
      order_id:     payload.order_id,
      order_number: payload.order_number,
      party:        payload.party,
      fob_kg:       payload.fob_kg || 0,
      process_code: payload.process_code,
      fob_type:     payload.fob_type || 'dyeing',
      status:       'open',
      notes:        payload.notes || '',
    })
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })
    return NextResponse.json({ ok:true, data })
  }`

const NEW_FOB_CREATE = `  // ── Create FOB ────────────────────────────────────────────────────────────
  if (action === 'create') {
    const { data, error } = await dbInsert('fob_records', {
      batch_id:     payload.batch_id,
      order_id:     payload.order_id,
      order_number: payload.order_number,
      party:        payload.party,
      fob_kg:       payload.fob_kg || 0,
      process_code: payload.process_code,
      fob_type:     payload.fob_type || 'dyeing',
      status:       'open',
      notes:        payload.notes || '',
    })
    if (error) return NextResponse.json({ ok:false, error }, { status:500 })

    // Update batch_processes: mark this process as 'fob' so FMS page keeps showing batch
    // with FOB badge; batch stays visible on this process page
    const now = new Date().toISOString()
    await sb('/batch_processes', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'fob', done_at: now }),
      params: {
        batch_id:     \`eq.\${payload.batch_id}\`,
        process_code: \`eq.\${payload.process_code}\`,
      },
      headers: { 'Prefer': 'return=minimal' },
    })

    // Also save last_process on batch so FMS can show FOB badge even after current_process changes
    await dbUpdate('batches', { id: payload.batch_id }, {
      last_process: payload.process_code,
    })

    return NextResponse.json({ ok:true, data })
  }`

if (fob.includes(OLD_FOB_CREATE)) {
  fob = fob.replace(OLD_FOB_CREATE, NEW_FOB_CREATE)
  fs.writeFileSync('app/api/fob/route.ts', fob, 'utf8')
  console.log('✓ FOB create: updates batch_processes with status=fob + saves last_process')
} else console.error('✗ FOB create pattern not found')

// ── Fix 2: Batches API mark_faulty — also save last_process ─────────────────
let batches = fs.readFileSync('app/api/batches/route.ts', 'utf8')

const OLD_FAULTY = `      // 1. Update batch: faulty status + clear current_process so it leaves FMS page
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:       true,
        status:          'faulty',
        current_process: null,
      })`

const NEW_FAULTY = `      // 1. Update batch: faulty status + save last_process so FMS page keeps showing it
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:       true,
        status:          'faulty',
        current_process: null,
        last_process:    process_code,  // remember where it was faulty'd for FMS display
      })`

if (batches.includes(OLD_FAULTY)) {
  batches = batches.replace(OLD_FAULTY, NEW_FAULTY)
  fs.writeFileSync('app/api/batches/route.ts', batches, 'utf8')
  console.log('✓ Batches API mark_faulty: saves last_process on batch')
} else console.error('✗ Batches mark_faulty pattern not found')

// ── Fix 3: FMS page — update filter + show Done/Faulty/FOB badges ────────────
let fms = fs.readFileSync('app/fms/[process]/page.tsx', 'utf8')

// Update filter to also include batches where last_process = thisProcess (faulty/fob)
const OLD_FILTER = `      // Show batches that are currently AT this process (active)
      // OR have been processed here (batch_processes shows done for this code)
      const filtered = batches.filter(b => {
        // Active: currently at this process
        const isActive = b.current_process?.toUpperCase() === processCode ||
                         b.current_process === processCode
        // Done/faulty here: batch_processes has done or faulty entry for this process code
        const isDoneHere = (b.batch_processes || []).some((bp: any) =>
          (bp.process_code?.toUpperCase() === processCode || bp.process_code === processCode) &&
          (bp.status === 'done' || bp.status === 'faulty')
        )
        return isActive || isDoneHere
      })`

const NEW_FILTER = `      // Show batches:
      // 1. Active: currently at this process (current_process === thisProcess)
      // 2. Done here: batch_processes has done/faulty/fob entry for this process code
      // 3. Faulty/FOB here: last_process === thisProcess (batch left via faulty or FOB)
      const filtered = batches.filter(b => {
        const bpCode = (c: string) =>
          c?.toUpperCase() === processCode || c === processCode

        // Active at this process
        const isActive = bpCode(b.current_process)

        // Done/faulty/fob here — batch_processes entry for this code
        const isDoneHere = (b.batch_processes || []).some((bp: any) =>
          bpCode(bp.process_code) &&
          (bp.status === 'done' || bp.status === 'faulty' || bp.status === 'fob')
        )

        // Faulty or FOB from this process (last_process tracks where it was marked)
        const isLastHere = bpCode(b.last_process)

        return isActive || isDoneHere || isLastHere
      })`

if (fms.includes(OLD_FILTER)) {
  fms = fms.replace(OLD_FILTER, NEW_FILTER)
  console.log('✓ FMS filter: shows active + done + faulty/fob from this process')
} else console.error('✗ FMS filter pattern not found')

// Update enriched map to read FOB status from batch_processes too
const OLD_BP = `        const bpStatus = bp?.status || 'pending'  // 'pending' | 'done' | 'faulty'`
const NEW_BP  = `        const bpStatus = bp?.status || 'pending'  // 'pending' | 'done' | 'faulty' | 'fob'`

if (fms.includes(OLD_BP)) {
  fms = fms.replace(OLD_BP, NEW_BP)
  console.log('✓ FMS: bpStatus includes fob')
} else console.error('✗ FMS bpStatus pattern not found')

// Update hasFob logic — use batch_processes OR fobMap
const OLD_FOB_CHECK = `        // Check if FOB exists for this batch at this process
        const fobKey  = \`\${b.id}__\${processCode}\`
        const hasFob  = !!fobMap[fobKey]`

const NEW_FOB_CHECK = `        // Check if FOB exists for this batch at this process
        // Either via fob_records OR via batch_processes.status='fob'
        const fobKey  = \`\${b.id}__\${processCode}\`
        const hasFob  = !!fobMap[fobKey] || bpStatus === 'fob'`

if (fms.includes(OLD_FOB_CHECK)) {
  fms = fms.replace(OLD_FOB_CHECK, NEW_FOB_CHECK)
  console.log('✓ FMS: hasFob checks both fob_records and batch_processes.status=fob')
} else console.error('✗ FMS hasFob pattern not found')

// Update row background to show FOB badge too
const OLD_ROW_BG = `                    background: row.isFaulty    ? '#FEE2E2'
                              : row.isCompleted ? 'var(--success-light)'
                              : idx % 2 === 0  ? 'var(--bg-primary)' : 'var(--bg-secondary)',`

const NEW_ROW_BG = `                    background: row.bpStatus === 'fob'    ? '#F3E8FF'
                              : row.isFaulty                    ? '#FEE2E2'
                              : row.isCompleted                 ? 'var(--success-light)'
                              : idx % 2 === 0                  ? 'var(--bg-primary)' : 'var(--bg-secondary)',`

if (fms.includes(OLD_ROW_BG)) {
  fms = fms.replace(OLD_ROW_BG, NEW_ROW_BG)
  console.log('✓ FMS: FOB rows show purple background')
} else console.error('✗ FMS row background pattern not found')

fs.writeFileSync('app/fms/[process]/page.tsx', fms, 'utf8')

console.log('\n✓ All fixes written')
