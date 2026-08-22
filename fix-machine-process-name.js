// Run from C:\dyeflow-react: node fix-machine-process-name.js

const fs   = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// Fix processName — when batch is pending, show first step of route as "next process"
const old = `          return {
            // batch fields
            batchId:       b.batch_id,
            id:            b.id,
            kg:            b.kg,
            mtr:           b.mtr,
            taka:          b.taka,
            status:        b.status || 'pending',
            currentProcess,
            planNumber:    b.date_calc_plan?.planNumber || null,
            faulty:        b.is_faulty || false,
            orderId:       b.order_id,
            processRoute,
            // order fields
            orderNo:       o.order_number   || '-',
            timeStamp:     o.created_at     || '',
            party:         o.party          || '-',
            subParty:      o.sub_party      || '-',
            salesPerson:   o.sales_person   || '-',
            article:       o.article        || '-',
            color:         o.color          || '-',
            labNo:         o.lab_no         || '-',
            lotNo:         o.lot_no         || '-',
            challanNo:     o.challan_no     || '-',
            qtyMtr:        b.mtr            || o.qty_mtr    || '',
            noOfTaka:      b.taka           || o.no_of_taka || '',
            typeOfFinish:  o.type_of_finish  || '-',
            typeOfPacking: o.type_of_packing || '-',
            remarks:       o.remarks        || '',
            supervisor:    o.supervisors?.name || '-',
            processName:   procMap[currentProcess] || currentProcess,
            plannedDate:   '',
            shadeType,
            shadeMasterType: shadeType,
          }`

const fixed = `          // For pending batches with no current process, show first route step as "next"
          const displayProcess = currentProcess || processRoute[0] || ''
          const processName = displayProcess
            ? (procMap[displayProcess] || displayProcess)
            : '-'

          return {
            // batch fields
            batchId:       b.batch_id,
            id:            b.id,
            kg:            b.kg,
            mtr:           b.mtr,
            taka:          b.taka,
            status:        b.status || 'pending',
            currentProcess: displayProcess,
            planNumber:    b.date_calc_plan?.planNumber || null,
            faulty:        b.is_faulty || false,
            orderId:       b.order_id,
            processRoute,
            // order fields
            orderNo:       o.order_number   || '-',
            timeStamp:     o.created_at     || '',
            party:         o.party          || '-',
            subParty:      o.sub_party      || '-',
            salesPerson:   o.sales_person   || '-',
            article:       o.article        || '-',
            color:         o.color          || '-',
            labNo:         o.lab_no         || '-',
            lotNo:         o.lot_no         || '-',
            challanNo:     o.challan_no     || '-',
            qtyMtr:        b.mtr            || o.qty_mtr    || '',
            noOfTaka:      b.taka           || o.no_of_taka || '',
            typeOfFinish:  o.type_of_finish  || '-',
            typeOfPacking: o.type_of_packing || '-',
            remarks:       o.remarks        || '',
            supervisor:    o.supervisors?.name || '-',
            processName,
            plannedDate:   '',
            shadeType,
            shadeMasterType: shadeType,
          }`

if (content.includes(old)) {
  content = content.replace(old, fixed)
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('✓ processName now shows first route step for pending batches')
} else {
  console.error('✗ Pattern not found')
}
