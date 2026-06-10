'use client'

import { useEffect, useState } from 'react'
import { useSupervisorFilter } from '@/lib/permissions'

// Shade grouping helper functions — reads custom rules from db, falls back to built-in keywords
const BUILTIN_SHADE_RULES = [
  { keyword: 'white',   shadeGroup: 'White'  },
  { keyword: 'bleach',  shadeGroup: 'White'  },
  { keyword: 'optical', shadeGroup: 'White'  },
  { keyword: 'light',   shadeGroup: 'Light'  },
  { keyword: 'pale',    shadeGroup: 'Light'  },
  { keyword: 'cream',   shadeGroup: 'Light'  },
  { keyword: 'beige',   shadeGroup: 'Light'  },
  { keyword: 'pastel',  shadeGroup: 'Light'  },
  { keyword: 'dark',    shadeGroup: 'Dark'   },
  { keyword: 'black',   shadeGroup: 'Dark'   },
  { keyword: 'navy',    shadeGroup: 'Dark'   },
  { keyword: 'deep',    shadeGroup: 'Dark'   },
  { keyword: 'medium',  shadeGroup: 'Medium' },
  { keyword: 'normal',  shadeGroup: 'Medium' },
]

const getShadeTypeByColor = (color: string): string => {
  const c = (color || '').toLowerCase()
  // Read custom rules from db (loaded lazily each call is fine for machine page)
  try {
    const raw = localStorage.getItem('dyeflow_db')
    const customRules: any[] = raw ? (JSON.parse(raw).shadeRules || []) : []
    for (const rule of customRules) {
      if (c.includes((rule.keyword || '').toLowerCase())) return rule.shadeGroup
    }
  } catch { /* ignore */ }
  // Fall back to built-in rules
  for (const rule of BUILTIN_SHADE_RULES) {
    if (c.includes(rule.keyword)) return rule.shadeGroup
  }
  return 'Medium' // Default
}

const getShadeGroup = (color: string): number => {
  const shade = getShadeTypeByColor(color)
  const map: Record<string, number> = { 'White': 1, 'Light': 2, 'Medium': 3, 'Dark': 4 }
  return map[shade] || 3
}

const getMachineShortName = (name: string) => {
  return (name || '').replace(/^Machine\s*/i, 'M ').trim()
}

const getProcObj = (code: string) => {
  const stored = localStorage.getItem('dyeflow_db')
  if (!stored) return null
  const db = JSON.parse(stored)
  const processes = db.processes || []
  return processes.find((p: any) => p.code === code)
}

// Helper function to check if a batch machine matches a machine record
const isMachineMatch = (batchMachine: string, machine: any): boolean => {
  if (!batchMachine) return false
  
  // Direct ID match
  if (batchMachine === machine.id) return true
  
  // Direct name match
  if (batchMachine === machine.name) return true
  
  // Case-insensitive name match
  const batchMachineLower = batchMachine.toLowerCase()
  const machineNameLower = (machine.name || '').toLowerCase()
  if (batchMachineLower === machineNameLower) return true
  
  // Partial match (e.g., "NO. 28" should match "Machine NO. 28")
  if (machineNameLower.includes(batchMachineLower) || batchMachineLower.includes(machineNameLower)) {
    return true
  }
  
  return false
}

