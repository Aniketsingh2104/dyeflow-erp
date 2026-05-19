'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface SheetRow {
  party: string
  subParty: string
  [key: string]: any
}

interface OrderSheet {
  id: string
  title: string
  assignedTo: string
  userId: string
  rows: SheetRow[]
}

export default function ViewSheetPage() {
  const searchParams = useSearchParams()
  const sheetId = searchParams.get('id')
  const [sheet, setSheet] = useState<OrderSheet | null>(null)

  useEffect(() => {
    if (!sheetId) return
    
    const stored = localStorage.getItem('dyeflow_db')
    if (stored) {
      const db = JSON.parse(stored)
      const foundSheet = db.orderSheets?.find((s: OrderSheet) => s.id === sheetId)
      if (foundSheet) {
        setSheet(foundSheet)
      }
    }
  }, [sheetId])

  if (!sheetId) {
    return (
      <div className="content">
        <div className="card">
          <div className="empty-state">
            No sheet ID provided. <Link href="/order-sheets">Go back to Order Sheets</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!sheet) {
    return (
      <div className="content">
        <div className="card">
          <div className="empty-state">
            Sheet not found. <Link href="/order-sheets">Go back to Order Sheets</Link>
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
              Assigned To: {sheet.assignedTo || '-'} | User ID: {sheet.userId}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <Link href="/order-sheets">
              <button className="small">← Back to Sheets</button>
            </Link>
          </div>
        </div>

        <div style={{ padding: '40px', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--success)', marginBottom: '20px' }}>✅ Sheet Route is Working!</h2>
          <p style={{ fontSize: '14px', marginBottom: '10px' }}>
            <strong>Sheet ID:</strong> {sheet.id}
          </p>
          <p style={{ fontSize: '14px', marginBottom: '10px' }}>
            <strong>Title:</strong> {sheet.title}
          </p>
          <p style={{ fontSize: '14px', marginBottom: '30px' }}>
            <strong>Rows:</strong> {sheet.rows?.length || 0}
          </p>
          
          <div style={{ 
            background: '#e8f5e9', 
            padding: '20px', 
            borderRadius: '8px',
            marginBottom: '30px',
            maxWidth: '600px',
            margin: '0 auto 30px'
          }}>
            <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>
              🎉 Route Working - Now Building Full Spreadsheet
            </p>
            <p style={{ fontSize: '12px', color: '#555' }}>
              I'll now add the complete Excel-like interface with all Phase 1 & 2 features!
            </p>
          </div>

          <Link href="/order-sheets">
            <button className="primary">← Back to Order Sheets</button>
          </Link>
        </div>
      </div>
    </div>
  )
}
