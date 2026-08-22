const fs = require('fs')
const filePath = 'app/fms/[process]/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: Add all missing columns to DEFAULT_COLS
const OLD_COLS = `const DEFAULT_COLS = [
  { id: 'created_at',     label: 'TIMESTAMP',       visible: true,  width: 150, minWidth: 100 },
  { id: 'orderNo',        label: 'ORDER #',          visible: true,  width: 130, minWidth: 80  },
  { id: 'batch_id',       label: 'BATCH #',          visible: true,  width: 130, minWidth: 80  },
  { id: 'party',          label: 'PARTY',            visible: true,  width: 150, minWidth: 100 },
  { id: 'article',        label: 'ARTICLE',          visible: true,  width: 130, minWidth: 80  },
  { id: 'color',          label: 'COLOR',            visible: true,  width: 120, minWidth: 80  },
  { id: 'blend',          label: 'BLEND',            visible: true,  width: 100, minWidth: 70  },
  { id: 'qty_kg',         label: 'QTY (KG)',         visible: true,  width: 90,  minWidth: 60  },
  { id: 'supervisor',     label: 'SUPERVISOR',       visible: true,  width: 130, minWidth: 80  },
  { id: 'machine',        label: 'MACHINE',          visible: true,  width: 130, minWidth: 80  },
  { id: 'process_route',  label: 'PROCESS ROUTE',    visible: true,  width: 200, minWidth: 120 },
  { id: 'planned_date',   label: 'PLANNED DATE',     visible: true,  width: 120, minWidth: 80  },
  { id: 'actual_date',    label: 'ACTUAL DATE',      visible: true,  width: 120, minWidth: 80  },
  { id: 'actions',        label: 'ACTIONS',          visible: true,  width: 220, minWidth: 160 },
  { id: 'time_delay',     label: 'TIME DELAY',       visible: true,  width: 110, minWidth: 80  },
]`

const NEW_COLS = `const DEFAULT_COLS = [
  { id: 'created_at',       label: 'TIMESTAMP',       visible: true,  width: 150, minWidth: 100 },
  { id: 'orderNo',          label: 'ORDER #',          visible: true,  width: 130, minWidth: 80  },
  { id: 'batch_id',         label: 'BATCH #',          visible: true,  width: 130, minWidth: 80  },
  { id: 'party',            label: 'PARTY',            visible: true,  width: 150, minWidth: 100 },
  { id: 'sub_party',        label: 'SUB PARTY',        visible: false, width: 120, minWidth: 80  },
  { id: 'sales_person',     label: 'SALES PERSON',     visible: false, width: 130, minWidth: 80  },
  { id: 'article',          label: 'ARTICLE',          visible: true,  width: 130, minWidth: 80  },
  { id: 'blend',            label: 'BLEND',            visible: true,  width: 80,  minWidth: 60  },
  { id: 'width',            label: 'WIDTH',            visible: false, width: 70,  minWidth: 50  },
  { id: 'gsm',              label: 'GSM',              visible: true,  width: 70,  minWidth: 50  },
  { id: 'color',            label: 'COLOR',            visible: true,  width: 120, minWidth: 80  },
  { id: 'lab_no',           label: 'LAB NO.',          visible: true,  width: 100, minWidth: 70  },
  { id: 'lot_no',           label: 'LOT NO.',          visible: false, width: 100, minWidth: 70  },
  { id: 'challan_no',       label: 'CHALLAN NO.',      visible: true,  width: 110, minWidth: 80  },
  { id: 'qty_kg',           label: 'QTY (KG)',         visible: true,  width: 90,  minWidth: 60  },
  { id: 'qty_mtr',          label: 'QTY (MTR)',        visible: true,  width: 90,  minWidth: 60  },
  { id: 'no_of_taka',       label: 'TAKA',             visible: true,  width: 70,  minWidth: 50  },
  { id: 'type_of_finish',   label: 'FINISH',           visible: true,  width: 110, minWidth: 80  },
  { id: 'type_of_packing',  label: 'PACKING',          visible: true,  width: 100, minWidth: 70  },
  { id: 'remarks',          label: 'REMARKS',          visible: false, width: 150, minWidth: 80  },
  { id: 'supervisor',       label: 'SUPERVISOR',       visible: true,  width: 130, minWidth: 80  },
  { id: 'machine',          label: 'MACHINE',          visible: true,  width: 160, minWidth: 100 },
  { id: 'process_route',    label: 'PROCESS ROUTE',    visible: true,  width: 220, minWidth: 120 },
  { id: 'planned_date',     label: 'PLANNED DATE',     visible: true,  width: 120, minWidth: 80  },
  { id: 'actual_date',      label: 'ACTUAL DATE',      visible: true,  width: 120, minWidth: 80  },
  { id: 'delivery_date',    label: 'DELIVERY DATE',    visible: true,  width: 120, minWidth: 80  },
  { id: 'actions',          label: 'ACTIONS',          visible: true,  width: 220, minWidth: 160 },
  { id: 'time_delay',       label: 'TIME DELAY',       visible: true,  width: 110, minWidth: 80  },
]`

