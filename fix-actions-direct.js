const fs = require('fs')
let c = fs.readFileSync('app/repairing-order/page.tsx', 'utf8')

// Replace ONLY the actions column buttons section
const OLD = `                        case 'actions': return (
                          <td key={col.key} style={{...s, overflow:'visible'}}>
                            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                              {/* Edit */}
                              <button className="xs"
                                onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'', repair_kg:r.repair_kg }) }}>
                                Edit
                              </button>
                              {/* Split */}
                              <button className="xs"
                                onClick={() => openSplitModal(r)}
                                disabled={saving}
                                style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                  border:'1px solid var(--accent)', borderRadius:4,
                                  cursor:'pointer', background:'transparent', color:'var(--accent)' }}>
                                ✂ Split
                              </button>
                              {/* Full Split */}
                              <button className="xs"
                                onClick={() => doFullSplit(r)}
                                disabled={saving}
                                style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                  border:'none', borderRadius:4, cursor:'pointer',
                                  background:'#7C3AED', color:'white' }}>
                                ⚡ Full
                              </button>
                              {/* Reassign */}
                              <button className="xs"
                                onClick={() => { setAssignModal(r); setChosenSup(r.supervisor||'') }}
                                disabled={saving}
                                style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                  border:'1px solid #D97706', borderRadius:4,
                                  cursor:'pointer', background:'#FFFBEB', color:'#92400E' }}>
                                👤 Reassign
                              </button>
                              {/* Delete / Rollback */}
                              <button className="xs"
                                onClick={() => handleDelete(r)}
                                disabled={saving}
                                style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                  border:'1px solid #DC2626', borderRadius:4,
                                  cursor:'pointer', background:'transparent', color:'#DC2626' }}
                                title={`Roll back to ${r.source_type === 'fob' ? 'FOB' : 'Faulty'} page`}>
                                ↩ Delete
                              </button>
                            </div>
                          </td>
                        )`

const NEW = `                        case 'actions': {
                          // r.status = repairing_orders.status
                          // 'pending' = not yet split → show Split/Full Split
                          // 'In Repair' or other = already split → show badge only
                          const isSplitDone = r.status !== 'pending'
                          return (
                            <td key={col.key} style={{...s, overflow:'visible'}}>
                              <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
                                {/* Edit — always */}
                                <button className="xs"
                                  onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'', repair_kg:r.repair_kg }) }}>
                                  Edit
                                </button>
                                {/* Split / Full Split — only when pending */}
                                {!isSplitDone ? (<>
                                  <button
                                    onClick={() => openSplitModal(r)}
                                    disabled={saving}
                                    style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                      border:'1px solid var(--accent)', borderRadius:4,
                                      cursor:'pointer', background:'transparent', color:'var(--accent)' }}>
                                    ✂ Split
                                  </button>
                                  <button
                                    onClick={() => doFullSplit(r)}
                                    disabled={saving}
                                    style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                      border:'none', borderRadius:4, cursor:'pointer',
                                      background:'#7C3AED', color:'white' }}>
                                    ⚡ Full
                                  </button>
                                </>) : (
                                  <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px',
                                    borderRadius:4, background:'#DCFCE7', color:'#166534' }}>
                                    ✓ Split Done
                                  </span>
                                )}
                                {/* Reassign — always */}
                                <button
                                  onClick={() => { setAssignModal(r); setChosenSup(r.supervisor||'') }}
                                  disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                    border:'1px solid #D97706', borderRadius:4,
                                    cursor:'pointer', background:'#FFFBEB', color:'#92400E' }}>
                                  👤 Reassign
                                </button>
                                {/* Delete — always */}
                                <button
                                  onClick={() => handleDelete(r)}
                                  disabled={saving}
                                  style={{ padding:'3px 8px', fontSize:11, fontWeight:600,
                                    border:'1px solid #DC2626', borderRadius:4,
                                    cursor:'pointer', background:'transparent', color:'#DC2626' }}
                                  title={'Roll back to ' + (r.source_type === 'fob' ? 'FOB' : 'Faulty') + ' page'}>
                                  ↩ Delete
                                </button>
                              </div>
                            </td>
                          )
                        }`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync('app/repairing-order/page.tsx', c, 'utf8')
  console.log('✓ Actions column updated - Split/Full Split only when status=pending')
} else {
  console.error('✗ Pattern not found')
  // Show what's around the actions case
  const i = c.indexOf("case 'actions'")
  console.log('Current actions:', c.substring(i, i + 200))
}
