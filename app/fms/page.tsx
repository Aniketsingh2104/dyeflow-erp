'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FmsOverviewPage() {
  const router = useRouter()
  const [fmsProcesses, setFmsProcesses] = useState<any[]>([])
  const [processCounts, setProcessCounts] = useState<{ [key: string]: number }>({})

  useEffect(() => {
    loadFmsProcesses()
  }, [])

  const loadFmsProcesses = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    
    // Get all processes from Process Master
    const processes = (db.processes || []).map((p: any) => ({
      code: p.code,
      name: p.name || p.code
    }))
    
    // Add extra FMS stages
    const extraProcesses = [
      { code: 'Qa', name: 'QA' },
      { code: 'Packing', name: 'Packing' },
      { code: 'Dispatch', name: 'Dispatch' }
    ]
    
    // Deduplicate by code
    const seen = new Set()
    const allProcesses: any[] = []
    
    ;[...processes, ...extraProcesses].forEach(p => {
      const code = String(p.code || '').trim()
      if (!code || seen.has(code)) return
      seen.add(code)
      allProcesses.push(p)
    })
    
    setFmsProcesses(allProcesses)
    
    // Calculate batch counts per process
    const counts: { [key: string]: number } = {}
    
    allProcesses.forEach(proc => {
      let count = 0
      
      ;(db.orders || []).forEach((order: any) => {
        const fullRoute = getFmsRouteForOrder(order)
        if (!fullRoute.includes(proc.code)) return
        
        ;(order.splits || []).forEach((batch: any) => {
          const firstCode = getFirstProcessCode(order)
          if (!firstCode) return
          
          // Check if batch sent to FMS
          if (!isBatchSentToFms(batch, firstCode)) return
          
          // Check if batch is active on this process
          const isActive = isBatchActiveOnProcess(batch, proc.code, firstCode)
          if (isActive) count++
        })
      })
      
      counts[proc.code] = count
    })
    
    setProcessCounts(counts)
  }

  const getFirstProcessCode = (order: any) => {
    const route = Array.isArray(order?.processRoute) ? order.processRoute.filter(Boolean) : []
    return route[0] || ''
  }

  const getFmsRouteForOrder = (order: any) => {
    const base = Array.isArray(order?.processRoute) ? order.processRoute.filter(Boolean) : []
    ;['Qa', 'Packing', 'Dispatch'].forEach(x => {
      if (!base.includes(x)) base.push(x)
    })
    return base
  }

  const ensureBatchFmsDispatch = (batch: any) => {
    if (!batch || typeof batch !== 'object') return {}
    if (!batch.fmsDispatch || typeof batch.fmsDispatch !== 'object') batch.fmsDispatch = {}
    if (!batch.fmsActiveProcesses || typeof batch.fmsActiveProcesses !== 'object') batch.fmsActiveProcesses = {}
    return batch.fmsDispatch
  }

  const isBatchSentToFms = (batch: any, processCode: string) => {
    ensureBatchFmsDispatch(batch)
    return !!(batch.fmsDispatch[processCode] && batch.fmsDispatch[processCode].sent)
  }

  const isBatchActiveOnProcess = (batch: any, processCode: string, firstCode: string) => {
    ensureBatchFmsDispatch(batch)
    
    const hasActiveMap = !!(batch.fmsActiveProcesses && Object.keys(batch.fmsActiveProcesses).length)
    
    if (hasActiveMap) {
      return !!batch.fmsActiveProcesses[processCode]
    }
    
    return (String(batch.fmsCurrentProcess || '') === processCode || 
            (!batch.fmsCurrentProcess && firstCode === processCode))
  }

  const getProcessColor = (code: string) => {
    const colors: any = {
      'D': '#3B82F6',
      'S': '#10B981',
      'F': '#8B5CF6',
      'C': '#06B6D4',
      'CBR': '#EF4444',
      'SCO': '#F59E0B',
      'Heat': '#EC4899',
      'Dyeing': '#3B82F6',
      'Stentering': '#10B981',
      'Finishing': '#8B5CF6',
      'Qa': '#6366F1',
      'Packing': '#8B5CF6',
      'Dispatch': '#059669'
    }
    return colors[code] || '#6B7280'
  }

  return (
    <div className="content">
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <div>
            <span className="card-title">FMS Overview</span>
            <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
              Finishing Machine Sheet - Track batches across all production processes
            </p>
          </div>
        </div>
      </div>

      {fmsProcesses.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            No FMS processes configured yet. Add processes in Process Master.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px'
        }}>
          {fmsProcesses.map(proc => {
            const count = processCounts[proc.code] || 0
            const color = getProcessColor(proc.code)
            
            return (
              <div
                key={proc.code}
                onClick={() => router.push(`/fms/${proc.code.toLowerCase()}`)}
                style={{
                  background: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  borderLeft: `4px solid ${color}`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    background: `${color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: color
                  }}>
                    {proc.code.substring(0, 2).toUpperCase()}
                  </div>
                  <span style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: count > 0 ? color : '#9CA3AF'
                  }}>
                    {count}
                  </span>
                </div>
                
                <div style={{ marginBottom: '8px' }}>
                  <div style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#1F2937',
                    marginBottom: '4px'
                  }}>
                    {proc.name}-FMS
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: '#6B7280'
                  }}>
                    {count === 0 ? 'No active batches' : 
                     count === 1 ? '1 active batch' :
                     `${count} active batches`}
                  </div>
                </div>
                
                <div style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid #F3F4F6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: `${color}15`,
                    color: color
                  }}>
                    {proc.code}
                  </span>
                  <span style={{ fontSize: '18px', color: '#9CA3AF' }}>→</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
