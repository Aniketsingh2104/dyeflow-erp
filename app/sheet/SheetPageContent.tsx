'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  SHEET_COL_HEADERS, SHEET_COL_WIDTH_DEFAULTS, SHEET_ALL_KEYS,
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

  const inputRef    = useRef<HTMLInputElement>(null)
  const tbodyRef    = useRef<HTMLTableSectionElement>(null)
  const saveTimerRef= useRef<Record<number, NodeJS.Timeout>>({})  // per-row debounce
  const gridRef     = useRef<HTMLDivElement>(null)

  // ── Load sheet metadata + rows from dedicated table ───────────────────────
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
        const allowedSheets: string[] = session?.permissions?.allowedSheets || []
        if (!isAdmin && !allowedSheets.includes(sheetId)) { setSheet({ __accessDenied: true }); return }

        setSheet(sheetRes.data)

        // If no rows yet in new table, fall back to legacy blob then bulk-migrate
        let clientRows: any[] = rowsRes.ok ? (rowsRes.data || []) : []

        if (clientRows.length === 0 && sheetRes.data.rows?.length) {
          // Migrate legacy blob to new table
          clientRows = sheetRes.data.rows.map((r: any, i: number) => ({ ...r, rowIndex: i, id: undefined }))
          await fetch('/api/sheet-rows', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'bulk_upsert', sheet_id: sheetId, rows: clientRows }),
          })
          // Reload from table
          const fresh = await fetch(`/api/sheet-rows?sheet_id=${sheetId}`, { cache: 'no-store' }).then(r => r.json())
          clientRows = fresh.ok ? (fresh.data || []) : clientRows
        }

        setRows(clientRows.length ? clientRows : [createBlankRow()])
      } catch { setNotFound(true) }
    }
    load()
  }, [sheetId])

  // ── Save ONE row to Supabase (debounced per row) ──────────────────────────
  // This is the key change: only the modified row is saved, not the whole sheet
  const saveRow = useCallback((rowIndex: number, rowData: any) => {
    if (!sheetId) return

    // Clear existing debounce for this row
    if (saveTimerRef.current[rowIndex]) clearTimeout(saveTimerRef.current[rowIndex])

    setSaveStatus('Unsaved…')
    saveTimerRef.current[rowIndex] = setTimeout(async () => {
      try {
        const res  = await fetch('/api/sheet-rows', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            action:   'upsert_row',
            sheet_id: sheetId,
            row:      { ...rowData, rowIndex },
          }),
        })
        const data = await res.json()
        if (data.ok) {
          setSaveStatus('Saved')
          setTimeout(() => setSaveStatus('Saved'), 1000)
        } else {
          setSaveStatus('Save failed ⚠')
        }
      } catch {
        setSaveStatus('Save failed ⚠')
      }
      delete saveTimerRef.current[rowIndex]
    }, 600)
  }, [sheetId])

  // ── Checkbox handler ──────────────────────────────────────────────────────
  const handleCheckbox = useCallback((ri: number, ci: number, checked: boolean) => {
    const row = rows[ri]
    const nr  = [...rows]

    if (ci === 0) {
      nr[ri] = checked
        ? { ...row, submitForApproval: true,  approvalStatus: 'pending', submittedOn: new Date().toISOString(), receivedAt: new Date().toISOString() }
        : { ...row, submitForApproval: false, approvalStatus: 'draft',   submittedOn: '', receivedAt: '' }
    } else if (ci === 1) {
      nr[ri] = { ...row, requestEdit: checked, editHistory: checked ? (row.editHistory || {}) : {}, editRequestedOn: checked ? (row.editRequestedOn || new Date().toISOString()) : '' }
    } else {
      nr[ri] = setCellValueInRow(row, ci, checked)
    }

    setRows(nr)
    saveRow(ri, nr[ri])
  }, [rows, saveRow])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const scrollCellIntoView = useCallback((rowIndex: number, colIndex: number) => {
    if (!gridRef.current) return
    const container = gridRef.current
    const cell = container.querySelector(`tbody tr:nth-child(${rowIndex+1}) td:nth-child(${colIndex+2})`) as HTMLElement
    if (!cell) return
    const cr = container.getBoundingClientRect(), cellR = cell.getBoundingClientRect()
    const cellTop = cellR.top - cr.top + container.scrollTop, cellBottom = cellTop + cellR.height
    const cellLeft= cellR.left- cr.left+ container.scrollLeft, cellRight = cellLeft + cellR.width
    if (cellTop < container.scrollTop) container.scrollTop = cellTop - 50
    else if (cellBottom > container.scrollTop + container.clientHeight) container.scrollTop = cellBottom - container.clientHeight + 50
    if (cellLeft < container.scrollLeft) container.scrollLeft = cellLeft - 50
    else if (cellRight > container.scrollLeft + container.clientWidth) container.scrollLeft = cellRight - container.clientWidth + 50
  }, [])

  useEffect(() => {
    const up = () => { setIsSelecting(false); setSelectionStart(null); setResizingColumn(null) }
    window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up)
  }, [])

  useEffect(() => {
    const mm = (e: MouseEvent) => {
      if (resizingColumn !== null) {
        const w = Math.max(50, resizeStartWidth + (e.clientX - resizeStartX))
        setColumnWidths(prev => { const n=[...prev]; n[resizingColumn]=w; return n })
      }
    }
    if (resizingColumn !== null) { window.addEventListener('mousemove', mm); return () => window.removeEventListener('mousemove', mm) }
  }, [resizingColumn, resizeStartX, resizeStartWidth])

  const extendSelection = (nr: number, nc: number) => {
    const anchor = anchorCell||selectedCell; if (!anchor) return
    if (!anchorCell) setAnchorCell(anchor)
    setSelectedRange({ startRow:Math.min(anchor.row,nr), startCol:Math.min(anchor.col,nc), endRow:Math.max(anchor.row,nr), endCol:Math.max(anchor.col,nc) })
    setSelectedCell({ row:nr, col:nc })
  }

  const addToUndoStack = useCallback(() => { setUndoStack(prev=>[...prev.slice(-19),rows]); setRedoStack([]) }, [rows])

  const updateRows = useCallback((newRows: any[], changedIdx?: number) => {
    addToUndoStack()
    setRows(newRows)
    if (changedIdx !== undefined) saveRow(changedIdx, newRows[changedIdx])
  }, [addToUndoStack, saveRow])

  const handleUndo = () => { if(!undoStack.length)return; setRedoStack(p=>[...p,rows]); setUndoStack(p=>p.slice(0,-1)); setRows(undoStack[undoStack.length-1]) }
  const handleRedo = () => { if(!redoStack.length)return; setUndoStack(p=>[...p,rows]); setRedoStack(p=>p.slice(0,-1)); setRows(redoStack[redoStack.length-1]) }

  const handleCopy = () => {
    if (!selectedCell&&!selectedRange) return
    const data: any[][]=[]
    if (selectedRange) { for(let r=selectedRange.startRow;r<=selectedRange.endRow;r++){const rd:any[]=[]; for(let c=selectedRange.startCol;c<=selectedRange.endCol;c++) rd.push(getCellValue(rows[r],c)); data.push(rd)} }
    else if (selectedCell) data.push([getCellValue(rows[selectedCell.row],selectedCell.col)])
    setCopiedData(data); navigator.clipboard.writeText(data.map(r=>r.join('\t')).join('\n'))
  }

  const handleCut = () => {
    handleCopy()
    if (selectedRange) {
      const nr=[...rows]; const changed=new Set<number>()
      for(let r=selectedRange.startRow;r<=selectedRange.endRow;r++) for(let c=selectedRange.startCol;c<=selectedRange.endCol;c++) if(!isReadonlyColumn(c)&&!isRowLocked(nr[r])){nr[r]=setCellValueInRow(nr[r],c,'');changed.add(r)}
      addToUndoStack(); setRows(nr); changed.forEach(i=>saveRow(i,nr[i]))
    } else if (selectedCell&&!isReadonlyColumn(selectedCell.col)&&!isRowLocked(rows[selectedCell.row])) {
      const nr=[...rows]; nr[selectedCell.row]=setCellValueInRow(nr[selectedCell.row],selectedCell.col,'')
      updateRows(nr, selectedCell.row)
    }
  }

  const handlePaste = async () => {
    if (!selectedCell) return
    try {
      const text=await navigator.clipboard.readText()
      const cd=text.split('\n').map(r=>r.split('\t'))
      const data=cd.length&&cd[0].length?cd:copiedData
      if(!data.length)return
      const nr=[...rows]; let cr=selectedCell.row; const changed=new Set<number>()
      for(const rd of data){if(cr>=rows.length)nr.push(createBlankRow());let cc=selectedCell.col;for(const cv of rd){if(cc<SHEET_COL_HEADERS.length&&!isReadonlyColumn(cc)){nr[cr]=setCellValueInRow(nr[cr],cc,cv)};cc++};changed.add(cr);cr++}
      addToUndoStack(); setRows(nr); changed.forEach(i=>saveRow(i,nr[i]))
    } catch {
      if(!copiedData.length)return
      const nr=[...rows]; let cr=selectedCell.row; const changed=new Set<number>()
      for(const rd of copiedData){if(cr>=rows.length)nr.push(createBlankRow());let cc=selectedCell.col;for(const cv of rd){if(cc<SHEET_COL_HEADERS.length&&!isReadonlyColumn(cc)){nr[cr]=setCellValueInRow(nr[cr],cc,cv)};cc++};changed.add(cr);cr++}
      addToUndoStack(); setRows(nr); changed.forEach(i=>saveRow(i,nr[i]))
    }
  }

  const handleDeleteSelectedCells = () => {
    if (!selectedCell&&!selectedRange) return
    const nr=[...rows]; let changed=false; const changedRows=new Set<number>()
    if (selectedRange) { for(let r=selectedRange.startRow;r<=selectedRange.endRow;r++) for(let c=selectedRange.startCol;c<=selectedRange.endCol;c++) if(!isReadonlyColumn(c)&&!isCheckboxColumn(c)&&!isRowLocked(nr[r])){nr[r]=setCellValueInRow(nr[r],c,'');changed=true;changedRows.add(r)} }
    else if (selectedCell&&!isReadonlyColumn(selectedCell.col)&&!isCheckboxColumn(selectedCell.col)&&!isRowLocked(nr[selectedCell.row])){nr[selectedCell.row]=setCellValueInRow(nr[selectedCell.row],selectedCell.col,'');changed=true;changedRows.add(selectedCell.row)}
    if (changed) { addToUndoStack(); setRows(nr); changedRows.forEach(i=>saveRow(i,nr[i])) }
  }

  useEffect(() => {
    const h=(e:KeyboardEvent)=>{
      if(editingCell)return
      if(e.ctrlKey&&e.key==='z'&&!e.shiftKey){e.preventDefault();handleUndo()}
      if(e.ctrlKey&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){e.preventDefault();handleRedo()}
      if(e.ctrlKey&&e.key==='c'){e.preventDefault();handleCopy()}
      if(e.ctrlKey&&e.key==='x'){e.preventDefault();handleCut()}
      if(e.ctrlKey&&e.key==='v'){e.preventDefault();handlePaste()}
      if(e.ctrlKey&&e.key==='f'){e.preventDefault();setShowFind(true)}
      if((e.key==='Delete'||e.key==='Backspace')&&!editingCell){e.preventDefault();handleDeleteSelectedCells()}
      if(selectedCell&&e.key==='Enter'&&!editingCell){e.preventDefault();const row=rows[selectedCell.row];if(!isCheckboxColumn(selectedCell.col)&&!isReadonlyColumn(selectedCell.col)){if(isRowLocked(row)){alert('Row is locked.');return};setEditingCell({row:selectedCell.row,col:selectedCell.col});setEditValue(String(getCellValue(row,selectedCell.col)||''))}}
      if(selectedCell&&!editingCell){
        if(e.key==='ArrowUp'&&selectedCell.row>0){e.preventDefault();const r=selectedCell.row-1;if(e.shiftKey)extendSelection(r,selectedCell.col);else{setSelectedCell({row:r,col:selectedCell.col});setSelectedRange(null);setAnchorCell(null)};scrollCellIntoView(r,selectedCell.col)}
        if(e.key==='ArrowDown'&&selectedCell.row<rows.length-1){e.preventDefault();const r=selectedCell.row+1;if(e.shiftKey)extendSelection(r,selectedCell.col);else{setSelectedCell({row:r,col:selectedCell.col});setSelectedRange(null);setAnchorCell(null)};scrollCellIntoView(r,selectedCell.col)}
        if(e.key==='ArrowLeft'&&selectedCell.col>0){e.preventDefault();const c=selectedCell.col-1;if(e.shiftKey)extendSelection(selectedCell.row,c);else{setSelectedCell({row:selectedCell.row,col:c});setSelectedRange(null);setAnchorCell(null)};scrollCellIntoView(selectedCell.row,c)}
        if(e.key==='ArrowRight'&&selectedCell.col<SHEET_COL_HEADERS.length-1){e.preventDefault();const c=selectedCell.col+1;if(e.shiftKey)extendSelection(selectedCell.row,c);else{setSelectedCell({row:selectedCell.row,col:c});setSelectedRange(null);setAnchorCell(null)};scrollCellIntoView(selectedCell.row,c)}
      }
    }
    window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h)
  },[editingCell,selectedCell,rows.length,undoStack,redoStack,selectedRange,scrollCellIntoView])

  useEffect(()=>{ if(editingCell&&inputRef.current){inputRef.current.focus();inputRef.current.select()} },[editingCell])

  const handleColResizeStart=(ci:number,e:React.MouseEvent)=>{ e.preventDefault();e.stopPropagation();setResizingColumn(ci);setResizeStartX(e.clientX);setResizeStartWidth(columnWidths[ci]) }
  const handleCellMouseDown=(r:number,c:number)=>{ if(isCheckboxColumn(c)||isReadonlyColumn(c))return;setIsSelecting(true);setSelectionStart({row:r,col:c});setSelectedCell({row:r,col:c});setSelectedRange(null) }
  const handleCellMouseEnter=(r:number,c:number)=>{ if(!isSelecting||!selectionStart||isCheckboxColumn(c)||isReadonlyColumn(c))return;setSelectedRange({startRow:Math.min(selectionStart.row,r),startCol:Math.min(selectionStart.col,c),endRow:Math.max(selectionStart.row,r),endCol:Math.max(selectionStart.col,c)}) }
  const handleCellClick=(r:number,c:number)=>{ if(editingCell?.row===r&&editingCell?.col===c)return;if(isCheckboxColumn(c)||isReadonlyColumn(c))return;setSelectedCell({row:r,col:c});setSelectedRange(null);setAnchorCell(null) }
  const handleCellDoubleClick=(r:number,c:number)=>{ if(isCheckboxColumn(c)||isReadonlyColumn(c))return;if(isRowLocked(rows[r])){alert('Row is locked.');return};setEditingCell({row:r,col:c});setEditValue(String(getCellValue(rows[r],c)||'')) }

  const handleCellBlur=()=>{
    if(!editingCell)return
    const row=rows[editingCell.row]; const oldVal=getCellValue(row,editingCell.col)
    if(oldVal===editValue){setEditingCell(null);return}
    const nr=[...rows]; nr[editingCell.row]=setCellValueInRow(row,editingCell.col,editValue)
    addToUndoStack(); setRows(nr); saveRow(editingCell.row, nr[editingCell.row])
    setEditingCell(null)
  }

  const handleKeyDown=(e:React.KeyboardEvent)=>{
    if(!editingCell)return
    if(e.key==='Enter'){e.preventDefault();handleCellBlur();const nr=editingCell.row+1;if(nr<rows.length){setTimeout(()=>{setSelectedCell({row:nr,col:editingCell.col});if(!isRowLocked(rows[nr])&&!isReadonlyColumn(editingCell.col)){setEditingCell({row:nr,col:editingCell.col});setEditValue(String(getCellValue(rows[nr],editingCell.col)||''))}},50)}else{const newRows=[...rows,createBlankRow()];addToUndoStack();setRows(newRows);saveRow(nr,newRows[nr]);setTimeout(()=>{setSelectedCell({row:nr,col:editingCell.col});setEditingCell({row:nr,col:editingCell.col});setEditValue('')},100)}}
    else if(e.key==='Escape'){setEditingCell(null);setEditValue('')}
    else if(e.key==='Tab'){e.preventDefault();handleCellBlur();const nc=editingCell.col+1;if(nc<SHEET_COL_HEADERS.length){setTimeout(()=>{setSelectedCell({row:editingCell.row,col:nc});if(!isReadonlyColumn(nc)&&!isCheckboxColumn(nc)){setEditingCell({row:editingCell.row,col:nc});setEditValue(String(getCellValue(rows[editingCell.row],nc)||''))}},50)}}
  }

  const addRow=()=>{
    const newRows=[...rows,createBlankRow()]
    const newIdx=newRows.length-1
    addToUndoStack(); setRows(newRows); saveRow(newIdx,newRows[newIdx])
  }

  const deleteRow=()=>{
    if(!selectedCell||rows.length===1)return
    if(!confirm('Delete this row?'))return
    const row=rows[selectedCell.row]
    if(row.id){
      fetch('/api/sheet-rows',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete_row',id:row.id})}).catch(()=>{})
    }
    addToUndoStack(); setRows(rows.filter((_,i)=>i!==selectedCell.row)); setSelectedCell(null)
  }

  const getSelectionStats=()=>{ const vals:number[]=[]; if(selectedRange){for(let r=selectedRange.startRow;r<=selectedRange.endRow;r++)for(let c=selectedRange.startCol;c<=selectedRange.endCol;c++){const n=parseFloat(String(getCellValue(rows[r],c)));if(!isNaN(n))vals.push(n)}}else if(selectedCell){const n=parseFloat(String(getCellValue(rows[selectedCell.row],selectedCell.col)));if(!isNaN(n))vals.push(n)};const sum=vals.reduce((a,b)=>a+b,0);return{sum,avg:vals.length?sum/vals.length:0,count:vals.length} }
  const isCellInRange=(r:number,c:number)=>!!selectedRange&&r>=selectedRange.startRow&&r<=selectedRange.endRow&&c>=selectedRange.startCol&&c<=selectedRange.endCol
  const stats=getSelectionStats()

  if (!sheet&&!notFound) return <div className="content"><div className="card"><div style={{padding:40,textAlign:'center',color:'var(--text-tertiary)'}}>Loading…</div></div></div>
  if (notFound||!sheet) return <div className="content"><div className="card"><div className="empty-state">Sheet not found. <Link href="/order-sheets">Go back</Link></div></div></div>
  if (sheet.__accessDenied) return <div className="content"><div className="card"><div style={{textAlign:'center',padding:'60px 20px'}}><div style={{fontSize:48,marginBottom:16}}>🔒</div><div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Access Denied</div><Link href="/order-sheets"><button className="primary">← Back</button></Link></div></div></div>

  return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">{sheet.title}</div>
            <div style={{fontSize:12,color:'var(--text-tertiary)',marginTop:2}}>
              {rows.length} rows · Each row saved individually to Supabase
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span style={{fontSize:12,fontWeight:600,color:saveStatus==='Saved'?'var(--success)':saveStatus.includes('⚠')?'var(--danger)':'var(--warning)'}}>{saveStatus}</span>
            <Link href="/order-sheets"><button className="small">← Sheets</button></Link>
          </div>
        </div>

        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8,alignItems:'center'}}>
          <span style={{fontSize:11,color:'var(--text-tertiary)'}}>Legend:</span>
          {[['#fff','Draft'],['#fff4e6','Pending'],['#f1f3f5','Approved'],['#fff8db','Edit Req'],['#e9f8ee','Accepted'],['#ffe9e9','Rejected']].map(([bg,label])=>(
            <span key={label} style={{fontSize:10,padding:'2px 8px',borderRadius:4,background:bg,border:'1px solid #ddd'}}>{label}</span>
          ))}
        </div>

        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:8}}>
          <button className="small primary" onClick={()=>{/* manual save no longer needed — auto saves per row */}}>Saved ✓</button>
          <button className="small" onClick={handleUndo} disabled={!undoStack.length}>Undo</button>
          <button className="small" onClick={handleRedo} disabled={!redoStack.length}>Redo</button>
          <span style={{width:1,height:22,background:'#ddd',margin:'0 3px'}}/>
          <button className="small" onClick={handleCut}>Cut</button>
          <button className="small" onClick={handleCopy}>Copy</button>
          <button className="small" onClick={handlePaste}>Paste</button>
          <span style={{width:1,height:22,background:'#ddd',margin:'0 3px'}}/>
          <button className="small" onClick={addRow}>Add Row</button>
          <button className="small" onClick={deleteRow} disabled={!selectedCell}>Delete Row</button>
          <span style={{width:1,height:22,background:'#ddd',margin:'0 3px'}}/>
          <button className="small" onClick={()=>setShowFind(!showFind)}>Find</button>
        </div>

        {showFind&&(
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8,padding:8,background:'#f5f5f5',borderRadius:4}}>
            <input value={findText} onChange={e=>setFindText(e.target.value)} placeholder="Find in sheet…" style={{flex:1,padding:'4px 8px',fontSize:12}}/>
            <button className="small" onClick={()=>setShowFind(false)}>Close</button>
          </div>
        )}

        <div ref={gridRef} style={{width:'100%',maxHeight:'calc(100vh - 280px)',overflow:'auto',border:'1px solid #ddd',borderRadius:6,background:'#fff',userSelect:'none'}}>
          <table style={{borderCollapse:'separate',borderSpacing:0,tableLayout:'fixed',width:'max-content',minWidth:'max-content',fontSize:12}}>
            <thead>
              <tr>
                <th style={{...sth,width:46,minWidth:46,position:'sticky',left:0,top:0,zIndex:5}}/>
                {SHEET_COL_HEADERS.map((_,i)=>(<th key={i} style={{...sth,width:columnWidths[i],minWidth:columnWidths[i],position:'sticky',top:0,zIndex:3}}>{toExcelColLabel(i)}</th>))}
              </tr>
              <tr>
                <th style={{...sth2,width:46,minWidth:46,position:'sticky',left:0,top:22,zIndex:5}}/>
                {SHEET_COL_HEADERS.map((h,i)=>(
                  <th key={i} style={{...sth2,width:columnWidths[i],minWidth:columnWidths[i],position:'sticky',top:22,zIndex:3}} title={h}>
                    <div style={{position:'relative',display:'flex',alignItems:'center'}}>
                      <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis'}}>{h}</span>
                      <div onMouseDown={e=>handleColResizeStart(i,e)} style={{position:'absolute',right:-3,top:-4,bottom:-4,width:6,cursor:'col-resize',zIndex:10}}/>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {rows.map((row,ri)=>(
                <tr key={ri} className={getRowClass(row)}>
                  <th style={{position:'sticky',left:0,zIndex:2,width:46,minWidth:46,textAlign:'center',background:'#f7f8fa',fontWeight:500,color:'#999',borderRight:'1px solid #e6e9ef',borderBottom:'1px solid #e6e9ef',padding:'4px 6px',height:30}}>{ri+1}</th>
                  {SHEET_COL_HEADERS.map((_,ci)=>{
                    const value     = getCellValue(row,ci)
                    const isEditing = editingCell?.row===ri&&editingCell?.col===ci
                    const isSelected= selectedCell?.row===ri&&selectedCell?.col===ci
                    const isInRange = isCellInRange(ri,ci)
                    const isChk     = isCheckboxColumn(ci)
                    const isRO      = isReadonlyColumn(ci)
                    const matchFind = !!(findText&&String(value).toLowerCase().includes(findText.toLowerCase()))
                    return (
                      <td key={`${ri}-${ci}`}
                        onMouseDown={()=>handleCellMouseDown(ri,ci)}
                        onMouseEnter={()=>handleCellMouseEnter(ri,ci)}
                        onClick={()=>handleCellClick(ri,ci)}
                        onDoubleClick={()=>handleCellDoubleClick(ri,ci)}
                        style={{width:columnWidths[ci],minWidth:columnWidths[ci],borderRight:'1px solid #e6e9ef',borderBottom:'1px solid #e6e9ef',padding:'4px 6px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',verticalAlign:'middle',height:30,cursor:isRO?'not-allowed':isChk?'default':'cell',outline:(isSelected||isInRange)?'2px solid #137E43':'none',outlineOffset:(isSelected||isInRange)?-2:0,background:matchFind?'#fff7c2':(isSelected||isInRange)?'rgba(232,245,233,0.55)':isRO?'#f1f3f5':'inherit',color:isRO?'#5a6470':'inherit'}}>
                        {isChk ? (
                          <input type="checkbox" checked={!!value}
                            onChange={e=>{ e.stopPropagation(); handleCheckbox(ri,ci,e.target.checked) }}
                            style={{margin:0,pointerEvents:'auto'}}/>
                        ) : isEditing ? (
                          <input ref={inputRef} type="text" value={editValue} onChange={e=>setEditValue(e.target.value)} onBlur={handleCellBlur} onKeyDown={handleKeyDown} style={{width:'100%',height:'100%',border:0,outline:0,padding:0,background:'transparent',font:'inherit',color:'inherit'}} autoFocus/>
                        ) : (
                          <span>{String(value||'')}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,padding:'6px 10px',border:'1px solid #ddd',borderTop:'none',borderRadius:'0 0 6px 6px',background:'#f8faf9',fontSize:12}}>
          <span>Row {selectedCell?selectedCell.row+1:1} of {rows.length} | Sum: {stats.sum.toFixed(2)} | Avg: {stats.avg.toFixed(2)} | Count: {stats.count}</span>
          <span style={{color:'var(--text-tertiary)',fontSize:11}}>Each row saves independently to Supabase</span>
        </div>
      </div>
    </div>
  )
}

const sth:  React.CSSProperties = { height:22,textAlign:'center',fontSize:11,fontWeight:700,color:'#2d5fa5',background:'#eef3fb',borderRight:'1px solid #e6e9ef',borderBottom:'1px solid #e6e9ef',padding:'4px 6px' }
const sth2: React.CSSProperties = { height:26,textAlign:'left',fontWeight:600,color:'#1a1a18',background:'#f2f3f5',borderRight:'1px solid #e6e9ef',borderBottom:'1px solid #e6e9ef',padding:'4px 6px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }
