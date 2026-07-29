// Spreadsheet constants and utilities

export const SHEET_COL_HEADERS = [
  'Submit for Approval', 'Request Edit', 'Party', 'Sub Party', 'Sales Person',
  'Article', 'Blend', 'Width', 'GSM', 'Color', 'Lab No.', 'Lot No.', 'Challan No.',
  'Qty (Kg)', 'Qty (Mtr.)', 'No. of Ta', 'Type of Finish', 'Type of Packing',
  'Remarks', 'Hold Reason', 'Order Number', 'Process', 'Delivery Date',
  'Current Stage', 'Approval Status', 'Rejection Reason', 'Sent At', 'Received At'
]

export const SHEET_COL_WIDTH_DEFAULTS = [
  56, 56, 150, 140, 130, 170, 115, 86, 86, 120,
  104, 104, 112, 96, 96, 88, 132, 132, 260, 220,
  120, 130, 130, 130, 120, 220, 150, 150
]

export const SHEET_ALL_KEYS = [
  'submitForApproval', 'requestEdit', 'party', 'subParty', 'salesPerson',
  'article', 'blend', 'width', 'gsm', 'color', 'labNo', 'lotNo', 'challanNo',
  'qtyKg', 'qtyMtr', 'noOfTa', 'typeOfFinish', 'typeOfPacking', 'remarks',
  'holdReason', 'orderNumber', 'process', 'deliveryDate', 'currentStage',
  'approvalStatus', 'rejectionReason', 'submittedOn', 'receivedAt'
]

// Columns the party can never edit — set by system or admin only
export const SHEET_READONLY_KEYS = [
  'holdReason', 'orderNumber', 'process', 'deliveryDate',
  'currentStage', 'approvalStatus', 'rejectionReason', 'submittedOn', 'receivedAt'
]

export const SHEET_NUMERIC_COLS = [7, 8, 13, 14, 15]

export const toExcelColLabel = (num: number): string => {
  let n = num + 1, out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out || 'A'
}

export const createBlankRow = (): any => ({
  party: '', subParty: '', salesPerson: '', article: '', blend: '', width: '', gsm: '',
  color: '', labNo: '', lotNo: '', challanNo: '', qtyKg: '', qtyMtr: '', noOfTa: '',
  typeOfFinish: '', typeOfPacking: '', remarks: '', holdReason: '', orderNumber: '',
  process: '', deliveryDate: '', currentStage: '', approvalStatus: 'draft',
  rejectionReason: '', submittedOn: '', receivedAt: '',
  submitForApproval: false, requestEdit: false, editHistory: {},
})

export const getCellValue = (row: any, colIndex: number): any =>
  row[SHEET_ALL_KEYS[colIndex]] ?? ''

export const setCellValueInRow = (row: any, colIndex: number, value: any): any =>
  ({ ...row, [SHEET_ALL_KEYS[colIndex]]: value })

export const isReadonlyColumn = (colIndex: number): boolean =>
  SHEET_READONLY_KEYS.includes(SHEET_ALL_KEYS[colIndex])

export const isCheckboxColumn = (colIndex: number): boolean =>
  colIndex === 0 || colIndex === 1

// ── isRowLocked ────────────────────────────────────────────────────────────
//
// Rule: requestEdit=true ALWAYS unlocks, regardless of approvalStatus.
// This must be checked FIRST before any status check.
//
// Locked states (no requestEdit):
//   pending      → waiting for admin, party cannot edit
//   edit-request → edit submitted, waiting for admin, party cannot edit
//   approved     → order created, locked until party requests edit
//   edit-accepted→ edit accepted, locked until party requests edit
//
// Unlocked states:
//   draft        → fresh row, freely editable
//   rejected     → admin rejected, party must fix and resubmit
//   any status   → when requestEdit=true (party is making an edit request)
//
export const isRowLocked = (row: any): boolean => {
  // requestEdit=true always overrides — unlocks regardless of status
  if (row.requestEdit) return false

  const status = row.approvalStatus || 'draft'

  // Waiting for admin decision → locked
  if (status === 'pending')       return true
  if (status === 'edit-request')  return true   // FIX: was missing, left edit-request rows unlocked

  // Finalized states → locked (party must tick Request Edit to change)
  if (status === 'approved')      return true
  if (status === 'edit-accepted') return true

  // draft and rejected → unlocked (party can freely edit or fix)
  // FIX: rejected was incorrectly locked before
  return false
}

// ── getRowClass ────────────────────────────────────────────────────────────
//
// requestEdit=true → always yellow, regardless of underlying status.
// This must be checked FIRST, same priority as isRowLocked.
//
export const getRowClass = (row: any): string => {
  // requestEdit overrides everything → yellow
  if (row.requestEdit) return 'sheet-row-edit-requested'

  const status = row.approvalStatus || 'draft'

  if (status === 'pending')        return 'sheet-row-pending'       // orange tint
  if (status === 'approved')       return 'sheet-row-approved'      // grey
  if (status === 'rejected')       return 'sheet-row-rejected'      // red tint
  if (status === 'edit-request')   return 'sheet-row-edit-requested' // FIX: was missing → yellow
  if (status === 'edit-accepted')  return 'sheet-row-edit-accepted' // green tint

  return 'sheet-row-draft' // white
}
