'use client'

import { useEffect, useState, useRef } from 'react'

const LAB_UNIT_OPTIONS = ['UDHNA', 'CKU', 'EMB', 'EYEHOOK', 'WWF', 'VAU', 'Others (external)']
const LAB_ORDER_STATUS_OPTIONS = ['Order in System', 'Order Pending', 'Self Development', 'Self Approval']
const LAB_LIGHT_SOURCE_OPTIONS = ['D-65', 'TL-84', 'CWF', 'Other']
const LAB_BRANCH_OPTIONS = ['Delhi', 'Mumbai', 'Ludhiana', 'Ulhasnagar', 'Bangalore', 'Tirupur', 'Udhna', 'KDC', 'Kolkatta', 'EMB', 'Ahmedabad', 'Sadar Bazar', 'Tirupur Showroom', 'Other']
const LAB_FASTNESS_TYPE_OPTIONS = ['Normal', 'High']

export default function LabIndentPage() {
  const [indents, setIndents] = useState<any[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [selectedIndent, setSelectedIndent] = useState<any>(null)
  const [formData, setFormData] = useState({
    unit: '',
    partyName: '',
    quality: '',
    numberOfLabDip: '',
    requestGivenBy: '',
    orderStatus: '',
    branch: '',
    lightSource: '',
    lightSourceOther: '',
    remarks: '',
    requestImage: ''
  })
  const [requestFormData, setRequestFormData] = useState({
    yarnDesign: '',
    shadePantone: '',
    fastnessType: '',
    fastnessRemark: '',
    otherRemark: ''
  })
  const [imagePreview, setImagePreview] = useState('')
  const [recentParties, setRecentParties] = useState<string[]>([])
  const [filteredParties, setFilteredParties] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadData()
  }, [])

  // Filter parties when partyName changes
  useEffect(() => {
    if (!formData.partyName.trim()) {
      setFilteredParties([])
      return
    }

    const searchTerm = formData.partyName.toLowerCase().trim()
    const filtered = recentParties.filter(party => 
      party.toLowerCase().includes(searchTerm)
    ).slice(0, 10) // Limit to 10 suggestions

    setFilteredParties(filtered)
  }, [formData.partyName, recentParties])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.labIndents) db.labIndents = []
    
    setIndents(db.labIndents)

    // Get recent parties from customers, labIndents, and orders
    const parties = [...new Set([
      ...(db.customers || []).map((c: any) => c.name),
      ...(db.labIndents || []).map((i: any) => i.partyName),
      ...(db.orders || []).map((o: any) => o.party)
    ].filter(Boolean))]
    setRecentParties(parties)
  }

  const nextId = () => {
    if (indents.length === 0) return 'LAB-IND-001'
    const nums = indents.map(indent => {
      const match = indent.id.match(/(\d+)/)
      return match ? parseInt(match[1]) : 0
    })
    return 'LAB-IND-' + String(Math.max(0, ...nums) + 1).padStart(3, '0')
  }

  const nextLabRequestId = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return 'LR-0001'
    const db = JSON.parse(stored)
    if (!db.labRequests || db.labRequests.length === 0) return 'LR-0001'
    const nums = db.labRequests.map((r: any) => {
      const match = r.id.match(/(\d+)/)
      return match ? parseInt(match[1]) : 0
    })
    return 'LR-' + String(Math.max(0, ...nums) + 1).padStart(4, '0')
  }

  const getLabRequestCount = (indentId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return 0
    const db = JSON.parse(stored)
    if (!db.labRequests) return 0
    return db.labRequests.filter((r: any) => r.indentId === indentId).length
  }

  const getLabPendingCount = (indent: any) => {
    if (indent.closed) return 0
    const requested = getLabRequestCount(indent.id)
    const labdipCount = parseInt(indent.numberOfLabDip) || 0
    return Math.max(0, labdipCount - requested)
  }

  const getTodayCount = () => {
    const todayStr = new Date().toDateString()
    return indents.filter(e => new Date(e.createdAt).toDateString() === todayStr).length
  }

  const getWithImagesCount = () => {
    return indents.filter(e => e.requestImage).length
  }

  const getPendingRequestsTotal = () => {
    return indents.reduce((sum, e) => sum + getLabPendingCount(e), 0)
  }

  const getPendingOrderCount = () => {
    return indents.filter(e => e.orderStatus === 'Order Pending').length
  }

  const saveIndent = () => {
    // Validation
    if (!formData.unit) {
      alert('Please select Unit.')
      return
    }
    if (!formData.partyName.trim()) {
      alert('Please enter Party Name.')
      return
    }
    if (!formData.quality.trim()) {
      alert('Please enter Quality.')
      return
    }
    if (!formData.numberOfLabDip || parseInt(formData.numberOfLabDip) < 1) {
      alert('Please enter Number of LabDIP (minimum 1).')
      return
    }
    if (!formData.requestGivenBy) {
      alert('Please select Request Given By.')
      return
    }
    if (!formData.orderStatus) {
      alert('Please select Order Status.')
      return
    }
    if (!formData.branch) {
      alert('Please select Branch.')
      return
    }
    if (!formData.lightSource) {
      alert('Please select Light Source.')
      return
    }
    if (formData.lightSource === 'Other' && !formData.lightSourceOther.trim()) {
      alert('Please enter Other Light Source.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { labIndents: [] }
    if (!db.labIndents) db.labIndents = []

    const nowTs = new Date().toISOString()

    if (editingId) {
      const index = db.labIndents.findIndex((x: any) => x.id === editingId)
      if (index >= 0) {
        db.labIndents[index] = {
          ...db.labIndents[index],
          unit: formData.unit,
          partyName: formData.partyName.trim(),
          quality: formData.quality.trim(),
          numberOfLabDip: formData.numberOfLabDip,
          requestGivenBy: formData.requestGivenBy,
          orderStatus: formData.orderStatus,
          branch: formData.branch,
          lightSource: formData.lightSource,
          lightSourceOther: formData.lightSourceOther.trim(),
          remarks: formData.remarks.trim(),
          requestImage: formData.requestImage,
          updatedAt: nowTs
        }
      }
    } else {
      db.labIndents.push({
        id: nextId(),
        unit: formData.unit,
        partyName: formData.partyName.trim(),
        quality: formData.quality.trim(),
        numberOfLabDip: formData.numberOfLabDip,
        requestGivenBy: formData.requestGivenBy,
        orderStatus: formData.orderStatus,
        branch: formData.branch,
        lightSource: formData.lightSource,
        lightSourceOther: formData.lightSourceOther.trim(),
        remarks: formData.remarks.trim(),
        requestImage: formData.requestImage,
        closed: false,
        createdAt: nowTs,
        updatedAt: ''
      })
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
    closeModal()
  }

  const closeIndent = (id: string) => {
    if (!confirm('Close this lab indent? No further requests can be added.')) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const index = db.labIndents.findIndex((x: any) => x.id === id)
    if (index >= 0) {
      db.labIndents[index].closed = true
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadData()
    }
  }

  const openNewRequestModal = (indent: any) => {
    setSelectedIndent(indent)
    setRequestFormData({
      yarnDesign: '',
      shadePantone: '',
      fastnessType: '',
      fastnessRemark: '',
      otherRemark: ''
    })
    setIsRequestModalOpen(true)
  }

  const saveLabRequest = () => {
    if (!selectedIndent) return

    // Validation
    if (!requestFormData.yarnDesign.trim()) {
      alert('Yarn Design is required.')
      return
    }
    if (!requestFormData.shadePantone.trim()) {
      alert('Shade or Pantone is required.')
      return
    }
    if (!requestFormData.fastnessType) {
      alert('Fastness Type is required.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : {}
    if (!db.labRequests) db.labRequests = []

    const nowTs = new Date().toISOString()
    const reqId = nextLabRequestId()

    db.labRequests.unshift({
      id: reqId,
      createdAt: nowTs,
      indentId: selectedIndent.id,
      indentNo: selectedIndent.id,
      unit: selectedIndent.unit,
      party: selectedIndent.partyName,
      quality: selectedIndent.quality,
      lightSource: selectedIndent.lightSource,
      lightSourceOther: selectedIndent.lightSourceOther || '',
      yarnDesign: requestFormData.yarnDesign.trim(),
      shadePantone: requestFormData.shadePantone.trim(),
      fastnessType: requestFormData.fastnessType,
      fastnessRemark: requestFormData.fastnessRemark.trim(),
      otherRemark: requestFormData.otherRemark.trim(),
      confirmed: false,
      confirmedAt: ''
    })

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    closeRequestModal()
    loadData()
    
    setTimeout(() => {
      alert(`✓ Lab request ${reqId} created against ${selectedIndent.id}.`)
    }, 120)
  }

  const openAddModal = () => {
    setEditingId('')
    setFormData({
      unit: '',
      partyName: '',
      quality: '',
      numberOfLabDip: '',
      requestGivenBy: '',
      orderStatus: '',
      branch: '',
      lightSource: '',
      lightSourceOther: '',
      remarks: '',
      requestImage: ''
    })
    setImagePreview('')
    setFilteredParties([])
    setIsModalOpen(true)
  }

  const openEditModal = (id: string) => {
    const indent = indents.find(x => x.id === id)
    if (!indent) return

    setEditingId(id)
    setFormData({
      unit: indent.unit,
      partyName: indent.partyName,
      quality: indent.quality,
      numberOfLabDip: indent.numberOfLabDip,
      requestGivenBy: indent.requestGivenBy,
      orderStatus: indent.orderStatus,
      branch: indent.branch,
      lightSource: indent.lightSource,
      lightSourceOther: indent.lightSourceOther || '',
      remarks: indent.remarks || '',
      requestImage: indent.requestImage || ''
    })
    setImagePreview(indent.requestImage || '')
    setFilteredParties([])
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingId('')
    setFilteredParties([])
  }

  const closeRequestModal = () => {
    setIsRequestModalOpen(false)
    setSelectedIndent(null)
    setRequestFormData({
      yarnDesign: '',
      shadePantone: '',
      fastnessType: '',
      fastnessRemark: '',
      otherRemark: ''
    })
  }

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      setImagePreview('')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      setImagePreview(result)
      setFormData({ ...formData, requestImage: result })
    }
    reader.readAsDataURL(file)
  }

  const resetForm = () => {
    setFormData({
      unit: '',
      partyName: '',
      quality: '',
      numberOfLabDip: '',
      requestGivenBy: '',
      orderStatus: '',
      branch: '',
      lightSource: '',
      lightSourceOther: '',
      remarks: '',
      requestImage: ''
    })
    setImagePreview('')
    setFilteredParties([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('en-GB')
  }

  const todayCount = getTodayCount()
  const withImages = getWithImagesCount()
  const totalPendingRequests = getPendingRequestsTotal()
  const pendingOrderCount = getPendingOrderCount()

  return (
    <div className="content">
      {/* Compact Stats Grid with Button on Same Line */}
      <div style={{ 
        display: 'flex',
        alignItems: 'stretch',
        gap: '12px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        {/* Total Indents - Green Theme */}
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
            <div style={{ fontSize: '18px' }}>📋</div>
            <div style={{
              background: '#EAF3DE',
              color: '#137E43',
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
            Total Indents
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#137E43', lineHeight: 1 }}>
            {indents.length}
          </div>
          <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 500, marginTop: '4px' }}>
            All saved requests
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
            Today's new entries
          </div>
        </div>

        {/* With Image - Orange Theme */}
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
            <div style={{ fontSize: '18px' }}>📷</div>
            <div style={{
              background: '#FFF4E6',
              color: '#D97706',
              fontSize: '8px',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '8px',
              letterSpacing: '0.5px'
            }}>
              IMAGE
            </div>
          </div>
          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            With Image
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#D97706', lineHeight: 1 }}>
            {withImages}
          </div>
          <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 500, marginTop: '4px' }}>
            Request image attached
          </div>
        </div>

        {/* Pending Requests - Purple Theme */}
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
            <div style={{ fontSize: '18px' }}>⏳</div>
            <div style={{
              background: '#F3E8FF',
              color: '#7C3AED',
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
          <div style={{ fontSize: '26px', fontWeight: 800, color: totalPendingRequests > 0 ? '#7C3AED' : '#64748B', lineHeight: 1 }}>
            {totalPendingRequests}
          </div>
          <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 500, marginTop: '4px' }}>
            {pendingOrderCount} indent{pendingOrderCount !== 1 ? 's' : ''} pending
          </div>
        </div>

        {/* New Indent Button - Aligned on Same Line */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginLeft: 'auto'
        }}>
          <button 
            onClick={openAddModal}
            style={{ 
              background: 'linear-gradient(135deg, #137E43 0%, #0F6835 100%)',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(19, 126, 67, 0.2)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              height: 'fit-content'
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
            + New Indent
          </button>
        </div>
      </div>

      {/* Saved Lab Indents */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Saved Lab Indents</span>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            {indents.length} entries
          </span>
        </div>

        {indents.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📋</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
              No lab indent entries yet
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>
              Start with a clean entry from the New Indent button.
            </div>
            <button 
              onClick={openAddModal}
              style={{ 
                background: 'linear-gradient(135deg, #137E43 0%, #0F6835 100%)',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(19, 126, 67, 0.2)'
              }}
            >
              + Create First Indent
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ minWidth: '1250px' }}>
              <thead>
                <tr>
                  <th>Indent No</th>
                  <th>Time</th>
                  <th>Unit</th>
                  <th>Party Name</th>
                  <th>Quality</th>
                  <th>LabDIP</th>
                  <th>Requested</th>
                  <th>Pending</th>
                  <th>Status</th>
                  <th>Request Given By</th>
                  <th>Order Status</th>
                  <th>Branch</th>
                  <th>Light Source</th>
                  <th>Remarks</th>
                  <th>Image</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {indents.map(indent => {
                  const requested = getLabRequestCount(indent.id)
                  const pending = getLabPendingCount(indent)
                  return (
                    <tr key={indent.id}>
                      <td style={{ fontWeight: 700, color: '#3366CC' }}>{indent.id}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '11px' }}>
                        {formatDate(indent.createdAt)}
                      </td>
                      <td>{indent.unit}</td>
                      <td>{indent.partyName}</td>
                      <td>{indent.quality}</td>
                      <td style={{ textAlign: 'center' }}>{indent.numberOfLabDip}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="xs">{requested}</button>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: pending > 0 ? 'var(--warning)' : 'var(--success)' }}>
                        {pending}
                      </td>
                      <td>
                        {indent.closed ? (
                          <span className="badge badge-done">Closed</span>
                        ) : (
                          <span className="badge badge-assigned">Open</span>
                        )}
                      </td>
                      <td>{indent.requestGivenBy}</td>
                      <td>{indent.orderStatus}</td>
                      <td>{indent.branch}</td>
                      <td>{indent.lightSource === 'Other' ? (indent.lightSourceOther || 'Other') : indent.lightSource}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {indent.remarks || '-'}
                      </td>
                      <td>
                        {indent.requestImage ? (
                          <a href={indent.requestImage} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                            <img src={indent.requestImage} alt="Lab Request" style={{ width: '38px', height: '38px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                            <span>View</span>
                          </a>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>-</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button 
                          className="xs primary" 
                          style={{ opacity: indent.closed || pending === 0 ? 0.45 : 1, cursor: indent.closed || pending === 0 ? 'not-allowed' : 'pointer' }}
                          disabled={indent.closed || pending === 0}
                          onClick={() => openNewRequestModal(indent)}
                        >
                          New Request
                        </button>
                        <button className="xs" style={{ marginLeft: '3px' }} onClick={() => openEditModal(indent.id)}>
                          Edit
                        </button>
                        <button 
                          className="xs danger" 
                          style={{ marginLeft: '3px', opacity: indent.closed ? 0.45 : 1, cursor: indent.closed ? 'not-allowed' : 'pointer' }}
                          onClick={() => closeIndent(indent.id)}
                          disabled={indent.closed}
                        >
                          Close
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

      {/* Add/Edit Indent Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '720px' }}>
            <div className="modal-header">
              <span className="modal-title">
                {editingId ? `Edit Lab Indent – ${editingId}` : 'New Lab Indent'}
              </span>
              <button className="small" onClick={closeModal}>✕</button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {editingId ? 'Update the indent details below.' : 'Fill the indent details below. This form opens only when you need to create a fresh request.'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '14px' }}>
              <div className="form-group">
                <label>Unit *</label>
                <select value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })}>
                  <option value="">Choose</option>
                  {LAB_UNIT_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Party Name *</label>
                <input
                  list="party-list"
                  placeholder="Select or type party name"
                  value={formData.partyName}
                  onChange={(e) => setFormData({ ...formData, partyName: e.target.value })}
                  autoComplete="off"
                />
                <datalist id="party-list">
                  {filteredParties.map(party => (
                    <option key={party} value={party} />
                  ))}
                </datalist>
              </div>

              <div className="form-group">
                <label>Quality *</label>
                <input
                  placeholder="Enter quality"
                  value={formData.quality}
                  onChange={(e) => setFormData({ ...formData, quality: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Number of LabDIP *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 3"
                  value={formData.numberOfLabDip}
                  onChange={(e) => setFormData({ ...formData, numberOfLabDip: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Request Given By *</label>
                <select value={formData.requestGivenBy} onChange={(e) => setFormData({ ...formData, requestGivenBy: e.target.value })}>
                  <option value="">Choose</option>
                  {LAB_BRANCH_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Order Status *</label>
                <select value={formData.orderStatus} onChange={(e) => setFormData({ ...formData, orderStatus: e.target.value })}>
                  <option value="">Choose</option>
                  {LAB_ORDER_STATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Branch *</label>
                <select value={formData.branch} onChange={(e) => setFormData({ ...formData, branch: e.target.value })}>
                  <option value="">Choose</option>
                  {LAB_BRANCH_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Light Source *</label>
                <select value={formData.lightSource} onChange={(e) => setFormData({ ...formData, lightSource: e.target.value })}>
                  <option value="">Choose</option>
                  {LAB_LIGHT_SOURCE_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', marginBottom: '16px', alignItems: 'start' }}>
              <div className="form-group">
                <label>Remarks</label>
                <textarea
                  placeholder="Add remarks if any"
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  rows={3}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {formData.lightSource === 'Other' && (
                  <div className="form-group">
                    <label>Other Light Source</label>
                    <input
                      placeholder="Write light source"
                      value={formData.lightSourceOther}
                      onChange={(e) => setFormData({ ...formData, lightSourceOther: e.target.value })}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>Lab Dip Request Image</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    {imagePreview ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img src={imagePreview} alt="Preview" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {editingId ? 'Existing image' : 'Preview ready'}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                            {editingId ? 'Upload a new file to replace it' : 'Image ready'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      'No image selected'
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={saveIndent}
                style={{ 
                  background: 'linear-gradient(135deg, #137E43 0%, #0F6835 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(19, 126, 67, 0.2)'
                }}
              >
                {editingId ? '✓ Update Indent' : '✓ Save Indent'}
              </button>
              <button onClick={resetForm}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* New Lab Request Modal */}
      {isRequestModalOpen && selectedIndent && (
        <div className="modal-overlay" onClick={closeRequestModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <span className="modal-title">New Lab Request - {selectedIndent.id}</span>
              <button className="small" onClick={closeRequestModal}>✕</button>
            </div>

            <div style={{ 
              background: 'var(--bg-secondary)', 
              borderRadius: 'var(--radius-md)', 
              padding: '10px 12px', 
              marginBottom: '14px', 
              fontSize: '12px', 
              color: 'var(--text-secondary)' 
            }}>
              Request {getLabRequestCount(selectedIndent.id) + 1} of {selectedIndent.numberOfLabDip} · Pending after this: {Math.max(0, getLabPendingCount(selectedIndent) - 1)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '14px' }}>
              <div className="form-group">
                <label>Unit</label>
                <input value={selectedIndent.unit} disabled />
              </div>

              <div className="form-group">
                <label>Party</label>
                <input value={selectedIndent.partyName} disabled />
              </div>

              <div className="form-group">
                <label>Quality</label>
                <input value={selectedIndent.quality} disabled />
              </div>

              <div className="form-group">
                <label>Light Source</label>
                <input value={selectedIndent.lightSource === 'Other' ? (selectedIndent.lightSourceOther || 'Other') : selectedIndent.lightSource} disabled />
              </div>

              <div className="form-group">
                <label>Lab Indent No</label>
                <input value={selectedIndent.id} disabled />
              </div>

              <div className="form-group">
                <label>Lab Request No</label>
                <input value={nextLabRequestId()} disabled />
              </div>

              <div className="form-group">
                <label>Yarn Design *</label>
                <input
                  placeholder="Enter yarn design"
                  value={requestFormData.yarnDesign}
                  onChange={(e) => setRequestFormData({ ...requestFormData, yarnDesign: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Shade or Pantone *</label>
                <input
                  placeholder="Enter shade or pantone"
                  value={requestFormData.shadePantone}
                  onChange={(e) => setRequestFormData({ ...requestFormData, shadePantone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Fastness Type *</label>
                <select 
                  value={requestFormData.fastnessType}
                  onChange={(e) => setRequestFormData({ ...requestFormData, fastnessType: e.target.value })}
                >
                  <option value="">Choose</option>
                  {LAB_FASTNESS_TYPE_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Fastness Remark</label>
                <input
                  placeholder="Enter fastness remark"
                  value={requestFormData.fastnessRemark}
                  onChange={(e) => setRequestFormData({ ...requestFormData, fastnessRemark: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Other Remark</label>
              <textarea
                placeholder="Add any additional note"
                value={requestFormData.otherRemark}
                onChange={(e) => setRequestFormData({ ...requestFormData, otherRemark: e.target.value })}
                rows={3}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={saveLabRequest}
                style={{ 
                  background: 'linear-gradient(135deg, #137E43 0%, #0F6835 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(19, 126, 67, 0.2)'
                }}
              >
                ✓ Save Lab Request
              </button>
              <button onClick={closeRequestModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
