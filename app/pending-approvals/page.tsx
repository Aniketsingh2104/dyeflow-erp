'use client'

import { useEffect, useState, useCallback } from 'react'

const api = (path: string, body?: any) =>
  fetch(path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { cache: 'no-store' }
  ).then(r => r.json())

function genOrderNumber(existing: string[]): string {
  const year = new Date().getFullYear().toString().slice(2)
  const nums = existing.filter(n => n?.startsWith(`DYE${year}-`)).map(n => parseInt(n.split('-')[1]) || 0)
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `DYE${year}-${String(next).padStart(4, '0')}`
}

const fmtDate = (d?: string) => {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) }
  catch { return d }
}
const v = (x: any) => (x == null || x === '') ? '-' : String(x)

// col index → {label, orderField} — mirrors SHEET_ALL_KEYS positions 2-18
const COL_KEY_MAP: Record<number, { label: string; orderField: string; camelKey: string }> = {
  2:  { label: 'Party',           orderField: 'party',           camelKey: 'party'         },
  3:  { label: 'Sub Party',       orderField: 'sub_party',       camelKey: 'subParty'      },
  4:  { label: 'Sales Person',    orderField: 'sales_person',    camelKey: 'salesPerson'   },
  5:  { label: 'Article',         orderField: 'article',         camelKey: 'article'       },
  6:  { label: 'Blend',           orderField: 'blend',           camelKey: 'blend'         },
  7:  { label: 'Width',           orderField: 'width',           camelKey: 'width'         },
  8:  { label: 'GSM',             orderField: 'gsm',             camelKey: 'gsm'           },
  9:  { label: 'Color',           orderField: 'color',           camelKey: 'color'         },
  10: { label: 'Lab No.',         orderField: 'lab_no',          camelKey: 'labNo'         },
  11: { label: 'Lot No.',         orderField: 'lot_no',          camelKey: 'lotNo'         },
  12: { label: 'Challan No.',     orderField: 'challan_no',      camelKey: 'challanNo'     },
  13: { label: 'Qty (KG)',        orderField: 'qty_kg',          camelKey: 'qtyKg'         },
  14: { label: 'Qty (MTR)',       orderField: 'qty_mtr',         camelKey: 'qtyMtr'        },
  15: { label: 'No. of Taka',     orderField: 'no_of_taka',      camelKey: 'noOfTa'        },
  16: { label: 'Type of Finish',  orderField: 'type_of_finish',  camelKey: 'typeOfFinish'  },
  17: { label: 'Type of Packing', orderField: 'type_of_packing', camelKey: 'typeOfPacking' },
  18: { label: 'Remarks',         orderField: 'remarks',         camelKey: 'remarks'       },
}

const ORDER_COLS = Object.values(COL_KEY_MAP)

function buildDiff(row: any) {
  const history: Record<string, any> = row.editHistory || {}
  return Object.entries(history).map(([ci, oldVal]) => {
    const meta = COL_KEY_MAP[parseInt(ci)]
    if (!meta) return null
    return { ...meta, colIdx: parseInt(ci), oldVal: String(oldVal ?? ''), newVal: String(row[meta.camelKey] ?? '') }
  }).filter(Boolean) as Array<{ label: string; orderField: string; camelKey: string; colIdx: number; oldVal: string; newVal: string }>
}

interface SheetItem { sheet: any; row: any; rowIndex: number }

