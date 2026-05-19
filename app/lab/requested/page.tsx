'use client'

import { useEffect, useState } from 'react'

export default function LabRequestedPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [filterIndent, setFilterIndent] = useState('')
  const [todayCount, setTodayCount] = useState(0)
  const [openIssuesCount, setOpenIssuesCount] = useState(0)
  const [movedToFms, setMovedToFms] = useState(0)
  
  // Issue modals
  const [isRaiseIssueModalOpen, setIsRaiseIssueModalOpen] = useState(false)
  const [isViewIssuesModalOpen, setIsViewIssuesModalOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<any>(null)
  const [issueFormData, setIssueFormData] = useState({ description: '', priority: 'Medium' })
  const [requestIssues, setRequestIssues] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.labRequests) db.labRequests = []
    if (!db.labIssues) db.labIssues = []

    const allRequests = db.labRequests
    const pending = allRequests.filter((r: any) => !r.confirmed)
    
    setRequests(allRequests)
    setPendingRequests(pending)

    // Calculate stats
    const todayStr = new Date().toDateString()
    const count = pending.filter((x: any) => new Date(x.createdAt).toDateString() === todayStr).length
    setTodayCount(count)

    // Count open issues (simplified - would need full implementation)
    const issues = pending.reduce((sum: number, r: any) => {
      const requestIssues = (db.labIssues || []).filter((i: any) => i.requestId === r.id && !i.solved)
      return sum + requestIssues.length
    }, 0)
    setOpenIssuesCount(issues)

    // Moved to FMS count
    const confirmed = allRequests.filter((r: any) => r.confirmed).length
    setMovedToFms(confirmed)
  }

  const confirmRequest = (id: string) => {
    if (!confirm('Confirm this request to move it to FMS page?')) return

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

  const openRaiseIssueModal = (request: any) => {
    setSelectedRequest(request)
    setIssueFormData({ description: '', priority: 'Medium' })
    setIsRaiseIssueModalOpen(true)
  }

  const saveIssue = () => {
    if (!issueFormData.description.trim()) {
      alert('Please enter issue description')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.labIssues) db.labIssues = []

    const newIssue = {
      id: `ISSUE-${String(db.labIssues.length + 1).padStart(4, '0')}`,
      requestId: selectedRequest.id,
      description: issueFormData.description,
      priority: issueFormData.priority,
      solved: false,
      createdAt: new Date().toISOString(),
      replies: []
    }

    db.labIssues.push(newIssue)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))

    alert(`Issue ${newIssue.id} created successfully!`)
    setIsRaiseIssueModalOpen(false)
    setIssueFormData({ description: '', priority: 'Medium' })
    loadData()
  }

  const openViewIssuesModal = (request: any) => {
    setSelectedRequest(request)
    
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.labIssues) db.labIssues = []

    const issues = db.labIssues.filter((i: any) => i.requestId === request.id)
    setRequestIssues(issues)
    setIsViewIssuesModalOpen(true)
  }

  const toggleIssueSolved = (issueId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const issue = db.labIssues.find((i: any) => i.id === issueId)
    if (issue) {
      issue.solved = !issue.solved
      if (issue.solved) {
        issue.solvedAt = new Date().toISOString()
      } else {
        delete issue.solvedAt
      }
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      
      // Refresh issues list
      const issues = db.labIssues.filter((i: any) => i.requestId === selectedRequest.id)
      setRequestIssues(issues)
      loadData()
    }
  }

  const clearFilter = () => {
    setFilterIndent('')
  }

  const getOpenIssueCount = (requestId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return 0
    const db = JSON.parse(stored)
    if (!db.labIssues) return 0
    return db.labIssues.filter((i: any) => i.requestId === requestId && !i.solved).length
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('en-GB')
  }

  return (
    <div className="content">
      {/* Beautiful Compact Stats Grid */}
      <div style={{ 
        display: 'flex',
        alignItems: 'stretch',
        gap: '12px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        {/* Pending Requests - Green Theme */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '14px',
          border: '2px solid #EAF3DE',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(19, 126, 67, 0.12)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '70px',
            height: '70px',
            background: 'linear-gradient(135deg, rgba(19, 126, 67, 0.08) 0%, rgba(19, 126, 67, 0) 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '18px' }}>⏳</div>
            <div style={{
              background: '#EAF3DE',
              color: '#137E43',
              fontSize: '8px',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '8px',
              letterSpacing: '0.5px'
            }}>
              PENDING
            </div>
          </div>
          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            Pending Requests
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#137E43', lineHeight: 1 }}>
            {pendingRequests.length}
          </div>
          <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 500, marginTop: '4px' }}>
            Ready for confirm
          </div>
        </div>

        {/* Created Today - Blue Theme */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '14px',
          border: '2px solid #E0F2FE',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(3, 105, 161, 0.12)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '70px',
            height: '70px',
            background: 'linear-gradient(135deg, #E0F2FE 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '18px' }}>✨</div>
            <div style={{
              background: '#E0F2FE',
              color: '#0369A1',
              fontSize: '8px',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '8px',
              letterSpacing: '0.5px'
            }}>
              TODAY
            </div>
          </div>
          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            Created Today
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0369A1', lineHeight: 1 }}>
            {todayCount}
          </div>
          <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 500, marginTop: '4px' }}>
            Today's pending
          </div>
        </div>

        {/* Open Issues - Orange Theme */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '14px',
          border: '2px solid #FFF4E6',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(217, 119, 6, 0.12)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '70px',
            height: '70px',
            background: 'linear-gradient(135deg, #FFF4E6 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '18px' }}>⚠️</div>
            <div style={{
              background: '#FFF4E6',
              color: '#D97706',
              fontSize: '8px',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '8px',
              letterSpacing: '0.5px'
            }}>
              ISSUES
            </div>
          </div>
          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            Open Issues
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: openIssuesCount > 0 ? '#D97706' : '#64748B', lineHeight: 1 }}>
            {openIssuesCount}
          </div>
          <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 500, marginTop: '4px' }}>
            Across visible requests
          </div>
        </div>

        {/* Moved To FMS - Purple Theme */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '14px',
          border: '2px solid #F3E8FF',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(124, 58, 237, 0.12)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '70px',
            height: '70px',
            background: 'linear-gradient(135deg, #F3E8FF 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '18px' }}>✅</div>
            <div style={{
              background: '#F3E8FF',
              color: '#7C3AED',
              fontSize: '8px',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '8px',
              letterSpacing: '0.5px'
            }}>
              FMS
            </div>
          </div>
          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            Moved To FMS
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#7C3AED', lineHeight: 1 }}>
            {movedToFms}
          </div>
          <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 500, marginTop: '4px' }}>
            Confirmed in this view
          </div>
        </div>

        {/* All Requests - Indigo Theme */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '14px',
          border: '2px solid #E0E7FF',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(79, 70, 229, 0.12)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '70px',
            height: '70px',
            background: 'linear-gradient(135deg, #E0E7FF 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '18px' }}>📊</div>
            <div style={{
              background: '#E0E7FF',
              color: '#4F46E5',
              fontSize: '8px',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '8px',
              letterSpacing: '0.5px'
            }}>
              TOTAL
            </div>
          </div>
          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            All Requests
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#4F46E5', lineHeight: 1 }}>
            {requests.length}
          </div>
          <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 500, marginTop: '4px' }}>
            Visible in current scope
          </div>
        </div>
      </div>

      {/* Pending Request Register */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Pending Request Register</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {filterIndent && (
              <>
                <span className="badge badge-assigned">Filtered: {filterIndent}</span>
                <button className="xs" onClick={clearFilter}>Clear</button>
              </>
            )}
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {pendingRequests.length} request{pendingRequests.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📋</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
              No pending requests in this view
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              Confirmed requests are moved to FMS page.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ minWidth: '1560px' }}>
              <thead>
                <tr>
                  <th>Lab Request No</th>
                  <th>Lab Indent No</th>
                  <th>Time</th>
                  <th>Unit</th>
                  <th>Party</th>
                  <th>Quality</th>
                  <th>Light Source</th>
                  <th>Yarn Design</th>
                  <th>Shade / Pantone</th>
                  <th>Fastness Type</th>
                  <th>Fastness Remark</th>
                  <th>Other Remark</th>
                  <th>Open Issue</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map(request => {
                  const openIssueCount = getOpenIssueCount(request.id)
                  return (
                    <tr key={request.id}>
                      <td style={{ fontWeight: 700, color: '#3366CC' }}>{request.id}</td>
                      <td>
                        <button className="xs">{request.indentNo || request.indentId || '-'}</button>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '11px' }}>
                        {formatDate(request.createdAt)}
                      </td>
                      <td>{request.unit || '-'}</td>
                      <td>{request.party || '-'}</td>
                      <td>{request.quality || '-'}</td>
                      <td>
                        {request.lightSource === 'Other' 
                          ? (request.lightSourceOther || 'Other') 
                          : (request.lightSource || '-')}
                      </td>
                      <td>{request.yarnDesign || '-'}</td>
                      <td>{request.shadePantone || '-'}</td>
                      <td>{request.fastnessType || '-'}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {request.fastnessRemark || '-'}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {request.otherRemark || '-'}
                      </td>
                      <td>
                        <span className={`badge ${openIssueCount > 0 ? 'badge-hold' : 'badge-done'}`}>
                          {openIssueCount > 0 ? `${openIssueCount} Open` : 'No Open Issue'}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button 
                          onClick={() => confirmRequest(request.id)}
                          style={{ 
                            background: 'linear-gradient(135deg, #137E43 0%, #0F6835 100%)',
                            color: 'white',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(19, 126, 67, 0.2)',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)'
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(19, 126, 67, 0.3)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(19, 126, 67, 0.2)'
                          }}
                        >
                          Confirm
                        </button>
                        <button 
                          className="xs" 
                          style={{ marginLeft: '4px' }}
                          onClick={() => openRaiseIssueModal(request)}
                        >
                          Raise Issue
                        </button>
                        <button 
                          className="xs" 
                          style={{ marginLeft: '4px' }}
                          onClick={() => openViewIssuesModal(request)}
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

      {/* Raise Issue Modal */}
      {isRaiseIssueModalOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setIsRaiseIssueModalOpen(false)}
        >
          <div 
            style={{
              background: 'white',
              borderRadius: '8px',
              width: '550px',
              maxWidth: '90%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F9FAFB'
            }}>
              <h3 style={{ 
                margin: 0, 
                fontSize: '16px', 
                fontWeight: 600,
                color: '#1F2937'
              }}>
                Raise Issue - {selectedRequest?.id}
              </h3>
              <button 
                onClick={() => setIsRaiseIssueModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  color: '#9CA3AF',
                  cursor: 'pointer',
                  padding: '0',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px' }}>
              {/* Two Column Layout for Request Details */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '16px'
              }}>
                {/* Unit */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '12px', 
                    fontWeight: 600,
                    color: '#6B7280',
                    marginBottom: '6px'
                  }}>
                    Unit
                  </label>
                  <input
                    type="text"
                    value={selectedRequest?.unit || '-'}
                    disabled
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      background: '#F9FAFB',
                      color: '#6B7280',
                      fontSize: '13px'
                    }}
                  />
                </div>

                {/* Party */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '12px', 
                    fontWeight: 600,
                    color: '#6B7280',
                    marginBottom: '6px'
                  }}>
                    Party
                  </label>
                  <input
                    type="text"
                    value={selectedRequest?.party || '-'}
                    disabled
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      background: '#F9FAFB',
                      color: '#6B7280',
                      fontSize: '13px'
                    }}
                  />
                </div>

                {/* Shade / Pantone */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '12px', 
                    fontWeight: 600,
                    color: '#6B7280',
                    marginBottom: '6px'
                  }}>
                    Shade / Pantone
                  </label>
                  <input
                    type="text"
                    value={selectedRequest?.shadePantone || '-'}
                    disabled
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      background: '#F9FAFB',
                      color: '#6B7280',
                      fontSize: '13px'
                    }}
                  />
                </div>

                {/* Lab Request No */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '12px', 
                    fontWeight: 600,
                    color: '#6B7280',
                    marginBottom: '6px'
                  }}>
                    Lab Request No
                  </label>
                  <input
                    type="text"
                    value={selectedRequest?.id || '-'}
                    disabled
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #E5E7EB',
                      borderRadius: '6px',
                      background: '#F9FAFB',
                      color: '#6B7280',
                      fontSize: '13px'
                    }}
                  />
                </div>
              </div>

              {/* Issue Description */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '12px', 
                  fontWeight: 600,
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Issue *
                </label>
                <textarea
                  value={issueFormData.description}
                  onChange={(e) => setIssueFormData({ ...issueFormData, description: e.target.value })}
                  placeholder="Write the issue details"
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#3B82F6'}
                  onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              background: '#F9FAFB'
            }}>
              <button 
                onClick={() => setIsRaiseIssueModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  background: 'white',
                  color: '#374151',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={saveIssue}
                style={{
                  padding: '8px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#3B82F6',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(59, 130, 246, 0.3)'
                }}
              >
                ✓ Raise Issue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Issues Modal */}
      {isViewIssuesModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsViewIssuesModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3>Issues for {selectedRequest?.id}</h3>
              <button className="modal-close" onClick={() => setIsViewIssuesModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {requestIssues.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
                    No Issues Found
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    This request has no issues reported.
                  </div>
                </div>
              ) : (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {requestIssues.map((issue) => (
                    <div 
                      key={issue.id}
                      style={{
                        background: issue.solved ? '#F0FDF4' : 'white',
                        border: issue.solved ? '1px solid #86EFAC' : '1px solid #E5E7EB',
                        borderRadius: '8px',
                        padding: '14px',
                        marginBottom: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <span style={{ 
                            fontSize: '12px', 
                            fontWeight: 700, 
                            color: issue.solved ? '#16A34A' : '#3B82F6' 
                          }}>
                            {issue.id}
                          </span>
                          <span style={{
                            marginLeft: '8px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '10px',
                            fontWeight: 700,
                            background: issue.priority === 'Critical' ? '#FEE2E2' : 
                                       issue.priority === 'High' ? '#FED7AA' : 
                                       issue.priority === 'Medium' ? '#FEF3C7' : '#E0E7FF',
                            color: issue.priority === 'Critical' ? '#991B1B' : 
                                   issue.priority === 'High' ? '#9A3412' : 
                                   issue.priority === 'Medium' ? '#92400E' : '#3730A3'
                          }}>
                            {issue.priority}
                          </span>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={issue.solved}
                            onChange={() => toggleIssueSolved(issue.id)}
                            style={{ width: '16px', height: '16px', accentColor: '#137E43' }}
                          />
                          <span style={{ fontSize: '11px', fontWeight: 600, color: issue.solved ? '#16A34A' : '#64748B' }}>
                            {issue.solved ? 'Solved' : 'Mark Solved'}
                          </span>
                        </label>
                      </div>
                      <div style={{ fontSize: '13px', color: '#1E293B', marginBottom: '8px' }}>
                        {issue.description}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        <div>Created: {formatDate(issue.createdAt)}</div>
                        {issue.solved && issue.solvedAt && (
                          <div style={{ color: '#16A34A', fontWeight: 600 }}>
                            Solved: {formatDate(issue.solvedAt)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setIsViewIssuesModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