export default function MachinesPage() {
  const supervisorFilter = useSupervisorFilter()
  const [machines, setMachines] = useState<any[]>([])
  const [machineData, setMachineData] = useState<Record<string, any>>({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const machinesList = db.machines || []
    setMachines(machinesList)

    const ordersWithSplits = (db.orders || []).filter((o: any) => o.splits && o.splits.length > 0)
    void ordersWithSplits // used for context only

    // Build data for each machine
    const data: Record<string, any> = {}

    for (const machine of machinesList) {
      const batches: any[] = []

      for (const order of (db.orders || [])) {
        if (!order.splits || order.splits.length === 0) continue
        // Apply supervisor filter
        if (supervisorFilter && order.supervisor !== supervisorFilter) continue

        for (const batch of order.splits) {
          const batchMachine = batch.machine || order.machine
          if (!batchMachine) continue
          if (!isMachineMatch(batchMachine, machine)) continue

          batches.push({
            ...batch,
            orderNo: order.orderNumber,
            party: order.party,
            article: order.article,
            color: order.color,
            blend: order.blend,
            processRoute: order.processRoute || [],
            supervisor: order.supervisor,
            machine: batchMachine
          })
        }
      }

      // Sort batches by shade group, then by date
      const sorted = batches.sort((a, b) => {
        const shadeCompare = getShadeGroup(a.color) - getShadeGroup(b.color)
        if (shadeCompare !== 0) return shadeCompare
        return (a.date || '').localeCompare(b.date || '')
      })

      // Group by shade type
      const grouped: Record<string, any[]> = {}
      for (const batch of sorted) {
        const shadeType = getShadeTypeByColor(batch.color)
        if (!grouped[shadeType]) grouped[shadeType] = []
        grouped[shadeType].push(batch)
      }

      data[machine.id] = {
        batches: sorted,
        grouped,
        totalBatches: batches.length
      }
    }

    setMachineData(data)
  }

  const getStatusBadge = (status: string) => {
    const badges: any = {
      new: { bg: '#DBEAFE', color: '#1E40AF', label: 'New' },
      pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
      'in-process': { bg: '#DBEAFE', color: '#1E40AF', label: 'In Process' },
      done: { bg: '#D1FAE5', color: '#065F46', label: 'Done' }
    }
    
    const badge = badges[status] || { bg: '#F3F4F6', color: '#6B7280', label: status }
    
    return (
      <span style={{
        padding: '4px 10px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 600,
        background: badge.bg,
        color: badge.color,
        whiteSpace: 'nowrap'
      }}>
        {badge.label}
      </span>
    )
  }

  const renderProcessRoute = (processRoute: string[], currentProcess?: string) => {
    if (!processRoute || processRoute.length === 0) return '-'
    
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center' }}>
        {processRoute.map((code: string, idx: number) => {
          const proc = getProcObj(code) || { code, name: code }
          const isActive = code === currentProcess
          
          return (
            <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span style={{
                background: isActive ? '#10B981' : '#DBEAFE',
                color: isActive ? 'white' : '#1E40AF',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600
              }}>
                {proc.name || code}
              </span>
              {idx < processRoute.length - 1 && (
                <span style={{ color: '#9CA3AF', fontSize: '11px', fontWeight: 600 }}>→</span>
              )}
            </span>
          )
        })}
      </div>
    )
  }

  if (machines.length === 0) {
    return (
      <div className="content">
        <div className="card">
          <div className="empty-state" style={{ padding: '60px' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🏭</div>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
              No Machines Configured
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>
              Add machines in Machine Master to see machine sheets here.
            </div>
            <button className="primary" onClick={() => window.location.href = '/setup'}>
              Go to Masters & Setup →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="content">
      {/* Debug Info - Removed */}

      {machines.map((machine) => {
        const data = machineData[machine.id] || { batches: [], grouped: {}, totalBatches: 0 }
        const { batches, grouped, totalBatches } = data

        return (
          <div key={machine.id} className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <div className="card-title">{machine.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  Capacity: {machine.capacity} Kg &nbsp;•&nbsp; Type: {machine.type || 'N/A'} &nbsp;•&nbsp; {totalBatches} batch{totalBatches !== 1 ? 'es' : ''}
                </div>
              </div>
              <span style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                background: machine.status === 'running' ? '#D1FAE5' : '#F3F4F6',
                color: machine.status === 'running' ? '#065F46' : '#6B7280'
              }}>
                {machine.status === 'running' ? 'Running' : 'Idle'}
              </span>
            </div>

            {batches.length === 0 ? (
              <div className="empty-state" style={{ padding: '20px' }}>
                No batches assigned to this machine
              </div>
            ) : (
              <>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  Shade-Sequenced Schedule
                </div>

                {Object.entries(grouped).map(([shadeType, shadeBatches]: [string, any]) => (
                  <div key={shadeType} style={{ marginBottom: '14px' }}>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#6B7280',
                      marginBottom: '6px',
                      padding: '4px 8px',
                      background: '#F9FAFB',
                      borderRadius: '4px',
                      display: 'inline-block'
                    }}>
                      {shadeType.toUpperCase()} SHADES
                    </div>

                    <div className="table-wrap">
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#F9FAFB' }}>
                            <th style={thStyle}>BATCH ID</th>
                            <th style={thStyle}>ORDER #</th>
                            <th style={thStyle}>PARTY</th>
                            <th style={thStyle}>COLOR</th>
                            <th style={thStyle}>ARTICLE</th>
                            <th style={thStyle}>QTY (KG)</th>
                            <th style={thStyle}>CURRENT PROCESS</th>
                            <th style={thStyle}>PROCESS ROUTE</th>
                            <th style={thStyle}>START DATE</th>
                            <th style={thStyle}>STATUS</th>
                            <th style={thStyle}>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shadeBatches.map((batch: any, idx: number) => (
                            <tr
                              key={batch.batchId || idx}
                              style={{
                                background: idx % 2 === 0 ? 'white' : '#FAFAFA',
                                borderBottom: '1px solid #F3F4F6'
                              }}
                            >
                              <td style={{ ...tdStyle, fontWeight: 700, color: '#2563EB' }}>
                                {batch.batchId}
                              </td>
                              <td style={tdStyle}>{batch.orderNo}</td>
                              <td style={tdStyle}>{batch.party}</td>
                              <td style={tdStyle}>{batch.color}</td>
                              <td style={{ ...tdStyle, fontWeight: 500 }}>
                                {batch.article}
                              </td>
                              <td style={{ ...tdStyle, fontWeight: 600 }}>
                                {batch.kg}
                              </td>
                              <td style={tdStyle}>
                                {batch.currentProcess ? (
                                  <span style={{
                                    background: '#10B981',
                                    color: 'white',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 600
                                  }}>
                                    {batch.currentProcess}
                                  </span>
                                ) : '-'}
                              </td>
                              <td style={{ ...tdStyle, minWidth: '150px' }}>
                                {renderProcessRoute(batch.processRoute, batch.currentProcess)}
                              </td>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                {batch.date || '-'}
                              </td>
                              <td style={tdStyle}>
                                {getStatusBadge(batch.status || 'new')}
                              </td>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                <button
                                  onClick={() => window.location.href = `/fms/${batch.fmsCurrentProcess || (batch.processRoute?.[0] || '')}`}
                                  style={{
                                    padding: '5px 10px',
                                    fontSize: '11px',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '4px',
                                    background: 'white',
                                    cursor: 'pointer',
                                    marginRight: '4px',
                                    color: '#374151'
                                  }}
                                >
                                  Sheet
                                </button>
                                {batch.status !== 'done' && (
                                  <button
                                    onClick={() => {
                                      if (!confirm(`Mark batch ${batch.batchId} as done in ${batch.fmsCurrentProcess || '(current process)'}?`)) return
                                      const stored = localStorage.getItem('dyeflow_db')
                                      if (!stored) return
                                      const db = JSON.parse(stored)
                                      for (const order of (db.orders || [])) {
                                        const b = (order.splits || []).find((s: any) => s.batchId === batch.batchId)
                                        if (!b) continue
                                        const today = new Date().toISOString().split('T')[0]
                                        if (!b.fmsActualDates) b.fmsActualDates = {}
                                        const code = b.fmsCurrentProcess
                                        if (code) b.fmsActualDates[code] = today
                                        const route: string[] = order.processRoute || []
                                        const idx = code ? route.indexOf(code) : -1
                                        const next = idx >= 0 ? route[idx + 1] : ''
                                        if (next) {
                                          if (!b.fmsActiveProcesses) b.fmsActiveProcesses = {}
                                          b.fmsActiveProcesses[next] = true
                                          b.fmsCurrentProcess = next
                                          if (!b.fmsDispatch) b.fmsDispatch = {}
                                          b.fmsDispatch[next] = { sent: true, sentAt: new Date().toISOString() }
                                        } else {
                                          b.fmsDone = true
                                          b.status = 'done'
                                        }
                                        break
                                      }
                                      localStorage.setItem('dyeflow_db', JSON.stringify(db))
                                      window.dispatchEvent(new Event('dyeflow-db-updated'))
                                      loadData()
                                    }}
                                    style={{
                                      padding: '5px 10px',
                                      fontSize: '11px',
                                      border: 'none',
                                      borderRadius: '4px',
                                      background: '#10B981',
                                      color: 'white',
                                      cursor: 'pointer',
                                      fontWeight: 600
                                    }}
                                  >
                                    Done
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: '10px',
  fontWeight: 700,
  color: '#6B7280',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '2px solid #E5E7EB',
  borderRight: '1px solid #E5E7EB',
  whiteSpace: 'nowrap'
}

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: '12px',
  color: '#1F2937',
  borderRight: '1px solid #F3F4F6',
  whiteSpace: 'nowrap'
}
