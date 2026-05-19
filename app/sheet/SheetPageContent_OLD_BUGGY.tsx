'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  SHEET_COL_HEADERS,
  SHEET_COL_WIDTH_DEFAULTS,
  SHEET_ALL_KEYS,
  toExcelColLabel,
  createBlankRow,
  getCellValue,
  setCellValueInRow,
  getRowClass,
  isReadonlyColumn,
  isCheckboxColumn,
  isRowLocked
} from './utils'

interface CellRange {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

export default function SheetPageContent() {
  const searchParams = useSearchParams()
  const sheetId = searchParams.get('id')
  
  const [sheet, setSheet] = useState<any>(null)
  const [rows, setRows] = useState<any[]>([])
  const [selectedCell, setSelectedCell] = useState<{row: number, col: number} | null>(null)
  const [selectedRange, setSelectedRange] = useState<CellRange | null>(null)
  const [editingCell, setEditingCell] = useState<{row: number, col: number} | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saveStatus, setSaveStatus] = useState('Saved')
  const [undoStack, setUndoStack] = useState<any[]>([])
  const [redoStack, setRedoStack] = useState<any[]>([])
  const [copiedData, setCopiedData] = useState<any[][]>([])
  const [showFind, setShowFind] = useState(false)
  const [findText, setFindText] = useState('')
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState<{row: number, col: number} | null>(null)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Load sheet
  useEffect(() => {
    if (!sheetId) return
    const stored = localStorage.getItem('dyeflow_db')
    if (stored) {
      const db = JSON.parse(stored)
      const foundSheet = db.orderSheets?.find((s: any) => s.id === sheetId)
      if (foundSheet) {
        setSheet(foundSheet)
        setRows(foundSheet.rows || [createBlankRow()])
      }
    }
  }, [sheetId])

