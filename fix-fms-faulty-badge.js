const fs = require('fs')
const filePath = 'app/fms/[process]/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: Row background — faulty rows should show red background
// Currently: row.isFaulty check is there but let's make it more visible
const OLD_ROW_BG = `                    background: row.isCompleted ? 'var(--success-light)'
                              : row.isFaulty   ? 'var(--danger-light)'
                              : idx % 2 === 0  ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-light)',
                    opacity: row.isCompleted ? 0.85 : 1 }}`

const NEW_ROW_BG = `                    background: row.isFaulty    ? '#FEE2E2'
                              : row.isCompleted ? 'var(--success-light)'
                              : idx % 2 === 0  ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderBottom: row.isFaulty ? '1px solid #FCA5A5' : '1px solid var(--border-light)',
                    opacity: 1 }}`

if (c.includes(OLD_ROW_BG)) {
  c = c.replace(OLD_ROW_BG, NEW_ROW_BG)
  console.log('✓ Faulty rows show red background (priority over completed)')
} else console.error('✗ Row bg pattern not found')

// Fix 2: Actions column — show FAULTY badge prominently + disable other buttons
const OLD_ACTIONS = `                          const done   = row.isCompleted
                          const faulty = row.isFaulty
                          return (
                            <td key={col.id} style={{ ...s, overflow: 'visible' }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => !done && handleDone(row)} disabled={done || saving}
                                  style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                    border: 'none', borderRadius: 4, cursor: done ? 'default' : 'pointer',
                                    background: done ? 'var(--success-light)' : 'var(--success)',
                                    color: done ? 'var(--success)' : '#fff' }}>
                                  {done ? '✓ Done' : 'Done'}
                                </button>
                                <button onClick={() => { setFaultyModal(row); setFaultyReason('') }}
                                  disabled={done || saving}
                                  style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                    border: '1px solid var(--danger)', borderRadius: 4,
                                    cursor: done ? 'not-allowed' : 'pointer',
                                    background: faulty ? 'var(--danger-light)' : 'transparent',
                                    color: 'var(--danger)', opacity: done ? 0.4 : 1 }}>
                                  {faulty ? '⚠ Faulty' : 'Faulty'}
                                </button>
                                <button onClick={() => { setFobModal(row); setFobType('dyeing'); setFobReason('') }}
                                  disabled={done || saving}
                                  style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                    border: '1px solid var(--purple)', borderRadius: 4,
                                    cursor: done ? 'not-allowed' : 'pointer',
                                    background: 'transparent', color: 'var(--purple)', opacity: done ? 0.4 : 1 }}>
                                  + FOB
                                </button>
                                <button onClick={() => handleRollback(row)}
                                  disabled={saving}
                                  style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                    border: '1px solid #DC2626', borderRadius: 4,
                                    cursor: 'pointer', background: 'transparent',
                                    color: '#DC2626' }}
                                  title="Roll back to previous process">
                                  ↩ Delete
                                </button>
                              </div>
                            </td>
                          )`

const NEW_ACTIONS = `                          const done   = row.isCompleted
                          const faulty = row.isFaulty
                          return (
                            <td key={col.id} style={{ ...s, overflow: 'visible' }}>
                              {faulty ? (
                                // Faulty batch — show prominent badge + rollback only
                                <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                                  <span style={{ padding:'4px 10px', fontSize:11, fontWeight:700,
                                    background:'#DC2626', color:'white', borderRadius:4,
                                    display:'flex', alignItems:'center', gap:4 }}>
                                    ⚠ FAULTY
                                  </span>
                                  <button onClick={() => handleRollback(row)} disabled={saving}
                                    style={{ padding:'4px 8px', fontSize:11, fontWeight:600,
                                      border:'1px solid #DC2626', borderRadius:4,
                                      cursor:'pointer', background:'transparent', color:'#DC2626' }}
                                    title="Roll back — undo faulty">
                                    ↩ Undo
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button onClick={() => !done && handleDone(row)} disabled={done || saving}
                                    style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                      border: 'none', borderRadius: 4, cursor: done ? 'default' : 'pointer',
                                      background: done ? 'var(--success-light)' : 'var(--success)',
                                      color: done ? 'var(--success)' : '#fff' }}>
                                    {done ? '✓ Done' : 'Done'}
                                  </button>
                                  <button onClick={() => { setFaultyModal(row); setFaultyReason('') }}
                                    disabled={done || saving}
                                    style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                      border: '1px solid var(--danger)', borderRadius: 4,
                                      cursor: done ? 'not-allowed' : 'pointer',
                                      background: 'transparent', color: 'var(--danger)', opacity: done ? 0.4 : 1 }}>
                                    Faulty
                                  </button>
                                  <button onClick={() => { setFobModal(row); setFobType('dyeing'); setFobReason('') }}
                                    disabled={done || saving}
                                    style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                      border: '1px solid var(--purple)', borderRadius: 4,
                                      cursor: done ? 'not-allowed' : 'pointer',
                                      background: 'transparent', color: 'var(--purple)', opacity: done ? 0.4 : 1 }}>
                                    + FOB
                                  </button>
                                  <button onClick={() => handleRollback(row)} disabled={saving}
                                    style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                      border: '1px solid #DC2626', borderRadius: 4,
                                      cursor: 'pointer', background: 'transparent', color: '#DC2626' }}
                                    title="Roll back to previous process">
                                    ↩ Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          )`

if (c.includes(OLD_ACTIONS)) {
  c = c.replace(OLD_ACTIONS, NEW_ACTIONS)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Faulty rows show FAULTY badge with Undo button; normal rows unchanged')
} else console.error('✗ Actions pattern not found')
