'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LabSubmittedPage() {
  const router = useRouter()
  const [submissions, setSubmissions] = useState<any[]>([])
  const [stats, setStats] = useState({
    total: 0,
    today: 0,
    received: 0,
    dispatched: 0,
    uniqueRequests: 0
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.labSubmitted) db.labSubmitted = []

    // Sort by submitted date, newest first
    const sorted = [...db.labSubmitted].sort((a, b) =>
      new Date(b.submittedAt || b.createdAt || 0).getTime() - new Date(a.submittedAt || a.createdAt || 0).getTime()
    )

    setSubmissions(sorted)

    // Calculate stats
    const todayStr = new Date().toDateString()
    const todayCount = sorted.filter((x: any) =>
      new Date(x.submittedAt || x.createdAt).toDateString() === todayStr
    ).length

    const receivedCount = sorted.filter((x: any) => x.received).length
    const dispatchedCount = sorted.filter((x: any) => x.dispatched).length
    const uniqueReq = new Set(sorted.map((x: any) => x.requestId || x.labRequestNo).filter(Boolean)).size

    setStats({
      total: sorted.length,
      today: todayCount,
      received: receivedCount,
      dispatched: dispatchedCount,
      uniqueRequests: uniqueReq
    })
  }

  const toggleReceived = (id: string, checked: boolean) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const index = db.labSubmitted.findIndex((x: any) => x.id === id)
    if (index >= 0) {
      db.labSubmitted[index].received = checked
      db.labSubmitted[index].receivedAt = checked ? new Date().toISOString() : ''
      // If unchecking received, also uncheck dispatched
      if (!checked) {
        db.labSubmitted[index].dispatched = false
        db.labSubmitted[index].dispatchedAt = ''
      }
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadData()
    }
  }

  const toggleDispatched = (id: string, checked: boolean) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const index = db.labSubmitted.findIndex((x: any) => x.id === id)
    if (index >= 0) {
      db.labSubmitted[index].dispatched = checked
      db.labSubmitted[index].dispatchedAt = checked ? new Date().toISOString() : ''
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadData()
    }
  }

  const getApprovalDecision = (submission: any) => {
    return submission.approvalDecision || 'Pending'
  }

  const parseDateString = (dateStr: string): Date | null => {
    if (!dateStr || typeof dateStr !== 'string') return null
    
    const trimmed = dateStr.trim()
    if (!trimmed) return null
    
    // Check if it's DD/MM/YYYY format
    const ddmmyyyyMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (ddmmyyyyMatch) {
      const [, day, month, year] = ddmmyyyyMatch
      const isoDate = `${year}-${month}-${day}`
      const date = new Date(isoDate)
      if (!isNaN(date.getTime())) {
        return date
      }
    }
    
    const date = new Date(trimmed)
    if (!isNaN(date.getTime())) {
      return date
    }
    
    return null
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-'
    
    const date = parseDateString(dateStr)
    if (!date) return '-'
    
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    
    return `${day}/${month}/${year}`
  }

  return (
    <div className="content">
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '6px' }}>
            Lab Submitted
          </h2>
          <p style={{ margin: 0, fontSize: '12px', color: '#6B7280', lineHeight: 1.5 }}>
            After 1st Submission, mark Received and then Dispatch to Party. Do approval decision from Lab Requested (Unit) page, approved entries are visible in Approved Lab page.
          </p>
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
            Visible by user Admin • All data access
          </div>
        </div>
        <button 
          onClick={() => router.push('/lab/approval')}
          style={{
            padding: '7px 14px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            background: 'white',
            color: '#374151',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            height: 'fit-content'
          }}
        >
          Go To Approved Lab
        </button>
      </div>

      {/* Beautiful Stats Cards Grid */}
      <div style={{ 
        display: 'flex',
        gap: '10px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        {/* Total Submitted - Gray */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px',
          border: '2px solid #F3F4F6',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '60px',
            height: '60px',
            background: 'linear-gradient(135deg, #F3F4F6 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Total Submitted
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1F2937', marginBottom: '4px', lineHeight: 1 }}>
            {stats.total}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>All records</div>
        </div>

        {/* Submitted Today - Blue */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px',
          border: '2px solid #DBEAFE',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.15)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '60px',
            height: '60px',
            background: 'linear-gradient(135deg, #DBEAFE 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Submitted Today
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#3B82F6', marginBottom: '4px', lineHeight: 1 }}>
            {stats.today}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Today's entries</div>
        </div>

        {/* Marked Received - Purple */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px',
          border: '2px solid #E9D5FF',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(168, 85, 247, 0.15)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '60px',
            height: '60px',
            background: 'linear-gradient(135deg, #E9D5FF 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Marked Received
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#A855F7', marginBottom: '4px', lineHeight: 1 }}>
            {stats.received}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Awaiting dispatch or approved</div>
        </div>

        {/* Dispatched - Green */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px',
          border: '2px solid #D1FAE5',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.15)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '60px',
            height: '60px',
            background: 'linear-gradient(135deg, #D1FAE5 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Dispatched
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#10B981', marginBottom: '4px', lineHeight: 1 }}>
            {stats.dispatched}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Moved to approval flow</div>
        </div>

        {/* Unique Requests - Orange */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px',
          border: '2px solid #FED7AA',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(251, 146, 60, 0.15)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '60px',
            height: '60px',
            background: 'linear-gradient(135deg, #FED7AA 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Unique Requests
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#FB923C', marginBottom: '4px', lineHeight: 1 }}>
            {stats.uniqueRequests}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Lab request coverage</div>
        </div>
      </div>

      {/* Table Card */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        overflow: 'hidden'
      }}>
        {/* Table Header */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>
            Submitted Register
          </div>
          <div style={{ fontSize: '12px', color: '#6B7280' }}>
            {submissions.length} record{submissions.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Table */}
        {submissions.length === 0 ? (
          <div style={{ 
            padding: '48px', 
            textAlign: 'center',
            color: '#9CA3AF',
            fontSize: '14px'
          }}>
            No lab submission records yet. Mark 1st Submission checkbox in FMS.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              width: '100%', 
              minWidth: '1820px',
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={headerStyle}>SUBMISSION NO</th>
                  <th style={headerStyle}>SUBMITTED AT</th>
                  <th style={headerStyle}>LAB REQUEST NO</th>
                  <th style={headerStyle}>LAB INDENT NO</th>
                  <th style={headerStyle}>UNIT</th>
                  <th style={headerStyle}>PARTY</th>
                  <th style={headerStyle}>SHADE / PANTONE</th>
                  <th style={headerStyle}>COLOUR TYPE</th>
                  <th style={headerStyle}>LAB SERIES</th>
                  <th style={headerStyle}>RECEIVED</th>
                  <th style={headerStyle}>RECEIVED AT</th>
                  <th style={headerStyle}>DISPATCH TO PARTY</th>
                  <th style={headerStyle}>DISPATCHED AT</th>
                  <th style={headerStyle}>APPROVAL</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission, idx) => {
                  const labSeries = (submission.labSeriesList && submission.labSeriesList.length)
                    ? submission.labSeriesList.join(', ')
                    : (submission.labSeries || '-')
                  
                  const decision = getApprovalDecision(submission)
                  
                  return (
                    <tr 
                      key={submission.id}
                      style={{ 
                        background: idx % 2 === 0 ? 'white' : '#FAFAFA',
                        borderBottom: '1px solid #F3F4F6'
                      }}
                    >
                      <td style={cellStyle}>
                        <span style={{ color: '#2563EB', fontWeight: 600 }}>
                          {submission.id || '-'}
                        </span>
                      </td>
                      <td style={cellStyle}>{formatDate(submission.submittedAt || submission.createdAt)}</td>
                      <td style={cellStyle}>
                        <span style={{ fontWeight: 600 }}>
                          {submission.labRequestNo || submission.requestId || '-'}
                        </span>
                      </td>
                      <td style={cellStyle}>{submission.indentId || '-'}</td>
                      <td style={cellStyle}>{submission.unit || '-'}</td>
                      <td style={cellStyle}>{submission.party || '-'}</td>
                      <td style={cellStyle}>{submission.shadePantone || '-'}</td>
                      <td style={cellStyle}>{submission.colourType || '-'}</td>
                      <td style={cellStyle}>
                        <span style={{ fontSize: '12px', color: '#6B7280' }}>{labSeries}</span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={submission.received || false}
                          onChange={(e) => toggleReceived(submission.id, e.target.checked)}
                          style={{ 
                            width: '16px', 
                            height: '16px', 
                            cursor: 'pointer',
                            accentColor: '#10B981'
                          }}
                        />
                      </td>
                      <td style={cellStyle}>{formatDate(submission.receivedAt)}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={submission.dispatched || false}
                          disabled={!submission.received}
                          onChange={(e) => toggleDispatched(submission.id, e.target.checked)}
                          style={{
                            width: '16px',
                            height: '16px',
                            cursor: submission.received ? 'pointer' : 'not-allowed',
                            opacity: submission.received ? 1 : 0.4,
                            accentColor: '#10B981'
                          }}
                        />
                      </td>
                      <td style={cellStyle}>{formatDate(submission.dispatchedAt)}</td>
                      <td style={cellStyle}>
                        {decision === 'Approved' ? (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#D1FAE5',
                            color: '#065F46'
                          }}>
                            Approved
                          </span>
                        ) : decision === 'Cancel' ? (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#FEE2E2',
                            color: '#991B1B'
                          }}>
                            Cancel
                          </span>
                        ) : decision === 'Recheck' ? (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#FEF3C7',
                            color: '#92400E'
                          }}>
                            Recheck
                          </span>
                        ) : (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#F3F4F6',
                            color: '#6B7280'
                          }}>
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const headerStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: '10px',
  fontWeight: 700,
  color: '#6B7280',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '1px solid #E5E7EB'
}

const cellStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: '12px',
  color: '#1F2937'
}
