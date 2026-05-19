'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ApprovedLabPage() {
  const router = useRouter()
  const [approvedSubmissions, setApprovedSubmissions] = useState<any[]>([])
  const [stats, setStats] = useState({
    total: 0,
    today: 0,
    withApprovalNo: 0
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.labSubmitted) db.labSubmitted = []

    // Filter only approved submissions
    const approved = db.labSubmitted
      .filter((x: any) => x.approvalDecision === 'Approved')
      .sort((a: any, b: any) =>
        new Date(b.approvedAt || b.decisionAt || b.createdAt || 0).getTime() -
        new Date(a.approvedAt || a.decisionAt || a.createdAt || 0).getTime()
      )

    setApprovedSubmissions(approved)

    // Calculate stats
    const todayStr = new Date().toDateString()
    const todayApproved = approved.filter((x: any) =>
      new Date(x.approvedAt || x.decisionAt || x.createdAt || 0).toDateString() === todayStr
    ).length

    const withApprovedNo = approved.filter((x: any) => (x.labApprovedNumber || '').trim()).length

    setStats({
      total: approved.length,
      today: todayApproved,
      withApprovalNo: withApprovedNo
    })
  }

  const getLabSeriesOptions = (submission: any) => {
    const options = []
    for (let i = 1; i <= 5; i++) {
      options.push(`LAB-${i}`)
    }
    return options
  }

  const hasRecipe = (submissionId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return false

    const db = JSON.parse(stored)
    if (!db.labRecipes) return false

    return db.labRecipes.some((r: any) => r.submissionId === submissionId)
  }

  const getRecipeComponentCount = (submissionId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return 0

    const db = JSON.parse(stored)
    if (!db.labRecipes) return 0

    const recipe = db.labRecipes.find((r: any) => r.submissionId === submissionId)
    return recipe?.components?.length || 0
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
            Approved Lab
          </h2>
          <p style={{ margin: 0, fontSize: '12px', color: '#6B7280', lineHeight: 1.5 }}>
            This page shows only approved lab records. Use Entry Receipe to save colour/chemical percentages for each approved submission.
          </p>
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
            Visible by user Admin • All data access
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', height: 'fit-content' }}>
          <button 
            onClick={() => router.push('/lab/receipe')}
            style={{
              padding: '7px 14px',
              border: '1px solid #10B981',
              borderRadius: '6px',
              background: '#10B981',
              color: 'white',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Lab Receipe
          </button>
          <button 
            onClick={() => router.push('/lab/requested-unit')}
            style={{
              padding: '7px 14px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              background: 'white',
              color: '#374151',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Back to Lab Requested (Unit)
          </button>
        </div>
      </div>

      {/* Beautiful Stats Cards Grid */}
      <div style={{ 
        display: 'flex',
        gap: '10px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        {/* Approved Records - Success Green */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 200px',
          minWidth: '200px',
          maxWidth: '280px',
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
            Approved Records
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#22C55E', marginBottom: '4px', lineHeight: 1 }}>
            {stats.total}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>All approved entries</div>
        </div>

        {/* Approved Today - Blue */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 200px',
          minWidth: '200px',
          maxWidth: '280px',
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
            Approved Today
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#3B82F6', marginBottom: '4px', lineHeight: 1 }}>
            {stats.today}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Today's approvals</div>
        </div>

        {/* With Approval No - Purple */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 200px',
          minWidth: '200px',
          maxWidth: '280px',
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
            With Approval No.
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#A855F7', marginBottom: '4px', lineHeight: 1 }}>
            {stats.withApprovalNo}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Selected lab approved number</div>
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
            Approved Register
          </div>
          <div style={{ fontSize: '12px', color: '#6B7280' }}>
            {approvedSubmissions.length} record{approvedSubmissions.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Table */}
        {approvedSubmissions.length === 0 ? (
          <div style={{ 
            padding: '48px', 
            textAlign: 'center',
            color: '#9CA3AF',
            fontSize: '14px'
          }}>
            No approved lab records yet. Do approval from Lab Requested (Unit) page.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              width: '100%', 
              minWidth: '2240px',
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={headerStyle}>LAB REQUEST NO</th>
                  <th style={headerStyle}>SUBMISSION NO</th>
                  <th style={headerStyle}>APPROVED AT</th>
                  <th style={headerStyle}>DISPATCHED AT</th>
                  <th style={headerStyle}>COMMITMENT DATE</th>
                  <th style={headerStyle}>CHART NUMBER</th>
                  <th style={headerStyle}>UNIT</th>
                  <th style={headerStyle}>PARTY</th>
                  <th style={headerStyle}>SHADE / PANTONE</th>
                  <th style={headerStyle}>COLOUR TYPE</th>
                  <th style={headerStyle}>LAB SERIES OPTIONS</th>
                  <th style={headerStyle}>LAB APPROVED NUMBER</th>
                  <th style={headerStyle}>RECEIPE STATUS</th>
                  <th style={headerStyle}>STATUS</th>
                  <th style={headerStyle}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {approvedSubmissions.map((submission, idx) => {
                  const options = getLabSeriesOptions(submission)
                  const requestNo = submission.labRequestNo || submission.requestId || '-'
                  const recipe = hasRecipe(submission.id)
                  const componentCount = getRecipeComponentCount(submission.id)

                  return (
                    <tr 
                      key={submission.id}
                      style={{ 
                        background: idx % 2 === 0 ? 'white' : '#FAFAFA',
                        borderBottom: '1px solid #F3F4F6'
                      }}
                    >
                      <td style={cellStyle}>
                        <span style={{ color: '#2563EB', fontWeight: 600 }}>{requestNo}</span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ color: '#2563EB', fontWeight: 600 }}>{submission.id || '-'}</span>
                      </td>
                      <td style={cellStyle}>{formatDate(submission.approvedAt || submission.decisionAt)}</td>
                      <td style={cellStyle}>{formatDate(submission.dispatchedAt)}</td>
                      <td style={cellStyle}>{formatDate(submission.commitmentDate)}</td>
                      <td style={cellStyle}>
                        <span style={{ fontWeight: 600 }}>{submission.chartNumber || '-'}</span>
                      </td>
                      <td style={cellStyle}>{submission.unit || '-'}</td>
                      <td style={cellStyle}>{submission.party || '-'}</td>
                      <td style={cellStyle}>{submission.shadePantone || '-'}</td>
                      <td style={cellStyle}>{submission.colourType || '-'}</td>
                      <td style={cellStyle}>
                        <span style={{ fontSize: '12px', color: '#6B7280' }}>
                          {options.length ? options.join(', ') : '-'}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontWeight: 700, color: '#22C55E' }}>
                          {submission.labApprovedNumber || '-'}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        {recipe ? (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#D1FAE5',
                            color: '#065F46'
                          }}>
                            Saved ({componentCount})
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
                            Not Entered
                          </span>
                        )}
                      </td>
                      <td style={cellStyle}>
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
                      </td>
                      <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                        <button 
                          style={{
                            padding: '5px 10px',
                            border: recipe ? '1px solid #D1D5DB' : 'none',
                            borderRadius: '5px',
                            background: recipe ? 'white' : '#3B82F6',
                            color: recipe ? '#374151' : 'white',
                            fontSize: '12px',
                            fontWeight: recipe ? 500 : 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (!recipe) {
                              e.currentTarget.style.background = '#2563EB'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!recipe) {
                              e.currentTarget.style.background = '#3B82F6'
                            }
                          }}
                        >
                          {recipe ? 'Edit Receipe' : 'Entry Receipe'}
                        </button>
                        <button 
                          onClick={() => router.push('/lab/receipe')}
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
                          View Page
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
