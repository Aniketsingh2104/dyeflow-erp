const fs = require('fs')
const path = 'app/supervisor/[name]/page.tsx'
let c = fs.readFileSync(path, 'utf8')

const OLD = `                      <td style={cellStyle}>
                        {r.ro_status === 'In Repair' ? (
                          <div>
                            <span style={{ display:'block', fontSize:11, fontWeight:700,
                              padding:'3px 8px', borderRadius:4, background:'#DCFCE7',
                              color:'#166534', marginBottom:4 }}>
                              ✓ Assigned
                            </span>
                            <span style={{ fontSize:10, color:'#6B7280' }}>
                              {r.machine_name !== '-' ? r.machine_name : ''}
                            </span>
                          </div>
                        ) : (
                          <RouteAssignment
                            order={{ ...r, id:r.id, batch_id:r.id, repair_id:r.repair_id, isRepair:true }}
                            onUpdate={loadData}
                          />
                        )}
                      </td>`

const NEW = `                      <td style={cellStyle}>
                        <RouteAssignment
                          order={{
                            ...r,
                            id:                   r.id,
                            batch_id:             r.id,
                            repair_id:            r.repair_id,
                            isRepair:             true,
                            // If already assigned → treat as confirmed so Edit button shows
                            supervisor_confirmed: r.ro_status === 'In Repair',
                            supervisorConfirmed:  r.ro_status === 'In Repair',
                            // Pass current route and machine so confirmed view shows correctly
                            process_route:        r.process_route || [],
                            processRoute:         r.process_route || [],
                            machine_id:           r.machine_id    || null,
                            machineId:            r.machine_id    || null,
                          }}
                          onUpdate={loadData}
                        />
                      </td>`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(path, c, 'utf8')
  console.log('✓ Repair Queue ASSIGN column always shows RouteAssignment with edit capability')
} else {
  console.error('✗ Pattern not found')
}
