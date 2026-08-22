const fs = require('fs')
const path = 'app/supervisor/[name]/page.tsx'
let c = fs.readFileSync(path, 'utf8')

const OLD = `                  <tr>
                    {['BATCH #','ORDER #','PARTY','COLOR','ARTICLE','BLEND','GSM',
                      'REPAIR KG','SOURCE','TYPE','NOTES','ASSIGN'].map(h => (
                      <th key={h} style={headerStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {faultyBatches.map((r: any, idx: number) => (
                    <tr key={r.id || idx} style={{ background: idx%2===0?'white':'#FFF5F5',
                      borderBottom: '1px solid #FEE2E2' }}>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#DC2626' }}>
                        {r.batch_id || '-'}
                      </td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#2563EB' }}>
                        {r.order_number || '-'}
                      </td>
                      <td style={cellStyle}>{r.party || '-'}</td>
                      <td style={{ ...cellStyle, color: '#2563EB' }}>{r.color || '-'}</td>
                      <td style={cellStyle}>{r.article || '-'}</td>
                      <td style={{ ...cellStyle, color: '#D97706' }}>{r.blend || '-'}</td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#2563EB' }}>{r.gsm || '-'}</td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#DC2626' }}>
                        {r.repair_kg || r.kg || 0} Kg
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:4,
                          background: r.source_type==='fob'?'#F3E8FF':'#FEE2E2',
                          color: r.source_type==='fob'?'#7C3AED':'#DC2626' }}>
                          {r.source_type || 'faulty'}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:4,
                          background: r.reprocess_type==='partial'?'#FEF3C7':'#F3F4F6',
                          color: r.reprocess_type==='partial'?'#D97706':'#6B7280' }}>
                          {r.reprocess_type || 'full'}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, fontSize: 11, maxWidth: 160 }}>
                        {r.repair_notes || '-'}
                      </td>
                      <td style={{ ...cellStyle }}>
                        <RouteAssignment
                          order={{
                            ...r,
                            id: r.id,
                            batch_id: r.id,
                            repair_id: r.repair_id,
                            isRepair: true,
                          }}
                          onUpdate={loadData}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>`

const NEW = `                  <tr>
                    {['BATCH #','ORDER #','PARTY','SUB PARTY','ARTICLE','BLEND','GSM',
                      'COLOR','LAB NO.','CHALLAN NO.','REPAIR KG','REPAIR MTR','TAKA',
                      'FINISH','PACKING','SOURCE','TYPE','NOTES','ASSIGN'].map(h => (
                      <th key={h} style={headerStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {faultyBatches.map((r: any, idx: number) => (
                    <tr key={r.id || idx} style={{ background: idx%2===0?'white':'#FFF5F5', borderBottom: '1px solid #FEE2E2' }}>
                      <td style={{ ...cellStyle, fontWeight:700, color:'#DC2626' }}>{r.batch_id||'-'}</td>
                      <td style={{ ...cellStyle, fontWeight:700, color:'#2563EB' }}>{r.order_number||'-'}</td>
                      <td style={{ ...cellStyle, color:'#2563EB', fontWeight:600 }}>{r.party||'-'}</td>
                      <td style={cellStyle}>{r.sub_party||'-'}</td>
                      <td style={{ ...cellStyle, fontWeight:500 }}>{r.article||'-'}</td>
                      <td style={{ ...cellStyle, color:'#D97706' }}>{r.blend||'-'}</td>
                      <td style={{ ...cellStyle, fontWeight:700, color:'#2563EB' }}>{r.gsm||'-'}</td>
                      <td style={{ ...cellStyle, color:'#2563EB' }}>{r.color||'-'}</td>
                      <td style={{ ...cellStyle, fontSize:11, color:'#2563EB' }}>{r.lab_no||'-'}</td>
                      <td style={{ ...cellStyle, fontSize:11, color:'#2563EB' }}>{r.challan_no||'-'}</td>
                      <td style={{ ...cellStyle, fontWeight:700, color:'#DC2626' }}>{r.repair_kg||r.kg||0} Kg</td>
                      <td style={{ ...cellStyle, fontWeight:600, color:'#2563EB' }}>{r.repair_mtr||r.qty_mtr||'-'}</td>
                      <td style={{ ...cellStyle, fontWeight:600, color:'#2563EB' }}>{r.repair_taka||r.no_of_taka||'-'}</td>
                      <td style={cellStyle}>{r.type_of_finish||'-'}</td>
                      <td style={{ ...cellStyle, color:'#2563EB' }}>{r.type_of_packing||'-'}</td>
                      <td style={cellStyle}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:4,
                          background:r.source_type==='fob'?'#F3E8FF':'#FEE2E2',
                          color:r.source_type==='fob'?'#7C3AED':'#DC2626' }}>
                          {r.source_type||'faulty'}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:4,
                          background:r.reprocess_type==='partial'?'#FEF3C7':'#F3F4F6',
                          color:r.reprocess_type==='partial'?'#D97706':'#6B7280' }}>
                          {r.reprocess_type||'full'}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, fontSize:11 }}>{r.repair_notes||'-'}</td>
                      <td style={cellStyle}>
                        <RouteAssignment
                          order={{ ...r, id:r.id, batch_id:r.id, repair_id:r.repair_id, isRepair:true }}
                          onUpdate={loadData}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(path, c, 'utf8')
  console.log('✓ All fields added to Repair Queue table')
} else {
  console.error('✗ Pattern not found')
}
