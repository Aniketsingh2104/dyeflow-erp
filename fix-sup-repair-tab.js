const fs = require('fs')
const filePath = 'app/supervisor/[name]/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: Load ONLY repairing batches (pending assignment) for this supervisor
// Remove the faulty_records join — only use /api/repair-assign
const OLD_LOAD = `      // Repair batches — load from repair-assign API (has all enriched fields)
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

const NEW_LOAD = `      // Repair batches — ONLY batches from repairing_orders with status='pending'
      // These need supervisor to assign process route + machine
      const repairApiRes = await fetch('/api/repair-assign', { cache: 'no-store' })
        .then(r => r.json()).catch(() => ({ data: [] }))

      // All pending repair batches (not filtered by supervisor — supervisor picks any)
      const pendingRepairs: any[] = (repairApiRes.data || []).filter((b: any) =>
        b.status === 'repairing'
      )

      setFaultyBatches(pendingRepairs)
      setStats({ inbox, faulty: pendingRepairs.length })`

if (c.includes(OLD_LOAD)) {
  c = c.replace(OLD_LOAD, NEW_LOAD)
  console.log('✓ Faulty tab now shows only pending repair batches')
} else console.error('✗ Load pattern not found')

// Fix 2: Update stats label and tab button
c = c.replace(
  `<TabButton id="faulty" label="🔧 Faulty Batch" count={stats.faulty} />`,
  `<TabButton id="faulty" label="🔧 Repair Queue" count={stats.faulty} />`
)
c = c.replace(
  `<div style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>Faulty Batches for Repair</div>`,
  `<div style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>Repair Queue — Assign Process & Machine</div>`
)
c = c.replace(
  `{faultyBatches.length} faulty batches`,
  `{faultyBatches.length} batches awaiting assignment`
)
console.log('✓ Updated tab labels')

// Fix 3: Replace the table with the correct format showing repair fields + assign button
const OLD_TABLE = `          {faultyBatches.length === 0 ? (
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

const NEW_TABLE = `          {faultyBatches.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>
              ✓ No repair batches pending assignment.
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#FFF5F5' }}>
                  <tr>
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
                </tbody>
              </table>
            </div>
          )}`

if (c.includes(OLD_TABLE)) {
  c = c.replace(OLD_TABLE, NEW_TABLE)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Replaced table with correct repair queue format + RouteAssignment')
} else console.error('✗ Table pattern not found')
