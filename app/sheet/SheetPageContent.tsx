'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  SHEET_COL_HEADERS, SHEET_COL_WIDTH_DEFAULTS,
  toExcelColLabel, createBlankRow, getCellValue, setCellValueInRow,
  getRowClass, isReadonlyColumn, isCheckboxColumn, isRowLocked
} from './utils'

interface CellRange { startRow: number; startCol: number; endRow: number; endCol: number }

export default function SheetPageContent() {
  const searchParams = useSearchParams()
  const sheetId = searchParams.get('id')

  const [sheet,           setSheet]           = useState<any>(null)
  const [rows,            setRows]            = useState<any[]>([])
  const [columnWidths,    setColumnWidths]    = useState<number[]>(SHEET_COL_WIDTH_DEFAULTS)
  const [resizingColumn,  setResizingColumn]  = useState<number|null>(null)
  const [resizeStartX,    setResizeStartX]    = useState(0)
  const [resizeStartWidth,setResizeStartWidth]= useState(0)
  const [selectedCell,    setSelectedCell]    = useState<{row:number;col:number}|null>(null)
  const [selectedRange,   setSelectedRange]   = useState<CellRange|null>(null)
  const [anchorCell,      setAnchorCell]      = useState<{row:number;col:number}|null>(null)
  const [editingCell,     setEditingCell]     = useState<{row:number;col:number}|null>(null)
  const [editValue,       setEditValue]       = useState('')
  const [saveStatus,      setSaveStatus]      = useState('Saved')
  const [undoStack,       setUndoStack]       = useState<any[]>([])
  const [redoStack,       setRedoStack]       = useState<any[]>([])
  const [copiedData,      setCopiedData]      = useState<any[][]>([])
  const [showFind,        setShowFind]        = useState(false)
  const [findText,        setFindText]        = useState('')
  const [isSelecting,     setIsSelecting]     = useState(false)
  const [selectionStart,  setSelectionStart]  = useState<{row:number;col:number}|null>(null)
  const [notFound,        setNotFound]        = useState(false)

  const inputRef     = useRef<HTMLInputElement>(null)
  const tbodyRef     = useRef<HTMLTableSectionElement>(null)
  const saveTimerRef = useRef<Record<number, NodeJS.Timeout>>({})
  const gridRef      = useRef<HTMLDivElement>(null)

  // ── Load from order_sheet_rows table ─────────────────────────────────────
  useEffect(() => {
    if (!sheetId) { setNotFound(true); return }
    const load = async () => {
      try {
        const [sheetRes, rowsRes] = await Promise.all([
          fetch(`/api/order-sheets?id=${sheetId}`, { cache: 'no-store' }).then(r => r.json()),
          fetch(`/api/sheet-rows?sheet_id=${sheetId}`, { cache: 'no-store' }).then(r => r.json()),
        ])
        if (!sheetRes.ok || !sheetRes.data) { setNotFound(true); return }

        const sessionRaw = localStorage.getItem('dyeflow_session')
        const session    = sessionRaw ? JSON.parse(sessionRaw) : null
        const isAdmin    = !session || session.role === 'admin' || !session.permissions
        const allowed    = session?.permissions?.allowedSheets || []
        if (!isAdmin && !allowed.includes(sheetId)) { setSheet({ __accessDenied: true }); return }

        setSheet(sheetRes.data)
        let clientRows: any[] = rowsRes.ok ? (rowsRes.data || []) : []

        // Auto-migrate legacy blob if new table empty
        if (clientRows.length === 0 && sheetRes.data.rows?.length) {
          clientRows = sheetRes.data.rows.map((r: any, i: number) => ({ ...r, rowIndex: i, id: undefined }))
          await fetch('/api/sheet-rows', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'bulk_upsert', sheet_id: sheetId, rows: clientRows }),
          })
          const fresh = await fetch(`/api/sheet-rows?sheet_id=${sheetId}`, { cache: 'no-store' }).then(r => r.json())
          clientRows = fresh.ok ? (fresh.data || []) : clientRows
        }

        setRows(clientRows.length ? clientRows : [createBlankRow()])
      } catch { setNotFound(true) }
    }
    load()
  }, [sheetId])

  // ── Save ONE row — debounced per rowIndex ─────────────────────────────────
  // Passes the row's `id` so PostgREST can match by PK, not just (sheet_id, row_index)
  const saveRow = useCallback((rowIndex: number, rowData: any) => {
    if (!sheetId) return
    if (saveTimerRef.current[rowIndex]) clearTimeout(saveTimerRef.current[rowIndex])
    setSaveStatus('Saving…')
    saveTimerRef.current[rowIndex] = setTimeout(async () => {
      try {
        const res  = await fetch('/api/sheet-rows', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          // BUG FIX: pass the full rowData including `id` so the API can upsert by PK
          body:    JSON.stringify({ action: 'upsert_row', sheet_id: sheetId, row: { ...rowData, rowIndex } }),
        })
        const data = await res.json()
        setSaveStatus(data.ok ? 'Saved' : 'Save failed ⚠')
      } catch { setSaveStatus('Save failed ⚠') }
      delete saveTimerRef.current[rowIndex]
    }, 600)
  }, [sheetId])

  // ── Checkbox handler ──────────────────────────────────────────────────────
  // BUG FIX: Submit on approved/rejected row → 'edit-request' not 'pending'
  // BUG FIX: requestEdit cleared on submit; unsubmit reverts correctly
  const handleCheckbox = useCallback((ri: number, ci: number, checked: boolean) => {
    const row = rows[ri]
    const nr  = [...rows]

    if (ci === 0) {
      // SUBMIT FOR APPROVAL
      if (checked) {
        const wasFinalized =
          row.approvalStatus === 'approved' ||
          row.approvalStatus === 'rejected' ||
          row.approvalStatus === 'edit-accepted'
        // Already approved/rejected + requestEdit ticked → edit request submission
        // Fresh draft row → new order submission
        const newStatus = wasFinalized ? 'edit-request' : 'pending'
        nr[ri] = {
          ...row,
          submitForApproval: true,
          requestEdit:       false,       // clear requestEdit — submission locks it
          approvalStatus:    newStatus,
          submittedOn:       new Date().toISOString(),
          receivedAt:        new Date().toISOString(),
        }
      } else {
        // Unsubmit
        const revertTo =
          row.approvalStatus === 'edit-request' ? 'approved'
          : row.approvalStatus === 'pending'    ? 'draft'
          : row.approvalStatus
        nr[ri] = { ...row, submitForApproval: false, approvalStatus: revertTo, submittedOn: '', receivedAt: '' }
      }

    } else if (ci === 1) {
      // REQUEST EDIT — unlock the row
      nr[ri] = checked
        ? { ...row, requestEdit: true,  editHistory: row.editHistory || {}, editRequestedOn: row.editRequestedOn || new Date().toISOString() }
        : { ...row, requestEdit: false, editHistory: {}, editRequestedOn: '' }

    } else {
      nr[ri] = setCellValueInRow(row, ci, checked)
    }

    setRows(nr)
    saveRow(ri, nr[ri])
  }, [rows, saveRow])

  // ── Track edit history when user edits a cell on a requestEdit row ────────
  const trackEdit = useCallback((row: any, colIndex: number, oldValue: any): any => {
    if (!row.requestEdit) return row.editHistory || {}
    const history = { ...(row.editHistory || {}) }
    const key = String(colIndex)
    // Only record the ORIGINAL value (first change wins)
    if (!(key in history)) history[key] = oldValue
    return history
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const scrollCellIntoView = useCallback((rowIndex: number, colIndex: number) => {
    if (!gridRef.current) return
    const c = gridRef.current
    const el = c.querySelector(`tbody tr:nth-child(${rowIndex+1}) td:nth-child(${colIndex+2})`) as HTMLElement
    if (!el) return
    const cr = c.getBoundingClientRect(), er = el.getBoundingClientRect()
    const t = er.top-cr.top+c.scrollTop, b = t+er.height, l = er.left-cr.left+c.scrollLeft, r = l+er.width
    if (t < c.scrollTop) c.scrollTop = t-50
    else if (b > c.scrollTop+c.clientHeight) c.scrollTop = b-c.clientHeight+50
    if (l < c.scrollLeft) c.scrollLeft = l-50
    else if (r > c.scrollLeft+c.clientWidth) c.scrollLeft = r-c.clientWidth+50
  }, [])

  useEffect(() => {
    const up = () => { setIsSelecting(false); setSelectionStart(null); setResizingColumn(null) }
    window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up)
  }, [])

  useEffect(() => {
    const mm = (e: MouseEvent) => { if (resizingColumn!==null){ const w=Math.max(50,resizeStartWidth+(e.clientX-resizeStartX)); setColumnWidths(p=>{const n=[...p];n[resizingColumn]=w;return n}) } }
    if (resizingColumn!==null){window.addEventListener('mousemove',mm);return ()=>window.removeEventListener('mousemove',mm)}
  }, [resizingColumn,resizeStartX,resizeStartWidth])

  const extendSel = (nr: number, nc: number) => { const a=anchorCell||selectedCell;if(!a)return;if(!anchorCell)setAnchorCell(a);setSelectedRange({startRow:Math.min(a.row,nr),startCol:Math.min(a.col,nc),endRow:Math.max(a.row,nr),endCol:Math.max(a.col,nc)});setSelectedCell({row:nr,col:nc}) }
  const addUndo  = useCallback(()=>{setUndoStack(p=>[...p.slice(-19),rows]);setRedoStack([])}, [rows])

  const updateRows = useCallback((newRows: any[], changedIdx?: number) => {
    addUndo(); setRows(newRows)
    if (changedIdx !== undefined) saveRow(changedIdx, newRows[changedIdx])
  }, [addUndo, saveRow])

  const handleUndo = () => { if(!undoStack.length)return;setRedoStack(p=>[...p,rows]);setUndoStack(p=>p.slice(0,-1));setRows(undoStack[undoStack.length-1]) }
  const handleRedo = () => { if(!redoStack.length)return;setUndoStack(p=>[...p,rows]);setRedoStack(p=>p.slice(0,-1));setRows(redoStack[redoStack.length-1]) }

  const handleCopy = () => {
    if(!selectedCell&&!selectedRange)return
    const d:any[][]=[]
    if(selectedRange){for(let r=selectedRange.startRow;r<=selectedRange.endRow;r++){const rd:any[]=[];for(let c=selectedRange.startCol;c<=selectedRange.endCol;c++)rd.push(getCellValue(rows[r],c));d.push(rd)}}
    else if(selectedCell)d.push([getCellValue(rows[selectedCell.row],selectedCell.col)])
    setCopiedData(d);navigator.clipboard.writeText(d.map(r=>r.join('\t')).join('\n'))
  }

  const handleCut = () => {
    handleCopy()
    const nr=[...rows];const ch=new Set<number>()
    if(selectedRange){for(let r=selectedRange.startRow;r<=selectedRange.endRow;r++)for(let c=selectedRange.startCol;c<=selectedRange.endCol;c++)if(!isReadonlyColumn(c)&&!isRowLocked(nr[r])){nr[r]=setCellValueInRow(nr[r],c,'');ch.add(r)}}
    else if(selectedCell&&!isReadonlyColumn(selectedCell.col)&&!isRowLocked(rows[selectedCell.row])){nr[selectedCell.row]=setCellValueInRow(nr[selectedCell.row],selectedCell.col,'');ch.add(selectedCell.row)}
    if(ch.size){addUndo();setRows(nr);ch.forEach(i=>saveRow(i,nr[i]))}
  }

  const handlePaste = async () => {
    if(!selectedCell)return
    const pasteData = async()=>{try{const t=await navigator.clipboard.readText();const d=t.split('\n').map(r=>r.split('\t'));return d.length&&d[0].length?d:copiedData}catch{return copiedData}}
    const data=await pasteData();if(!data.length)return
    const nr=[...rows];let cr=selectedCell.row;const ch=new Set<number>()
    for(const rd of data){if(cr>=rows.length)nr.push(createBlankRow());let cc=selectedCell.col;for(const cv of rd){if(cc<SHEET_COL_HEADERS.length&&!isReadonlyColumn(cc))nr[cr]=setCellValueInRow(nr[cr],cc,cv);cc++};ch.add(cr);cr++}
    addUndo();setRows(nr);ch.forEach(i=>saveRow(i,nr[i]))
  }

  const handleDeleteCells = () => {
    const nr=[...rows];const ch=new Set<number>()
    if(selectedRange){for(let r=selectedRange.startRow;r<=selectedRange.endRow;r++)for(let c=selectedRange.startCol;c<=selectedRange.endCol;c++)if(!isReadonlyColumn(c)&&!isCheckboxColumn(c)&&!isRowLocked(nr[r])){nr[r]=setCellValueInRow(nr[r],c,'');ch.add(r)}}
    else if(selectedCell&&!isReadonlyColumn(selectedCell.col)&&!isCheckboxColumn(selectedCell.col)&&!isRowLocked(nr[selectedCell.row])){nr[selectedCell.row]=setCellValueInRow(nr[selectedCell.row],selectedCell.col,'');ch.add(selectedCell.row)}
    if(ch.size){addUndo();setRows(nr);ch.forEach(i=>saveRow(i,nr[i]))}
  }

  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      if(editingCell)return
      if(e.ctrlKey&&e.key==='z'&&!e.shiftKey){e.preventDefault();handleUndo()}
      if(e.ctrlKey&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){e.preventDefault();handleRedo()}
      if(e.ctrlKey&&e.key==='c'){e.preventDefault();handleCopy()}
      if(e.ctrlKey&&e.key==='x'){e.preventDefault();handleCut()}
      if(e.ctrlKey&&e.key==='v'){e.preventDefault();handlePaste()}
      if(e.ctrlKey&&e.key==='f'){e.preventDefault();setShowFind(true)}
      if((e.key==='Delete'||e.key==='Backspace')&&!editingCell){e.preventDefault();handleDeleteCells()}
      if(selectedCell&&e.key==='Enter'&&!editingCell){e.preventDefault();const row=rows[selectedCell.row];if(!isCheckboxColumn(selectedCell.col)&&!isReadonlyColumn(selectedCell.col)){if(isRowLocked(row)){alert('Row is locked — tick Request Edit to unlock.');return};setEditingCell({row:selectedCell.row,col:selectedCell.col});setEditValue(String(getCellValue(row,selectedCell.col)||''))}}
      if(selectedCell&&!editingCell){
        if(e.key==='ArrowUp'&&selectedCell.row>0){e.preventDefault();const r=selectedCell.row-1;if(e.shiftKey)extendSel(r,selectedCell.col);else{setSelectedCell({row:r,col:selectedCell.col});setSelectedRange(null);setAnchorCell(null)};scrollCellIntoView(r,selectedCell.col)}
        if(e.key==='ArrowDown'&&selectedCell.row<rows.length-1){e.preventDefault();const r=selectedCell.row+1;if(e.shiftKey)extendSel(r,selectedCell.col);else{setSelectedCell({row:r,col:selectedCell.col});setSelectedRange(null);setAnchorCell(null)};scrollCellIntoView(r,selectedCell.col)}
        if(e.key==='ArrowLeft'&&selectedCell.col>0){e.preventDefault();const c=selectedCell.col-1;if(e.shiftKey)extendSel(selectedCell.row,c);else{setSelectedCell({row:selectedCell.row,col:c});setSelectedRange(null);setAnchorCell(null)};scrollCellIntoView(selectedCell.row,c)}
        if(e.key==='ArrowRight'&&selectedCell.col<SHEET_COL_HEADERS.length-1){e.preventDefault();const c=selectedCell.col+1;if(e.shiftKey)extendSel(selectedCell.row,c);else{setSelectedCell({row:selectedCell.row,col:c});setSelectedRange(null);setAnchorCell(null)};scrollCellIntoView(selectedCell.row,c)}
      }
    }
    window.addEventListener('keydown',h);return ()=>window.removeEventListener('keydown',h)
  },[editingCell,selectedCell,rows.length,undoStack,redoStack,selectedRange,scrollCellIntoView])

  useEffect(()=>{if(editingCell&&inputRef.current){inputRef.current.focus();inputRef.current.select()}},[editingCell])

  const handleColResize=(ci:number,e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();setResizingColumn(ci);setResizeStartX(e.clientX);setResizeStartWidth(columnWidths[ci])}
  const onMouseDown=(r:number,c:number)=>{if(isCheckboxColumn(c)||isReadonlyColumn(c))return;setIsSelecting(true);setSelectionStart({row:r,col:c});setSelectedCell({row:r,col:c});setSelectedRange(null)}
  const onMouseEnter=(r:number,c:number)=>{if(!isSelecting||!selectionStart||isCheckboxColumn(c)||isReadonlyColumn(c))return;setSelectedRange({startRow:Math.min(selectionStart.row,r),startCol:Math.min(selectionStart.col,c),endRow:Math.max(selectionStart.row,r),endCol:Math.max(selectionStart.col,c)})}
  const onClick=(r:number,c:number)=>{if(editingCell?.row===r&&editingCell?.col===c)return;if(isCheckboxColumn(c)||isReadonlyColumn(c))return;setSelectedCell({row:r,col:c});setSelectedRange(null);setAnchorCell(null)}
  const onDblClick=(r:number,c:number)=>{if(isCheckboxColumn(c)||isReadonlyColumn(c))return;if(isRowLocked(rows[r])){alert('Row is locked — tick Request Edit to unlock.');return};setEditingCell({row:r,col:c});setEditValue(String(getCellValue(rows[r],c)||''))}

  const handleCellBlur=()=>{
    if(!editingCell)return
    const row=rows[editingCell.row];const oldVal=getCellValue(row,editingCell.col)
    if(String(oldVal)===editValue){setEditingCell(null);return}
    const nr=[...rows]
    // BUG FIX: track edit history before overwriting
    const editHistory = trackEdit(row, editingCell.col, oldVal)
    nr[editingCell.row]={...setCellValueInRow(row,editingCell.col,editValue), editHistory}
    addUndo();setRows(nr);saveRow(editingCell.row,nr[editingCell.row]);setEditingCell(null)
  }

  const handleKeyDown=(e:React.KeyboardEvent)=>{
    if(!editingCell)return
    if(e.key==='Enter'){e.preventDefault();handleCellBlur();const nr=editingCell.row+1;if(nr<rows.length){setTimeout(()=>{setSelectedCell({row:nr,col:editingCell.col});if(!isRowLocked(rows[nr])&&!isReadonlyColumn(editingCell.col)){setEditingCell({row:nr,col:editingCell.col});setEditValue(String(getCellValue(rows[nr],editingCell.col)||''))}},50)}else{const nrs=[...rows,createBlankRow()];addUndo();setRows(nrs);saveRow(nr,nrs[nr]);setTimeout(()=>{setSelectedCell({row:nr,col:editingCell.col});setEditingCell({row:nr,col:editingCell.col});setEditValue('')},100)}}
    else if(e.key==='Escape'){setEditingCell(null);setEditValue('')}
    else if(e.key==='Tab'){e.preventDefault();handleCellBlur();const nc=editingCell.col+1;if(nc<SHEET_COL_HEADERS.length){setTimeout(()=>{setSelectedCell({row:editingCell.row,col:nc});if(!isReadonlyColumn(nc)&&!isCheckboxColumn(nc)){setEditingCell({row:editingCell.row,col:nc});setEditValue(String(getCellValue(rows[editingCell.row],nc)||''))}},50)}}
  }

  const addRow=()=>{const nr=[...rows,createBlankRow()];const i=nr.length-1;addUndo();setRows(nr);saveRow(i,nr[i])}
  const deleteRow=()=>{
    if(!selectedCell||rows.length===1)return
    if(!confirm('Delete this row?'))return
    const row=rows[selectedCell.row]
    if(row.id)fetch('/api/sheet-rows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete_row',id:row.id})}).catch(()=>{})
    addUndo();setRows(rows.filter((_,i)=>i!==selectedCell.row));setSelectedCell(null)
  }

  const stats=()=>{const vals:number[]=[];if(selectedRange){for(let r=selectedRange.startRow;r<=selectedRange.endRow;r++)for(let c=selectedRange.startCol;c<=selectedRange.endCol;c++){const n=parseFloat(String(getCellValue(rows[r],c)));if(!isNaN(n))vals.push(n)}}else if(selectedCell){const n=parseFloat(String(getCellValue(rows[selectedCell.row],selectedCell.col)));if(!isNaN(n))vals.push(n)};const s=vals.reduce((a,b)=>a+b,0);return{sum:s,avg:vals.length?s/vals.length:0,count:vals.length}}
  const inRange=(r:number,c:number)=>!!selectedRange&&r>=selectedRange.startRow&&r<=selectedRange.endRow&&c>=selectedRange.startCol&&c<=selectedRange.endCol
  const st=stats()

  if(!sheet&&!notFound)return <div className="content"><div className="card"><div style={{padding:40,textAlign:'center',color:'var(--text-tertiary)'}}>Loading…</div></div></div>
  if(notFound||!sheet)return <div className="content"><div className="card"><div className="empty-state">Sheet not found. <Link href="/order-sheets">Go back</Link></div></div></div>
  if(sheet.__accessDenied)return <div className="content"><div className="card"><div style={{textAlign:'center',padding:'60px 20px'}}><div style={{fontSize:48,marginBottom:16}}>🔒</div><div style={{fontSize:18,fontWeight:700}}>Access Denied</div><Link href="/order-sheets"><button className="primary" style={{marginTop:16}}>← Back</button></Link></div></div></div>

  return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">{sheet.title}</div>
            <div style={{fontSize:12,color:'var(--text-tertiary)',marginTop:2}}>{rows.length} rows · auto-saves per row</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span style={{fontSize:12,fontWeight:600,color:saveStatus==='Saved'?'#059669':saveStatus.includes('⚠')?'#DC2626':'#D97706'}}>{saveStatus}</span>
            <Link href="/order-sheets"><button className="small">← Sheets</button></Link>
          </div>
        </div>

        {/* Legend */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8,alignItems:'center'}}>
          <span style={{fontSize:11,color:'var(--text-tertiary)'}}>Legend:</span>
          {[['#fff','Draft'],['#fff4e6','Pending'],['#f1f3f5','Approved'],['#fff8db','Edit Req'],['#e9f8ee','Accepted'],['#ffe9e9','Rejected']].map(([bg,label])=>(
            <span key={label} style={{fontSize:10,padding:'2px 8px',borderRadius:4,background:bg,border:'1px solid #ddd'}}>{label}</span>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:8}}>
          <button className="small" onClick={handleUndo} disabled={!undoStack.length}>Undo</button>
          <button className="small" onClick={handleRedo} disabled={!redoStack.length}>Redo</button>
          <span style={{width:1,height:22,background:'#ddd',margin:'0 2px'}}/>
          <button className="small" onClick={handleCut}>Cut</button>
          <button className="small" onClick={handleCopy}>Copy</button>
          <button className="small" onClick={handlePaste}>Paste</button>
          <span style={{width:1,height:22,background:'#ddd',margin:'0 2px'}}/>
          <button className="small" onClick={addRow}>+ Add Row</button>
          <button className="small" onClick={deleteRow} disabled={!selectedCell}>Delete Row</button>
          <span style={{width:1,height:22,background:'#ddd',margin:'0 2px'}}/>
          <button className="small" onClick={()=>setShowFind(!showFind)}>Find</button>
        </div>

        {showFind&&(
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8,padding:8,background:'#f5f5f5',borderRadius:4}}>
            <input value={findText} onChange={e=>setFindText(e.target.value)} placeholder="Find in sheet…" style={{flex:1,padding:'4px 8px',fontSize:12}} autoFocus/>
            <button className="small" onClick={()=>setShowFind(false)}>Close</button>
          </div>
        )}

        {/* Grid */}
        <div ref={gridRef} style={{width:'100%',maxHeight:'calc(100vh - 270px)',overflow:'auto',border:'1px solid #ddd',borderRadius:6,background:'#fff',userSelect:'none'}}>
          <table style={{borderCollapse:'separate',borderSpacing:0,tableLayout:'fixed',width:'max-content',fontSize:12}}>
            <thead>
              <tr>
                <th style={{...STH,width:46,position:'sticky',left:0,top:0,zIndex:5}}/>
                {SHEET_COL_HEADERS.map((_,i)=><th key={i} style={{...STH,width:columnWidths[i],position:'sticky',top:0,zIndex:3}}>{toExcelColLabel(i)}</th>)}
              </tr>
              <tr>
                <th style={{...STH2,width:46,position:'sticky',left:0,top:22,zIndex:5}}/>
                {SHEET_COL_HEADERS.map((h,i)=>(
                  <th key={i} style={{...STH2,width:columnWidths[i],position:'sticky',top:22,zIndex:3}} title={h}>
                    <div style={{position:'relative',display:'flex',alignItems:'center'}}>
                      <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis'}}>{h}</span>
                      <div onMouseDown={e=>handleColResize(i,e)} style={{position:'absolute',right:-3,top:-4,bottom:-4,width:6,cursor:'col-resize',zIndex:10}}/>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {rows.map((row,ri)=>(
                <tr key={row.id||ri} className={getRowClass(row)}>
                  <th style={{position:'sticky',left:0,zIndex:2,width:46,textAlign:'center',background:'#f7f8fa',fontWeight:500,color:'#999',borderRight:'1px solid #e6e9ef',borderBottom:'1px solid #e6e9ef',padding:'4px 6px',height:30}}>{ri+1}</th>
                  {SHEET_COL_HEADERS.map((_,ci)=>{
                    const val      = getCellValue(row,ci)
                    const editing  = editingCell?.row===ri&&editingCell?.col===ci
                    const selected = selectedCell?.row===ri&&selectedCell?.col===ci
                    const inRng    = inRange(ri,ci)
                    const isChk    = isCheckboxColumn(ci)
                    const isRO     = isReadonlyColumn(ci)
                    const match    = !!(findText&&String(val).toLowerCase().includes(findText.toLowerCase()))
                    return (
                      <td key={ci}
                        onMouseDown={()=>onMouseDown(ri,ci)}
                        onMouseEnter={()=>onMouseEnter(ri,ci)}
                        onClick={()=>onClick(ri,ci)}
                        onDoubleClick={()=>onDblClick(ri,ci)}
                        style={{width:columnWidths[ci],borderRight:'1px solid #e6e9ef',borderBottom:'1px solid #e6e9ef',padding:'4px 6px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',verticalAlign:'middle',height:30,
                          cursor:isRO?'not-allowed':isChk?'default':'cell',
                          outline:(selected||inRng)?'2px solid #137E43':'none',outlineOffset:(selected||inRng)?-2:0,
                          background:match?'#fff7c2':(selected||inRng)?'rgba(232,245,233,0.55)':isRO?'#f1f3f5':'inherit',
                          color:isRO?'#5a6470':'inherit'}}>
                        {isChk ? (
                          <input type="checkbox" checked={!!val}
                            onChange={e=>{e.stopPropagation();handleCheckbox(ri,ci,e.target.checked)}}
                            style={{margin:0,pointerEvents:'auto'}}/>
                        ) : editing ? (
                          <input ref={inputRef} value={editValue} onChange={e=>setEditValue(e.target.value)}
                            onBlur={handleCellBlur} onKeyDown={handleKeyDown}
                            style={{width:'100%',height:'100%',border:0,outline:0,padding:0,background:'transparent',font:'inherit',color:'inherit'}} autoFocus/>
                        ) : (
                          <span>{String(val||'')}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Status bar */}
        <div style={{display:'flex',justifyContent:'space-between',padding:'5px 10px',border:'1px solid #ddd',borderTop:'none',borderRadius:'0 0 6px 6px',background:'#f8faf9',fontSize:11,color:'var(--text-tertiary)'}}>
          <span>Row {selectedCell?selectedCell.row+1:'-'} of {rows.length} · Sum: {st.sum.toFixed(2)} · Avg: {st.avg.toFixed(2)} · Count: {st.count}</span>
          <span>Each row saves independently · Supabase order_sheet_rows</span>
        </div>
      </div>
    </div>
  )
}

const STH:  React.CSSProperties = {height:22,textAlign:'center',fontSize:11,fontWeight:700,color:'#2d5fa5',background:'#eef3fb',borderRight:'1px solid #e6e9ef',borderBottom:'1px solid #e6e9ef',padding:'4px 6px',whiteSpace:'nowrap',overflow:'hidden'}
const STH2: React.CSSProperties = {height:26,textAlign:'left',fontWeight:600,color:'#1a1a18',background:'#f2f3f5',borderRight:'1px solid #e6e9ef',borderBottom:'1px solid #e6e9ef',padding:'4px 6px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}
