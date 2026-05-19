'use client'

import { useEffect, useState } from 'react'

const SCOPE_MODES = ['all', 'unit', 'party', 'unit_or_party']

export default function UserManagementPage() {
  const [users, setUsers] = useState<any[]>([])
  const [activeUserId, setActiveUserId] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState('')
  const [formData, setFormData] = useState({
    username: '',
    scopeMode: 'unit_or_party',
    unit: '',
    party: '',
    notes: ''
  })
  const [availableUnits, setAvailableUnits] = useState<string[]>([])
  const [availableParties, setAvailableParties] = useState<string[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) {
      // Initialize with default admin user
      initializeDefaultUser()
      return
    }

    const db = JSON.parse(stored)
    if (!db.users) db.users = []
    if (db.users.length === 0) {
      initializeDefaultUser()
      return
    }

    setUsers(db.users)
    setActiveUserId(db.activeUserId || (db.users[0]?.id || ''))

    // Extract available units and parties
    const units = [...new Set([
      ...(db.labIndents || []).map((x: any) => x.unit),
      ...(db.labRequests || []).map((x: any) => x.unit),
      ...(db.orders || []).map((x: any) => x.party),
    ].filter(Boolean))].sort()

    const parties = [...new Set([
      ...(db.labIndents || []).map((x: any) => x.partyName),
      ...(db.labRequests || []).map((x: any) => x.party),
      ...(db.orders || []).map((x: any) => x.party),
    ].filter(Boolean))].sort()

    setAvailableUnits(units)
    setAvailableParties(parties)
  }

  const initializeDefaultUser = () => {
    const defaultUser = {
      id: 'USR-001',
      username: 'Admin',
      scopeMode: 'all',
      unit: '',
      party: '',
      notes: 'Default full-access user',
      createdAt: new Date().toLocaleString('en-GB')
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : {}
    db.users = [defaultUser]
    db.activeUserId = 'USR-001'
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const getScopeModeLabel = (mode: string) => {
    const labels: Record<string, string> = {
      'all': 'All Data',
      'unit': 'Unit Only',
      'party': 'Party Only',
      'unit_or_party': 'Unit OR Party'
    }
    return labels[mode] || mode
  }

  const getUserScopeSummary = (user: any) => {
    if (user.scopeMode === 'all') return 'All data access'
    if (user.scopeMode === 'unit') return `Unit: ${user.unit}`
    if (user.scopeMode === 'party') return `Party: ${user.party}`
    if (user.scopeMode === 'unit_or_party') {
      const parts = []
      if (user.unit) parts.push(`Unit: ${user.unit}`)
      if (user.party) parts.push(`Party: ${user.party}`)
      return parts.join(' OR ')
    }
    return '-'
  }

  const getActiveUser = () => {
    return users.find(u => u.id === activeUserId)
  }

  const nextUserId = () => {
    const nums = users.map(u => {
      const match = u.id.match(/(\d+)/)
      return match ? parseInt(match[1]) : 0
    })
    return 'USR-' + String(Math.max(0, ...nums) + 1).padStart(3, '0')
  }

  const saveUser = () => {
    if (!formData.username.trim()) {
      alert('Please enter user name.')
      return
    }

    if (!SCOPE_MODES.includes(formData.scopeMode)) {
      alert('Please select valid visibility basis.')
      return
    }

    if (formData.scopeMode === 'unit' && !formData.unit.trim()) {
      alert('Please select Unit for Unit based user.')
      return
    }

    if (formData.scopeMode === 'party' && !formData.party.trim()) {
      alert('Please select Party for Party based user.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { users: [] }
    if (!db.users) db.users = []

    const userData = {
      username: formData.username.trim(),
      scopeMode: formData.scopeMode,
      unit: formData.unit.trim(),
      party: formData.party.trim(),
      notes: formData.notes.trim(),
      createdAt: new Date().toLocaleString('en-GB')
    }

    if (editingUserId) {
      const index = db.users.findIndex((u: any) => u.id === editingUserId)
      if (index >= 0) {
        db.users[index] = { ...db.users[index], ...userData }
      }
    } else {
      db.users.push({
        id: nextUserId(),
        ...userData
      })
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
    closeModal()
  }

  const deleteUser = (id: string) => {
    if (!confirm('Delete this user?')) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    db.users = db.users.filter((u: any) => u.id !== id)
    
    if (db.activeUserId === id && db.users.length > 0) {
      db.activeUserId = db.users[0].id
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const setActiveUserById = (id: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    db.activeUserId = id
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setActiveUserId(id)
  }

  const openAddModal = () => {
    setEditingUserId('')
    setFormData({
      username: '',
      scopeMode: 'unit_or_party',
      unit: '',
      party: '',
      notes: ''
    })
    setIsModalOpen(true)
  }

  const openEditModal = (userId: string) => {
    const user = users.find(u => u.id === userId)
    if (!user) return

    setEditingUserId(userId)
    setFormData({
      username: user.username,
      scopeMode: user.scopeMode,
      unit: user.unit || '',
      party: user.party || '',
      notes: user.notes || ''
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingUserId('')
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    return dateStr
  }

  const activeUser = getActiveUser()

  return (
    <div className="content">
      {/* Active User Info Card */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '16px' }}>👤</span>
            <span className="card-title" style={{ margin: 0 }}>Current Active User</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '16px',
            background: '#EAF3DE',
            borderRadius: '8px',
            border: '1.5px solid #137E43'
          }}>
            <div style={{ 
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#137E43',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '20px',
              fontWeight: 700
            }}>
              {activeUser ? activeUser.username.charAt(0).toUpperCase() : '?'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#137E43', marginBottom: '4px' }}>
                {activeUser ? activeUser.username : 'No user selected'}
              </div>
              <div style={{ fontSize: '13px', color: '#27500A' }}>
                <strong>Scope:</strong> {activeUser ? getScopeModeLabel(activeUser.scopeMode) : '-'} &nbsp;|&nbsp;
                <strong>Filter:</strong> {activeUser ? getUserScopeSummary(activeUser) : '-'}
              </div>
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '12px', marginBottom: 0 }}>
            Create users with Unit / Party based visibility. In Lab pages, visibility matching is smart: if a page stores value in Unit or in Party, both are matched as per selected user scope.
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="card-title">All Users</span>
            <span style={{ 
              fontSize: '11px', 
              color: 'var(--text-tertiary)',
              background: 'var(--bg-secondary)',
              padding: '2px 8px',
              borderRadius: '10px',
              fontWeight: 600
            }}>
              {users.length} users
            </span>
          </div>
          <button 
            onClick={openAddModal}
            style={{ 
              background: '#137E43',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            + Add User
          </button>
        </div>
        
        <div className="table-wrap">
          <table style={{ minWidth: '1200px' }}>
            <thead>
              <tr>
                <th>User ID</th>
                <th>User Name</th>
                <th>Visibility Basis</th>
                <th>Unit</th>
                <th>Party</th>
                <th>Notes</th>
                <th>Created</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td style={{ fontWeight: 700, color: '#3366CC' }}>{user.id}</td>
                  <td style={{ fontWeight: 600 }}>{user.username}</td>
                  <td>
                    <span style={{
                      background: '#E6F0FF',
                      color: '#3366CC',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600
                    }}>
                      {getScopeModeLabel(user.scopeMode)}
                    </span>
                  </td>
                  <td>{user.unit || '-'}</td>
                  <td>{user.party || '-'}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {user.notes || '-'}
                  </td>
                  <td style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                    {formatDate(user.createdAt)}
                  </td>
                  <td>
                    {activeUserId === user.id ? (
                      <span style={{
                        background: '#EAF3DE',
                        color: '#27500A',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 600
                      }}>
                        ✓ Active
                      </span>
                    ) : (
                      <span style={{
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-tertiary)',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 600
                      }}>
                        Inactive
                      </span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button 
                      className="xs" 
                      onClick={() => setActiveUserById(user.id)}
                      style={{
                        background: activeUserId === user.id ? 'var(--bg-secondary)' : '#137E43',
                        color: activeUserId === user.id ? 'var(--text-secondary)' : 'white',
                        border: 'none',
                        cursor: activeUserId === user.id ? 'not-allowed' : 'pointer',
                        opacity: activeUserId === user.id ? 0.5 : 1
                      }}
                      disabled={activeUserId === user.id}
                    >
                      {activeUserId === user.id ? 'Using' : 'Use'}
                    </button>
                    <button className="xs" style={{ marginLeft: '4px' }} onClick={() => openEditModal(user.id)}>
                      Edit
                    </button>
                    <button className="xs danger" style={{ marginLeft: '4px' }} onClick={() => deleteUser(user.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Available Unit / Party Values */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Available Unit / Party Values</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '0 20px 20px 20px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Units ({availableUnits.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {availableUnits.length > 0 ? (
                availableUnits.map(unit => (
                  <span key={unit} style={{
                    background: '#E6F0FF',
                    color: '#3366CC',
                    border: '1px solid #3366CC',
                    borderRadius: '16px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600
                  }}>
                    {unit}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  No units found yet.
                </span>
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Parties ({availableParties.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {availableParties.length > 0 ? (
                availableParties.map(party => (
                  <span key={party} style={{
                    background: '#E6F0FF',
                    color: '#3366CC',
                    border: '1px solid #3366CC',
                    borderRadius: '16px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600
                  }}>
                    {party}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  No parties found yet.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* User Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <span className="modal-title">
                {editingUserId ? 'Edit User' : 'Create User'}
              </span>
              <button className="small" onClick={closeModal}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div className="form-group">
                <label>User Name *</label>
                <input
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="e.g. Lab CKU User"
                />
              </div>
              <div className="form-group">
                <label>Visibility Basis *</label>
                <select
                  value={formData.scopeMode}
                  onChange={(e) => setFormData({ ...formData, scopeMode: e.target.value })}
                >
                  <option value="all">All Data (Admin)</option>
                  <option value="unit">Unit Only</option>
                  <option value="party">Party Only</option>
                  <option value="unit_or_party">Unit OR Party (Recommended)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Unit</label>
                <input
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  placeholder="Select or type unit"
                  list="unit-list"
                  disabled={formData.scopeMode === 'all' || formData.scopeMode === 'party'}
                />
                <datalist id="unit-list">
                  {availableUnits.map(unit => (
                    <option key={unit} value={unit} />
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label>Party</label>
                <input
                  value={formData.party}
                  onChange={(e) => setFormData({ ...formData, party: e.target.value })}
                  placeholder="Select or type party"
                  list="party-list"
                  disabled={formData.scopeMode === 'all' || formData.scopeMode === 'unit'}
                />
                <datalist id="party-list">
                  {availableParties.map(party => (
                    <option key={party} value={party} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label>Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Optional notes for this user"
                rows={3}
              />
            </div>

            <div style={{
              padding: '10px 12px',
              background: '#E6F0FF',
              borderRadius: '6px',
              fontSize: '12px',
              marginBottom: '16px',
              color: '#3366CC',
              lineHeight: 1.5
            }}>
              <strong>ℹ️ Matching logic:</strong> For Unit/Party based scope, records are matched against both Unit and Party fields to handle page-to-page naming differences.
            </div>

            <button 
              onClick={saveUser}
              style={{ 
                width: '100%',
                background: '#137E43',
                color: 'white',
                border: 'none',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {editingUserId ? '✓ Update User' : '✓ Create User'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
