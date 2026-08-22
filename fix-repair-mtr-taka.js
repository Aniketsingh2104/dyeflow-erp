const fs = require('fs')

// Fix faulty API — set batch mtr and taka to repair values on creation
let faulty = fs.readFileSync('app/api/faulty/route.ts', 'utf8')

const OLD_F = `      // Full reprocess — entire batch goes to repair, kg stays same
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:false, status:'repairing', current_process:null,
        kg: repairKg,  // set to exact repair kg
      })`

const NEW_F = `      // Full reprocess — entire batch goes to repair
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:false, status:'repairing', current_process:null,
        kg:   repairKg,
        mtr:  isPartial ? (parseFloat(reprocess_mtr)||0) : (currentBatch.mtr  || null),
        taka: isPartial ? (parseFloat(reprocess_taka)||0) : (currentBatch.taka || null),
      })`

if (faulty.includes(OLD_F)) {
  faulty = faulty.replace(OLD_F, NEW_F)
  fs.writeFileSync('app/api/faulty/route.ts', faulty, 'utf8')
  console.log('✓ Faulty API: batch mtr/taka set to repair values')
} else console.error('✗ Faulty pattern not found')

// Fix FOB API — same
let fob = fs.readFileSync('app/api/fob/route.ts', 'utf8')

const OLD_FOB = `    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id:batch_id }, {
        status:'repairing', current_process:null,
        kg: repairKg,  // set to exact repair kg
      })`

const NEW_FOB = `    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id:batch_id }, {
        status:'repairing', current_process:null,
        kg:   repairKg,
        mtr:  isPartial ? (parseFloat(reprocess_mtr)||0) : (currentBatch.mtr  || null),
        taka: isPartial ? (parseFloat(reprocess_taka)||0) : (currentBatch.taka || null),
      })`

if (fob.includes(OLD_FOB)) {
  fob = fob.replace(OLD_FOB, NEW_FOB)
  fs.writeFileSync('app/api/fob/route.ts', fob, 'utf8')
  console.log('✓ FOB API: batch mtr/taka set to repair values')
} else console.error('✗ FOB pattern not found')
