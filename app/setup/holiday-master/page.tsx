'use client'

import { useEffect, useState } from 'react'

export default function HolidayMasterPage() {
  const [globalHolidays, setGlobalHolidays] = useState<string[]>([])
  const [machineHolidays, setMachineHolidays] = useState<any[]>([])
  const [machines, setMachines] = useState<any[]>([])
  const [isGlobalModalOpen, setIsGlobalModalOpen] = useState(false)
  const [isMachineModalOpen, setIsMachineModalOpen] = useState(false)
  const [globalDate, setGlobalDate] = useState('')
  const [machineFormData, setMachineFormData] = useState({
    machineId: '',
    date: '',
    reason: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    
    // Load global holidays
    if (!Array.isArray(db.holidays)) db.holidays = []
    const normalized = db.holidays.map((d: any) => {
      if (typeof d === 'string') return d
      if (d instanceof Date) return d.toISOString().split('T')[0]
      return ''
    }).filter(Boolean).sort()
    setGlobalHolidays(normalized)

    // Load machine holidays
    if (!Array.isArray(db.machineHolidays)) db.machineHolidays = []
    setMachineHolidays(db.machineHolidays.sort((a: any, b: any) => 
      a.date.localeCompare(b.date) || a.machineId.localeCompare(b.machineId)
    ))

    // Load machines
    setMachines(db.machines || [])
  }

  const saveGlobalHoliday = () => {
    if (!globalDate) {
      alert('Please select date.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { holidays: [] }
    if (!Array.isArray(db.holidays)) db.holidays = []

    if (db.holidays.includes(globalDate)) {
      alert('Global holiday already exists for this date.')
      return
    }

    db.holidays.push(globalDate)
    db.holidays = db.holidays.sort()

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
    closeGlobalModal()
  }

  const deleteGlobalHoliday = (dateStr: string) => {
    if (!confirm('Delete this global holiday?')) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    db.holidays = (db.holidays || []).filter((d: string) => d !== dateStr)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const nextMachineHolidayId = () => {
    if (machineHolidays.length === 0) return 'MHD-001'
    const nums = machineHolidays.map(h => {
      const match = h.id.match(/(\d+)/)
      return match ? parseInt(match[1]) : 0
    })
    return 'MHD-' + String(Math.max(0, ...nums) + 1).padStart(3, '0')
  }

  const saveMachineHoliday = () => {
    if (!machineFormData.machineId) {
      alert('Please select machine.')
      return
    }

    if (!machineFormData.date) {
      alert('Please select date.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { machineHolidays: [] }
    if (!Array.isArray(db.machineHolidays)) db.machineHolidays = []

    const duplicate = db.machineHolidays.find((x: any) => 
      x.machineId === machineFormData.machineId && x.date === machineFormData.date
    )
    if (duplicate) {
      alert('Machine holiday already exists for this machine/date.')
      return
    }

    db.machineHolidays.push({
      id: nextMachineHolidayId(),
      date: machineFormData.date,
      machineId: machineFormData.machineId,
      reason: machineFormData.reason,
      createdAt: new Date().toISOString()
    })

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
    closeMachineModal()
  }

  const deleteMachineHoliday = (id: string) => {
    if (!confirm('Delete this machine holiday?')) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    db.machineHolidays = (db.machineHolidays || []).filter((x: any) => x.id !== id)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const openGlobalModal = () => {
    setGlobalDate('')
    setIsGlobalModalOpen(true)
  }

  const closeGlobalModal = () => {
    setIsGlobalModalOpen(false)
  }

  const openMachineModal = () => {
    setMachineFormData({ machineId: '', date: '', reason: '' })
    setIsMachineModalOpen(true)
  }

  const closeMachineModal = () => {
    setIsMachineModalOpen(false)
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`
    }
    return dateStr
  }

  const getDayName = (dateStr: string) => {
    try {
      const date = new Date(dateStr + 'T00:00:00')
      return date.toLocaleDateString('en-IN', { weekday: 'long' })
    } catch {
      return '-'
    }
  }

  return (
    <div className="content">
      {/* Beautiful Stats Grid with Color Themes */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '12px',
        marginBottom: '20px'
      }}>
        {/* Global Holiday Card - Green Theme */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          border: '2px solid #EAF3DE',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
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
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, rgba(19, 126, 67, 0.08) 0%, rgba(19, 126, 67, 0) 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '20px' }}>🌍</div>
            <div style={{
              background: '#EAF3DE',
              color: '#137E43',
              fontSize: '9px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '10px',
              letterSpacing: '0.5px'
            }}>
              GLOBAL
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#137E43', marginBottom: '2px', lineHeight: 1 }}>
            {globalHolidays.length}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
            Applicable everywhere
          </div>
        </div>

        {/* Machine Holiday Card - Blue Theme */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          border: '2px solid #E0F2FE',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
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
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, #E0F2FE 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '20px' }}>🔧</div>
            <div style={{
              background: '#E0F2FE',
              color: '#0369A1',
              fontSize: '9px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '10px',
              letterSpacing: '0.5px'
            }}>
              MACHINE
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0369A1', marginBottom: '2px', lineHeight: 1 }}>
            {machineHolidays.length}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
            Machine only
          </div>
        </div>

        {/* Sunday Rule Card - Purple Theme */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          border: '2px solid #F3E8FF',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
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
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, #F3E8FF 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '20px' }}>☀️</div>
            <div style={{
              background: '#F3E8FF',
              color: '#7C3AED',
              fontSize: '9px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '10px',
              letterSpacing: '0.5px'
            }}>
              RULE
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#1a1a18', marginBottom: '2px', lineHeight: 1 }}>
            MANUAL
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
            Add Sunday in Holiday to skip
          </div>
        </div>
      </div>

      {/* Global Holiday Register */}
      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="card-header">
          <span className="card-title">Global Holiday Register</span>
          <button 
            onClick={openGlobalModal}
            style={{ 
              background: 'linear-gradient(135deg, #137E43 0%, #0F6835 100%)',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(19, 126, 67, 0.2)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(19, 126, 67, 0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(19, 126, 67, 0.2)'
            }}
          >
            + Global Holiday
          </button>
        </div>
        {globalHolidays.length === 0 ? (
          <div className="empty-state" style={{ padding: '18px' }}>
            No global holiday added.
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ minWidth: '620px' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {globalHolidays.map(date => (
                  <tr key={date}>
                    <td style={{ fontWeight: 700, color: '#3366CC' }}>
                      {formatDate(date)}
                    </td>
                    <td>{getDayName(date)}</td>
                    <td>
                      <button className="xs danger" onClick={() => deleteGlobalHoliday(date)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Machine Holiday Register */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Machine Holiday Register</span>
          <button 
            onClick={openMachineModal}
            style={{ 
              background: 'linear-gradient(135deg, #137E43 0%, #0F6835 100%)',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(19, 126, 67, 0.2)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(19, 126, 67, 0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(19, 126, 67, 0.2)'
            }}
          >
            + Machine Holiday
          </button>
        </div>
        {machineHolidays.length === 0 ? (
          <div className="empty-state" style={{ padding: '18px' }}>
            No machine holiday added.
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ minWidth: '760px' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Machine</th>
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {machineHolidays.map(holiday => {
                  const machine = machines.find(m => m.id === holiday.machineId)
                  return (
                    <tr key={holiday.id}>
                      <td style={{ fontWeight: 700, color: '#3366CC' }}>
                        {formatDate(holiday.date)}
                      </td>
                      <td>{machine ? machine.name : holiday.machineId}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {holiday.reason || '-'}
                      </td>
                      <td>
                        <button className="xs danger" onClick={() => deleteMachineHoliday(holiday.id)}>
                          Delete
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

      {/* Global Holiday Modal */}
      {isGlobalModalOpen && (
        <div className="modal-overlay" onClick={closeGlobalModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Global Holiday</span>
              <button className="small" onClick={closeGlobalModal}>✕</button>
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label>Date *</label>
              <input
                type="date"
                value={globalDate}
                onChange={(e) => setGlobalDate(e.target.value)}
              />
            </div>

            <button 
              onClick={saveGlobalHoliday}
              style={{ 
                width: '100%',
                background: 'linear-gradient(135deg, #137E43 0%, #0F6835 100%)',
                color: 'white',
                border: 'none',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(19, 126, 67, 0.2)'
              }}
            >
              ✓ Save
            </button>
          </div>
        </div>
      )}

      {/* Machine Holiday Modal */}
      {isMachineModalOpen && (
        <div className="modal-overlay" onClick={closeMachineModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Machine Holiday</span>
              <button className="small" onClick={closeMachineModal}>✕</button>
            </div>

            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Machine *</label>
              <select
                value={machineFormData.machineId}
                onChange={(e) => setMachineFormData({ ...machineFormData, machineId: e.target.value })}
              >
                <option value="">Select machine</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>Date *</label>
              <input
                type="date"
                value={machineFormData.date}
                onChange={(e) => setMachineFormData({ ...machineFormData, date: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label>Reason</label>
              <input
                value={machineFormData.reason}
                onChange={(e) => setMachineFormData({ ...machineFormData, reason: e.target.value })}
                placeholder="Optional reason"
              />
            </div>

            <button 
              onClick={saveMachineHoliday}
              style={{ 
                width: '100%',
                background: 'linear-gradient(135deg, #137E43 0%, #0F6835 100%)',
                color: 'white',
                border: 'none',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(19, 126, 67, 0.2)'
              }}
            >
              ✓ Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
