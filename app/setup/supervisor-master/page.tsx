'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Supervisor {
  id: string
  name: string
  email?: string
  phone?: string
  createdAt: string
}

// Initialize supervisors from existing orders if supervisors array is empty
const initializeSupervisors = () => {
  const stored = localStorage.getItem('dyeflow_db')
  if (!stored) return

  const db = JSON.parse(stored)
  
  // If supervisors already exist, don't initialize
  if (db.supervisors && db.supervisors.length > 0) return

  // Extract unique supervisor names from orders
  const supervisorNames = new Set<string>()
  if (db.orders && Array.isArray(db.orders)) {
    db.orders.forEach((order: any) => {
      if (order.supervisor && order.supervisor.trim()) {
        supervisorNames.add(order.supervisor.trim())
      }
    })
  }

  // Create supervisor objects
  if (supervisorNames.size > 0) {
    db.supervisors = Array.from(supervisorNames).map((name, idx) => ({
      id: `SUP-${Date.now()}-${idx}`,
      name: name,
      email: '',
      phone: '',
      createdAt: new Date().toISOString()
    }))

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    console.log(`Initialized ${db.supervisors.length} supervisors from existing orders`)
  }
}

export default function SupervisorMasterPage() {
  const router = useRouter()
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingSupervisor, setEditingSupervisor] = useState<Supervisor | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: ''
  })
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    // Initialize supervisors from orders on first load
    initializeSupervisors()
    loadSupervisors()
  }, [])

  const loadSupervisors = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) {
      // Initialize with empty supervisors array
      const db = { supervisors: [] }
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      setSupervisors([])
      return
    }

    const db = JSON.parse(stored)
    if (!db.supervisors || !Array.isArray(db.supervisors)) {
      db.supervisors = []
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
    }

    setSupervisors(db.supervisors)
  }

  const generateId = () => {
    return `SUP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  const openNewModal = () => {
    setEditingSupervisor(null)
    setFormData({ name: '', email: '', phone: '' })
    setShowModal(true)
  }

  const openEditModal = (supervisor: Supervisor) => {
    setEditingSupervisor(supervisor)
    setFormData({
      name: supervisor.name,
      email: supervisor.email || '',
      phone: supervisor.phone || ''
    })
    setShowModal(true)
  }

  const saveSupervisor = () => {
    if (!formData.name.trim()) {
      alert('Please enter supervisor name.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { supervisors: [] }

    if (!db.supervisors) {
      db.supervisors = []
    }

    if (editingSupervisor) {
      // Update existing supervisor
      const index = db.supervisors.findIndex((s: Supervisor) => s.id === editingSupervisor.id)
      if (index !== -1) {
        db.supervisors[index] = {
          ...db.supervisors[index],
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim()
        }
      }
    } else {
      // Create new supervisor
      const newSupervisor: Supervisor = {
        id: generateId(),
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        createdAt: new Date().toISOString()
      }
      db.supervisors.push(newSupervisor)
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setShowModal(false)
    setEditingSupervisor(null)
    loadSupervisors()
  }

  const deleteSupervisor = (id: string) => {
    if (!confirm('Are you sure you want to delete this supervisor? This action cannot be undone.')) {
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { supervisors: [] }

    if (!db.supervisors) return

    db.supervisors = db.supervisors.filter((s: Supervisor) => s.id !== id)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadSupervisors()
  }

  const filteredSupervisors = supervisors.filter(supervisor =>
    supervisor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (supervisor.email && supervisor.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (supervisor.phone && supervisor.phone.includes(searchTerm))
  )

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937', margin: 0 }}>Supervisor Master</h1>
          <p style={{ fontSize: '14px', color: '#6B7280', marginTop: '4px' }}>Manage supervisor details and assignments</p>
        </div>
        <button 
          onClick={() => router.push('/setup')}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            background: 'white',
            color: '#374151',
            cursor: 'pointer'
          }}
        >
          ← Back to Setup
        </button>
      </div>

      {/* Search and Add Button */}
      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        marginBottom: '20px',
        background: '#F9FAFB',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid #E5E7EB'
      }}>
        <input
          type="text"
          placeholder="Search supervisors..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: '14px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            outline: 'none'
          }}
        />
        <button
          onClick={openNewModal}
          style={{
            padding: '8px 20px',
            fontSize: '14px',
            fontWeight: 600,
            border: 'none',
            borderRadius: '6px',
            background: '#3B82F6',
            color: 'white',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          + Add Supervisor
        </button>
      </div>

      {/* Supervisors Table */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
              <th style={headerStyle}>Supervisor Name</th>
              <th style={headerStyle}>Email</th>
              <th style={headerStyle}>Phone</th>
              <th style={headerStyle}>Created Date</th>
              <th style={{ ...headerStyle, width: '150px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSupervisors.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ 
                  padding: '48px', 
                  textAlign: 'center', 
                  color: '#9CA3AF',
                  fontSize: '14px'
                }}>
                  {supervisors.length === 0 
                    ? 'No supervisors yet. Click "+ Add Supervisor" to create one.'
                    : 'No supervisors match your search.'}
                </td>
              </tr>
            ) : (
              filteredSupervisors.map((supervisor, idx) => (
                <tr 
                  key={supervisor.id}
                  style={{ 
                    background: idx % 2 === 0 ? 'white' : '#FAFAFA',
                    borderBottom: '1px solid #F3F4F6'
                  }}
                >
                  <td style={cellStyle}>
                    <span style={{ fontWeight: 600, color: '#1F2937' }}>
                      {supervisor.name}
                    </span>
                  </td>
                  <td style={cellStyle}>
                    <span style={{ color: '#6B7280' }}>
                      {supervisor.email || '-'}
                    </span>
                  </td>
                  <td style={cellStyle}>
                    <span style={{ color: '#6B7280' }}>
                      {supervisor.phone || '-'}
                    </span>
                  </td>
                  <td style={cellStyle}>
                    <span style={{ fontSize: '13px', color: '#9CA3AF' }}>
                      {supervisor.createdAt 
                        ? new Date(supervisor.createdAt).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })
                        : '-'}
                    </span>
                  </td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => openEditModal(supervisor)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '4px',
                          background: 'white',
                          color: '#374151',
                          cursor: 'pointer'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteSupervisor(supervisor.id)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          border: '1px solid #FCA5A5',
                          borderRadius: '4px',
                          background: 'white',
                          color: '#DC2626',
                          cursor: 'pointer'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summary Stats */}
      <div style={{ 
        marginTop: '20px', 
        padding: '12px 16px', 
        background: '#F9FAFB', 
        borderRadius: '6px',
        fontSize: '13px',
        color: '#6B7280'
      }}>
        Total Supervisors: <strong style={{ color: '#1F2937' }}>{supervisors.length}</strong>
        {searchTerm && (
          <span style={{ marginLeft: '16px' }}>
            Showing: <strong style={{ color: '#1F2937' }}>{filteredSupervisors.length}</strong>
          </span>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={modalHeaderStyle}>
              <span style={{ fontSize: '18px', fontWeight: 700 }}>
                {editingSupervisor ? 'Edit Supervisor' : 'Add New Supervisor'}
              </span>
              <button 
                onClick={() => setShowModal(false)} 
                style={closeButtonStyle}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Supervisor Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter supervisor name"
                style={inputStyle}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Email (Optional)</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="supervisor@example.com"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Phone (Optional)</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 XXXXX XXXXX"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={saveSupervisor} 
                style={primaryButtonStyle}
              >
                {editingSupervisor ? '✓ Update Supervisor' : '✓ Add Supervisor'}
              </button>
              <button 
                onClick={() => setShowModal(false)} 
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Styles
const headerStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 700,
  color: '#6B7280',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
}

const cellStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: '14px'
}

const modalOverlayStyle: React.CSSProperties = {
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
}

const modalContentStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '12px',
  padding: '24px',
  maxWidth: '500px',
  width: '90%',
  maxHeight: '90vh',
  overflow: 'auto'
}

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '24px',
  paddingBottom: '16px',
  borderBottom: '2px solid #E5E7EB'
}

const closeButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '16px',
  border: 'none',
  background: '#F3F4F6',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 600,
  color: '#6B7280'
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '6px'
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  fontSize: '14px',
  outline: 'none',
  transition: 'border-color 0.2s'
}

const primaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 16px',
  fontSize: '14px',
  fontWeight: 600,
  border: 'none',
  borderRadius: '6px',
  background: '#3B82F6',
  color: 'white',
  cursor: 'pointer'
}

const secondaryButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 16px',
  fontSize: '14px',
  fontWeight: 500,
  border: '1px solid #D1D5DB',
  borderRadius: '6px',
  background: 'white',
  color: '#374151',
  cursor: 'pointer'
}
