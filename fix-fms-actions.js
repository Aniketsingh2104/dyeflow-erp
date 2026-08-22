const fs = require('fs')
const filePath = 'app/fms/[process]/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: Load FOB records alongside batches to know which batches have FOB
const OLD_LOAD = `      const [batchRes, orderRes, dpRes] = await Promise.all([
        getBatches({ limit: 5000 }),  // fetch all batches, filter by current_process below
        getOrders({ limit: 1000 }),
        fetch('/api/date-plans', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])`

const NEW_LOAD = `      const [batchRes, orderRes, dpRes, fobRes] = await Promise.all([
        getBatches({ limit: 5000 }),
        getOrders({ limit: 1000 }),
        fetch('/api/date-plans', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/fob', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ])`

if (c.includes(OLD_LOAD)) {
  c = c.replace(OLD_LOAD, NEW_LOAD)
  console.log('✓ Added FOB records fetch to loadRows')
} else console.error('✗ Load pattern not found')

// Fix 2: Build FOB map after orderMap
const OLD_OMAP = `      const orderMap: Record<string, any> = {}
      for (const o of orders) orderMap[o.id] = o`

const NEW_OMAP = `      const orderMap: Record<string, any> = {}
      for (const o of orders) orderMap[o.id] = o

      // FOB map: batch UUID + process code → fob record (to know if batch has FOB here)
      const fobRecords: any[] = fobRes.data || []
      const fobMap: Record<string, any> = {}
      for (const f of fobRecords) {
        const key = \`\${f.batch_uuid || f.batch_id}__\${f.process_code}\`
        fobMap[key] = f
      }`

if (c.includes(OLD_OMAP)) {
  c = c.replace(OLD_OMAP, NEW_OMAP)
  console.log('✓ Added FOB map build')
} else console.error('✗ oMap pattern not found')

// Fix 3: Add hasFob, bpStatus, and actualDateTime to enriched row
const OLD_BP = `        // Actual date from batch_processes for THIS specific process
        const bp = (b.batch_processes || []).find((p: any) =>
          p.process_code?.toUpperCase() === processCode ||
          p.process_code === processCode
        )
        // Only mark as completed if this process step is done AND it's still the current process
        const actual = bp?.done_at ? bp.done_at.split('T')[0] : ''
        const delay  = delayMeta(planned, actual, now)
        // Timestamp = sent_at on batch (when it arrived at this process)
        const sentAt = b.sent_at || b.updated_at || b.created_at || ''`

const NEW_BP = `        // batch_processes entry for THIS process
        const bp = (b.batch_processes || []).find((p: any) =>
          p.process_code?.toUpperCase() === processCode ||
          p.process_code === processCode
        )
        const bpStatus = bp?.status || 'pending'  // 'pending' | 'done' | 'faulty'
        const actual   = bp?.done_at ? bp.done_at.split('T')[0] : ''
        const actualDateTime = bp?.done_at ? bp.done_at : ''  // full timestamp for display
        const delay    = delayMeta(planned, actual, now)
        // Check if FOB exists for this batch at this process
        const fobKey  = \`\${b.id}__\${processCode}\`
        const hasFob  = !!fobMap[fobKey]
        // Timestamp = sent_at on batch (when it arrived at this process)
        const sentAt  = b.sent_at || b.updated_at || b.created_at || ''`

if (c.includes(OLD_BP)) {
  c = c.replace(OLD_BP, NEW_BP)
  console.log('✓ Added bpStatus, hasFob, actualDateTime to enriched')
} else console.error('✗ BP pattern not found')

// Fix 4: Add hasFob, bpStatus, actualDateTime to return object
const OLD_RETURN = `          isCompleted:     bp?.status === 'done' || bp?.status === 'faulty',
          delayText:       delay.text,
          delayLate:       delay.late,
          isFaulty:        b.is_faulty,`

const NEW_RETURN = `          isCompleted:     bpStatus === 'done' || bpStatus === 'faulty',
          bpStatus,          // 'pending' | 'done' | 'faulty'
          hasFob,            // true if FOB record exists for this batch at this process
          actualDateTime,    // full timestamp of done_at for display
          delayText:         delay.text,
          delayLate:         delay.late,
          isFaulty:          b.is_faulty,`

if (c.includes(OLD_RETURN)) {
  c = c.replace(OLD_RETURN, NEW_RETURN)
  console.log('✓ Added hasFob, bpStatus, actualDateTime to row return')
} else console.error('✗ Return pattern not found')

// Fix 5: Actual date column — show full timestamp when Done/Faulty/FOB marked
const OLD_ACTUAL = `                        case 'actual_date':   return <td key={col.id} style={{ ...s, fontWeight: 700, color: row.actualDate ? 'var(--success)' : 'var(--text-tertiary)' }}>{fmtDate(row.actualDate)}</td>`

