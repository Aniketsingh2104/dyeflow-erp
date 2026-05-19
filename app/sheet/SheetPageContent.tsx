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
  const [rows, setRows] = useState<any[]>([]);
  const [columnWidths, setColumnWidths] = useState<number[]>(SHEET_COL_WIDTH_DEFAULTS)
  const [resizingColumn, setResizingColumn] = useState<number | null>(null)
  const [resizeStartX, setResizeStartX] = useState<number>(0)
  const [resizeStartWidth, setResizeStartWidth] = useState<number>(0)
  const [selectedCell, setSelectedCell] = useState<{row: number, col: number} | null>(null)
  const [selectedRange, setSelectedRange] = useState<CellRange | null>(null)
  const [anchorCell, setAnchorCell] = useState<{row: number, col: number} | null>(null)
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
  const tbodyRef = useRef<HTMLTableSectionElement>(null)
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Scroll selected cell into view
  const scrollCellIntoView = useCallback((rowIndex: number, colIndex: number) => {
    if (!gridRef.current) return

    const container = gridRef.current
    const cellSelector = `tbody tr:nth-child(${rowIndex + 1}) td:nth-child(${colIndex + 2})` // +1 for 0-index, +2 for row header
    const cell = container.querySelector(cellSelector) as HTMLElement
    
    if (!cell) return

    const containerRect = container.getBoundingClientRect()
    const cellRect = cell.getBoundingClientRect()

    // Calculate relative positions
    const cellTop = cellRect.top - containerRect.top + container.scrollTop
    const cellBottom = cellTop + cellRect.height
    const cellLeft = cellRect.left - containerRect.left + container.scrollLeft
    const cellRight = cellLeft + cellRect.width

    const viewportTop = container.scrollTop
    const viewportBottom = viewportTop + container.clientHeight
    const viewportLeft = container.scrollLeft
    const viewportRight = viewportLeft + container.clientWidth

    // Scroll vertically if needed
    if (cellTop < viewportTop) {
      // Cell is above viewport - scroll up
      container.scrollTop = cellTop - 50 // 50px padding
    } else if (cellBottom > viewportBottom) {
      // Cell is below viewport - scroll down
      container.scrollTop = cellBottom - container.clientHeight + 50 // 50px padding
    }

    // Scroll horizontally if needed
    if (cellLeft < viewportLeft) {
      // Cell is left of viewport - scroll left
      container.scrollLeft = cellLeft - 50 // 50px padding
    } else if (cellRight > viewportRight) {
      // Cell is right of viewport - scroll right
      container.scrollLeft = cellRight - container.clientWidth + 50 // 50px padding
    }
  }, [])

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
      setResizingColumn(null)
    }

    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  // Column resize handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (resizingColumn !== null) {
        const diff = e.clientX - resizeStartX
        const newWidth = Math.max(50, resizeStartWidth + diff) // Minimum width 50px
        
        setColumnWidths(prev => {
          const newWidths = [...prev]
          newWidths[resizingColumn] = newWidth
          return newWidths
        })
      }
    }

    if (resizingColumn !== null) {
      window.addEventListener('mousemove', handleMouseMove)
      return () => window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [resizingColumn, resizeStartX, resizeStartWidth])

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
      // Delete key: Clear selected cells
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        handleDeleteSelectedCells()
      }
      // Enter key: Start editing selected cell
      if (selectedCell && !editingCell && e.key === 'Enter') {
        e.preventDefault()
        console.log('🔵 Enter pressed! selectedCell:', selectedCell)
        const row = rows[selectedCell.row]
        const colIndex = selectedCell.col
        
        // Skip checkboxes and readonly
        if (isCheckboxColumn(colIndex) || isReadonlyColumn(colIndex)) {
          console.log('❌ Skipping - checkbox or readonly column')
          return
        }
        
        // Check if locked
        if (isRowLocked(row)) {
          alert('Row is locked. Tick "Request Edit" to modify.')
          return
        }
        
        // Start editing
        console.log('✅ Starting edit mode:', { row: selectedCell.row, col: selectedCell.col })
        setEditingCell({ row: selectedCell.row, col: selectedCell.col })
        setEditValue(String(getCellValue(row, selectedCell.col) || ''))
        console.log('✅ Edit state set!')
      }
      // Arrow keys: Navigation (extend selection with Shift)
      if (selectedCell && !editingCell) {
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (e.shiftKey && selectedCell.row > 0) {
            const newRow = selectedCell.row - 1
            extendSelection(newRow, selectedCell.col)
            scrollCellIntoView(newRow, selectedCell.col)
          } else if (selectedCell.row > 0) {
            const newRow = selectedCell.row - 1
            setSelectedCell({ row: newRow, col: selectedCell.col })
            setSelectedRange(null)
            setAnchorCell(null)
            scrollCellIntoView(newRow, selectedCell.col)
          }
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (e.shiftKey && selectedCell.row < rows.length - 1) {
            const newRow = selectedCell.row + 1
            extendSelection(newRow, selectedCell.col)
            scrollCellIntoView(newRow, selectedCell.col)
          } else if (selectedCell.row < rows.length - 1) {
            const newRow = selectedCell.row + 1
            setSelectedCell({ row: newRow, col: selectedCell.col })
            setSelectedRange(null)
            setAnchorCell(null)
            scrollCellIntoView(newRow, selectedCell.col)
          }
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          if (e.shiftKey && selectedCell.col > 0) {
            const newCol = selectedCell.col - 1
            extendSelection(selectedCell.row, newCol)
            scrollCellIntoView(selectedCell.row, newCol)
          } else if (selectedCell.col > 0) {
            const newCol = selectedCell.col - 1
            setSelectedCell({ row: selectedCell.row, col: newCol })
            setSelectedRange(null)
            setAnchorCell(null)
            scrollCellIntoView(selectedCell.row, newCol)
          }
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          if (e.shiftKey && selectedCell.col < SHEET_COL_HEADERS.length - 1) {
            const newCol = selectedCell.col + 1
            extendSelection(selectedCell.row, newCol)
            scrollCellIntoView(selectedCell.row, newCol)
          } else if (selectedCell.col < SHEET_COL_HEADERS.length - 1) {
            const newCol = selectedCell.col + 1
            setSelectedCell({ row: selectedCell.row, col: newCol })
            setSelectedRange(null)
            setAnchorCell(null)
            scrollCellIntoView(selectedCell.row, newCol)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingCell, selectedCell, rows.length, undoStack, redoStack, selectedRange, scrollCellIntoView])

  // Auto-focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCell])

  // Extend selection helper
  const extendSelection = (newRow: number, newCol: number) => {
    // Use anchorCell if it exists (for multi-step selection), otherwise use selectedCell
    const anchor = anchorCell || selectedCell
    if (!anchor) return
    
    // Set anchor if not already set
    if (!anchorCell) {
      setAnchorCell(anchor)
    }
    
    setSelectedRange({
      startRow: Math.min(anchor.row, newRow),
      startCol: Math.min(anchor.col, newCol),
      endRow: Math.max(anchor.row, newRow),
      endCol: Math.max(anchor.col, newCol)
    })
    
    // Update selected cell to the new position (for visual feedback)
    setSelectedCell({ row: newRow, col: newCol })
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

  // Auto-save when rows change
  useEffect(() => {
    if (rows.length > 0) {
      saveSheet()
    }
  }, [rows, saveSheet])

  const addToUndoStack = useCallback((newRows: any[]) => {
    setUndoStack(prev => [...prev.slice(-19), rows]) // Keep last 20
    setRedoStack([]) // Clear redo on new action
  }, [rows])

  // Handle double-click to start editing
  const handleCellDoubleClick = (rowIndex: number, colIndex: number) => {
    if (isCheckboxColumn(colIndex) || isReadonlyColumn(colIndex)) return
    
    const row = rows[rowIndex]
    if (isRowLocked(row)) {
      alert('Row is locked. Tick "Request Edit" to modify.')
      return
    }
    
    // Start editing with React state
    setEditingCell({ row: rowIndex, col: colIndex })
    setEditValue(String(getCellValue(row, colIndex) || ''))
  }


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
          if (!isReadonlyColumn(c) && !isRowLocked(newRows[r])) {
            newRows[r] = setCellValueInRow(newRows[r], c, '')
          }
        }
      }
      updateRows(newRows)
      saveSheet()
    } else if (selectedCell && !isReadonlyColumn(selectedCell.col) && !isRowLocked(rows[selectedCell.row])) {
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

  // Delete selected cells (Delete/Backspace key)
  const handleDeleteSelectedCells = () => {
    if (!selectedCell && !selectedRange) return
    
    const newRows = [...rows]
    let hasChanges = false
    
    if (selectedRange) {
      // Delete all cells in the selected range
      for (let r = selectedRange.startRow; r <= selectedRange.endRow; r++) {
        for (let c = selectedRange.startCol; c <= selectedRange.endCol; c++) {
          if (!isReadonlyColumn(c) && !isCheckboxColumn(c) && !isRowLocked(newRows[r])) {
            newRows[r] = setCellValueInRow(newRows[r], c, '')
            hasChanges = true
          }
        }
      }
    } else if (selectedCell) {
      // Delete single selected cell
      const { row, col } = selectedCell
      if (!isReadonlyColumn(col) && !isCheckboxColumn(col) && !isRowLocked(newRows[row])) {
        newRows[row] = setCellValueInRow(newRows[row], col, '')
        hasChanges = true
      }
    }
    
    if (hasChanges) {
      updateRows(newRows)
      saveSheet()
    }
  }

  // Start column resize
  const handleColumnResizeStart = (colIndex: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(colIndex)
    setResizeStartX(e.clientX)
    setResizeStartWidth(columnWidths[colIndex])
  }

  // Mouse selection handlers for drag-to-select
  const handleCellMouseDown = (rowIndex: number, colIndex: number, e: React.MouseEvent) => {
    if (isCheckboxColumn(colIndex) || isReadonlyColumn(colIndex)) {
      return
    }
    
    setIsSelecting(true)
    setSelectionStart({ row: rowIndex, col: colIndex })
    setSelectedCell({ row: rowIndex, col: colIndex })
    setSelectedRange(null)
  }

  const handleCellMouseEnter = (rowIndex: number, colIndex: number) => {
    if (!isSelecting || !selectionStart) return
    if (isCheckboxColumn(colIndex) || isReadonlyColumn(colIndex)) return
    
    setSelectedRange({
      startRow: Math.min(selectionStart.row, rowIndex),
      startCol: Math.min(selectionStart.col, colIndex),
      endRow: Math.max(selectionStart.row, rowIndex),
      endCol: Math.max(selectionStart.col, colIndex)
    })
  }

  const handleCellClick = (rowIndex: number, colIndex: number) => {
    // ✅ CRITICAL FIX: Skip if we're already editing this cell!
    // This prevents onClick from closing the input when you click inside it
    if (editingCell?.row === rowIndex && editingCell?.col === colIndex) {
      return
    }
    
    if (isCheckboxColumn(colIndex) || isReadonlyColumn(colIndex)) {
      return
    }
    
    setSelectedCell({ row: rowIndex, col: colIndex })
    setSelectedRange(null)
    setAnchorCell(null)
  }

  const handleCellBlur = () => {
    if (!editingCell) return
    
    const row = rows[editingCell.row]
    const colKey = SHEET_ALL_KEYS[editingCell.col]
    const oldValue = getCellValue(row, editingCell.col)
    const newValue = editValue
    
    console.log('📝 handleCellBlur called:', {
      rowIndex: editingCell.row,
      colIndex: editingCell.col,
      colKey,
      oldValue,
      newValue,
      requestEdit: row.requestEdit,
      approvalStatus: row.approvalStatus
    });
    
    // Check if value actually changed
    if (oldValue === newValue) {
      console.log('⏭️ Value unchanged, skipping');
      setEditingCell(null)
      return
    }
    
    const newRows = [...rows]
    
    // If this row has "Request Edit" checked and the value changed, track it in editHistory
    if (row.requestEdit && oldValue !== newValue) {
      console.log('✅ Tracking edit in history!');
      
      // Initialize editHistory if it doesn't exist
      if (!newRows[editingCell.row].editHistory) {
        newRows[editingCell.row].editHistory = {}
      }
      
      // Only store original value if not already tracked
      if (!newRows[editingCell.row].editHistory[colKey]) {
        newRows[editingCell.row].editHistory[colKey] = oldValue
        console.log(`💾 Stored original value for ${colKey}:`, oldValue);
      } else {
        console.log(`ℹ️ Original value for ${colKey} already tracked:`, newRows[editingCell.row].editHistory[colKey]);
      }
      
      // Also track when and who made the edit
      if (!newRows[editingCell.row].editRequestedOn) {
        newRows[editingCell.row].editRequestedOn = new Date().toISOString()
        newRows[editingCell.row].editRequestedBy = sheet.userId
      }
      
      newRows[editingCell.row].editReason = newRows[editingCell.row].editReason || 'Changes requested'
    } else {
      console.log('⚠️ NOT tracking - requestEdit:', row.requestEdit);
    }
    
    // Update the cell value
    newRows[editingCell.row] = setCellValueInRow(row, editingCell.col, newValue)
    
    console.log('💾 Final row data:', newRows[editingCell.row]);
    
    updateRows(newRows)
    setEditingCell(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!editingCell) return
    
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCellBlur()
      const nextRow = editingCell.row + 1
      if (nextRow < rows.length) {
        setTimeout(() => {
          const nextRowData = rows[nextRow]
          setSelectedCell({ row: nextRow, col: editingCell.col })
          // Check if next row is locked before editing
          if (!isRowLocked(nextRowData) && !isReadonlyColumn(editingCell.col)) {
            setEditingCell({ row: nextRow, col: editingCell.col })
            setEditValue(String(getCellValue(nextRowData, editingCell.col) || ''))
          }
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
                  <th key={i} style={{ width: `${columnWidths[i]}px`, minWidth: `${columnWidths[i]}px`, height: '22px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#2d5fa5', background: '#eef3fb', borderRight: '1px solid #e6e9ef', borderBottom: '1px solid #e6e9ef', padding: '4px 6px', position: 'sticky', top: 0, zIndex: 3 }}>
                    {toExcelColLabel(i)}
                  </th>
                ))}
              </tr>
              <tr>
                <th style={{ width: '46px', minWidth: '46px', height: '26px', textAlign: 'left', fontWeight: 600, color: '#1a1a18', background: '#f2f3f5', borderRight: '1px solid #e6e9ef', borderBottom: '1px solid #e6e9ef', padding: '4px 6px', position: 'sticky', left: 0, top: '22px', zIndex: 5 }}></th>
                {SHEET_COL_HEADERS.map((header, i) => (
                  <th key={i} style={{ width: `${columnWidths[i]}px`, minWidth: `${columnWidths[i]}px`, height: '26px', textAlign: 'left', fontWeight: 600, color: '#1a1a18', background: '#f2f3f5', borderRight: '1px solid #e6e9ef', borderBottom: '1px solid #e6e9ef', padding: '4px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', position: 'sticky', top: '22px', zIndex: 3, userSelect: 'none' }} title={header}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{header}</span>
                      <div 
                        onMouseDown={(e) => handleColumnResizeStart(i, e)}
                        style={{ 
                          position: 'absolute', 
                          right: '-3px', 
                          top: '-4px', 
                          bottom: '-4px', 
                          width: '6px', 
                          cursor: 'col-resize',
                          zIndex: 10,
                          background: 'transparent'
                        }}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClass(row)}>
                  <th style={{ position: 'sticky', left: 0, zIndex: 2, width: '46px', minWidth: '46px', textAlign: 'center', background: '#f7f8fa', fontWeight: 500, color: '#999', borderRight: '1px solid #e6e9ef', borderBottom: '1px solid #e6e9ef', padding: '4px 6px', height: '30px' }}>
                    {rowIndex + 1}
                  </th>
                  {SHEET_COL_HEADERS.map((_, colIndex) => {
                    const value = getCellValue(row, colIndex)
                    const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex
                    if (isEditing) {
                      console.log('🟢 RENDERING INPUT for row', rowIndex, 'col', colIndex, 'editValue:', editValue)
                    }
                    const isSelected = selectedCell?.row === rowIndex && selectedCell?.col === colIndex
                    const isInRange = isCellInRange(rowIndex, colIndex)
                    const isCheckbox = isCheckboxColumn(colIndex)
                    const isReadonly = isReadonlyColumn(colIndex)
                    const matchesFind = findText && String(value).toLowerCase().includes(findText.toLowerCase())
                    
                    return (
                      <td 
                        key={`${rowIndex}-${colIndex}`}
                        onMouseDown={(e) => handleCellMouseDown(rowIndex, colIndex, e)}
                        onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
                        onClick={() => handleCellClick(rowIndex, colIndex)}
                        onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                        style={{ 
                          width: `${columnWidths[colIndex]}px`, 
                          minWidth: `${columnWidths[colIndex]}px`, 
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
                          <input key="checkbox" type="checkbox" checked={!!value} onChange={(e) => { 
                            e.stopPropagation(); 
                            const newRows = [...rows]; 
                            const checked = e.target.checked;
                            
                            // Special handling for "Submit for Approval" checkbox (colIndex 0)
                            if (colIndex === 0) {
                              if (checked) {
                                // When checking: set status to pending and add timestamp
                                newRows[rowIndex] = {
                                  ...row,
                                  submitForApproval: true,
                                  approvalStatus: 'pending',
                                  submittedOn: new Date().toISOString(),
                                  submittedBy: sheet.userId
                                };
                                
                                // ✅ FIX: If this row has been edited (requestEdit + editHistory), create an editedOrders entry
                                if (row.requestEdit && row.editHistory && Object.keys(row.editHistory).length > 0) {
                                  const stored = localStorage.getItem('dyeflow_db')
                                  if (stored) {
                                    const db = JSON.parse(stored)
                                    
                                    // Initialize editedOrders array if it doesn't exist
                                    if (!db.editedOrders) {
                                      db.editedOrders = []
                                    }
                                    
                                    // Build oldValues from editHistory and newValues from current row
                                    const oldValues: Record<string, any> = {}
                                    const newValues: Record<string, any> = {}
                                    
                                    Object.keys(row.editHistory).forEach(key => {
                                      oldValues[key] = row.editHistory[key]
                                      newValues[key] = row[key]
                                    })
                                    
                                    // Create edited order entry
                                    const editedOrder = {
                                      id: `EDIT-${Date.now()}`,
                                      sheetId: sheet.id,
                                      linkedOrderId: row.orderNumber || row.party || `Row-${rowIndex + 1}`,
                                      rowId: row.rowId || `ROW-${Date.now()}-${rowIndex}`,
                                      requestedBy: row.editRequestedBy || sheet.userId,
                                      requestedAt: row.editRequestedOn || new Date().toISOString(),
                                      oldValues: oldValues,
                                      newValues: newValues,
                                      status: 'pending',
                                      rejectionReason: '',
                                      reviewedBy: '',
                                      reviewedAt: ''
                                    }
                                    
                                    db.editedOrders.push(editedOrder)
                                    localStorage.setItem('dyeflow_db', JSON.stringify(db))
                                    
                                    console.log('✅ Created editedOrders entry:', editedOrder)
                                  }
                                }
                              } else {
                                // When unchecking: revert to draft
                                newRows[rowIndex] = {
                                  ...row,
                                  submitForApproval: false,
                                  approvalStatus: 'draft',
                                  submittedOn: '',
                                  submittedBy: ''
                                };
                              }
                            } else {
                              // For "Request Edit" checkbox (colIndex 1)
                              if (colIndex === 1) {
                                if (checked) {
                                  // When checking Request Edit: initialize edit tracking and change status
                                  newRows[rowIndex] = {
                                    ...row,
                                    requestEdit: true,
                                    approvalStatus: row.approvalStatus === 'approved' ? 'approved' : row.approvalStatus,  // Keep current status
                                    editHistory: row.editHistory || {},  // Keep existing or init empty
                                    editRequestedOn: row.editRequestedOn || new Date().toISOString(),
                                    editRequestedBy: row.editRequestedBy || sheet.userId,
                                    editReason: row.editReason || ''
                                  };
                                  console.log('✅ Request Edit CHECKED - Row should be UNLOCKED now', newRows[rowIndex]);
                                } else {
                                  // When unchecking: clear edit tracking
                                  newRows[rowIndex] = {
                                    ...row,
                                    requestEdit: false,
                                    editHistory: {},
                                    editRequestedOn: '',
                                    editRequestedBy: '',
                                    editReason: ''
                                  };
                                  console.log('❌ Request Edit UNCHECKED - Row LOCKED again', newRows[rowIndex]);
                                }
                              } else {
                                // For other checkboxes, just set the value
                                newRows[rowIndex] = setCellValueInRow(row, colIndex, checked);
                              }
                            }
                            
                            updateRows(newRows); 
                            // saveSheet() removed - auto-save via useEffect handles this
                          }} style={{ margin: 0, pointerEvents: 'auto' }} />
                        ) : isEditing ? (
                          <input key={`edit-${rowIndex}-${colIndex}`} ref={inputRef} type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleCellBlur} onKeyDown={handleKeyDown} style={{ width: '100%', height: '100%', border: 0, outline: 0, padding: 0, background: 'transparent', font: 'inherit', color: 'inherit' }} autoFocus />
                        ) : (
                          <span key={`span-${rowIndex}-${colIndex}`}>{String(value || '')}</span>
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