  // Focus input when editing
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCell])

  // Mouse selection handlers
  useEffect(() => {
    const handleMouseUp = () => {
      setIsSelecting(false)
      setSelectionStart(null)
    }

    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when editing
      if (editingCell) return
      
      // Ctrl+Z: Undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      // Ctrl+Y or Ctrl+Shift+Z: Redo
      if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        handleRedo()
      }
      // Ctrl+C: Copy
      if (e.ctrlKey && e.key === 'c') {
        e.preventDefault()
        handleCopy()
      }
      // Ctrl+X: Cut
      if (e.ctrlKey && e.key === 'x') {
        e.preventDefault()
        handleCut()
      }
      // Ctrl+V: Paste
      if (e.ctrlKey && e.key === 'v') {
        e.preventDefault()
        handlePaste()
      }
      // Ctrl+F: Find
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        setShowFind(true)
      }
      // Ctrl+S: Save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        saveSheet()
      }
      // Arrow keys: Navigation (extend selection with Shift)
      if (selectedCell && !editingCell) {
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (e.shiftKey && selectedCell.row > 0) {
            extendSelection(selectedCell.row - 1, selectedCell.col)
          } else if (selectedCell.row > 0) {
            setSelectedCell({ row: selectedCell.row - 1, col: selectedCell.col })
            setSelectedRange(null)
          }
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (e.shiftKey && selectedCell.row < rows.length - 1) {
            extendSelection(selectedCell.row + 1, selectedCell.col)
          } else if (selectedCell.row < rows.length - 1) {
            setSelectedCell({ row: selectedCell.row + 1, col: selectedCell.col })
            setSelectedRange(null)
          }
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          if (e.shiftKey && selectedCell.col > 0) {
            extendSelection(selectedCell.row, selectedCell.col - 1)
          } else if (selectedCell.col > 0) {
            setSelectedCell({ row: selectedCell.row, col: selectedCell.col - 1 })
            setSelectedRange(null)
          }
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          if (e.shiftKey && selectedCell.col < SHEET_COL_HEADERS.length - 1) {
            extendSelection(selectedCell.row, selectedCell.col + 1)
          } else if (selectedCell.col < SHEET_COL_HEADERS.length - 1) {
            setSelectedCell({ row: selectedCell.row, col: selectedCell.col + 1 })
            setSelectedRange(null)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingCell, selectedCell, rows.length, undoStack, redoStack, selectedRange])

  // Extend selection helper
  const extendSelection = (newRow: number, newCol: number) => {
    if (!selectedCell) return
    
    setSelectedRange({
      startRow: Math.min(selectedCell.row, newRow),
      startCol: Math.min(selectedCell.col, newCol),
      endRow: Math.max(selectedCell.row, newRow),
      endCol: Math.max(selectedCell.col, newCol)
    })
  }

  // Auto-save
  const saveSheet = useCallback(() => {
    if (!sheet) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    
    saveTimerRef.current = setTimeout(() => {
      const stored = localStorage.getItem('dyeflow_db')
      if (stored) {
        const db = JSON.parse(stored)
        const idx = db.orderSheets?.findIndex((s: any) => s.id === sheet.id)
        if (idx !== -1) {
          db.orderSheets[idx].rows = rows
          localStorage.setItem('dyeflow_db', JSON.stringify(db))
          setSaveStatus('Saved just now')
          setTimeout(() => setSaveStatus('Saved'), 2000)
        }
      }
    }, 500)
  }, [sheet, rows])

  const addToUndoStack = useCallback((newRows: any[]) => {
    setUndoStack(prev => [...prev.slice(-19), rows]) // Keep last 20
    setRedoStack([]) // Clear redo on new action
  }, [rows])

  const updateRows = useCallback((newRows: any[], addToUndo = true) => {
    if (addToUndo) {
      addToUndoStack(newRows)
    }
    setRows(newRows)
    setSaveStatus('Unsaved changes...')
  }, [addToUndoStack])

  // PHASE 5: Undo/Redo
  const handleUndo = () => {
    if (undoStack.length === 0) return
    const previousState = undoStack[undoStack.length - 1]
    setRedoStack(prev => [...prev, rows])
    setUndoStack(prev => prev.slice(0, -1))
    setRows(previousState)
    setSaveStatus('Unsaved changes...')
    saveSheet()
  }

  const handleRedo = () => {
    if (redoStack.length === 0) return
    const nextState = redoStack[redoStack.length - 1]
    setUndoStack(prev => [...prev, rows])
    setRedoStack(prev => prev.slice(0, -1))
    setRows(nextState)
    setSaveStatus('Unsaved changes...')
    saveSheet()
  }

  // PHASE 4: Copy/Cut/Paste
  const handleCopy = () => {
    if (!selectedCell && !selectedRange) return
    
    const data: any[][] = []
    if (selectedRange) {
      for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
        const rowData: any[] = []
        for (let c = selectedRange.startCol; c <= selectedRange.endCol; c++) {
          rowData.push(getCellValue(rows[r], c))
        }
        data.push(rowData)
      }
    } else if (selectedCell) {
      data.push([getCellValue(rows[selectedCell.row], selectedCell.col)])
    }
    
    setCopiedData(data)
    
    // Also copy to clipboard
    const text = data.map(row => row.join('\t')).join('\n')
    navigator.clipboard.writeText(text)
  }

  const handleCut = () => {
    handleCopy()
    
    if (selectedRange) {
      const newRows = [...rows]
      for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
        for (let c = selectedRange.startCol; c <= selectedRange.endCol; c++) {
          if (!isReadonlyColumn(c)) {
            newRows[r] = setCellValueInRow(newRows[r], c, '')
          }
        }
      }
      updateRows(newRows)
      saveSheet()
    } else if (selectedCell && !isReadonlyColumn(selectedCell.col)) {
      const newRows = [...rows]
      newRows[selectedCell.row] = setCellValueInRow(newRows[selectedCell.row], selectedCell.col, '')
      updateRows(newRows)
      saveSheet()
    }
  }

  const handlePaste = async () => {
    if (!selectedCell) return
    
    try {
      const clipboardText = await navigator.clipboard.readText()
      const clipboardData = clipboardText.split('\n').map(row => row.split('\t'))
      
      const dataToUse = clipboardData.length > 0 && clipboardData[0].length > 0 ? clipboardData : copiedData
      
      if (dataToUse.length === 0) return
      
      const newRows = [...rows]
      let currentRow = selectedCell.row
      
      for (const rowData of dataToUse) {
        if (currentRow >= rows.length) {
          newRows.push(createBlankRow())
        }
        
        let currentCol = selectedCell.col
        for (const cellValue of rowData) {
          if (currentCol < SHEET_COL_HEADERS.length && !isReadonlyColumn(currentCol)) {
            newRows[currentRow] = setCellValueInRow(newRows[currentRow], currentCol, cellValue)
          }
          currentCol++
        }
        currentRow++
      }
      
      updateRows(newRows)
      saveSheet()
    } catch (err) {
      if (copiedData.length === 0) return
      
      const newRows = [...rows]
      let currentRow = selectedCell.row
      
      for (const rowData of copiedData) {
        if (currentRow >= rows.length) {
          newRows.push(createBlankRow())
        }
        
        let currentCol = selectedCell.col
        for (const cellValue of rowData) {
          if (currentCol < SHEET_COL_HEADERS.length && !isReadonlyColumn(currentCol)) {
            newRows[currentRow] = setCellValueInRow(newRows[currentRow], currentCol, cellValue)
          }
          currentCol++
        }
        currentRow++
      }
      
      updateRows(newRows)
      saveSheet()
    }
  }

  // Cell click with drag selection support
  const handleCellMouseDown = (rowIndex: number, colIndex: number, e: React.MouseEvent) => {
    const row = rows[rowIndex]
    
    if (isRowLocked(row) && !isCheckboxColumn(colIndex)) {
      alert('Row is locked. Tick "Request Edit" to modify.')
      return
    }
    
    if (isCheckboxColumn(colIndex)) {
      const newRows = [...rows]
      const val = getCellValue(row, colIndex)
      const newValue = !val
      newRows[rowIndex] = setCellValueInRow(row, colIndex, newValue)
      
      if (colIndex === 0 && newValue) {
        newRows[rowIndex] = { ...newRows[rowIndex], approvalStatus: 'pending', submittedOn: new Date().toISOString() }
      } else if (colIndex === 0 && !newValue) {
        newRows[rowIndex] = { ...newRows[rowIndex], approvalStatus: 'draft', submittedOn: '' }
      }
      
      updateRows(newRows)
      saveSheet()
      return
    }
    
    // Start selection
    setSelectedCell({ row: rowIndex, col: colIndex })
    setSelectionStart({ row: rowIndex, col: colIndex })
    setSelectedRange(null)
    setIsSelecting(true)
    
    // Don't start editing on mousedown, wait for click
    if (!isReadonlyColumn(colIndex)) {
      // Only edit on double-click or explicit action
      if (e.detail === 2) {
        setEditingCell({ row: rowIndex, col: colIndex })
        setEditValue(String(getCellValue(row, colIndex) || ''))
      }
    }
  }

  const handleCellMouseEnter = (rowIndex: number, colIndex: number) => {
    if (!isSelecting || !selectionStart) return
    
    setSelectedRange({
      startRow: Math.min(selectionStart.row, rowIndex),
      startCol: Math.min(selectionStart.col, colIndex),
      endRow: Math.max(selectionStart.row, rowIndex),
      endCol: Math.max(selectionStart.col, colIndex)
    })
  }

  const handleCellClick = (rowIndex: number, colIndex: number) => {
    const row = rows[rowIndex]
    
    if (isCheckboxColumn(colIndex) || isRowLocked(row) || isReadonlyColumn(colIndex)) {
      return
    }
    
    // Single click to select, double click handled in mousedown
    setSelectedCell({ row: rowIndex, col: colIndex })
  }

  const handleCellBlur = () => {
    if (!editingCell) return
    const newRows = [...rows]
    newRows[editingCell.row] = setCellValueInRow(rows[editingCell.row], editingCell.col, editValue)
    updateRows(newRows)
    setEditingCell(null)
    saveSheet()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!editingCell) return
    
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCellBlur()
      const nextRow = editingCell.row + 1
      if (nextRow < rows.length) {
        setTimeout(() => {
          setSelectedCell({ row: nextRow, col: editingCell.col })
          setEditingCell({ row: nextRow, col: editingCell.col })
          setEditValue(String(getCellValue(rows[nextRow], editingCell.col) || ''))
        }, 50)
      } else {
        addRow()
        setTimeout(() => {
          setSelectedCell({ row: nextRow, col: editingCell.col })
          setEditingCell({ row: nextRow, col: editingCell.col })
          setEditValue('')
        }, 100)
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null)
      setEditValue('')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      handleCellBlur()
      const nextCol = editingCell.col + 1
      if (nextCol < SHEET_COL_HEADERS.length) {
        setTimeout(() => {
          setSelectedCell({ row: editingCell.row, col: nextCol })
          if (!isReadonlyColumn(nextCol) && !isCheckboxColumn(nextCol)) {
            setEditingCell({ row: editingCell.row, col: nextCol })
            setEditValue(String(getCellValue(rows[editingCell.row], nextCol) || ''))
          }
        }, 50)
      }
    }
  }

  const addRow = () => {
    updateRows([...rows, createBlankRow()])
  }

  const deleteRow = () => {
    if (!selectedCell || rows.length === 1) return
    if (!confirm('Delete this row?')) return
    const newRows = rows.filter((_, i) => i !== selectedCell.row)
    updateRows(newRows)
    setSelectedCell(null)
    saveSheet()
  }

  // PHASE 3: Selection stats
  const getSelectionStats = () => {
    if (!selectedCell && !selectedRange) return { sum: 0, avg: 0, count: 0 }
    
    const values: number[] = []
    
    if (selectedRange) {
      for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
        for (let c = selectedRange.startCol; c <= selectedRange.endCol; c++) {
          const val = getCellValue(rows[r], c)
          const num = parseFloat(String(val))
          if (!isNaN(num)) values.push(num)
        }
      }
    } else if (selectedCell) {
      const val = getCellValue(rows[selectedCell.row], selectedCell.col)
      const num = parseFloat(String(val))
      if (!isNaN(num)) values.push(num)
    }
    
    const sum = values.reduce((a, b) => a + b, 0)
    const avg = values.length > 0 ? sum / values.length : 0
    const count = values.length
    
    return { sum, avg, count }
  }

  // Check if cell is in selected range
  const isCellInRange = (rowIndex: number, colIndex: number) => {
    if (!selectedRange) return false
    return rowIndex >= selectedRange.startRow && rowIndex <= selectedRange.endRow &&
           colIndex >= selectedRange.startCol && colIndex <= selectedRange.endCol
  }

  const stats = getSelectionStats()

  if (!sheet) {
    return (
      <div className="content">
        <div className="card">
          <div className="empty-state">
            Sheet not found. <Link href="/order-sheets">Go back</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">{sheet.title}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
              Assigned To: {sheet.assignedTo || '-'} | User ID: {sheet.userId} | Expiry: {sheet.expiryDate || 'N/A'}
            </div>
          </div>
          <Link href="/order-sheets"><button className="small">Logout</button></Link>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <span className="badge" style={{ background: '#fff', border: '1px solid #ddd' }}>Draft = white</span>
          <span className="badge" style={{ background: '#fff4e6', border: '1px solid #ddd' }}>Pending = orange</span>
          <span className="badge" style={{ background: '#f1f3f5', border: '1px solid #ddd' }}>Approved = grey</span>
          <span className="badge" style={{ background: '#fff8db', border: '1px solid #ddd' }}>Edit Requested = yellow</span>
          <span className="badge" style={{ background: '#e9f8ee', border: '1px solid #ddd' }}>Edit Accepted = green</span>
          <span className="badge" style={{ background: '#ffe9e9', border: '1px solid #ddd' }}>Rejected = red</span>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <button className="small primary" onClick={() => saveSheet()} title="Save changes (Ctrl+S)">Save Draft</button>
          <button className="small" onClick={handleUndo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)">Undo</button>
          <button className="small" onClick={handleRedo} disabled={redoStack.length === 0} title="Redo (Ctrl+Y)">Redo</button>
          <span style={{ width: '1px', height: '22px', background: '#ddd', margin: '0 3px' }}></span>
          <button className="small" onClick={handleCut} title="Cut (Ctrl+X)">Cut</button>
          <button className="small" onClick={handleCopy} title="Copy (Ctrl+C)">Copy</button>
          <button className="small" onClick={handlePaste} title="Paste (Ctrl+V)">Paste</button>
          <span style={{ width: '1px', height: '22px', background: '#ddd', margin: '0 3px' }}></span>
          <button className="small" onClick={addRow} title="Insert new row">Add Row</button>
          <button className="small" onClick={deleteRow} disabled={!selectedCell} title="Delete selected row">Delete Row</button>
          <span style={{ width: '1px', height: '22px', background: '#ddd', margin: '0 3px' }}></span>
          <button className="small" title="Bold (Ctrl+B)">B</button>
          <button className="small" title="Center align">Center</button>
          <button className="small" title="Middle align">Middle</button>
          <button className="small" title="Wrap text">Wrap</button>
          <span style={{ width: '1px', height: '22px', background: '#ddd', margin: '0 3px' }}></span>
          <button className="small" title="Filter columns">Filter</button>
          <button className="small" title="Toggle column resize">Resize Off</button>
          <button className="small" title="Show/hide columns">Columns</button>
          <span style={{ width: '1px', height: '22px', background: '#ddd', margin: '0 3px' }}></span>
          <button className="small" onClick={() => setShowFind(!showFind)} title="Find in sheet (Ctrl+F)">Find</button>
          <span style={{ width: '1px', height: '22px', background: '#ddd', margin: '0 3px' }}></span>
          <button className="small" title="Help">Help</button>
          <span style={{ fontSize: '12px', color: '#666', marginLeft: '6px', minWidth: '150px' }}>{saveStatus}</span>
        </div>

        {/* Find bar */}
        {showFind && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
            <input type="text" value={findText} onChange={(e) => setFindText(e.target.value)} placeholder="Find in sheet..." style={{ flex: 1, padding: '4px 8px', fontSize: '12px' }} />
            <button className="small" onClick={() => setShowFind(false)}>Close</button>
          </div>
        )}

        {/* Grid */}
        <div ref={gridRef} style={{ width: '100%', maxHeight: 'calc(100vh - 320px)', overflow: 'auto', border: '1px solid #ddd', borderRadius: '6px', background: '#fff', userSelect: 'none' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: 'max-content', minWidth: 'max-content', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ width: '46px', minWidth: '46px', height: '22px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#2d5fa5', background: '#eef3fb', borderRight: '1px solid #e6e9ef', borderBottom: '1px solid #e6e9ef', padding: '4px 6px', position: 'sticky', left: 0, top: 0, zIndex: 5 }}></th>
                {SHEET_COL_HEADERS.map((_, i) => (
                  <th key={i} style={{ width: `${SHEET_COL_WIDTH_DEFAULTS[i]}px`, minWidth: `${SHEET_COL_WIDTH_DEFAULTS[i]}px`, height: '22px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#2d5fa5', background: '#eef3fb', borderRight: '1px solid #e6e9ef', borderBottom: '1px solid #e6e9ef', padding: '4px 6px', position: 'sticky', top: 0, zIndex: 3 }}>
                    {toExcelColLabel(i)}
                  </th>
                ))}
              </tr>
              <tr>
                <th style={{ width: '46px', minWidth: '46px', height: '26px', textAlign: 'left', fontWeight: 600, color: '#1a1a18', background: '#f2f3f5', borderRight: '1px solid #e6e9ef', borderBottom: '1px solid #e6e9ef', padding: '4px 6px', position: 'sticky', left: 0, top: '22px', zIndex: 5 }}></th>
                {SHEET_COL_HEADERS.map((header, i) => (
                  <th key={i} style={{ width: `${SHEET_COL_WIDTH_DEFAULTS[i]}px`, minWidth: `${SHEET_COL_WIDTH_DEFAULTS[i]}px`, height: '26px', textAlign: 'left', fontWeight: 600, color: '#1a1a18', background: '#f2f3f5', borderRight: '1px solid #e6e9ef', borderBottom: '1px solid #e6e9ef', padding: '4px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', position: 'sticky', top: '22px', zIndex: 3 }} title={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClass(row)}>
                  <th style={{ position: 'sticky', left: 0, zIndex: 2, width: '46px', minWidth: '46px', textAlign: 'center', background: '#f7f8fa', fontWeight: 500, color: '#999', borderRight: '1px solid #e6e9ef', borderBottom: '1px solid #e6e9ef', padding: '4px 6px', height: '30px' }}>
                    {rowIndex + 1}
                  </th>
                  {SHEET_COL_HEADERS.map((_, colIndex) => {
                    const value = getCellValue(row, colIndex)
                    const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex
                    const isSelected = selectedCell?.row === rowIndex && selectedCell?.col === colIndex
                    const isInRange = isCellInRange(rowIndex, colIndex)
                    const isCheckbox = isCheckboxColumn(colIndex)
                    const isReadonly = isReadonlyColumn(colIndex)
                    const matchesFind = findText && String(value).toLowerCase().includes(findText.toLowerCase())
                    
                    return (
                      <td 
                        key={colIndex} 
                        onMouseDown={(e) => handleCellMouseDown(rowIndex, colIndex, e)}
                        onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
                        onClick={() => handleCellClick(rowIndex, colIndex)}
                        style={{ 
                          width: `${SHEET_COL_WIDTH_DEFAULTS[colIndex]}px`, 
                          minWidth: `${SHEET_COL_WIDTH_DEFAULTS[colIndex]}px`, 
                          borderRight: '1px solid #e6e9ef', 
                          borderBottom: '1px solid #e6e9ef', 
                          padding: '4px 6px', 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          verticalAlign: 'middle', 
                          height: '30px', 
                          cursor: isReadonly ? 'not-allowed' : isCheckbox ? 'default' : 'cell', 
                          outline: (isSelected || isInRange) ? '2px solid #137E43' : 'none', 
                          outlineOffset: (isSelected || isInRange) ? '-2px' : '0', 
                          background: matchesFind ? '#fff7c2' : (isSelected || isInRange) ? 'rgba(232,245,233,0.55)' : isReadonly ? '#f1f3f5' : 'inherit', 
                          color: isReadonly ? '#5a6470' : 'inherit' 
                        }}
                      >
                        {isCheckbox ? (
                          <input type="checkbox" checked={!!value} onChange={(e) => { e.stopPropagation(); const newRows = [...rows]; newRows[rowIndex] = setCellValueInRow(row, colIndex, e.target.checked); updateRows(newRows); saveSheet(); }} style={{ margin: 0, pointerEvents: 'auto' }} />
                        ) : isEditing ? (
                          <input ref={inputRef} type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} onKeyDown={handleKeyDown} style={{ width: '100%', height: '100%', border: 0, outline: 0, padding: 0, background: 'transparent', font: 'inherit', color: 'inherit' }} />
                        ) : (
                          <span>{String(value || '')}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Status Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 10px', border: '1px solid #ddd', borderTop: 'none', borderRadius: '0 0 6px 6px', background: '#f8faf9', fontSize: '12px' }}>
          <div>Row {selectedCell ? selectedCell.row + 1 : 1} of {rows.length} | Sum: {stats.sum.toFixed(2)} | Avg: {stats.avg.toFixed(2)} | Count: {stats.count}</div>
        </div>
      </div>
    </div>
  )
}