const NEW_ACTUAL = `                        case 'actual_date':   return (
                          <td key={col.id} style={{ ...s, fontWeight: 700,
                            color: row.actualDate
                              ? (row.bpStatus === 'faulty' ? 'var(--danger)'
                                : row.hasFob ? 'var(--purple)' : 'var(--success)')
                              : 'var(--text-tertiary)' }}>
                            {row.actualDateTime ? fmtDateTime(row.actualDateTime) : '-'}
                          </td>
                        )`

if (c.includes(OLD_ACTUAL)) {
  c = c.replace(OLD_ACTUAL, NEW_ACTUAL)
  console.log('✓ Actual date shows full timestamp with color (green=done, red=faulty, purple=fob)')
} else console.error('✗ Actual date pattern not found')

// Fix 6: Actions column — mutex buttons + Delete always works
const OLD_ACTIONS = `                        case 'actions': {
                          const done   = row.isCompleted
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
                          )
                        }`

const NEW_ACTIONS = `                        case 'actions': {
                          // Determine which action has been taken
                          const isDone   = row.bpStatus === 'done'
                          const isFaulty = row.bpStatus === 'faulty'
                          const hasFob   = row.hasFob
                          // One action taken = lock other two; Delete always works
                          const anyDone  = isDone || isFaulty || hasFob

                          const btnBase: React.CSSProperties = {
                            padding: '4px 10px', fontSize: 11, fontWeight: 600,
                            borderRadius: 4, cursor: 'pointer', border: 'none',
                          }
                          const disabledStyle: React.CSSProperties = {
                            opacity: 0.3, cursor: 'not-allowed', pointerEvents: 'none'
                          }

                          return (
                            <td key={col.id} style={{ ...s, overflow: 'visible' }}>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>

                                {/* DONE button */}
                                <button
                                  onClick={() => !anyDone && handleDone(row)}
                                  disabled={anyDone || saving}
                                  style={{
                                    ...btnBase,
                                    background: isDone ? '#DCFCE7' : anyDone ? '#F3F4F6' : '#16A34A',
                                    color:      isDone ? '#16A34A' : anyDone ? '#9CA3AF' : '#fff',
                                    border:     isDone ? '1px solid #16A34A' : '1px solid transparent',
                                    ...(anyDone && !isDone ? disabledStyle : {})
                                  }}>
                                  {isDone ? '✓ Done' : 'Done'}
                                </button>

                                {/* FAULTY button */}
                                <button
                                  onClick={() => !anyDone && (setFaultyModal(row), setFaultyReason(''))}
                                  disabled={anyDone || saving}
                                  style={{
                                    ...btnBase,
                                    background:   isFaulty ? '#FEE2E2' : 'transparent',
                                    color:        isFaulty ? '#DC2626' : anyDone ? '#9CA3AF' : '#DC2626',
                                    border:       \`1px solid \${isFaulty ? '#DC2626' : anyDone ? '#E5E7EB' : '#DC2626'}\`,
                                    ...(anyDone && !isFaulty ? disabledStyle : {})
                                  }}>
                                  {isFaulty ? '⚠ Faulty' : 'Faulty'}
                                </button>

                                {/* FOB button */}
                                <button
                                  onClick={() => !anyDone && (setFobModal(row), setFobType('dyeing'), setFobReason(''))}
                                  disabled={anyDone || saving}
                                  style={{
                                    ...btnBase,
                                    background: hasFob ? '#F3E8FF' : 'transparent',
                                    color:      hasFob ? '#7C3AED' : anyDone ? '#9CA3AF' : '#7C3AED',
                                    border:     \`1px solid \${hasFob ? '#7C3AED' : anyDone ? '#E5E7EB' : '#7C3AED'}\`,
                                    ...(anyDone && !hasFob ? disabledStyle : {})
                                  }}>
                                  {hasFob ? '✓ FOB' : '+ FOB'}
                                </button>

                                {/* DELETE — always enabled */}
                                <button
                                  onClick={() => handleRollback(row)}
                                  disabled={saving}
                                  style={{ ...btnBase, background:'transparent',
                                    color:'#DC2626', border:'1px solid #DC2626' }}
                                  title="Roll back to previous process">
                                  ↩ Delete
                                </button>

                              </div>
                            </td>
                          )
                        }`

if (c.includes(OLD_ACTIONS)) {
  c = c.replace(OLD_ACTIONS, NEW_ACTIONS)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Actions column: mutex buttons, actual date timestamp, Delete always works')
} else console.error('✗ Actions pattern not found')
