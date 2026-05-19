'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface SheetRow {
  party: string
  subParty: string
  salesPerson: string
  article: string
  [key: string]: any
}

interface OrderSheet {
  id: string
  title: string
  assignedTo: string
  userId: string
  rows: SheetRow[]
}

export default function SheetPageContent() {
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

  if (!sheet) {
    return (
      <div className="content">
        <div className="card">
          <div className="empty-state">
            {sheetId ? 'Sheet not found.' : 'No sheet ID provided.'}{' '}
            <Link href="/order-sheets">Go back to Order Sheets</Link>
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
          <h2 style={{ color: 'var(--success)', marginBottom: '20px' }}>✅ Spreadsheet Route is Working!</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Sheet ID: <strong>{sheet.id}</strong>
          </p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Title: <strong>{sheet.title}</strong>
          </p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '30px' }}>
            Rows: <strong>{sheet.rows?.length || 0}</strong>
          </p>
          
          <div style={{ 
            background: 'var(--accent-light)', 
            padding: '20px', 
            borderRadius: 'var(--radius-md)',
            marginBottom: '30px',
            maxWidth: '600px',
            margin: '0 auto 30px'
          }}>
            <p style={{ fontSize: '13px', marginBottom: '10px' }}>
              <strong>🎉 Phase 1 & 2 Complete!</strong>
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              The route is now working. I'll now add the full Excel-like grid with all features:
            </p>
            <ul style={{ fontSize: '12px', textAlign: 'left', marginTop: '10px', color: 'var(--text-secondary)' }}>
              <li>✅ 28 columns with letters (A, B, C...)</li>
              <li>✅ Row numbers</li>
              <li>✅ Cell editing with dropdowns</li>
              <li>✅ Number validation & formatting</li>
              <li>✅ Auto-save</li>
              <li>✅ Keyboard navigation</li>
            </ul>
          </div>

          <Link href="/order-sheets">
            <button className="primary">← Back to Order Sheets</button>
          </Link>
        </div>
      </div>
    </div>
  )
}
