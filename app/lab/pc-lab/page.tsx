'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PcLabPage() {
  const router = useRouter()
  const [stats, setStats] = useState({
    totalRequests: 0,
    normalRequests: 0,
    recheckedRequests: 0,
    confirmedRequests: 0
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.labRequests) db.labRequests = []

    const normal = db.labRequests.filter((r: any) => !r.isRecheck)
    const rechecked = db.labRequests.filter((r: any) => !!r.isRecheck)
    const confirmed = db.labRequests.filter((r: any) => !!r.confirmed)

    setStats({
      totalRequests: db.labRequests.length,
      normalRequests: normal.length,
      recheckedRequests: rechecked.length,
      confirmedRequests: confirmed.length
    })
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
            PC Lab - Delay Tracking
          </h2>
          <p style={{ margin: 0, fontSize: '12px', color: '#6B7280', lineHeight: 1.5 }}>
            PC lab specific workflow for tracking delays and follow-ups across lab requests. Monitor request status and identify bottlenecks in the lab workflow.
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
        {/* Total Requests - Indigo */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px',
          border: '2px solid #E0E7FF',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.15)'
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
            background: 'linear-gradient(135deg, #E0E7FF 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Total Requests
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#4F46E5', marginBottom: '4px', lineHeight: 1 }}>
            {stats.totalRequests}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>All lab requests</div>
        </div>

        {/* Normal Requests - Blue */}
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
            Normal Requests
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#3B82F6', marginBottom: '4px', lineHeight: 1 }}>
            {stats.normalRequests}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Non-recheck requests</div>
        </div>

        {/* Rechecked Requests - Purple */}
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
            Rechecked Requests
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#A855F7', marginBottom: '4px', lineHeight: 1 }}>
            {stats.recheckedRequests}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Recheck requests</div>
        </div>

        {/* Confirmed Requests - Green */}
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
            Confirmed Requests
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#10B981', marginBottom: '4px', lineHeight: 1 }}>
            {stats.confirmedRequests}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>In FMS workflow</div>
        </div>
      </div>

      {/* Main Content Card */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        overflow: 'hidden'
      }}>
        {/* Card Header */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid #E5E7EB',
          background: '#F9FAFB'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>
            PC Lab Delay Register
          </div>
        </div>

        {/* Empty State with Beautiful Design */}
        <div style={{ 
          padding: '64px 32px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 24px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #E0E7FF 0%, #DBEAFE 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '36px'
          }}>
            ⏱️
          </div>
          
          <h3 style={{
            margin: '0 0 12px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: '#1F2937'
          }}>
            PC Lab Delay Tracking System
          </h3>
          
          <p style={{
            margin: '0 0 24px 0',
            fontSize: '14px',
            color: '#6B7280',
            lineHeight: 1.6,
            maxWidth: '500px',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}>
            Advanced delay monitoring and follow-up system for PC Lab workflow. 
            Track request delays, identify bottlenecks, and manage follow-ups across all lab requests.
          </p>

          <div style={{
            display: 'inline-flex',
            gap: '12px',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}>
            <div style={{
              padding: '12px 20px',
              borderRadius: '8px',
              background: '#F3F4F6',
              fontSize: '13px',
              color: '#374151',
              fontWeight: 500
            }}>
              📊 Delay Analytics
            </div>
            <div style={{
              padding: '12px 20px',
              borderRadius: '8px',
              background: '#F3F4F6',
              fontSize: '13px',
              color: '#374151',
              fontWeight: 500
            }}>
              🔔 Follow-up Alerts
            </div>
            <div style={{
              padding: '12px 20px',
              borderRadius: '8px',
              background: '#F3F4F6',
              fontSize: '13px',
              color: '#374151',
              fontWeight: 500
            }}>
              📈 Performance Metrics
            </div>
          </div>

          <div style={{
            marginTop: '32px',
            padding: '16px',
            borderRadius: '8px',
            background: '#FEF3C7',
            border: '1px solid #FDE68A',
            maxWidth: '600px',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}>
            <div style={{
              fontSize: '13px',
              color: '#92400E',
              fontWeight: 600,
              marginBottom: '4px'
            }}>
              🚧 Coming Soon
            </div>
            <div style={{
              fontSize: '12px',
              color: '#78350F',
              lineHeight: 1.5
            }}>
              Advanced delay tracking features including automated follow-ups, delay analysis, 
              and performance dashboards are currently in development.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
