const fs = require('fs')

// Fix 1: Splitted Orders page — include machine from batch join
let splitted = fs.readFileSync('app/splitted-orders/page.tsx', 'utf8')

// The batches API needs to return machines join
// Current batch fetch: '/api/batches?limit=5000' — check if it returns machines
// Fix: map machine_name from batch directly
const OLD_MAP = `      setRows(splitBatches.map(b => {
        const o = oMap[b.order_id] || {}
        return {
          ...b,
          order_number:    o.order_number     || '-',
          party:           o.party            || '-',
          sub_party:       o.sub_party        || '-',
          sales_person:    o.sales_person     || '-',
          article:         o.article          || '-',
          color:           o.color            || '-',
          blend:           o.blend            || '-',
          width:           o.width            || '-',
          gsm:             o.gsm              || '-',
          lab_no:          o.lab_no           || '-',
          lot_no:          o.lot_no           || '-',
          challan_no:      o.challan_no       || '-',
          type_of_finish:  o.type_of_finish   || '-',
          type_of_packing: o.type_of_packing  || '-',
          order_qty_kg:    o.qty_kg           || '-',
          supervisor:      o.supervisors?.name || '-',
          process_route:   (b.process_route?.length ? b.process_route : o.process_route) || [],
          machine_name:    b.machines?.name   || '-',
        }
      }))`

const NEW_MAP = `      setRows(splitBatches.map(b => {
        const o = oMap[b.order_id] || {}
        return {
          ...b,
          order_number:    o.order_number     || '-',
          party:           o.party            || '-',
          sub_party:       o.sub_party        || '-',
          sales_person:    o.sales_person     || '-',
          article:         o.article          || '-',
          color:           o.color            || '-',
          blend:           o.blend            || '-',
          width:           o.width            || '-',
          gsm:             o.gsm              || '-',
          lab_no:          o.lab_no           || '-',
          lot_no:          o.lot_no           || '-',
          challan_no:      o.challan_no       || '-',
          type_of_finish:  o.type_of_finish   || '-',
          type_of_packing: o.type_of_packing  || '-',
          order_qty_kg:    o.qty_kg           || '-',
          supervisor:      o.supervisors?.name || b.supervisors?.name || '-',
          process_route:   (b.process_route?.length ? b.process_route : o.process_route) || [],
          // Machine: prefer batch machine (set by supervisor for repair) over order machine
          machine_name:    b.machines?.name || o.machines?.name || '-',
        }
      }))`

if (splitted.includes(OLD_MAP)) {
  splitted = splitted.replace(OLD_MAP, NEW_MAP)
  console.log('✓ Splitted Orders: machine from batch machine takes priority')
} else console.error('✗ Map pattern not found')

fs.writeFileSync('app/splitted-orders/page.tsx', splitted, 'utf8')

// Fix 2: /api/batches GET — ensure machines join is included
let batchesApi = fs.readFileSync('app/api/batches/route.ts', 'utf8')
const hasMachines = batchesApi.includes('machines(id,name)')
console.log('Batches API includes machines join:', hasMachines)

// Fix 3: faulty and fob reprocess APIs — set batch kg = repair_kg not original kg
// When creating repair batch, kg should = repairKg not totalKg
const faultyPath = 'app/api/faulty/route.ts'
let faulty = fs.readFileSync(faultyPath, 'utf8')

// In partial reprocess, batch.kg should be repairKg (amount going to repair)
// Current code sets batch to repairing with original kg — fix
const OLD_FAULTY_BATCH_FULL = `    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:false, status:'repairing', current_process:null,
      })`

const NEW_FAULTY_BATCH_FULL = `    if (!isPartial || remainKg <= 0) {
      // Full reprocess — entire batch goes to repair, kg stays same
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:false, status:'repairing', current_process:null,
        kg: repairKg,  // set to exact repair kg
      })`

if (faulty.includes(OLD_FAULTY_BATCH_FULL)) {
  faulty = faulty.replace(OLD_FAULTY_BATCH_FULL, NEW_FAULTY_BATCH_FULL)
  fs.writeFileSync(faultyPath, faulty, 'utf8')
  console.log('✓ Faulty reprocess: batch kg set to repairKg')
} else console.error('✗ Faulty batch full pattern not found')

// Same fix for FOB
const fobPath = 'app/api/fob/route.ts'
let fob = fs.readFileSync(fobPath, 'utf8')

const OLD_FOB_BATCH_FULL = `    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id:batch_id }, {
        status:'repairing', current_process:null,
      })`

const NEW_FOB_BATCH_FULL = `    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id:batch_id }, {
        status:'repairing', current_process:null,
        kg: repairKg,  // set to exact repair kg
      })`

if (fob.includes(OLD_FOB_BATCH_FULL)) {
  fob = fob.replace(OLD_FOB_BATCH_FULL, NEW_FOB_BATCH_FULL)
  fs.writeFileSync(fobPath, fob, 'utf8')
  console.log('✓ FOB reprocess: batch kg set to repairKg')
} else console.error('✗ FOB batch full pattern not found')

console.log('\n✓ All done')
