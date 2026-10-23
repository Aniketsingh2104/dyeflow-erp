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

// Every row carries a client key (_k) that never changes, so saves stay tied
// to the right row even after rows above it are deleted.
let keySeq = 0
const newKey = () => `n${Date.now().toString(36)}${(keySeq++).toString(36)}`
const keyOf  = (row: any): string => row?._k || row?.id || ''
const blankRow = () => ({ ...createBlankRow(), _k: newKey() })

// Status fields the party never changes by typing / undo
const STATUS_KEYS = ['id', '_k', 'approvalStatus', 'submitForApproval', 'requestEdit', 'editRequestedOn',
  'submittedOn', 'receivedAt', 'orderNumber', 'rejectionReason', 'holdReason', 'process', 'deliveryDate', 'currentStage']

// Put back the original values of an edited approved row
function restoreOriginals(row: any): any {
  let out = { ...row }
  for (const [ci, oldVal] of Object.entries(row.editHistory || {})) out = setCellValueInRow(out, Number(ci), oldVal)
  return out
}

export default function SheetPageContent() {
  const searchParams = useSearchParams()
  const sheetId = searchParams.get('id')

  const [sheet,           setSheet]           = useState<any>(null)
  const [rows,            setRows]            = useState<any[]>([])
  const [columnWidths,    setColumnWidths]    = useState<number[]>(SHEET_COL_WIDTH_DEFAULTS)
  const [resizingColumn,  setResizingColumn]  = useState<number|null>(null)
  const resizeRef = useRef<{ col: number; startX: number; startW: number } | null>(null)
  const widthsKey = `dyeflow_sheet_colw_${sheetId || 'x'}`
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
  const saveTimerRef = useRef<Record<string, NodeJS.Timeout>>({})
  const idsRef       = useRef<Record<string, string>>({})          // _k → database id once inserted
  const latestRef    = useRef<Record<string, any>>({})             // _k → newest row data to save
  const inflightRef  = useRef<Record<string, Promise<void> | undefined>>({})   // _k → save in progress
  const deletedRef   = useRef<Set<string>>(new Set())
  const insertChainRef = useRef<Promise<void>>(Promise.resolve())
  const conflictShown = useRef(false)
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
        // Access is decided by the server (admin, office staff, or the sheets
        // ticked for this user in User Management)
        if (sheetRes.ok === false && /access/i.test(sheetRes.error || '')) { setSheet({ __accessDenied: true }); return }
        if (!sheetRes.ok || !sheetRes.data) { setNotFound(true); return }

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

        setRows(clientRows.length ? clientRows.map((r: any) => ({ ...r, _k: r.id || newKey() })) : [blankRow()])
      } catch { setNotFound(true) }
    }
    load()
  }, [sheetId])

  // ── Save ONE row — debounced per row key ──────────────────────────────────
  // New rows are inserted by the server at the end of the sheet and their id
  // comes back here, so every later save of that row patches it by id.
  const flushRow = useCallback(async (k: string) => {
    delete saveTimerRef.current[k]
    if (inflightRef.current[k]) { try { await inflightRef.current[k] } catch {} }
    const row = latestRef.current[k]
    if (!row || deletedRef.current.has(k) || !sheetId) return
    const id = idsRef.current[k] || row.id
    // New rows are added one after another so they keep the order they have on screen
    const after = id ? Promise.resolve() : insertChainRef.current
    const job = (async () => {
      try { await after } catch {}
      try {
        const res  = await fetch('/api/sheet-rows', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action: 'upsert_row', from: 'sheet', sheet_id: sheetId, row: { ...row, id } }),
        })
        const data = await res.json()
        if (data.ok && data.id && data.id !== id) {
          idsRef.current[k] = data.id
          setRows(prev => prev.map(r => keyOf(r) === k ? { ...r, id: data.id } : r))
        }
        if (!data.ok && res.status === 409 && !conflictShown.current) {
          conflictShown.current = true
          alert(data.error || 'This sheet was changed by the office — please reload.')
        }
        setSaveStatus(data.ok ? 'Saved' : res.status === 409 ? 'Reload needed ⚠' : 'Save failed ⚠')
      } catch { setSaveStatus('Save failed ⚠') }
    })()
    inflightRef.current[k] = job
    if (!id) insertChainRef.current = job
    try { await job } finally { if (inflightRef.current[k] === job) delete inflightRef.current[k] }
  }, [sheetId])

  const saveRow = useCallback((_rowIndex: number, rowData: any) => {
    if (!sheetId || !rowData) return
    const k = keyOf(rowData)
    if (!k) return
    latestRef.current[k] = rowData
    if (saveTimerRef.current[k]) clearTimeout(saveTimerRef.current[k])
    setSaveStatus('Saving…')
    saveTimerRef.current[k] = setTimeout(() => { flushRow(k) }, 600)
  }, [sheetId, flushRow])

  // ── Checkbox handler ──────────────────────────────────────────────────────
  // BUG FIX: Submit on approved/rejected row → 'edit-request' not 'pending'
  // BUG FIX: requestEdit cleared on submit; unsubmit reverts correctly
  const handleCheckbox = useCallback((ri: number, ci: number, checked: boolean) => {
    const row = rows[ri]
    const nr  = [...rows]
    const st  = row.approvalStatus || 'draft'

    if (ci === 0) {
      // SUBMIT FOR APPROVAL
      if (checked) {
        if (st === 'pending' || st === 'edit-request' || st === 'approving') return
        if (st === 'approved' || st === 'edit-accepted') {
          // Already an order → this is an EDIT request, only if something was changed
          if (!row.requestEdit || !Object.keys(row.editHistory || {}).length) {
            alert('This row is already an order. Tick "Request Edit", change the cells, then tick Submit.')
            return
          }
          nr[ri] = { ...row, submitForApproval: true, requestEdit: false, approvalStatus: 'edit-request',
            submittedOn: new Date().toISOString(), receivedAt: new Date().toISOString() }
        } else {
          // draft, or rejected and fixed → a NEW order request
          if (!String(row.party || '').trim() || !String(row.article || '').trim()) {
            alert('Fill in at least Party and Article before submitting.')
            return
          }
          nr[ri] = { ...row, submitForApproval: true, requestEdit: false, approvalStatus: 'pending',
            rejectionReason: '', submittedOn: new Date().toISOString(), receivedAt: new Date().toISOString() }
        }
      } else {
        // Unsubmit
        if (st === 'edit-request') {
          // Withdraw the edit → cells go back to what the order has
          nr[ri] = { ...restoreOriginals(row), submitForApproval: false, requestEdit: false, approvalStatus: 'approved',
            editHistory: {}, editRequestedOn: '', submittedOn: '', receivedAt: '' }
        } else if (st === 'pending') {
          nr[ri] = { ...row, submitForApproval: false, approvalStatus: 'draft', submittedOn: '', receivedAt: '' }
        } else return
      }

    } else if (ci === 1) {
      // REQUEST EDIT — only for rows that are already orders
      if (st !== 'approved' && st !== 'edit-accepted') {
        alert(st === 'pending' || st === 'edit-request'
          ? 'This row is waiting for the office. Untick "Submit" first if you need to change it.'
          : 'This row is not an order yet — you can edit it directly.')
        return
      }
      nr[ri] = checked
        ? { ...row, requestEdit: true,  editHistory: row.editHistory || {}, editRequestedOn: row.editRequestedOn || new Date().toISOString() }
        // Cancel the edit → put the original values back so the sheet matches the order
        : { ...restoreOriginals(row), requestEdit: false, editHistory: {}, editRequestedOn: '' }

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

  // Column widths: dragged on the header border, remembered per sheet in this
  // browser, and never changed by pasting — long text wraps inside the cell.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(widthsKey) || 'null')
      if (Array.isArray(saved) && saved.length) setColumnWidths(SHEET_COL_WIDTH_DEFAULTS.map((d, i) => (typeof saved[i] === 'number' && saved[i] >= 40 ? saved[i] : d)))
    } catch {}
  }, [widthsKey])
  useEffect(() => {
    const mm = (e: MouseEvent) => {
      const r = resizeRef.current; if (!r) return
      const w = Math.max(40, r.startW + (e.clientX - r.startX))
      setColumnWidths(p => { if (p[r.col] === w) return p; const n = [...p]; n[r.col] = w; return n })
    }
    const up = () => {
      setIsSelecting(false); setSelectionStart(null)
      if (resizeRef.current) {
        resizeRef.current = null; setResizingColumn(null)
        document.body.style.cursor = ''; document.body.style.userSelect = ''
        setColumnWidths(p => { try { localStorage.setItem(widthsKey, JSON.stringify(p)) } catch {} return p })
      }
    }
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', up) }
  }, [widthsKey])

  const extendSel = (nr: number, nc: number) => { const a=anchorCell||selectedCell;if(!a)return;if(!anchorCell)setAnchorCell(a);setSelectedRange({startRow:Math.min(a.row,nr),startCol:Math.min(a.col,nc),endRow:Math.max(a.row,nr),endCol:Math.max(a.col,nc)});setSelectedCell({row:nr,col:nc}) }
  const addUndo  = useCallback(()=>{setUndoStack(p=>[...p.slice(-19),rows]);setRedoStack([])}, [rows])

  const updateRows = useCallback((newRows: any[], changedIdx?: number) => {
    addUndo(); setRows(newRows)
    if (changedIdx !== undefined) saveRow(changedIdx, newRows[changedIdx])
  }, [addUndo, saveRow])

  // Undo / redo change cell values only — never a row's status, and never a
  // locked row — and every row that changes is saved, so the screen and the
  // database stay the same. Rows deleted since then stay deleted.
  const applySnapshot = (snap: any[]) => {
    const cur: Record<string, any> = {}
    rows.forEach(r => { cur[keyOf(r)] = r })
    const next: any[] = []
    const changed: number[] = []
    for (const old of snap) {
      const k = keyOf(old)
      const now = cur[k]
      if (!now) continue                          // deleted since → keep deleted
      if (old === now || isRowLocked(now)) { next.push(now); continue }
      const merged: any = { ...old }
      for (const key of STATUS_KEYS) merged[key] = now[key]
      merged.id = idsRef.current[k] || now.id
      merged.editHistory = now.requestEdit ? { ...(old.editHistory || {}), ...(now.editHistory || {}) } : (now.editHistory || {})
      next.push(merged); changed.push(next.length - 1)
    }
    // rows added after the snapshot stay (they may already hold data)
    const inSnap = new Set(snap.map(keyOf))
    rows.forEach(r => { if (!inSnap.has(keyOf(r))) next.push(r) })
    setRows(next)
    changed.forEach(i => saveRow(i, next[i]))
  }
  const handleUndo = () => { if(!undoStack.length)return;setRedoStack(p=>[...p,rows]);setUndoStack(p=>p.slice(0,-1));applySnapshot(undoStack[undoStack.length-1]) }
  const handleRedo = () => { if(!redoStack.length)return;setUndoStack(p=>[...p,rows]);setRedoStack(p=>p.slice(0,-1));applySnapshot(redoStack[redoStack.length-1]) }

  // Write one cell the way a typed edit would (keeps the edit history)
  const writeCell = (row: any, ci: number, value: any) => {
    const oldVal = getCellValue(row, ci)
    if (String(oldVal ?? '') === String(value ?? '')) return row
    return { ...setCellValueInRow(row, ci, value), editHistory: trackEdit(row, ci, oldVal) }
  }
  const canWrite = (row: any, ci: number) => !!row && !isReadonlyColumn(ci) && !isCheckboxColumn(ci) && !isRowLocked(row)

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
    if(selectedRange){for(let r=selectedRange.startRow;r<=selectedRange.endRow;r++)for(let c=selectedRange.startCol;c<=selectedRange.endCol;c++)if(canWrite(nr[r],c)){nr[r]=writeCell(nr[r],c,'');ch.add(r)}}
    else if(selectedCell&&canWrite(rows[selectedCell.row],selectedCell.col)){nr[selectedCell.row]=writeCell(nr[selectedCell.row],selectedCell.col,'');ch.add(selectedCell.row)}
    if(ch.size){addUndo();setRows(nr);ch.forEach(i=>saveRow(i,nr[i]))}
  }

  const handlePaste = async () => {
    if(!selectedCell)return
    const pasteData = async()=>{try{const t=(await navigator.clipboard.readText()).replace(/\r/g,'').replace(/\n+$/,'');const d=t.split('\n').map(r=>r.split('\t'));return t&&d.length&&d[0].length?d:copiedData}catch{return copiedData}}
    const data=await pasteData();if(!data.length)return
    // Locked rows (waiting for / already approved) and the checkbox / office
    // columns are skipped, exactly like typing.
    const nr=[...rows];let cr=selectedCell.row;const ch=new Set<number>();let skipped=0
    for(const rd of data){if(cr>=nr.length)nr.push(blankRow());let cc=selectedCell.col;for(const cv of rd){if(cc<SHEET_COL_HEADERS.length){if(canWrite(nr[cr],cc)){const before=nr[cr];nr[cr]=writeCell(nr[cr],cc,cv);if(nr[cr]!==before)ch.add(cr)}else if(!isCheckboxColumn(cc)&&!isReadonlyColumn(cc))skipped++};cc++};cr++}
    // brand-new rows that got nothing stay out
    while(nr.length>rows.length&&!ch.has(nr.length-1))nr.pop()
    if(ch.size){addUndo();setRows(nr);ch.forEach(i=>saveRow(i,nr[i]))}
    if(skipped)alert(`${skipped} cell(s) were not pasted because their rows are locked. Tick "Request Edit" on an approved row to change it.`)
  }

  const handleDeleteCells = () => {
    const nr=[...rows];const ch=new Set<number>()
    if(selectedRange){for(let r=selectedRange.startRow;r<=selectedRange.endRow;r++)for(let c=selectedRange.startCol;c<=selectedRange.endCol;c++)if(canWrite(nr[r],c)){nr[r]=writeCell(nr[r],c,'');ch.add(r)}}
    else if(selectedCell&&canWrite(nr[selectedCell.row],selectedCell.col)){nr[selectedCell.row]=writeCell(nr[selectedCell.row],selectedCell.col,'');ch.add(selectedCell.row)}
    if(ch.size){addUndo();setRows(nr);ch.forEach(i=>saveRow(i,nr[i]))}
  }

  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandlerRef.current(e)
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])
  useEffect(()=>{
    keyHandlerRef.current=(e:KeyboardEvent)=>{
      if(editingCell)return
      // typing in the Find box (or any other field) must work normally
      const t=e.target as HTMLElement|null
      if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable))return
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
  })

  useEffect(()=>{if(editingCell&&inputRef.current){inputRef.current.focus();inputRef.current.select()}},[editingCell])

  const handleColResize=(ci:number,e:React.MouseEvent)=>{e.preventDefault();e.stopPropagation();resizeRef.current={col:ci,startX:e.clientX,startW:columnWidths[ci]};setResizingColumn(ci);document.body.style.cursor='col-resize';document.body.style.userSelect='none'}
  const resetColWidths=()=>{setColumnWidths(SHEET_COL_WIDTH_DEFAULTS);try{localStorage.removeItem(widthsKey)}catch{}}
  const onMouseDown=(r:number,c:number)=>{if(isCheckboxColumn(c)||isReadonlyColumn(c))return;setIsSelecting(true);setSelectionStart({row:r,col:c});setSelectedCell({row:r,col:c});setSelectedRange(null)}
  const onMouseEnter=(r:number,c:number)=>{if(!isSelecting||!selectionStart||isCheckboxColumn(c)||isReadonlyColumn(c))return;setSelectedRange({startRow:Math.min(selectionStart.row,r),startCol:Math.min(selectionStart.col,c),endRow:Math.max(selectionStart.row,r),endCol:Math.max(selectionStart.col,c)})}
  const onClick=(r:number,c:number)=>{if(editingCell?.row===r&&editingCell?.col===c)return;if(isCheckboxColumn(c)||isReadonlyColumn(c))return;setSelectedCell({row:r,col:c});setSelectedRange(null);setAnchorCell(null)}
  const onDblClick=(r:number,c:number)=>{if(isCheckboxColumn(c)||isReadonlyColumn(c))return;if(isRowLocked(rows[r])){alert('Row is locked — tick Request Edit to unlock.');return};setEditingCell({row:r,col:c});setEditValue(String(getCellValue(rows[r],c)||''))}

  // Returns the rows after the edit, so Enter-on-last-row can add a new row
  // on top of them (it used to start from the old rows and wipe the value
  // just typed off the screen — a later save of that row then erased it).
  const handleCellBlur=():any[]=>{
    if(!editingCell)return rows
    const row=rows[editingCell.row];const oldVal=getCellValue(row,editingCell.col)
    if(String(oldVal??'')===editValue){setEditingCell(null);return rows}
    const nr=[...rows]
    // BUG FIX: track edit history before overwriting
    const editHistory = trackEdit(row, editingCell.col, oldVal)
    nr[editingCell.row]={...setCellValueInRow(row,editingCell.col,editValue), editHistory}
    addUndo();setRows(nr);saveRow(editingCell.row,nr[editingCell.row]);setEditingCell(null)
    return nr
  }

  const handleKeyDown=(e:React.KeyboardEvent)=>{
    if(!editingCell)return
    if(e.key==='Enter'){e.preventDefault();const cur=handleCellBlur();const nr=editingCell.row+1;if(nr<cur.length){setTimeout(()=>{setSelectedCell({row:nr,col:editingCell.col});if(!isRowLocked(rows[nr])&&!isReadonlyColumn(editingCell.col)){setEditingCell({row:nr,col:editingCell.col});setEditValue(String(getCellValue(rows[nr],editingCell.col)||''))}},50)}else{const nrs=[...cur,blankRow()];setRows(nrs);   /* saved once something is typed in it */setTimeout(()=>{setSelectedCell({row:nr,col:editingCell.col});setEditingCell({row:nr,col:editingCell.col});setEditValue('')},100)}}
    else if(e.key==='Escape'){setEditingCell(null);setEditValue('')}
    else if(e.key==='Tab'){e.preventDefault();handleCellBlur();const nc=editingCell.col+1;if(nc<SHEET_COL_HEADERS.length){setTimeout(()=>{setSelectedCell({row:editingCell.row,col:nc});if(!isReadonlyColumn(nc)&&!isCheckboxColumn(nc)){setEditingCell({row:editingCell.row,col:nc});setEditValue(String(getCellValue(rows[editingCell.row],nc)||''))}},50)}}
  }

  const addRow=()=>{const nr=[...rows,blankRow()];const i=nr.length-1;addUndo();setRows(nr);saveRow(i,nr[i])}
  const deleteRow=async()=>{
    if(!selectedCell||rows.length===1)return
    const row=rows[selectedCell.row]
    const st=row.approvalStatus||'draft'
    if(row.orderNumber||(st!=='draft'&&st!=='rejected')){alert(`This row is "${st}"${row.orderNumber?` (order ${row.orderNumber})`:''} and can't be deleted here — ask the office.`);return}
    if(!confirm('Delete this row?'))return
    const k=keyOf(row)
    // stop any pending save of this row, wait for one already running
    if(saveTimerRef.current[k]){clearTimeout(saveTimerRef.current[k]);delete saveTimerRef.current[k]}
    deletedRef.current.add(k)
    if(inflightRef.current[k]){try{await inflightRef.current[k]}catch{}}
    const id=idsRef.current[k]||row.id
    if(id){
      const res=await fetch('/api/sheet-rows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete_row',id})}).then(r=>r.json()).catch(()=>({ok:false,error:'Network error'}))
      if(!res.ok){deletedRef.current.delete(k);alert(res.error||'Could not delete the row');return}
    }
    setUndoStack([]);setRedoStack([])   // a deleted row can't be brought back by Undo
    setRows(prev=>prev.filter(r=>keyOf(r)!==k));setSelectedCell(null)
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
          <button className="small" onClick={resetColWidths} title="Put all column widths back to default">Reset widths</button>
        </div>

        {showFind&&(
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8,padding:8,background:'#f5f5f5',borderRadius:4}}>
            <input value={findText} onChange={e=>setFindText(e.target.value)} placeholder="Find in sheet…" style={{flex:1,padding:'4px 8px',fontSize:12}} autoFocus/>
            <button className="small" onClick={()=>setShowFind(false)}>Close</button>
          </div>
        )}

        {/* Grid */}
        <div ref={gridRef} style={{width:'100%',maxHeight:'calc(100vh - 270px)',overflow:'auto',border:'1px solid #ddd',borderRadius:6,background:'#fff',userSelect:'none'}}>
          <table style={{borderCollapse:'separate',borderSpacing:0,tableLayout:'fixed',width:46+columnWidths.reduce((a,b)=>a+b,0),fontSize:12}}>
            <colgroup>
              <col style={{width:46}}/>
              {columnWidths.map((w,i)=><col key={i} style={{width:w}}/>)}
            </colgroup>
            <thead>
              <tr>
                <th style={{...STH,width:46,position:'sticky',left:0,top:0,zIndex:5}}/>
                {SHEET_COL_HEADERS.map((_,i)=><th key={i} style={{...STH,width:columnWidths[i],position:'sticky',top:0,zIndex:3}}>{toExcelColLabel(i)}</th>)}
              </tr>
              <tr>
                <th style={{...STH2,width:46,position:'sticky',left:0,top:22,zIndex:5}}/>
                {SHEET_COL_HEADERS.map((h,i)=>(
                  <th key={i} style={{...STH2,width:columnWidths[i],position:'sticky',top:22,zIndex:3,overflow:'visible',whiteSpace:'normal',height:'auto',verticalAlign:'top'}} title={h}>
                    <div style={{position:'relative',display:'flex',alignItems:'flex-start',minHeight:18}}>
                      <span style={{flex:1,overflow:'hidden',wordBreak:'break-word',lineHeight:1.3,fontSize:11}}>{h}</span>
                      <div onMouseDown={e=>handleColResize(i,e)} onDoubleClick={e=>{e.stopPropagation();setColumnWidths(p=>{const n=[...p];n[i]=SHEET_COL_WIDTH_DEFAULTS[i];try{localStorage.setItem(widthsKey,JSON.stringify(n))}catch{}return n})}} title="Drag to resize · double-click to reset" style={{position:'absolute',right:-6,top:-6,bottom:-6,width:10,cursor:'col-resize',zIndex:10,background:resizingColumn===i?'#137E43':'transparent'}}/>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {rows.map((row,ri)=>(
                <tr key={keyOf(row)||ri} className={getRowClass(row)}>
                  <th style={{position:'sticky',left:0,zIndex:2,width:46,textAlign:'center',background:'#f7f8fa',fontWeight:500,color:'#999',borderRight:'1px solid #e6e9ef',borderBottom:'1px solid #e6e9ef',padding:'4px 6px',minHeight:30,verticalAlign:'top'}}>{ri+1}</th>
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
                        style={{borderRight:'1px solid #e6e9ef',borderBottom:'1px solid #e6e9ef',padding:'4px 6px',whiteSpace:isRO?'nowrap':'pre-wrap',wordBreak:'break-word',overflow:'hidden',textOverflow:'ellipsis',verticalAlign:'top',minHeight:30,lineHeight:1.4,
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
