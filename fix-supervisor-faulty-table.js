const fs = require('fs')
const filePath = 'app/supervisor/[name]/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: Update faultyBatches loading to get all enriched fields
// The current code filters by supervisor name but faulty_records don't have supervisor field
// Better: load repair batches from /api/repair-assign (which has all enriched fields)
const OLD_FAULTY_LOAD = `      // Faulty batches
      const faultyRes = await fetch('/api/faulty', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] }))
      const supervisorFaulty = (faultyRes.data || [])
        .filter((r: any) => r.supervisor === resolvedName || r.supervisor_id === resolvedId)
        .map((r: any) => ({
          ...r,
          processRoute: r.processRoute ? r.processRoute.split('/') : [],
          qtyKg: String(r.qtyKg || r.qty_kg || 0),
        }))

      setFaultyBatches(supervisorFaulty)
      setStats({ inbox, faulty: supervisorFaulty.length })`

const NEW_FAULTY_LOAD = `      // Repair batches — load from repair-assign API (has all enriched fields)
      // Show both repairing (pending assignment) and active repair batches for THIS supervisor
      const [faultyApiRes, repairApiRes] = await Promise.all([
        fetch('/api/faulty', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/repair-assign', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])

      // Faulty records for this supervisor (open/repairing)
      const faultyForSup = (faultyApiRes.data || []).filter((r: any) =>
        r.supervisor === resolvedName || r.supervisor_id === resolvedId
      )

      // Repair batches assigned to this supervisor
      const repairForSup = (repairApiRes.data || []).filter((b: any) =>
        b.supervisor_id === resolvedId || b.supervisor_name === resolvedName
      )

      // Combine: faulty records + repair batches (deduplicate by batch_id)
      const combined = [
        ...faultyForSup,
        ...repairForSup.filter((rb: any) =>
          !faultyForSup.some((f: any) => f.batch_uuid === rb.id || f.batch_id === rb.id)
        )
      ]

      setFaultyBatches(combined)
      setStats({ inbox, faulty: combined.length })`

if (c.includes(OLD_FAULTY_LOAD)) {
  c = c.replace(OLD_FAULTY_LOAD, NEW_FAULTY_LOAD)
  console.log('✓ Updated faulty data loading')
} else console.error('✗ Faulty load pattern not found')

// Fix 2: Replace the Faulty Batch table with full-field table matching Faulty page
const OLD_FAULTY_TABLE = `          {faultyBatches.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>No faulty batches assigned for repair.</div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F9FAFB' }}>
                  <tr>
                    {['REPAIR ID','BATCH #','ORDER #','PARTY','ARTICLE','QTY (KG)','ISSUE TYPE','ROUTE/MACHINE','STATUS','PRIORITY'].map(h => (
                      <th key={h} style={headerStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {faultyBatches.map((batch, idx) => (
                    <tr key={batch.id} style={{ background: idx % 2 === 0 ? 'white' : '#FAFAFA', borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#EF4444' }}>{batch.id}</td>
                      <td style={{ ...cellStyle, fontWeight: 600, color: '#3B82F6' }}>{batch.batchId}</td>
                      <td style={{ ...cellStyle, fontWeight: 600 }}>{batch.orderNo}</td>
                      <td style={cellStyle}>{batch.party}</td>
                      <td style={cellStyle}>{batch.article || '-'}</td>
                      <td style={{ ...cellStyle, fontWeight: 700 }}>{batch.qtyKg}</td>
                      <td style={{ ...cellStyle, color: '#7C3AED', fontWeight: 600 }}>{batch.issueType}</td>
                      <td style={cellStyle}><RouteAssignment order={batch} onUpdate={loadData} /></td>
                      <td style={cellStyle}>
                        <select value={batch.status} onChange={e => updateFaultyStatus(batch.id, e.target.value)}
                          style={{ width: '100%', padding: '4px 8px', fontSize: '11px', fontWeight: 600, border: 'none', borderRadius: '12px', cursor: 'pointer',
                            background: batch.status === 'Completed' ? '#D1FAE5' : batch.status === 'In Repair' ? '#DBEAFE' : batch.status === 'Rejected' ? '#FEE2E2' : '#FEF3C7',
                            color: batch.status === 'Completed' ? '#065F46' : batch.status === 'In Repair' ? '#1E40AF' : batch.status === 'Rejected' ? '#991B1B' : '#92400E' }}>
                          <option value="Pending">Pending</option>
                          <option value="In Repair">In Repair</option>
                          <option value="Completed">Completed</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                          background: batch.priority === 'Critical' ? '#FEE2E2' : batch.priority === 'High' ? '#FED7AA' : batch.priority === 'Medium' ? '#FEF3C7' : '#DBEAFE',
                          color: batch.priority === 'Critical' ? '#991B1B' : batch.priority === 'High' ? '#9A3412' : batch.priority === 'Medium' ? '#92400E' : '#1E40AF' }}>
                          {batch.priority}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}`

const NEW_FAULTY_TABLE = `          {faultyBatches.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>No faulty batches assigned for repair.</div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F9FAFB' }}>
                  <tr>
                    {[
                      ['TIMESTAMP',145],['ORDER #',120],['BATCH #',140],['PARTY',100],
                      ['SUB PARTY',100],['ARTICLE',90],['BLEND',70],['GSM',60],
                      ['COLOR',90],['LAB NO.',90],['CHALLAN NO.',100],
                      ['QTY (KG)',80],['QTY (MTR)',80],['TAKA',60],
                      ['FINISH',100],['PACKING',90],['SUPERVISOR',110],['MACHINE',140],
                      ['PROCESS',80],['FAULTY TYPE',110],['FAULTY KG',80],
                      ['SOURCE',80],['TYPE',80],['STATUS',90],['NOTES',160],
                    ].map(([h, w]) => (
                      <th key={h as string} style={{ ...headerStyle, width: w as number, minWidth: w as number }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {faultyBatches.map((r: any, idx: number) => {
                    const sc: any = {
                      open:      { bg: '#FEE2E2', color: '#991B1B' },
                      repairing: { bg: '#FEF3C7', color: '#92400E' },
                      resolved:  { bg: '#D1FAE5', color: '#065F46' },
                    }
                    const s = sc[r.status] || sc['open']
                    const fmtDt = (d: any) => { try { const dt = new Date(d); return dt.toLocaleDateString('en-GB') + ' ' + dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) } catch { return d || '-' } }
                    return (
                      <tr key={r.id || idx} style={{ background: idx%2===0?'white':'#FAFAFA', borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ ...cellStyle, fontSize: 11, color: '#9CA3AF', width: 145 }}>{fmtDt(r.sent_at || r.created_at)}</td>
                        <td style={{ ...cellStyle, fontWeight: 700, color: 'var(--accent)', width: 120 }}>{r.order_number || '-'}</td>
                        <td style={{ ...cellStyle, fontWeight: 700, color: '#DC2626', width: 140 }}>{r.batch_id_str || r.batch_id || '-'}</td>
                        <td style={{ ...cellStyle, color: 'var(--accent)', width: 100 }}>{r.party || '-'}</td>
                        <td style={{ ...cellStyle, width: 100 }}>{r.sub_party || '-'}</td>
                        <td style={{ ...cellStyle, fontWeight: 500, width: 90 }}>{r.article || '-'}</td>
                        <td style={{ ...cellStyle, color: '#D97706', width: 70 }}>{r.blend || '-'}</td>
                        <td style={{ ...cellStyle, fontWeight: 700, color: 'var(--accent)', width: 60 }}>{r.gsm || '-'}</td>
                        <td style={{ ...cellStyle, color: 'var(--accent)', width: 90 }}>{r.color || '-'}</td>
                        <td style={{ ...cellStyle, fontSize: 11, color: 'var(--accent)', width: 90 }}>{r.lab_no || '-'}</td>
                        <td style={{ ...cellStyle, fontSize: 11, color: 'var(--accent)', width: 100 }}>{r.challan_no || '-'}</td>
                        <td style={{ ...cellStyle, fontWeight: 700, color: 'var(--accent)', width: 80 }}>{(r.kg || r.faulty_kg || 0)} Kg</td>
                        <td style={{ ...cellStyle, fontWeight: 600, color: 'var(--accent)', width: 80 }}>{r.qty_mtr || '-'}</td>
                        <td style={{ ...cellStyle, fontWeight: 600, color: 'var(--accent)', width: 60 }}>{r.no_of_taka || '-'}</td>
                        <td style={{ ...cellStyle, width: 100 }}>{r.type_of_finish || '-'}</td>
                        <td style={{ ...cellStyle, color: 'var(--accent)', width: 90 }}>{r.type_of_packing || '-'}</td>
                        <td style={{ ...cellStyle, width: 110 }}>{r.supervisor || '-'}</td>
                        <td style={{ ...cellStyle, width: 140 }}>{r.machine || '-'}</td>
                        <td style={{ ...cellStyle, textAlign: 'center', width: 80 }}>
                          {r.process_code ? (
                            <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                              width:28, height:28, borderRadius:'50%', background:'var(--accent)',
                              color:'#fff', fontSize:11, fontWeight:700 }}>{r.process_code}</span>
                          ) : '-'}
                        </td>
                        <td style={{ ...cellStyle, color: '#DC2626', fontWeight: 600, width: 110 }}>{r.faulty_type || r.source_type || '-'}</td>
                        <td style={{ ...cellStyle, fontWeight: 700, color: '#DC2626', width: 80 }}>{(r.faulty_kg || r.repair_kg || 0)} Kg</td>
                        <td style={{ ...cellStyle, width: 80 }}>
                          <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:4,
                            background: r.source_type==='fob'?'#F3E8FF':'#FEE2E2',
                            color: r.source_type==='fob'?'#7C3AED':'#DC2626' }}>
                            {r.source_type || 'faulty'}
                          </span>
                        </td>
                        <td style={{ ...cellStyle, width: 80 }}>
                          <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:4,
                            background: r.reprocess_type==='partial'?'#FEF3C7':'#F3F4F6',
                            color: r.reprocess_type==='partial'?'#D97706':'#6B7280' }}>
                            {r.reprocess_type || 'full'}
                          </span>
                        </td>
                        <td style={{ ...cellStyle, width: 90 }}>
                          <span style={{ padding:'3px 8px', borderRadius:4, fontSize:11, fontWeight:600,
                            background: s.bg, color: s.color }}>
                            {r.status || 'open'}
                          </span>
                        </td>
                        <td style={{ ...cellStyle, fontSize: 11, width: 160, whiteSpace:'normal' }}>{r.notes || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}`

if (c.includes(OLD_FAULTY_TABLE)) {
  c = c.replace(OLD_FAULTY_TABLE, NEW_FAULTY_TABLE)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Replaced faulty table with full-field version')
} else console.error('✗ Faulty table pattern not found')