export default function PendingApprovalsPage() {
  const [tab,         setTab]         = useState<'new'|'edits'>('new')
  const [newItems,    setNewItems]    = useState<SheetItem[]>([])
  const [editItems,   setEditItems]   = useState<SheetItem[]>([])
  const [loading,     setLoading]     = useState(true)
  // Per-card saving state — key is row.id
  const [cardSaving,  setCardSaving]  = useState<Record<string, boolean>>({})
  const [selected,    setSelected]    = useState<Set<number>>(new Set())
  const [progress,    setProgress]    = useState<{done:number;total:number}|null>(null)
  const [rejectModal, setRejectModal] = useState<any>(null)
  const [rejectReason,setRejectReason]= useState('')
  const [filterSheet, setFilterSheet] = useState('all')
  const [toast,       setToast]       = useState('')

  const showToast = (msg: string, err=false) => { setToast(msg); setTimeout(()=>setToast(''), err?5000:3500) }
  const setSaving = (id: string, v: boolean) => setCardSaving(p => ({ ...p, [id]: v }))
  const isSaving  = (id: string) => !!cardSaving[id]
  const anySaving = Object.values(cardSaving).some(Boolean)

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setSelected(new Set())
    try {
      const sheetsRes = await api('/api/order-sheets')
      if (!sheetsRes.ok) return
      const pending: SheetItem[] = [], edits: SheetItem[] = []
      await Promise.all((sheetsRes.data || []).map(async (sheet: any) => {
        const [pRes, eRes] = await Promise.all([
          api(`/api/sheet-rows?sheet_id=${sheet.id}&approval_status=pending`),
          api(`/api/sheet-rows?sheet_id=${sheet.id}&approval_status=edit-request`),
        ])
        ;(pRes.data||[]).forEach((row:any)=>{ if(!row.isBatchRow) pending.push({sheet,row,rowIndex:row.rowIndex}) })
        ;(eRes.data||[]).forEach((row:any)=>{ if(!row.isBatchRow) edits.push({sheet,row,rowIndex:row.rowIndex}) })
      }))
      pending.sort((a,b)=>a.sheet.title.localeCompare(b.sheet.title)||a.rowIndex-b.rowIndex)
      edits.sort(  (a,b)=>a.sheet.title.localeCompare(b.sheet.title)||a.rowIndex-b.rowIndex)
      setNewItems(pending); setEditItems(edits)
    } finally { setLoading(false) }
  }, [])

  useEffect(()=>{ load() },[load])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const items     = tab==='new' ? newItems : editItems
  const filtered  = filterSheet==='all' ? items : items.filter(it=>it.sheet.title===filterSheet)
  const allSheets = [...new Set(items.map(it=>it.sheet.title))]
  const allSel    = filtered.length>0 && filtered.every(it=>selected.has(items.indexOf(it)))
  const someSel   = selected.size>0

  const toggleOne = (i:number) => setSelected(p=>{ const n=new Set(p); n.has(i)?n.delete(i):n.add(i); return n })
  const toggleAll = () => {
    if(allSel) setSelected(p=>{ const n=new Set(p); filtered.forEach(it=>n.delete(items.indexOf(it))); return n })
    else       setSelected(p=>{ const n=new Set(p); filtered.forEach(it=>n.add(items.indexOf(it)));    return n })
  }

  // BUG FIX: use item.sheet.id not row.sheet_id (which doesn't exist on client rows)
  const updateSheetRow = async (item: SheetItem, patch: Record<string,any>) => {
    const res = await api('/api/sheet-rows', {
      action:   'upsert_row',
      sheet_id: item.sheet.id,      // ← always from item.sheet, not row
      row:      { ...item.row, ...patch },
    })
    if (!res.ok) throw new Error(res.error || 'Save failed')
  }

  const buildOrderPayload = (row: any, orderNumber: string) => ({
    action: 'create', order_number: orderNumber, status: 'new', process_route: [],
    party:           row.party          || '',
    article:         row.article        || '',
    blend:           row.blend          || '',
    color:           row.color          || '',
    challan_no:      row.challanNo      || '',
    qty_kg:          parseFloat(row.qtyKg)  || 0,
    qty_mtr:         parseFloat(row.qtyMtr) || 0,
    no_of_taka:      parseInt(row.noOfTa)   || 0,
    width:           row.width          || '',
    gsm:             row.gsm            || '',
    lab_no:          row.labNo          || '',
    lot_no:          row.lotNo          || '',
    sub_party:       row.subParty       || '',
    sales_person:    row.salesPerson    || '',
    type_of_finish:  row.typeOfFinish   || '',
    type_of_packing: row.typeOfPacking  || '',
    delivery_date:   row.deliveryDate   || '',
    remarks:         row.remarks        || '',
  })

  // ── New Orders: approve selected ──────────────────────────────────────────
  const approveSelected = async () => {
    const toApprove = newItems.filter((_,i)=>selected.has(i))
    if (!toApprove.length) return
    if (!confirm(`Approve ${toApprove.length} row(s) and create orders?`)) return
    setSaving('__bulk__', true); setProgress({done:0,total:toApprove.length})
    try {
      const existRes  = await api('/api/orders?limit=2000')
      const existing  = (existRes.data||[]).map((o:any)=>o.order_number)
      let done=0; const errors:string[]=[]
      for (const item of toApprove) {
        const orderNumber = genOrderNumber([...existing]); existing.push(orderNumber)
        const result = await api('/api/orders', buildOrderPayload(item.row, orderNumber))
        if (!result.ok) { errors.push(`Row ${item.rowIndex+1}: ${result.error}`) }
        else {
          try { await updateSheetRow(item, { approvalStatus:'approved', orderNumber, submitForApproval:false, requestEdit:false, receivedAt:new Date().toISOString() }) }
          catch(e) { errors.push(`Row ${item.rowIndex+1}: sheet update failed`) }
        }
        done++; setProgress({done,total:toApprove.length})
      }
      showToast(errors.length ? `✓ ${toApprove.length-errors.length} approved · ${errors.length} failed` : `✓ ${toApprove.length} order(s) created`, !!errors.length)
      setSelected(new Set()); await load()
    } finally { setSaving('__bulk__',false); setProgress(null) }
  }

  // ── New Orders: approve single ─────────────────────────────────────────────
  const approveSingle = async (item: SheetItem) => {
    setSaving(item.row.id, true)
    try {
      const existRes    = await api('/api/orders?limit=2000')
      const orderNumber = genOrderNumber((existRes.data||[]).map((o:any)=>o.order_number))
      const result      = await api('/api/orders', buildOrderPayload(item.row, orderNumber))
      if (!result.ok) { alert('Error: '+result.error); return }
      await updateSheetRow(item, { approvalStatus:'approved', orderNumber, submitForApproval:false, requestEdit:false, receivedAt:new Date().toISOString() })
      showToast(`✓ Order ${orderNumber} created`)
      await load()
    } catch(e:any) { alert(e.message) }
    finally { setSaving(item.row.id, false) }
  }

  // ── New Orders: reject single ──────────────────────────────────────────────
  const rejectNew = async () => {
    if (!rejectReason.trim() || !rejectModal) return
    setSaving(rejectModal.row.id, true)
    try {
      await updateSheetRow(rejectModal, { approvalStatus:'rejected', submitForApproval:false, rejectionReason:rejectReason, receivedAt:new Date().toISOString() })
      setRejectModal(null); setRejectReason('')
      showToast('Row rejected.')
      await load()
    } catch(e:any) { alert(e.message) }
    finally { setSaving(rejectModal.row.id, false) }
  }

  // ── Edit Requests: accept ─────────────────────────────────────────────────
  // Sets approvalStatus → 'edit-accepted' (shows green in sheet)
  // Patches only changed fields on the existing orders record
  const acceptEdit = async (item: SheetItem) => {
    const diff = buildDiff(item.row)
    if (!diff.length) { alert('No changes found in edit history.'); return }
    if (!confirm(`Accept ${diff.length} change(s) to ${item.row.orderNumber}?`)) return
    setSaving(item.row.id, true)
    try {
      // Find the order by order_number
      const ordersRes = await api('/api/orders')
      const order = (ordersRes.data||[]).find((o:any)=>o.order_number===item.row.orderNumber)
      if (!order) { alert(`Order ${item.row.orderNumber} not found in orders table.`); return }

      // Patch only changed fields
      const patch: Record<string,any> = { action:'update', id:order.id }
      diff.forEach(ch => { patch[ch.orderField] = ch.newVal })
      const result = await api('/api/orders', patch)
      if (!result.ok) { alert('Error updating order: '+result.error); return }

      // BUG FIX: set 'edit-accepted' not 'approved' — shows green in sheet, not grey
      await updateSheetRow(item, {
        approvalStatus:    'edit-accepted',
        requestEdit:       false,
        submitForApproval: false,
        editHistory:       {},
        editRequestedOn:   '',
        receivedAt:        new Date().toISOString(),
      })

      showToast(`✓ ${item.row.orderNumber} updated — ${diff.length} field(s) accepted`)
      await load()  // removes from Edit Requests tab since status is now 'edit-accepted'
    } catch(e:any) { alert(e.message) }
    finally { setSaving(item.row.id, false) }
  }

  // ── Edit Requests: reject ─────────────────────────────────────────────────
  // Restores original values from editHistory, sets status back to 'approved'
  const rejectEdit = async (item: SheetItem, reason: string) => {
    setSaving(item.row.id, true)
    try {
      // Restore each original value from edit_history
      const restored: Record<string,any> = {}
      Object.entries(item.row.editHistory||{}).forEach(([ci, oldVal]) => {
        const meta = COL_KEY_MAP[parseInt(ci)]
        if (meta) restored[meta.camelKey] = oldVal
      })

      // BUG FIX: set back to 'approved' (not edit-accepted) — row locked, original values restored
      await updateSheetRow(item, {
        ...restored,
        approvalStatus:    'approved',
        requestEdit:       false,
        submitForApproval: false,
        editHistory:       {},
        editRequestedOn:   '',
        rejectionReason:   reason,
        receivedAt:        new Date().toISOString(),
      })

      setRejectModal(null); setRejectReason('')
      showToast(`Edit rejected — original values restored on ${item.row.orderNumber}`)
      await load()  // removes from Edit Requests tab
    } catch(e:any) { alert(e.message) }
    finally { setSaving(item.row.id, false) }
  }

  // ── Render: New Orders tab ────────────────────────────────────────────────
  const renderNewTab = () => (
    <>
      {someSel && (
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',marginBottom:12,background:'#EFF6FF',border:'2px solid #BFDBFE',borderRadius:10}}>
          <span style={{fontSize:13,fontWeight:700,color:'#1E40AF'}}>{selected.size} row{selected.size>1?'s':''} selected</span>
          <button onClick={()=>setSelected(new Set())} style={{fontSize:12,color:'#6B7280',background:'none',border:'none',cursor:'pointer',textDecoration:'underline',padding:0}}>Clear</button>
          <div style={{flex:1}}/>
          {progress && (
            <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
              <div style={{flex:1,height:6,background:'#DBEAFE',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',background:'#059669',borderRadius:3,width:`${Math.round((progress.done/progress.total)*100)}%`,transition:'width 0.2s'}}/>
              </div>
              <span style={{fontSize:12,color:'#065F46',fontWeight:600}}>{progress.done}/{progress.total}</span>
            </div>
          )}
          <button onClick={approveSelected} disabled={isSaving('__bulk__')}
            style={{padding:'8px 20px',fontSize:13,fontWeight:700,border:'none',borderRadius:8,background:isSaving('__bulk__')?'#9CA3AF':'#059669',color:'#fff',cursor:isSaving('__bulk__')?'not-allowed':'pointer'}}>
            {isSaving('__bulk__') ? `Creating… (${progress?.done||0}/${progress?.total||0})` : `✓ Approve ${selected.size} selected`}
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{textAlign:'center',padding:60}}>
          <div style={{fontSize:36,marginBottom:10}}>✅</div>
          <div style={{fontSize:15,fontWeight:600,color:'#059669'}}>No new orders pending.</div>
        </div>
      ) : (
        <div style={{background:'var(--bg-primary)',border:'1px solid var(--border-light)',borderRadius:12,overflow:'hidden'}}>
          <div style={{overflowX:'auto',maxHeight:'calc(100vh - 260px)',overflowY:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead style={{position:'sticky',top:0,zIndex:10,background:'var(--bg-secondary)'}}>
                <tr>
                  <th style={{...TH,width:40,textAlign:'center',position:'sticky',left:0,zIndex:12,background:'var(--bg-secondary)'}}>
                    <input type="checkbox" checked={allSel} ref={el=>{if(el)el.indeterminate=someSel&&!allSel}} onChange={toggleAll} style={{accentColor:'#185FA5'}}/>
                  </th>
                  <th style={{...TH,position:'sticky',left:40,zIndex:12,background:'var(--bg-secondary)'}}>SHEET</th>
                  <th style={TH}>ROW</th>
                  <th style={TH}>SUBMITTED</th>
                  {ORDER_COLS.map(c=><th key={c.camelKey} style={{...TH,minWidth:90}}>{c.label.toUpperCase()}</th>)}
                  <th style={{...TH,position:'sticky',right:0,zIndex:12,background:'var(--bg-secondary)',boxShadow:'-2px 0 6px rgba(0,0,0,.08)'}}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item=>{
                  const gi  = items.indexOf(item)
                  const sel = selected.has(gi)
                  const bg  = sel ? '#EFF6FF' : '#FFFBEB'
                  const sav = isSaving(item.row.id)
                  return (
                    <tr key={item.row.id} onClick={()=>toggleOne(gi)} style={{borderBottom:'1px solid var(--border-light)',background:bg,cursor:'pointer'}}>
                      <td style={{...TD,width:40,textAlign:'center',position:'sticky',left:0,zIndex:2,background:bg}} onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" checked={sel} onChange={()=>toggleOne(gi)} style={{accentColor:'#185FA5'}}/>
                      </td>
                      <td style={{...TD,position:'sticky',left:40,zIndex:2,background:bg,fontWeight:700,color:'var(--accent)',whiteSpace:'nowrap',boxShadow:'2px 0 4px rgba(0,0,0,.04)'}} onClick={e=>e.stopPropagation()}>{item.sheet.title}</td>
                      <td style={{...TD,textAlign:'center',color:'var(--text-tertiary)',fontWeight:600}}>{item.rowIndex+1}</td>
                      <td style={{...TD,fontSize:11,color:'var(--text-secondary)',whiteSpace:'nowrap'}}>{fmtDate(item.row.submittedOn)}</td>
                      {ORDER_COLS.map(c=>(
                        <td key={c.camelKey} style={{...TD,whiteSpace:'nowrap'}}>{v(item.row[c.camelKey])}</td>
                      ))}
                      <td style={{...TD,whiteSpace:'nowrap',position:'sticky',right:0,zIndex:2,background:bg,boxShadow:'-2px 0 6px rgba(0,0,0,.08)'}} onClick={e=>e.stopPropagation()}>
                        <button style={{...BTN_G,marginRight:5,opacity:sav?.5:1}} disabled={sav} onClick={()=>approveSingle(item)}>
                          {sav ? '…' : 'Approve'}
                        </button>
                        <button style={{...BTN_R,opacity:sav?.5:1}} disabled={sav} onClick={()=>{setRejectModal(item);setRejectReason('')}}>Reject</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{padding:'7px 14px',borderTop:'1px solid var(--border-light)',fontSize:11,color:'var(--text-tertiary)',display:'flex',justifyContent:'space-between'}}>
            <span>{filtered.length} pending{someSel?` · ${selected.size} selected`:''} · click row to select</span>
            <span>Approve → new order in Supabase</span>
          </div>
        </div>
      )}
    </>
  )

  // ── Render: Edit Requests tab ─────────────────────────────────────────────
  const renderEditsTab = () => (
    <>
      {filtered.length === 0 ? (
        <div style={{textAlign:'center',padding:60}}>
          <div style={{fontSize:36,marginBottom:10}}>✏️</div>
          <div style={{fontSize:15,fontWeight:600,color:'var(--text-secondary)'}}>No edit requests pending.</div>
          <div style={{fontSize:13,color:'var(--text-tertiary)',marginTop:6}}>All edit requests have been processed.</div>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {filtered.map((item,i)=>{
            const diff = buildDiff(item.row)
            const sav  = isSaving(item.row.id)
            return (
              <div key={item.row.id||i} style={{background:'var(--bg-primary)',border:'2px solid #FDE68A',borderRadius:12,overflow:'hidden',opacity:sav?.7:1,transition:'opacity 0.2s'}}>

                {/* Card header */}
                <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',background:'#FFFBEB',borderBottom:'1px solid #FDE68A',flexWrap:'wrap'}}>
                  <span style={{fontSize:11,fontWeight:700,padding:'2px 10px',borderRadius:20,background:'#FEF3C7',color:'#92400E'}}>✏️ Edit Request</span>
                  <span style={{fontWeight:700,fontSize:13}}>{item.sheet.title} · Row {item.rowIndex+1}</span>
                  <span style={{fontSize:12,color:'var(--text-secondary)'}}>
                    Order: <strong style={{color:'#185FA5'}}>{item.row.orderNumber||'—'}</strong>
                  </span>
                  <span style={{fontSize:11,color:'var(--text-tertiary)'}}>Submitted: {fmtDate(item.row.submittedOn)}</span>
                  <div style={{flex:1}}/>
                  {/* Per-card Accept / Reject — independent for each card */}
                  <button
                    style={{...BTN_G,fontSize:12,opacity:sav?.5:1,display:'flex',alignItems:'center',gap:5}}
                    disabled={sav}
                    onClick={()=>acceptEdit(item)}>
                    {sav ? '⏳ Saving…' : '✓ Accept Changes'}
                  </button>
                  <button
                    style={{...BTN_R,fontSize:12,opacity:sav?.5:1}}
                    disabled={sav}
                    onClick={()=>{setRejectModal({...item,isEdit:true});setRejectReason('')}}>
                    ✕ Reject Edit
                  </button>
                </div>

                {/* Diff table */}
                <div style={{padding:'12px 16px'}}>
                  {diff.length === 0 ? (
                    <div style={{fontSize:12,color:'var(--text-tertiary)',padding:'8px 0'}}>⚠ No tracked changes in edit history — party may have unticked Request Edit before submitting.</div>
                  ) : (
                    <table style={{borderCollapse:'collapse',width:'auto',minWidth:400,fontSize:12,marginBottom:10}}>
                      <thead>
                        <tr style={{background:'var(--bg-secondary)'}}>
                          <th style={{...TH,width:160,borderRadius:'6px 0 0 0'}}>FIELD</th>
                          <th style={{...TH,minWidth:140,color:'#991B1B'}}>ORIGINAL VALUE</th>
                          <th style={{...TH,width:40,textAlign:'center'}}></th>
                          <th style={{...TH,minWidth:140,color:'#065F46',borderRadius:'0 6px 0 0'}}>NEW VALUE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.map(ch=>(
                          <tr key={ch.colIdx} style={{borderBottom:'1px solid var(--border-light)'}}>
                            <td style={{...TD,fontWeight:700,color:'var(--text-primary)'}}>{ch.label}</td>
                            <td style={{...TD,background:'#FEE2E2',color:'#991B1B',fontFamily:'monospace',textDecoration:'line-through',fontSize:13}}>{ch.oldVal||'—'}</td>
                            <td style={{...TD,textAlign:'center',color:'var(--text-tertiary)',fontSize:18,padding:'4px 8px'}}>→</td>
                            <td style={{...TD,background:'#D1FAE5',color:'#065F46',fontFamily:'monospace',fontWeight:800,fontSize:13}}>{ch.newVal||'—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Unchanged fields summary */}
                  <div style={{fontSize:11,color:'var(--text-tertiary)',display:'flex',flexWrap:'wrap',gap:'3px 14px',paddingTop:4,borderTop:'1px solid var(--border-light)'}}>
                    <span style={{fontWeight:600,color:'var(--text-secondary)'}}>Unchanged:</span>
                    {ORDER_COLS.filter(c=>!diff.some(d=>d.label===c.label)).map(c=>(
                      <span key={c.camelKey}><strong>{c.label}:</strong> {v(item.row[c.camelKey])}</span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )

  return (
    <div className="content" style={{padding:'16px 20px'}}>

      {/* Toast */}
      {toast && (
        <div style={{position:'fixed',top:16,right:20,zIndex:9999,
          background:toast.includes('failed')||toast.includes('rejected')?'#FEE2E2':'#D1FAE5',
          border:`1px solid ${toast.includes('failed')||toast.includes('rejected')?'#FCA5A5':'#6EE7B7'}`,
          borderRadius:8,padding:'10px 18px',fontSize:13,fontWeight:600,
          color:toast.includes('failed')||toast.includes('rejected')?'#991B1B':'#065F46',
          boxShadow:'0 4px 12px rgba(0,0,0,.12)',maxWidth:360}}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{fontSize:20,fontWeight:800}}>Pending Approvals</div>
        <button className="small" onClick={load} disabled={loading}>{loading?'…':'↻ Refresh'}</button>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:0,marginBottom:16,background:'var(--bg-secondary)',borderRadius:10,padding:4,width:'fit-content'}}>
        {(['new','edits'] as const).map(t=>{
          const label = t==='new' ? '🆕 New Orders' : '✏️ Edit Requests'
          const count = t==='new' ? newItems.length : editItems.length
          const active = tab===t
          return (
            <button key={t} onClick={()=>{setTab(t);setSelected(new Set());setFilterSheet('all')}}
              style={{padding:'8px 20px',fontSize:13,fontWeight:700,border:'none',borderRadius:8,cursor:'pointer',
                background:active?'var(--bg-primary)':'transparent',
                color:active?'var(--text-primary)':'var(--text-tertiary)',
                boxShadow:active?'0 1px 4px rgba(0,0,0,.1)':'none',
                display:'flex',alignItems:'center',gap:8}}>
              {label}
              {count>0 && (
                <span style={{fontSize:11,fontWeight:800,padding:'1px 8px',borderRadius:20,
                  background:active?(t==='edits'?'#FEF3C7':'#D1FAE5'):'var(--bg-secondary)',
                  color:active?(t==='edits'?'#92400E':'#065F46'):'var(--text-tertiary)'}}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Sheet filter chips */}
      {allSheets.length>1 && (
        <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
          {['all',...allSheets].map(s=>(
            <button key={s} onClick={()=>{setFilterSheet(s);setSelected(new Set())}}
              style={{padding:'4px 12px',fontSize:12,fontWeight:600,
                border:`2px solid ${filterSheet===s?'#185FA5':'var(--border-light)'}`,
                borderRadius:20,background:filterSheet===s?'#185FA5':'var(--bg-primary)',
                color:filterSheet===s?'#fff':'var(--text-secondary)',cursor:'pointer'}}>
              {s==='all'?`All (${items.length})`:`${s} (${items.filter(it=>it.sheet.title===s).length})`}
            </button>
          ))}
        </div>
      )}

      {/* Only blank the whole tab on the true first load; approveSingle/
          approveSelected/rejectNew/acceptEdit/rejectEdit all call load() again
          afterward, which would otherwise wipe every card mid-action even
          though per-card isSaving() already shows a proper inline state. */}
      {loading && newItems.length === 0 && editItems.length === 0 ? (
        <div style={{textAlign:'center',padding:60,color:'var(--text-tertiary)'}}>Loading…</div>
      ) : tab==='new' ? renderNewTab() : renderEditsTab()}

      {/* Reject modal */}
      {rejectModal && (
        <div className="modal-overlay" onClick={()=>setRejectModal(null)}>
          <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{rejectModal.isEdit?'Reject Edit Request':'Reject Order Row'}</span>
              <button className="small" onClick={()=>setRejectModal(null)}>✕</button>
            </div>
            <div style={{background:'var(--bg-secondary)',borderRadius:8,padding:'10px 12px',marginBottom:14,fontSize:12}}>
              <div><strong>Sheet:</strong> {rejectModal.sheet.title} · Row {rejectModal.rowIndex+1}</div>
              {rejectModal.isEdit && <div style={{marginTop:4}}><strong>Order:</strong> {rejectModal.row.orderNumber}</div>}
              <div style={{marginTop:4}}>
                <strong>Party:</strong> {rejectModal.row.party} · <strong>Article:</strong> {rejectModal.row.article} · <strong>Color:</strong> {rejectModal.row.color}
              </div>
              {rejectModal.isEdit && (
                <div style={{marginTop:8,padding:'8px',background:'#FEF3C7',borderRadius:6,fontSize:11}}>
                  ⚠️ Rejecting will <strong>restore the original values</strong> and lock the row back to Approved.
                </div>
              )}
            </div>
            <div className="form-group" style={{marginBottom:14}}>
              <label>{rejectModal.isEdit?'Reason for rejecting edit *':'Rejection reason *'}</label>
              <textarea value={rejectReason} rows={4} autoFocus onChange={e=>setRejectReason(e.target.value)}
                placeholder={rejectModal.isEdit?'e.g. Width change not authorised by production':'Enter rejection reason…'}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button style={{background:'#DC2626',color:'#fff',border:'none',padding:'9px 18px',borderRadius:6,fontWeight:700,cursor:'pointer',flex:1}}
                disabled={!rejectReason.trim()||isSaving(rejectModal.row.id)}
                onClick={()=>rejectModal.isEdit ? rejectEdit(rejectModal,rejectReason) : rejectNew()}>
                {isSaving(rejectModal.row.id) ? 'Processing…' : rejectModal.isEdit ? 'Reject & Restore Original' : 'Reject Row'}
              </button>
              <button onClick={()=>setRejectModal(null)} style={{flex:1}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const TH: React.CSSProperties = {padding:'9px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'2px solid var(--border-light)',whiteSpace:'nowrap'}
const TD: React.CSSProperties = {padding:'9px 12px',fontSize:12,color:'var(--text-primary)'}
const BTN_G: React.CSSProperties = {padding:'5px 14px',fontSize:11,fontWeight:700,border:'none',borderRadius:6,background:'#059669',color:'#fff',cursor:'pointer'}
const BTN_R: React.CSSProperties = {padding:'5px 10px',fontSize:11,fontWeight:700,border:'1px solid #FCA5A5',borderRadius:6,background:'#FEF2F2',color:'#DC2626',cursor:'pointer'}
