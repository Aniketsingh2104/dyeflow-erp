// Column configuration for supervisor inbox table

export interface ColumnConfig {
  id: string
  label: string
  visible: boolean
  width: number
  minWidth: number
  resizable: boolean
}

export const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'timestamp', label: 'TIMESTAMP', visible: true, width: 140, minWidth: 100, resizable: true },
  { id: 'party', label: 'PARTY', visible: true, width: 150, minWidth: 100, resizable: true },
  { id: 'subParty', label: 'SUB PARTY', visible: true, width: 120, minWidth: 80, resizable: true },
  { id: 'salesPerson', label: 'SALES PERSON', visible: true, width: 120, minWidth: 80, resizable: true },
  { id: 'article', label: 'ARTICLE', visible: true, width: 120, minWidth: 80, resizable: true },
  { id: 'blend', label: 'BLEND', visible: true, width: 100, minWidth: 80, resizable: true },
  { id: 'width', label: 'WIDTH', visible: true, width: 80, minWidth: 60, resizable: true },
  { id: 'gsm', label: 'GSM', visible: true, width: 70, minWidth: 50, resizable: true },
  { id: 'color', label: 'COLOR', visible: true, width: 100, minWidth: 80, resizable: true },
  { id: 'labNo', label: 'LAB NO.', visible: true, width: 100, minWidth: 70, resizable: true },
  { id: 'lotNo', label: 'LOT NO.', visible: true, width: 100, minWidth: 70, resizable: true },
  { id: 'challanNo', label: 'CHALLAN', visible: true, width: 100, minWidth: 70, resizable: true },
  { id: 'qtyKg', label: 'QTY(KG)', visible: true, width: 90, minWidth: 70, resizable: true },
  { id: 'qtyMtr', label: 'QTY(MTR)', visible: true, width: 90, minWidth: 70, resizable: true },
  { id: 'noOfTaka', label: 'TAKA', visible: true, width: 70, minWidth: 50, resizable: true },
  { id: 'typeOfFinish', label: 'FINISH', visible: true, width: 100, minWidth: 80, resizable: true },
  { id: 'typeOfPacking', label: 'PACKING', visible: true, width: 100, minWidth: 80, resizable: true },
  { id: 'remarks', label: 'REMARKS', visible: true, width: 200, minWidth: 100, resizable: true },
  { id: 'holdApproval', label: 'HOLD/APPROVAL', visible: true, width: 120, minWidth: 80, resizable: true },
  { id: 'holdReason', label: 'HOLD REMARK', visible: true, width: 200, minWidth: 100, resizable: true },
  { id: 'orderNumber', label: 'ORDER #', visible: true, width: 100, minWidth: 80, resizable: true },
  { id: 'supervisor', label: 'SUPERVISOR', visible: true, width: 120, minWidth: 80, resizable: true },
  { id: 'labRecheck', label: 'LAB RECHECK', visible: true, width: 100, minWidth: 80, resizable: true },
  { id: 'labRecheckAt', label: 'LAB RECHECK TIME', visible: true, width: 140, minWidth: 100, resizable: true },
  { id: 'labReceive', label: 'LAB RECEIVE', visible: true, width: 100, minWidth: 80, resizable: true },
  { id: 'labReceiveAt', label: 'LAB RECEIVE TIME', visible: true, width: 140, minWidth: 100, resizable: true },
  { id: 'greigeCheck', label: 'GREIGE RECHECK', visible: true, width: 120, minWidth: 80, resizable: true },
  { id: 'greigeCheckAt', label: 'GREIGE RECHECK TIME', visible: true, width: 140, minWidth: 100, resizable: true },
  { id: 'greigeRecheckFailReason', label: 'GREIGE CHECK REMARK', visible: true, width: 220, minWidth: 100, resizable: true },
  { id: 'routeMachine', label: 'ROUTE TEMPLATE & MACHINES', visible: true, width: 350, minWidth: 300, resizable: true }
]

export function saveColumnConfig(supervisorName: string, columns: ColumnConfig[]) {
  const key = `supervisor_columns_${supervisorName.toLowerCase().replace(/\s+/g, '_')}`
  localStorage.setItem(key, JSON.stringify(columns))
}

export function loadColumnConfig(supervisorName: string): ColumnConfig[] {
  const key = `supervisor_columns_${supervisorName.toLowerCase().replace(/\s+/g, '_')}`
  const stored = localStorage.getItem(key)
  
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {
      return [...DEFAULT_COLUMNS]
    }
  }
  
  return [...DEFAULT_COLUMNS]
}

export function resetColumnConfig(supervisorName: string) {
  const key = `supervisor_columns_${supervisorName.toLowerCase().replace(/\s+/g, '_')}`
  localStorage.removeItem(key)
  return [...DEFAULT_COLUMNS]
}
