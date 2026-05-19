// Spreadsheet constants and utilities

// Column headers - exactly from original ERP
export const SHEET_COL_HEADERS = [
  'Submit for Approval', 'Request Edit', 'Party', 'Sub Party', 'Sales Person', 
  'Article', 'Blend', 'Width', 'GSM', 'Color', 'Lab No.', 'Lot No.', 'Challan No.', 
  'Qty (Kg)', 'Qty (Mtr.)', 'No. of Ta', 'Type of Finish', 'Type of Packing', 
  'Remarks', 'Hold Reason', 'Order Number', 'Process', 'Delivery Date', 
  'Current Stage', 'Approval Status', 'Rejection Reason', 'Sent At', 'Received At'
]

// Column widths - exactly from original ERP
export const SHEET_COL_WIDTH_DEFAULTS = [
  56, 56, 150, 140, 130, 170, 115, 86, 86, 120, 
  104, 104, 112, 96, 96, 88, 132, 132, 260, 220, 
  120, 130, 130, 130, 120, 220, 150, 150
]

// All column keys in order
export const SHEET_ALL_KEYS = [
  'submitForApproval', 'requestEdit', 'party', 'subParty', 'salesPerson',
  'article', 'blend', 'width', 'gsm', 'color', 'labNo', 'lotNo', 'challanNo',
  'qtyKg', 'qtyMtr', 'noOfTa', 'typeOfFinish', 'typeOfPacking', 'remarks',
  'holdReason', 'orderNumber', 'process', 'deliveryDate', 'currentStage',
  'approvalStatus', 'rejectionReason', 'submittedOn', 'receivedAt'
]

// Readonly columns
export const SHEET_READONLY_KEYS = [
  'holdReason', 'orderNumber', 'process', 'deliveryDate', 
  'currentStage', 'approvalStatus', 'rejectionReason', 'submittedOn', 'receivedAt'
]

// Numeric columns
export const SHEET_NUMERIC_COLS = [7, 8, 13, 14, 15]

// Convert column index to Excel letter
export const toExcelColLabel = (num: number): string => {
  let n = num + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out || 'A'
}

// ✅ UPDATED: Create blank row - now includes rowId for tracking edited orders
export const createBlankRow = (): any => ({
  rowId: `ROW-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // Unique row identifier
  party: '', subParty: '', salesPerson: '', article: '', blend: '', width: '', gsm: '',
  color: '', labNo: '', lotNo: '', challanNo: '', qtyKg: '', qtyMtr: '', noOfTa: '',
  typeOfFinish: '', typeOfPacking: '', remarks: '', holdReason: '', orderNumber: '',
  process: '', deliveryDate: '', currentStage: '', approvalStatus: 'draft',
  rejectionReason: '', submittedOn: '', receivedAt: ''
})

// Get cell value
export const getCellValue = (row: any, colIndex: number): any => {
  const key = SHEET_ALL_KEYS[colIndex]
  return row[key] ?? ''
}

// Set cell value
export const setCellValueInRow = (row: any, colIndex: number, value: any): any => {
  const key = SHEET_ALL_KEYS[colIndex]
  return { ...row, [key]: value }
}

// ✅ FIXED: Get row class - now checks requestEdit checkbox!
export const getRowClass = (row: any): string => {
  // Priority 1: Check if "Request Edit" is ticked (yellow)
  if (row.requestEdit) return 'sheet-row-edit-requested'
  
  // Priority 2: Check approval status
  const status = row.approvalStatus
  if (status === 'pending') return 'sheet-row-pending'
  if (status === 'approved') return 'sheet-row-approved'
  if (status === 'rejected') return 'sheet-row-rejected'
  if (status === 'edit-accepted') return 'sheet-row-edit-accepted'
  
  // Default: draft (white)
  return 'sheet-row-draft'
}

// Check if readonly
export const isReadonlyColumn = (colIndex: number): boolean => {
  return SHEET_READONLY_KEYS.includes(SHEET_ALL_KEYS[colIndex])
}

// Check if checkbox
export const isCheckboxColumn = (colIndex: number): boolean => {
  return colIndex === 0 || colIndex === 1
}

// Check if row locked
export const isRowLocked = (row: any): boolean => {
  if (row.approvalStatus === 'pending') return true
  if ((row.approvalStatus === 'approved' || row.approvalStatus === 'edit-accepted') && !row.requestEdit) return true
  return false
}