if (c.includes(OLD_COLS)) {
  c = c.replace(OLD_COLS, NEW_COLS)
  console.log('✓ Added all order fields to DEFAULT_COLS')
} else console.error('✗ COLS pattern not found')

// Fix 2: Add missing fields to enriched batch object in loadRows
const OLD_ENRICH = `        return {
          ...b,
          orderNo:      order.order_number || '-',
          party:        order.party        || '-',
          article:      order.article      || '-',
          color:        order.color        || '-',
          blend:        order.blend        || '',
          supervisorName: sup,
          machineName:    mach,
          routeStr:       route.join('/'),
          plannedDate:    planned,
          actualDate:     actual,
          isCompleted:    !!actual,
          delayText:      delay.text,
          delayLate:      delay.late,
          isFaulty:       b.is_faulty,
        }`

const NEW_ENRICH = `        return {
          ...b,
          orderNo:         order.order_number    || '-',
          party:           order.party           || '-',
          sub_party:       order.sub_party       || '-',
          sales_person:    order.sales_person    || '-',
          article:         order.article         || '-',
          color:           order.color           || '-',
          blend:           order.blend           || '-',
          width:           order.width           || '-',
          gsm:             order.gsm             || '-',
          lab_no:          order.lab_no          || '-',
          lot_no:          order.lot_no          || '-',
          challan_no:      order.challan_no      || '-',
          qty_mtr:         b.mtr || order.qty_mtr     || '-',
          no_of_taka:      b.taka || order.no_of_taka || '-',
          type_of_finish:  order.type_of_finish  || '-',
          type_of_packing: order.type_of_packing || '-',
          remarks:         order.remarks         || '-',
          supervisorName:  sup,
          machineName:     mach,
          routeStr:        route.join('/'),
          plannedDate:     planned,
          actualDate:      actual,
          delivery_date:   order.delivery_date   || '-',
          isCompleted:     !!actual,
          delayText:       delay.text,
          delayLate:       delay.late,
          isFaulty:        b.is_faulty,
        }`

if (c.includes(OLD_ENRICH)) {
  c = c.replace(OLD_ENRICH, NEW_ENRICH)
  console.log('✓ Added all order fields to enriched object')
} else console.error('✗ Enrich pattern not found')

// Fix 3: Add render cases for new columns in the switch statement
const OLD_MACHINE = `                        case 'machine':       return <td key={col.id} style={s}>{row.machineName}</td>`

const NEW_MACHINE = `                        case 'machine':       return <td key={col.id} style={s}>{row.machineName}</td>
                        case 'sub_party':     return <td key={col.id} style={s}>{row.sub_party}</td>
                        case 'sales_person':  return <td key={col.id} style={{ ...s, color:'var(--accent)' }}>{row.sales_person}</td>
                        case 'width':         return <td key={col.id} style={s}>{row.width}</td>
                        case 'gsm':           return <td key={col.id} style={{ ...s, fontWeight:700, color:'var(--accent)' }}>{row.gsm}</td>
                        case 'lab_no':        return <td key={col.id} style={{ ...s, fontSize:11, color:'var(--accent)' }}>{row.lab_no}</td>
                        case 'lot_no':        return <td key={col.id} style={{ ...s, fontSize:11 }}>{row.lot_no}</td>
                        case 'challan_no':    return <td key={col.id} style={{ ...s, fontSize:11, color:'var(--accent)' }}>{row.challan_no}</td>
                        case 'qty_mtr':       return <td key={col.id} style={{ ...s, fontWeight:600, color:'var(--accent)' }}>{row.qty_mtr}</td>
                        case 'no_of_taka':    return <td key={col.id} style={{ ...s, fontWeight:600, color:'var(--accent)' }}>{row.no_of_taka}</td>
                        case 'type_of_finish':  return <td key={col.id} style={s}>{row.type_of_finish}</td>
                        case 'type_of_packing': return <td key={col.id} style={{ ...s, color:'var(--accent)' }}>{row.type_of_packing}</td>
                        case 'remarks':       return <td key={col.id} style={{ ...s, fontSize:11, whiteSpace:'normal' }}>{row.remarks}</td>
                        case 'delivery_date': return <td key={col.id} style={{ ...s, fontWeight:700, color:'var(--warning)' }}>{row.delivery_date !== '-' ? fmtDate(row.delivery_date) : '-'}</td>`

if (c.includes(OLD_MACHINE)) {
  c = c.replace(OLD_MACHINE, NEW_MACHINE)
  console.log('✓ Added render cases for all new columns')
} else console.error('✗ machine case not found')

// Fix 4: Reset COL_KEY to force fresh columns (clear old cached version)
const OLD_KEY = `const COL_KEY = 'fms_col_settings_v2'`
const NEW_KEY = `const COL_KEY = 'fms_col_settings_v3'`

if (c.includes(OLD_KEY)) {
  c = c.replace(OLD_KEY, NEW_KEY)
  console.log('✓ Updated COL_KEY to v3 — forces fresh column defaults')
} else console.error('✗ COL_KEY not found')

fs.writeFileSync(filePath, c, 'utf8')
console.log('\n✓ All FMS page fields added')
