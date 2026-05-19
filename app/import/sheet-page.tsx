'use client'
import { Suspense } from 'react'
import SheetPageContent from './SheetPageContent'

export default function SheetPage() {
  return (
    <Suspense fallback={
      <div className="content">
        <div className="card">
          <div style={{ padding: '40px', textAlign: 'center' }}>
            Loading spreadsheet...
          </div>
        </div>
      </div>
    }>
      <SheetPageContent />
    </Suspense>
  )
}
