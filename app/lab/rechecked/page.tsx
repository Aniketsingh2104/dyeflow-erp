'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RecheckedLabPage() {
  const router = useRouter()
  const [recheckRequests, setRecheckRequests] = useState<any[]>([])
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    withChart: 0,
    withDelivery: 0,
    linkedOpenIssues: 0
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.labRequests) db.labRequests = []
    if (!db.labIssues) db.labIssues = []

    // Filter recheck requests
    const rechecks = db.labRequests
      .filter((r: any) => !!r.isRecheck)
      .sort((a: any, b: any) =>
        new Date(b.recheckCreatedAt || b.createdAt || 0).getTime() -
        new Date(a.recheckCreatedAt || a.createdAt || 0).getTime()
      )

    setRecheckRequests(rechecks)

    // Calculate stats
    const pendingCount = rechecks.filter((r: any) => !r.confirmed).length
    
    const withChart = rechecks.filter((r: any) => {
      const fms = r.fmsData || {}
      return (fms.chartNumber || '').trim()
    }).length

    const withDelivery = rechecks.filter((r: any) => {
      const fms = r.fmsData || {}
      return !!fms.deliveryDate
    }).length

    // Count linked open issues
    const linkedOpenIssueCount = rechecks.reduce((sum: number, r: any) => {
      const thisIssues = getOpenIssueCount(r.id, db.labIssues)
      const linkedIssues = r.recheckFromRequestId ? getOpenIssueCount(r.recheckFromRequestId, db.labIssues) : 0
      return sum + thisIssues + linkedIssues
    }, 0)

    setStats({
      total: rechecks.length,
      pending: pendingCount,
      withChart,
      withDelivery,
      linkedOpenIssues: linkedOpenIssueCount
    })
  }

  const getOpenIssueCount = (requestId: string, issues: any[]) => {
    return issues.filter((i: any) => i.requestId === requestId && !i.solved).length
  }

  const confirmRequest = (id: string) => {
    if (!confirm('Confirm this recheck request to move it to FMS page?')) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const index = db.labRequests.findIndex((x: any) => x.id === id)
    if (index >= 0) {
      db.labRequests[index].confirmed = true
      db.labRequests[index].confirmedAt = new Date().toISOString()
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadData()
    }
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
            Rechecked Lab
          </h2>
          <p style={{ margin: 0, fontSize: '12px', color: '#6B7280', lineHeight: 1.5 }}>
            All recheck-generated lab requests are shown here with Chart Number, Delivery Date and actions (Confirm, Raise Issue, View Issues).
          </p>
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
            Visible by user Admin • All data access
          </div>
        </div>
        <button 
          onClick={() => router.push('/lab/requested')}
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
          Back to Lab Requested
        </button>
      </div>

      {/* Beautiful Stats Cards Grid */}
      <div style={{ 
        display: 'flex',
        gap: '10px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        {/* Recheck Requests - Purple */}
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
            Recheck Requests
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#A855F7', marginBottom: '4px', lineHeight: 1 }}>
            {stats.total}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Generated from Recheck</div>
        </div>

        {/* Pending - Orange */}
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
            Pending
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#FB923C', marginBottom: '4px', lineHeight: 1 }}>
            {stats.pending}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Not confirmed to FMS</div>
        </div>

        {/* With Chart Number - Blue */}
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
            With Chart Number
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#3B82F6', marginBottom: '4px', lineHeight: 1 }}>
            {stats.withChart}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Chart available</div>
        </div>

        {/* With Delivery Date - Green */}
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
            With Delivery Date
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#10B981', marginBottom: '4px', lineHeight: 1 }}>
            {stats.withDelivery}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Delivery available</div>
        </div>

        {/* Linked Open Issues - Red/Green Dynamic */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px',
          border: stats.linkedOpenIssues > 0 ? '2px solid #FEE2E2' : '2px solid #D1FAE5',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = stats.linkedOpenIssues > 0 
            ? '0 4px 12px rgba(239, 68, 68, 0.15)' 
            : '0 4px 12px rgba(16, 185, 129, 0.15)'
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
            background: stats.linkedOpenIssues > 0 
              ? 'linear-gradient(135deg, #FEE2E2 0%, transparent 100%)'
              : 'linear-gradient(135deg, #D1FAE5 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Linked Open Issues
          </div>
          <div style={{ 
            fontSize: '32px', 
            fontWeight: 800, 
            color: stats.linkedOpenIssues > 0 ? '#EF4444' : '#10B981', 
            marginBottom: '4px', 
            lineHeight: 1 
          }}>
            {stats.linkedOpenIssues}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>This + linked request</div>
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
            Recheck Register
          </div>
          <div style={{ fontSize: '12px', color: '#6B7280' }}>
            {recheckRequests.length} request{recheckRequests.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Table */}
        {recheckRequests.length === 0 ? (
          <div style={{ 
            padding: '48px', 
            textAlign: 'center',
            color: '#9CA3AF',
            fontSize: '14px'
          }}>
            No rechecked lab requests yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              width: '100%', 
              minWidth: '2060px',
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={headerStyle}>RECHECKED LAB NO</th>
                  <th style={headerStyle}>CREATED AT</th>
                  <th style={headerStyle}>LINKED LAB REQUEST NO</th>
                  <th style={headerStyle}>FROM SUBMISSION</th>
                  <th style={headerStyle}>UNIT</th>
                  <th style={headerStyle}>PARTY</th>
                  <th style={headerStyle}>SHADE / PANTONE</th>
                  <th style={headerStyle}>RECHECK REMARK</th>
                  <th style={headerStyle}>CHART NUMBER</th>
                  <th style={headerStyle}>DELIVERY DATE</th>
                  <th style={headerStyle}>OPEN ISSUE</th>
                  <th style={headerStyle}>STATUS</th>
                  <th style={headerStyle}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {recheckRequests.map((request, idx) => {
                  const fms = request.fmsData || {}
                  const fromReq = request.recheckFromRequestId || '-'
                  
                  const stored = localStorage.getItem('dyeflow_db')
                  const db = stored ? JSON.parse(stored) : { labIssues: [] }
                  
                  const openThis = getOpenIssueCount(request.id, db.labIssues)
                  const openLinked = request.recheckFromRequestId 
                    ? getOpenIssueCount(request.recheckFromRequestId, db.labIssues) 
                    : 0
                  const openTotal = openThis + openLinked

                  return (
                    <tr 
                      key={request.id}
                      style={{ 
                        background: idx % 2 === 0 ? 'white' : '#FAFAFA',
                        borderBottom: '1px solid #F3F4F6'
                      }}
                    >
                      <td style={cellStyle}>
                        <span style={{ color: '#2563EB', fontWeight: 600 }}>{request.id}</span>
                        <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '2px' }}>
                          Linked: {fromReq}
                        </div>
                      </td>
                      <td style={cellStyle}>{formatDate(request.recheckCreatedAt || request.createdAt)}</td>
                      <td style={cellStyle}>
                        <span style={{ fontWeight: 600 }}>{fromReq}</span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontWeight: 600 }}>{request.recheckFromSubmissionId || '-'}</span>
                      </td>
                      <td style={cellStyle}>{request.unit || '-'}</td>
                      <td style={cellStyle}>{request.party || '-'}</td>
                      <td style={cellStyle}>{request.shadePantone || '-'}</td>
                      <td style={cellStyle}>
                        <span style={{ fontSize: '12px', color: '#6B7280' }}>
                          {request.recheckRemark || '-'}
                        </span>
                      </td>
                      <td style={cellStyle}>{fms.chartNumber || '-'}</td>
                      <td style={cellStyle}>{formatDate(fms.deliveryDate)}</td>
                      <td style={cellStyle}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: openTotal > 0 ? '#FEF3C7' : '#D1FAE5',
                          color: openTotal > 0 ? '#92400E' : '#065F46'
                        }}>
                          {openTotal > 0 ? `${openTotal} Open` : 'No Open Issue'}
                        </span>
                        <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '3px' }}>
                          This: {openThis} | Linked: {openLinked}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        {request.confirmed ? (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#E0E7FF',
                            color: '#4338CA'
                          }}>
                            In FMS
                          </span>
                        ) : (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#FEF3C7',
                            color: '#92400E'
                          }}>
                            Pending
                          </span>
                        )}
                      </td>
                      <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                        {request.confirmed ? (
                          <button 
                            disabled 
                            style={{
                              padding: '5px 10px',
                              border: '1px solid #E5E7EB',
                              borderRadius: '5px',
                              background: '#F3F4F6',
                              color: '#9CA3AF',
                              fontSize: '12px',
                              fontWeight: 500,
                              cursor: 'not-allowed',
                              opacity: 0.6
                            }}
                          >
                            Confirmed
                          </button>
                        ) : (
                          <button 
                            onClick={() => confirmRequest(request.id)}
                            style={{
                              padding: '5px 10px',
                              border: 'none',
                              borderRadius: '5px',
                              background: '#10B981',
                              color: 'white',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#059669'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#10B981'
                            }}
                          >
                            Confirm
                          </button>
                        )}
                        <button 
                          style={{
                            marginLeft: '4px',
                            padding: '5px 10px',
                            border: '1px solid #D1D5DB',
                            borderRadius: '5px',
                            background: 'white',
                            color: '#374151',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer'
                          }}
                        >
                          Raise Issue
                        </button>
                        <button 
                          style={{
                            marginLeft: '4px',
                            padding: '5px 10px',
                            border: '1px solid #D1D5DB',
                            borderRadius: '5px',
                            background: 'white',
                            color: '#374151',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer'
                          }}
                        >
                          View Issues
                        </button>
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
