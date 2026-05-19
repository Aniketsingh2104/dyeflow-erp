'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LabWithIssuePage() {
  const router = useRouter()
  const [issues, setIssues] = useState<any[]>([])
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'solved'>('all')
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    solved: 0,
    today: 0
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.labIssues) db.labIssues = []
    if (!db.labRequests) db.labRequests = []

    // Sort by creation date, newest first
    const sorted = [...db.labIssues].sort((a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    )

    setIssues(sorted)

    // Calculate stats
    const openCount = sorted.filter((x: any) => !x.solved).length
    const solvedCount = sorted.filter((x: any) => x.solved).length
    const todayStr = new Date().toDateString()
    const todayCount = sorted.filter((x: any) =>
      new Date(x.createdAt).toDateString() === todayStr
    ).length

    setStats({
      total: sorted.length,
      open: openCount,
      solved: solvedCount,
      today: todayCount
    })
  }

  const getLabRequest = (requestId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return null

    const db = JSON.parse(stored)
    return db.labRequests?.find((r: any) => r.id === requestId) || null
  }

  const toggleSolved = (issueId: string, checked: boolean) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const index = db.labIssues.findIndex((x: any) => x.id === issueId)
    if (index >= 0) {
      db.labIssues[index].solved = checked
      db.labIssues[index].solvedAt = checked ? new Date().toISOString() : ''
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadData()
    }
  }

  const addReply = (issueId: string) => {
    const replyText = replyInputs[issueId]?.trim()
    if (!replyText) {
      alert('Please enter a reply.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const index = db.labIssues.findIndex((x: any) => x.id === issueId)
    if (index >= 0) {
      if (!Array.isArray(db.labIssues[index].replies)) {
        db.labIssues[index].replies = []
      }
      db.labIssues[index].replies.push({
        text: replyText,
        createdAt: new Date().toISOString(),
        by: 'Admin'
      })
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      
      // Clear the input
      setReplyInputs({ ...replyInputs, [issueId]: '' })
      loadData()
    }
  }

  const handleReplyInputChange = (issueId: string, value: string) => {
    setReplyInputs({ ...replyInputs, [issueId]: value })
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Apply filters
  const filteredIssues = issues.filter(issue => {
    // Status filter
    if (filterStatus === 'open' && issue.solved) return false
    if (filterStatus === 'solved' && !issue.solved) return false

    // Search filter
    if (searchQuery) {
      const req = getLabRequest(issue.requestId)
      const searchText = [
        issue.id,
        issue.description,
        req?.party,
        req?.shadePantone,
        req?.id
      ].join(' ').toLowerCase()
      
      if (!searchText.includes(searchQuery.toLowerCase())) return false
    }

    return true
  })

  return (
    <div className="content">
      {/* Header with Search and Filters */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        <h1 style={{ 
          margin: 0, 
          fontSize: '24px', 
          fontWeight: 700,
          color: '#1F2937',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px'
          }}>
            ⚠️
          </span>
          Lab with Issue
        </h1>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #E5E7EB',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            <option value="all">All Issues</option>
            <option value="open">Open Only</option>
            <option value="solved">Solved Only</option>
          </select>

          {/* Search */}
          <input
            placeholder="Search by Issue ID, Party, Shade..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #E5E7EB',
              fontSize: '13px',
              minWidth: '280px'
            }}
          />

          <button 
            className="xs"
            onClick={() => router.push('/lab/requested')}
            style={{ whiteSpace: 'nowrap' }}
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px',
        marginBottom: '20px'
      }}>
        {/* Total Issues */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          border: '2px solid #E0E7FF',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: -15,
            right: -15,
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, #E0E7FF 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginBottom: '8px' }}>
            TOTAL ISSUES
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#4F46E5', lineHeight: 1 }}>
            {stats.total}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '6px' }}>
            All raised issues
          </div>
        </div>

        {/* Open Issues */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          border: '2px solid #FEE2E2',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: -15,
            right: -15,
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, #FEE2E2 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginBottom: '8px' }}>
            OPEN ISSUES
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: stats.open > 0 ? '#EF4444' : '#64748B', lineHeight: 1 }}>
            {stats.open}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '6px' }}>
            Pending resolution
          </div>
        </div>

        {/* Solved Issues */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          border: '2px solid #D1FAE5',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: -15,
            right: -15,
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, #D1FAE5 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginBottom: '8px' }}>
            SOLVED ISSUES
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#10B981', lineHeight: 1 }}>
            {stats.solved}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '6px' }}>
            Successfully resolved
          </div>
        </div>

        {/* Raised Today */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          border: '2px solid #EAF3DE',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: -15,
            right: -15,
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, #EAF3DE 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginBottom: '8px' }}>
            RAISED TODAY
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#137E43', lineHeight: 1 }}>
            {stats.today}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '6px' }}>
            Today's new issues
          </div>
        </div>
      </div>

      {/* Issue Cards */}
      <div style={{ 
        display: 'grid',
        gap: '16px'
      }}>
        {filteredIssues.length === 0 ? (
          <div style={{
            background: 'white',
            borderRadius: '10px',
            padding: '48px',
            textAlign: 'center',
            border: '2px dashed #E5E7EB'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '6px' }}>
              {issues.length === 0 ? 'No issues raised yet' : 'No matching issues found'}
            </div>
            <div style={{ fontSize: '13px', color: '#6B7280' }}>
              {issues.length === 0 
                ? 'Issues raised on lab requests will appear here'
                : 'Try adjusting your search or filter criteria'}
            </div>
          </div>
        ) : (
          filteredIssues.map(issue => {
            const req = getLabRequest(issue.requestId)
            const replies = Array.isArray(issue.replies) ? issue.replies : []

            return (
              <div 
                key={issue.id}
                style={{
                  background: 'white',
                  borderRadius: '10px',
                  border: issue.solved ? '2px solid #D1FAE5' : '2px solid #FEE2E2',
                  overflow: 'hidden',
                  transition: 'all 0.2s'
                }}
              >
                {/* Issue Header */}
                <div style={{
                  background: issue.solved ? '#F0FDF4' : '#FEF2F2',
                  padding: '16px 20px',
                  borderBottom: issue.solved ? '1px solid #D1FAE5' : '1px solid #FEE2E2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {/* Issue ID */}
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: issue.solved ? '#10B981' : '#EF4444' }}>
                        {issue.id}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                        Raised {formatDateShort(issue.createdAt)}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div style={{
                      padding: '4px 12px',
                      borderRadius: '16px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: issue.solved ? '#D1FAE5' : '#FEE2E2',
                      color: issue.solved ? '#065F46' : '#991B1B'
                    }}>
                      {issue.solved ? '✓ SOLVED' : '⚠ OPEN'}
                    </div>

                    {/* Request Details */}
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      fontSize: '12px',
                      color: '#6B7280'
                    }}>
                      <span><strong>Party:</strong> {req?.party || '-'}</span>
                      <span>•</span>
                      <span><strong>Shade:</strong> {req?.shadePantone || '-'}</span>
                      <span>•</span>
                      <span><strong>Request:</strong> {req?.id || issue.requestId}</span>
                    </div>
                  </div>

                  {/* Solved Checkbox */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'white',
                    border: '1px solid #E5E7EB'
                  }}>
                    <input
                      type="checkbox"
                      checked={issue.solved || false}
                      onChange={(e) => toggleSolved(issue.id, e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: '#10B981' }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                      Mark as Solved
                    </span>
                  </label>
                </div>

                {/* Issue Body */}
                <div style={{ padding: '20px' }}>
                  {/* Issue Description */}
                  <div style={{
                    background: '#F9FAFB',
                    padding: '14px',
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB',
                    marginBottom: '16px'
                  }}>
                    <div style={{ 
                      fontSize: '11px', 
                      fontWeight: 600, 
                      color: '#6B7280',
                      marginBottom: '8px'
                    }}>
                      ISSUE DESCRIPTION
                    </div>
                    <div style={{ fontSize: '13px', color: '#1F2937', lineHeight: '1.6' }}>
                      {issue.description || '-'}
                    </div>
                  </div>

                  {/* Replies Section */}
                  {replies.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ 
                        fontSize: '11px', 
                        fontWeight: 600, 
                        color: '#6B7280',
                        marginBottom: '10px'
                      }}>
                        REPLIES ({replies.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {replies.map((reply: any, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              background: '#F0F9FF',
                              border: '1px solid #BAE6FD',
                              borderRadius: '8px',
                              padding: '12px',
                              position: 'relative'
                            }}
                          >
                            <div style={{ fontSize: '13px', color: '#1E293B', marginBottom: '6px' }}>
                              {reply.text}
                            </div>
                            <div style={{ 
                              fontSize: '10px', 
                              color: '#64748B',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <span style={{ fontWeight: 600 }}>{reply.by || 'Admin'}</span>
                              <span>•</span>
                              <span>{formatDateShort(reply.createdAt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reply Input */}
                  <div style={{
                    background: '#F9FAFB',
                    padding: '14px',
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB'
                  }}>
                    <div style={{ 
                      fontSize: '11px', 
                      fontWeight: 600, 
                      color: '#6B7280',
                      marginBottom: '8px'
                    }}>
                      ADD REPLY
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input
                        placeholder="Type your reply to this issue..."
                        value={replyInputs[issue.id] || ''}
                        onChange={(e) => handleReplyInputChange(issue.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            addReply(issue.id)
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid #D1D5DB',
                          fontSize: '13px'
                        }}
                      />
                      <button 
                        onClick={() => addReply(issue.id)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '6px',
                          background: 'linear-gradient(135deg, #137E43 0%, #0F6835 100%)',
                          color: 'white',
                          border: 'none',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        📨 Send Reply
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
