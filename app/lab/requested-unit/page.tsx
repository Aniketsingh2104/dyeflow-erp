'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LabRequestedUnitPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<any[]>([])
  const [filteredRequests, setFilteredRequests] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [unitFilter, setUnitFilter] = useState('All Units')
  const [units, setUnits] = useState<string[]>([])
  const [stats, setStats] = useState({
    total: 0,
    withChart: 0,
    withDelivery: 0,
    readyForApproval: 0,
    approved: 0,
    units: 0
  })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [requests, searchQuery, unitFilter])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.labRequests) db.labRequests = []
    if (!db.labSubmitted) db.labSubmitted = []

    const allRequests = db.labRequests
      .filter((r: any) => !r.isRecheck)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    setRequests(allRequests)

    const uniqueUnits = [...new Set(allRequests.map((r: any) => (r.unit || '').trim()).filter(Boolean))] as string[]
    setUnits(uniqueUnits)

    const withChart = allRequests.filter((r: any) => {
      const fms = r.fmsData || {}
      return (fms.chartNumber || '').trim()
    }).length

    const withDelivery = allRequests.filter((r: any) => {
      const fms = r.fmsData || {}
      return !!fms.deliveryDate
    }).length

    const dispatchedSubs = db.labSubmitted
      .filter((x: any) => x.dispatched)
      .sort((a: any, b: any) => new Date(b.dispatchedAt || b.createdAt).getTime() - new Date(a.dispatchedAt || a.createdAt).getTime())

    const latestSubmissionByRequest: any = {}
    dispatchedSubs.forEach((x: any) => {
      if (!x.requestId) return
      if (!latestSubmissionByRequest[x.requestId]) {
        latestSubmissionByRequest[x.requestId] = x
      }
    })

    const readyForApproval = allRequests.filter((r: any) => !!latestSubmissionByRequest[r.id]).length
    const approvedCount = Object.values(latestSubmissionByRequest).filter((x: any) => x.approvalDecision === 'Approved').length

    setStats({
      total: allRequests.length,
      withChart,
      withDelivery,
      readyForApproval,
      approved: approvedCount,
      units: uniqueUnits.length
    })
  }

  const applyFilters = () => {
    let filtered = [...requests]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((r: any) =>
        (r.id || '').toLowerCase().includes(q) ||
        (r.party || '').toLowerCase().includes(q) ||
        (r.fmsData?.chartNumber || '').toLowerCase().includes(q)
      )
    }

    if (unitFilter && unitFilter !== 'All Units') {
      filtered = filtered.filter((r: any) => r.unit === unitFilter)
    }

    setFilteredRequests(filtered)
  }

  const getLatestSubmission = (requestId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return null

    const db = JSON.parse(stored)
    if (!db.labSubmitted) return null

    const subs = db.labSubmitted
      .filter((x: any) => x.requestId === requestId && x.dispatched)
      .sort((a: any, b: any) => new Date(b.dispatchedAt || b.createdAt).getTime() - new Date(a.dispatchedAt || a.createdAt).getTime())

    return subs[0] || null
  }

  const getLabSeriesOptions = (submission: any) => {
    if (!submission) return []
    const options = []
    for (let i = 1; i <= 5; i++) {
      options.push(`LAB-${i}`)
    }
    return options
  }

  const parseDateString = (dateStr: string): Date | null => {
    if (!dateStr || typeof dateStr !== 'string') return null
    
    const trimmed = dateStr.trim()
    if (!trimmed) return null
    
    // Check if it's DD/MM/YYYY format (stored delivery dates)
    const ddmmyyyyMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (ddmmyyyyMatch) {
      const [, day, month, year] = ddmmyyyyMatch
      // Create date as YYYY-MM-DD format which JavaScript can parse
      const isoDate = `${year}-${month}-${day}`
      const date = new Date(isoDate)
      if (!isNaN(date.getTime())) {
        return date
      }
    }
    
    // Try parsing as ISO date or other standard formats
    const date = new Date(trimmed)
    if (!isNaN(date.getTime())) {
      return date
    }
    
    return null
  }

  const formatDateTime = (dateStr: string | null | undefined) => {
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
            Lab Requested - Unit View
          </h2>
          <p style={{ margin: 0, fontSize: '12px', color: '#6B7280', lineHeight: 1.5 }}>
            All normal lab requests are shown here with Chart Number and Delivery Date. Rechecked requests are excluded from this page and listed in Rechecked Lab page. Approval decision is managed here.
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
        {/* All Lab Requests - Gray */}
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
            All Lab Requests
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1F2937', marginBottom: '4px', lineHeight: 1 }}>
            {stats.total}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Across all indents</div>
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
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Chart entered</div>
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
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Commitment available</div>
        </div>

        {/* Ready For Approval - Orange */}
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
            Ready For Approval
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#FB923C', marginBottom: '4px', lineHeight: 1 }}>
            {stats.readyForApproval}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Dispatched submissions</div>
        </div>

        {/* Approved - Success Green */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px',
          border: '2px solid #BBF7D0',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.15)'
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
            background: 'linear-gradient(135deg, #BBF7D0 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Approved
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#22C55E', marginBottom: '4px', lineHeight: 1 }}>
            {stats.approved}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Approved decisions</div>
        </div>

        {/* Units - Purple */}
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
            Units
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#A855F7', marginBottom: '4px', lineHeight: 1 }}>
            {stats.units}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Unique units</div>
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
            Requested Register (Unit)
          </div>
          <div style={{ fontSize: '12px', color: '#6B7280' }}>
            {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Filters */}
        <div style={{ 
          padding: '12px 16px', 
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          gap: '10px'
        }}>
          <input
            type="text"
            placeholder="Search request no / party / chart..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '7px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '13px',
              outline: 'none'
            }}
          />
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            style={{
              padding: '7px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '13px',
              background: 'white',
              minWidth: '140px'
            }}
          >
            <option value="All Units">All Units</option>
            {units.map(unit => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {filteredRequests.length === 0 ? (
          <div style={{ 
            padding: '48px', 
            textAlign: 'center',
            color: '#9CA3AF',
            fontSize: '14px'
          }}>
            No lab requests found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              width: '100%', 
              minWidth: '2000px',
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={headerStyle}>LAB REQUEST NO</th>
                  <th style={headerStyle}>LAB INDENT NO</th>
                  <th style={headerStyle}>TIME</th>
                  <th style={headerStyle}>UNIT</th>
                  <th style={headerStyle}>PARTY</th>
                  <th style={headerStyle}>SHADE / PANTONE</th>
                  <th style={headerStyle}>COLOUR TYPE</th>
                  <th style={headerStyle}>CHART NUMBER</th>
                  <th style={headerStyle}>DELIVERY DATE</th>
                  <th style={headerStyle}>SUBMISSION NO</th>
                  <th style={headerStyle}>LAB SERIES OPTIONS</th>
                  <th style={headerStyle}>DECISION</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request, idx) => {
                  const fms = request.fmsData || {}
                  const submission = getLatestSubmission(request.id)
                  const options = submission ? getLabSeriesOptions(submission) : []
                  const decision = submission?.approvalDecision || ''

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
                      </td>
                      <td style={cellStyle}>{request.indentNo || request.indentId || '-'}</td>
                      <td style={cellStyle}>{formatDateTime(request.createdAt)}</td>
                      <td style={cellStyle}>{request.unit || '-'}</td>
                      <td style={cellStyle}>{request.party || '-'}</td>
                      <td style={cellStyle}>{request.shadePantone || '-'}</td>
                      <td style={cellStyle}>{submission?.colourType || '-'}</td>
                      <td style={cellStyle}>{fms.chartNumber || '-'}</td>
                      <td style={cellStyle}>
                        {formatDateTime(fms.deliveryDate)}
                      </td>
                      <td style={cellStyle}>
                        <span style={{ color: '#2563EB', fontWeight: 600 }}>{submission?.id || '-'}</span>
                      </td>
                      <td style={cellStyle}>{options.length ? options.join(', ') : '-'}</td>
                      <td style={cellStyle}>
                        {submission ? (
                          decision ? (
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: decision === 'Approved' ? '#D1FAE5' : 
                                         decision === 'Cancel' ? '#FEE2E2' : '#FEF3C7',
                              color: decision === 'Approved' ? '#065F46' :
                                     decision === 'Cancel' ? '#991B1B' : '#92400E'
                            }}>
                              {decision}
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
                              Not ready
                            </span>
                          )
                        ) : (
                          <span style={{ fontSize: '11px', color: '#9CA3AF' }}>Not ready</span>
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
