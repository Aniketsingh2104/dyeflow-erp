'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const FMS_STEP_CONFIG = [
  { 
    key: 'greigeRfdFabricReceived', 
    title: 'GREIGE RFD FABRIC RECEIVED', 
    bg: '#BBDEFB', 
    fg: '#0C447C', 
    border: '#90CAF9'
  },
  { 
    key: 'deliveryDateEntry', 
    title: 'DELIVERY DATE ENTRY', 
    bg: '#C8E6C9', 
    fg: '#1B5E20', 
    border: '#A5D6A7'
  },
  { 
    key: 'firstSubmission', 
    title: '1ST SUBMISSION', 
    bg: '#FFE0B2', 
    fg: '#E65100', 
    border: '#FFCC80'
  },
  { 
    key: 'partyApproval', 
    title: 'PARTY APPROVAL', 
    bg: '#F8BBD0', 
    fg: '#880E4F', 
    border: '#F48FB1'
  },
]

// Actual supervisor names from Master
const SUPERVISORS_LIST = [
  'Kundan M.',
  'Nandlal M.',
  'Urvesh M.',
  'Gyaneshwar M.',
  'Jitesh M.',
  'Arpit M.',
  'Ketan M.',
  'Ajay M.'
]

export default function LabFmsPage() {
  const router = useRouter()
  const [confirmedRequests, setConfirmedRequests] = useState<any[]>([])
  const [filteredRequests, setFilteredRequests] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [stepNumbers, setStepNumbers] = useState<Record<string, string>>({})
  const [currentTime, setCurrentTime] = useState(new Date())
  const [stats, setStats] = useState({
    total: 0,
    today: 0,
    openIssues: 0,
    completedSteps: 0,
    totalSteps: 0
  })

  useEffect(() => {
    loadData()
    
    // Update current time every minute for live delay calculation
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000) // Update every minute

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    applyFilters()
  }, [confirmedRequests, searchQuery])

  // Helper: Parse DD/MM/YYYY to Date object
  const parseDDMMYYYY = (dateStr: string): Date | null => {
    if (!dateStr) return null
    
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/')
      if (parts.length !== 3) return null
      
      const day = parseInt(parts[0])
      const month = parseInt(parts[1]) - 1
      const year = parseInt(parts[2])
      
      if (isNaN(day) || isNaN(month) || isNaN(year)) return null
      return new Date(year, month, day, 23, 59, 59) // End of day
    }
    
    // ISO format
    return new Date(dateStr)
  }

  // Helper: Add days to a date (works with both DD/MM/YYYY and ISO formats)
  const addDaysToDate = (dateStr: string, days: number): string => {
    if (!dateStr || !days) return ''
    
    let date: Date
    
    // Check if it's DD/MM/YYYY format
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/')
      if (parts.length !== 3) return ''
      
      const day = parseInt(parts[0])
      const month = parseInt(parts[1]) - 1 // Month is 0-indexed
      const year = parseInt(parts[2])
      
      if (isNaN(day) || isNaN(month) || isNaN(year)) return ''
      date = new Date(year, month, day)
    } else {
      // ISO format
      date = new Date(dateStr)
    }
    
    if (isNaN(date.getTime())) return ''
    
    date.setDate(date.getDate() + days)
    
    const newDay = String(date.getDate()).padStart(2, '0')
    const newMonth = String(date.getMonth() + 1).padStart(2, '0')
    const newYear = date.getFullYear()
    
    return `${newDay}/${newMonth}/${newYear}`
  }

  // Calculate delay for a step
  const calculateDelay = (planned: string, actual: string | null, status: boolean) => {
    if (!planned) return { text: '-', color: '#64748B', isLate: false }
    
    const plannedDate = parseDDMMYYYY(planned)
    if (!plannedDate) return { text: '-', color: '#64748B', isLate: false }
    
    // If marked done
    if (status && actual) {
      const actualDate = new Date(actual)
      const diffMs = actualDate.getTime() - plannedDate.getTime()
      
      // Completed before or on planned date
      if (diffMs <= 0) {
        return { text: '', color: '#64748B', isLate: false }
      }
      
      // Completed after planned date - show final delay in red
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      
      return {
        text: `+${days}d ${hours}h ${minutes}m`,
        color: '#DC2626',
        isLate: true
      }
    }
    
    // Not yet completed - calculate current delay
    const now = currentTime
    const diffMs = now.getTime() - plannedDate.getTime()
    
    const absDiffMs = Math.abs(diffMs)
    const days = Math.floor(absDiffMs / (1000 * 60 * 60 * 24))
    const hours = Math.floor((absDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60))
    
    if (diffMs < 0) {
      // Time left (before planned date) - GREEN with MINUS
      return {
        text: `-${days}d ${hours}h ${minutes}m`,
        color: '#16A34A',
        isLate: false
      }
    } else {
      // Time exceeded (after planned date) - RED with PLUS
      return {
        text: `+${days}d ${hours}h ${minutes}m`,
        color: '#DC2626',
        isLate: true
      }
    }
  }

  // Calculate planned dates based on the complete logic
  const calculatePlannedDates = (request: any, fms: any, stepNumbers: Record<string, string>) => {
    const confirmedAt = request.confirmedAt // ISO format timestamp
    const deliveryDate = fms.deliveryDate // DD/MM/YYYY format
    const fabricRequired = fms.fabricRequired // Supervisor name or empty
    
    // Reset all planned dates first
    FMS_STEP_CONFIG.forEach(step => {
      if (fms.steps[step.key]) {
        fms.steps[step.key].planned = ''
      }
    })
    
    // STEP 1: Greige RFD Fabric Received
    // Only generate if Fabric Required has a supervisor selected
    // Formula: Confirmed At + Number
    if (fabricRequired && confirmedAt && stepNumbers['greigeRfdFabricReceived']) {
      const days = parseInt(stepNumbers['greigeRfdFabricReceived'])
      if (!isNaN(days)) {
        fms.steps['greigeRfdFabricReceived'].planned = addDaysToDate(confirmedAt, days)
      }
    }
    
    // STEP 2: Delivery Date Entry
    // Two conditions:
    // A) If Fabric Required is NOT selected: Confirmed At + Number
    // B) If Fabric Required IS selected: Greige RFD Actual + Number
    if (stepNumbers['deliveryDateEntry']) {
      const days = parseInt(stepNumbers['deliveryDateEntry'])
      if (!isNaN(days)) {
        if (!fabricRequired) {
          // Condition A: Fabric Required is empty
          if (confirmedAt) {
            fms.steps['deliveryDateEntry'].planned = addDaysToDate(confirmedAt, days)
          }
        } else {
          // Condition B: Fabric Required has supervisor
          const greigeActual = fms.steps['greigeRfdFabricReceived']?.actual
          if (greigeActual) {
            fms.steps['deliveryDateEntry'].planned = addDaysToDate(greigeActual, days)
          }
        }
      }
    }
    
    // STEP 3: 1st Submission
    // Formula: Delivery Date + Number
    if (deliveryDate && stepNumbers['firstSubmission']) {
      const days = parseInt(stepNumbers['firstSubmission'])
      if (!isNaN(days)) {
        fms.steps['firstSubmission'].planned = addDaysToDate(deliveryDate, days)
      }
    }
    
    // STEP 4: Party Approval
    // Formula: 1st Submission Actual + Number
    const firstSubmissionActual = fms.steps['firstSubmission']?.actual
    if (firstSubmissionActual && stepNumbers['partyApproval']) {
      const days = parseInt(stepNumbers['partyApproval'])
      if (!isNaN(days)) {
        fms.steps['partyApproval'].planned = addDaysToDate(firstSubmissionActual, days)
      }
    }
  }

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.labRequests) db.labRequests = []
    if (!db.labIssues) db.labIssues = []

    // Get confirmed requests
    const confirmed = db.labRequests.filter((r: any) => r.confirmed)
    
    // Load step numbers first
    const savedNumbers = db.fmsStepNumbers || {}
    setStepNumbers(savedNumbers)
    
    // Calculate planned dates for each request
    confirmed.forEach((request: any) => {
      const fms = ensureFmsData(request)
      calculatePlannedDates(request, fms, savedNumbers)
    })
    
    setConfirmedRequests(confirmed)

    // Calculate stats
    const todayStr = new Date().toDateString()
    const todayCount = confirmed.filter((x: any) =>
      new Date(x.confirmedAt || x.createdAt).toDateString() === todayStr
    ).length

    const openIssuesCount = confirmed.reduce((sum: number, r: any) => {
      const issues = db.labIssues.filter((i: any) => i.requestId === r.id && !i.solved)
      return sum + issues.length
    }, 0)

    const totalStepSlots = confirmed.length * FMS_STEP_CONFIG.length
    const completedSteps = confirmed.reduce((sum: number, r: any) => {
      const fms = ensureFmsData(r)
      return sum + FMS_STEP_CONFIG.filter(s => !!fms.steps[s.key]?.status).length
    }, 0)

    setStats({
      total: confirmed.length,
      today: todayCount,
      openIssues: openIssuesCount,
      completedSteps,
      totalSteps: totalStepSlots
    })
  }

  const ensureFmsData = (request: any) => {
    if (!request.fmsData) {
      request.fmsData = {
        deliveryDate: '',
        chartNumber: '',
        fabricRequired: '',
        steps: {}
      }
    }
    if (!request.fmsData.steps) {
      request.fmsData.steps = {}
    }
    // Ensure all steps exist
    FMS_STEP_CONFIG.forEach(step => {
      if (!request.fmsData.steps[step.key]) {
        request.fmsData.steps[step.key] = {
          planned: '',
          actual: '',
          status: false
        }
      }
    })
    return request.fmsData
  }

  const applyFilters = () => {
    if (!searchQuery) {
      setFilteredRequests(confirmedRequests)
      return
    }

    const q = searchQuery.toLowerCase()
    const filtered = confirmedRequests.filter((r: any) =>
      (r.id || '').toLowerCase().includes(q) ||
      (r.party || '').toLowerCase().includes(q) ||
      (r.shadePantone || '').toLowerCase().includes(q)
    )
    setFilteredRequests(filtered)
  }

  const updateStepStatus = (requestId: string, stepKey: string, checked: boolean) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const request = db.labRequests.find((r: any) => r.id === requestId)
    if (!request) return

    const fms = ensureFmsData(request)
    fms.steps[stepKey].status = checked
    if (checked && !fms.steps[stepKey].actual) {
      fms.steps[stepKey].actual = new Date().toISOString()
    }

    // Recalculate planned dates when actual changes
    calculatePlannedDates(request, fms, stepNumbers)

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const updateDeliveryDate = (requestId: string, value: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const request = db.labRequests.find((r: any) => r.id === requestId)
    if (!request) return

    const fms = ensureFmsData(request)
    fms.deliveryDate = value

    // Auto-tick Delivery Date Entry status when delivery date is entered
    // Auto-untick when delivery date is cleared
    if (value && value.trim() !== '') {
      // Delivery date entered - tick the status
      fms.steps['deliveryDateEntry'].status = true
      if (!fms.steps['deliveryDateEntry'].actual) {
        fms.steps['deliveryDateEntry'].actual = new Date().toISOString()
      }
    } else {
      // Delivery date cleared - untick the status
      fms.steps['deliveryDateEntry'].status = false
      fms.steps['deliveryDateEntry'].actual = ''
    }

    // Recalculate planned dates when delivery date changes
    calculatePlannedDates(request, fms, stepNumbers)

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const updateChartNumber = (requestId: string, value: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const request = db.labRequests.find((r: any) => r.id === requestId)
    if (!request) return

    const fms = ensureFmsData(request)
    fms.chartNumber = value

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const updateFabricRequired = (requestId: string, value: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const request = db.labRequests.find((r: any) => r.id === requestId)
    if (!request) return

    const fms = ensureFmsData(request)
    fms.fabricRequired = value

    // Recalculate planned dates when fabric required changes
    calculatePlannedDates(request, fms, stepNumbers)

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const updateStepNumber = (stepKey: string, value: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.fmsStepNumbers) db.fmsStepNumbers = {}
    db.fmsStepNumbers[stepKey] = value

    // Recalculate all planned dates for all requests
    db.labRequests.forEach((request: any) => {
      if (request.confirmed) {
        const fms = ensureFmsData(request)
        calculatePlannedDates(request, fms, db.fmsStepNumbers)
      }
    })

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setStepNumbers({ ...stepNumbers, [stepKey]: value })
    loadData()
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
    
    // If it's already in DD/MM/YYYY format, return as is
    if (dateStr.includes('/')) {
      return dateStr
    }
    
    // Otherwise parse ISO date
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB')
  }

  return (
    <div className="content">
      {/* Search Bar */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        gap: '14px', 
        flexWrap: 'wrap',
        marginBottom: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            placeholder="Search request / party / shade..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              width: '320px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-light)',
              fontSize: '13px'
            }}
          />
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
            {confirmedRequests.length} request{confirmedRequests.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{
          fontSize: '10px',
          padding: '6px 12px',
          background: '#F0F9FF',
          border: '1px solid #BAE6FD',
          borderRadius: '6px',
          color: '#0369A1',
          maxWidth: '700px',
          lineHeight: '1.4'
        }}>
          <strong>Logic:</strong> Greige = Confirmed + Num (if supervisor) | Delivery Entry = Confirmed + Num OR Greige Actual + Num | 1st Sub = Delivery + Num | Party = 1st Sub Actual + Num
        </div>
      </div>

      {/* FMS Register Table */}
      {filteredRequests.length === 0 ? (
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '48px',
          textAlign: 'center',
          border: '2px dashed #E5E7EB'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '6px' }}>
            {confirmedRequests.length === 0 
              ? 'No confirmed requests yet'
              : 'No matching requests found'}
          </div>
          <div style={{ fontSize: '13px', color: '#6B7280' }}>
            {confirmedRequests.length === 0 
              ? 'Confirmed lab requests will appear here'
              : 'Try adjusting your search criteria'}
          </div>
        </div>
      ) : (
        <div style={{ 
          overflowX: 'auto',
          background: 'white',
          borderRadius: '8px',
          border: '1px solid var(--border-light)'
        }}>
          <table style={{ 
            minWidth: '2400px', 
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0
          }}>
            <thead>
              {/* Main Step Headers */}
              <tr>
                <th rowSpan={3} style={{ 
                  position: 'sticky', 
                  left: 0, 
                  background: '#f8f9fa',
                  zIndex: 3,
                  padding: '10px 12px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderRight: '2px solid #e2e8f0',
                  borderBottom: '1px solid #e2e8f0',
                  minWidth: '120px'
                }}>
                  LAB REQUEST NO
                </th>
                <th rowSpan={3} style={{ 
                  background: '#f8f9fa',
                  padding: '10px 12px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #e2e8f0',
                  minWidth: '140px'
                }}>
                  CONFIRMED AT
                </th>
                <th rowSpan={3} style={{ 
                  background: '#f8f9fa',
                  padding: '10px 12px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #e2e8f0',
                  minWidth: '80px'
                }}>
                  UNIT
                </th>
                <th rowSpan={3} style={{ 
                  background: '#f8f9fa',
                  padding: '10px 12px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #e2e8f0',
                  minWidth: '150px'
                }}>
                  PARTY
                </th>
                <th rowSpan={3} style={{ 
                  background: '#f8f9fa',
                  padding: '10px 12px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #e2e8f0',
                  minWidth: '120px'
                }}>
                  SHADE / PANTONE
                </th>
                <th rowSpan={3} style={{ 
                  background: '#f8f9fa',
                  padding: '10px 12px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #e2e8f0',
                  minWidth: '130px'
                }}>
                  DELIVERY DATE
                </th>
                <th rowSpan={3} style={{ 
                  background: '#f8f9fa',
                  padding: '10px 12px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #e2e8f0',
                  minWidth: '110px'
                }}>
                  CHART NUMBER
                </th>
                <th rowSpan={3} style={{ 
                  background: '#f8f9fa',
                  padding: '10px 12px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #e2e8f0',
                  minWidth: '130px'
                }}>
                  FABRIC REQUIRED
                </th>
                <th rowSpan={3} style={{ 
                  background: '#f8f9fa',
                  padding: '10px 12px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #e2e8f0',
                  borderRight: '2px solid #e2e8f0',
                  minWidth: '90px'
                }}>
                  OPEN ISSUE
                </th>
                {FMS_STEP_CONFIG.map(step => (
                  <th key={step.key} colSpan={4} style={{ 
                    background: step.bg, 
                    color: step.fg, 
                    padding: '10px 12px',
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderLeft: '2px solid white',
                    borderBottom: '1px solid white',
                    textAlign: 'center'
                  }}>
                    {step.title}
                  </th>
                ))}
              </tr>
              
              {/* Step Numbers Row */}
              <tr>
                {FMS_STEP_CONFIG.map(step => (
                  <th key={step.key} colSpan={4} style={{ 
                    background: step.bg,
                    padding: '8px 10px',
                    borderLeft: '2px solid white',
                    borderBottom: '1px solid white'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                      <span style={{ fontSize: '9px', color: step.fg, fontWeight: 600 }}>NUMBER</span>
                      <input
                        value={stepNumbers[step.key] || ''}
                        onChange={(e) => updateStepNumber(step.key, e.target.value)}
                        style={{ 
                          width: '60px', 
                          padding: '3px 6px', 
                          fontSize: '11px',
                          border: '1px solid rgba(0,0,0,0.1)',
                          borderRadius: '4px',
                          textAlign: 'center',
                          background: 'white'
                        }}
                        placeholder="0"
                      />
                    </div>
                  </th>
                ))}
              </tr>
              
              {/* Column Headers */}
              <tr>
                {FMS_STEP_CONFIG.map(step => (
                  <React.Fragment key={step.key}>
                    <th style={{ 
                      background: step.bg, 
                      color: step.fg, 
                      padding: '8px 10px',
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.3px',
                      borderLeft: '2px solid white',
                      borderBottom: '2px solid white',
                      minWidth: '90px'
                    }}>
                      PLANNED
                    </th>
                    <th style={{ 
                      background: step.bg, 
                      color: step.fg, 
                      padding: '8px 10px',
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.3px',
                      borderLeft: '1px solid rgba(255,255,255,0.5)',
                      borderBottom: '2px solid white',
                      minWidth: '90px'
                    }}>
                      ACTUAL
                    </th>
                    <th style={{ 
                      background: step.bg, 
                      color: step.fg, 
                      padding: '8px 10px',
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.3px',
                      borderLeft: '1px solid rgba(255,255,255,0.5)',
                      borderBottom: '2px solid white',
                      minWidth: '70px'
                    }}>
                      STATUS
                    </th>
                    <th style={{ 
                      background: step.bg, 
                      color: step.fg, 
                      padding: '8px 10px',
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.3px',
                      borderLeft: '1px solid rgba(255,255,255,0.5)',
                      borderBottom: '2px solid white',
                      minWidth: '110px'
                    }}>
                      DELAY
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            
            <tbody>
              {filteredRequests.map((request, rowIndex) => {
                const fms = ensureFmsData(request)
                const openIssueCount = getOpenIssueCount(request.id)

                return (
                  <tr key={request.id} style={{ 
                    background: rowIndex % 2 === 0 ? 'white' : '#fafbfc'
                  }}>
                    <td style={{ 
                      fontWeight: 700, 
                      color: '#137E43',
                      position: 'sticky', 
                      left: 0, 
                      background: rowIndex % 2 === 0 ? 'white' : '#fafbfc',
                      zIndex: 2,
                      padding: '10px 12px',
                      borderRight: '2px solid #e2e8f0',
                      fontSize: '12px'
                    }}>
                      {request.id}
                    </td>
                    <td style={{ 
                      whiteSpace: 'nowrap', 
                      fontSize: '11px',
                      padding: '10px 12px',
                      color: '#475569'
                    }}>
                      {formatDate(request.confirmedAt)}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: '#1e293b' }}>
                      {request.unit || '-'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: '#1e293b' }}>
                      {request.party || '-'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: '#1e293b' }}>
                      {request.shadePantone || '-'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        type="text"
                        value={fms.deliveryDate || ''}
                        onChange={(e) => updateDeliveryDate(request.id, e.target.value)}
                        placeholder="DD/MM/YYYY"
                        style={{ 
                          padding: '5px 8px', 
                          fontSize: '12px',
                          minWidth: '110px',
                          borderRadius: '4px',
                          border: '1px solid #e2e8f0',
                          background: 'white',
                          fontWeight: 600
                        }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        type="text"
                        value={fms.chartNumber || ''}
                        onChange={(e) => updateChartNumber(request.id, e.target.value)}
                        placeholder="Chart #"
                        style={{ 
                          padding: '5px 8px', 
                          fontSize: '12px',
                          minWidth: '100px',
                          borderRadius: '4px',
                          border: '1px solid #e2e8f0'
                        }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <select
                        value={fms.fabricRequired || ''}
                        onChange={(e) => updateFabricRequired(request.id, e.target.value)}
                        style={{ 
                          padding: '5px 8px', 
                          fontSize: '12px',
                          minWidth: '120px',
                          borderRadius: '4px',
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        <option value="">Choose Supervisor</option>
                        {SUPERVISORS_LIST.map(sup => (
                          <option key={sup} value={sup}>{sup}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ 
                      textAlign: 'center',
                      padding: '10px 12px',
                      borderRight: '2px solid #e2e8f0'
                    }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: openIssueCount > 0 ? '#FEF3C7' : '#D1FAE5',
                        color: openIssueCount > 0 ? '#92400E' : '#065F46'
                      }}>
                        {openIssueCount}
                      </span>
                    </td>
                    
                    {/* Step Columns */}
                    {FMS_STEP_CONFIG.map(step => {
                      const stepData = fms.steps[step.key]
                      const delay = calculateDelay(stepData.planned, stepData.actual, stepData.status)
                      
                      return (
                        <React.Fragment key={step.key}>
                          <td style={{ 
                            background: step.bg, 
                            fontSize: '11px', 
                            whiteSpace: 'nowrap',
                            padding: '10px 12px',
                            borderLeft: '2px solid white',
                            color: step.fg,
                            fontWeight: 600
                          }}>
                            {formatDateShort(stepData.planned)}
                          </td>
                          <td style={{ 
                            background: step.bg, 
                            fontSize: '11px', 
                            whiteSpace: 'nowrap',
                            padding: '10px 12px',
                            borderLeft: '1px solid rgba(255,255,255,0.5)',
                            color: stepData.actual ? '#1B5E20' : step.fg,
                            fontWeight: stepData.actual ? 700 : 400
                          }}>
                            {formatDateShort(stepData.actual)}
                          </td>
                          <td style={{ 
                            background: step.bg, 
                            textAlign: 'center',
                            padding: '10px 12px',
                            borderLeft: '1px solid rgba(255,255,255,0.5)'
                          }}>
                            <input
                              type="checkbox"
                              checked={stepData.status || false}
                              onChange={(e) => updateStepStatus(request.id, step.key, e.target.checked)}
                              disabled={step.key === 'deliveryDateEntry'} // Disable manual click for Delivery Date Entry
                              style={{ 
                                width: '16px', 
                                height: '16px', 
                                cursor: step.key === 'deliveryDateEntry' ? 'not-allowed' : 'pointer',
                                accentColor: '#137E43',
                                opacity: step.key === 'deliveryDateEntry' ? 0.7 : 1
                              }}
                            />
                          </td>
                          <td style={{ 
                            background: step.bg, 
                            fontSize: '10px',
                            padding: '10px 12px',
                            borderLeft: '1px solid rgba(255,255,255,0.5)',
                            color: delay.color,
                            textAlign: 'center',
                            fontWeight: 700,
                            whiteSpace: 'nowrap'
                          }}>
                            {delay.text}
                          </td>
                        </React.Fragment>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
