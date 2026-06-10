'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  buildPageList, buildPermissionsFromRole,
  ROLE_LABELS, EMPTY_PERM, FULL_PERM, VIEW_PERM,
  DEFAULT_USER_PERMISSIONS,
  type DyeflowUser, type UserPermissions, type PagePerm, type RolePreset, type PageDef,
} from '@/lib/permissions'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

// Extended with password for local storage
interface DyeflowUserWithPassword extends DyeflowUser {
  password?: string
  fullName?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SCOPE_MODES = ['all', 'unit', 'party', 'unit_or_party']
const SCOPE_LABELS: Record<string, string> = {
  all: 'All Data', unit: 'Unit Only', party: 'Party Only', unit_or_party: 'Unit OR Party',
}

function getScopeSummary(user: DyeflowUser): string {
  if (user.scopeMode === 'all' || !user.scopeMode) return 'All data'
  if (user.scopeMode === 'unit')  return `Unit: ${user.unit || '-'}`
  if (user.scopeMode === 'party') return `Party: ${user.party || '-'}`
  if (user.scopeMode === 'unit_or_party') {
    const parts: string[] = []
    if (user.unit)  parts.push(`Unit: ${user.unit}`)
    if (user.party) parts.push(`Party: ${user.party}`)
    return parts.join(' OR ') || '-'
  }
  return '-'
}

function nextUserId(users: DyeflowUserWithPassword[]): string {
  const nums = users.map(u => { const m = (u.id || '').match(/(\d+)/); return m ? parseInt(m[1]) : 0 })
  return 'USR-' + String(Math.max(0, ...nums) + 1).padStart(3, '0')
}

function countGranted(perms: UserPermissions): number {
  return Object.values(perms.pages).filter(p => p.view).length
}

// ─────────────────────────────────────────────────────────────────────────────
// PagePermRow
// ─────────────────────────────────────────────────────────────────────────────

function PagePermRow({ page, perm, onChange }: { page: PageDef; perm: PagePerm; onChange: (p: PagePerm) => void }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 56px 56px 56px',
      alignItems: 'center', padding: '5px 8px', borderRadius: 6,
      background: perm.view ? 'var(--accent-light)' : 'var(--bg-secondary)', marginBottom: 3, gap: 4,
    }}>
      <span style={{ fontSize: 12, color: perm.view ? 'var(--accent-dark)' : 'var(--text-tertiary)', fontWeight: perm.view ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {page.dynamic ? '↪ ' : ''}{page.label}
      </span>
      {(['view', 'edit', 'delete'] as const).map(k => (
        <label key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!perm[k]}
            onChange={e => {
              const next = { ...perm, [k]: e.target.checked }
              if ((k === 'edit' || k === 'delete') && e.target.checked) next.view = true
              if (k === 'view' && !e.target.checked) { next.edit = false; next.delete = false }
              onChange(next)
            }}
            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: k === 'delete' ? '#DC2626' : k === 'edit' ? '#D97706' : 'var(--accent)' }}
          />
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{k}</span>
        </label>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PasswordInput
// ─────────────────────────────────────────────────────────────────────────────

function PasswordInput({ value, onChange, placeholder, required }: {
  value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'Enter password'}
        required={required}
        style={{ paddingRight: 38 }}
      />
      <button type="button" onClick={() => setShow(s => !s)}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: show ? 'var(--accent)' : 'var(--text-tertiary)', fontSize: 14, padding: '2px 4px' }}>
        {show ? '🙈' : '👁'}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function UserManagementPage() {
  const [users, setUsers]               = useState<DyeflowUserWithPassword[]>([])
  const [activeUserId, setActiveUserId] = useState('')
  const [isModalOpen, setIsModalOpen]   = useState(false)
  const [editingUserId, setEditingUserId] = useState('')
  const [modalTab, setModalTab]         = useState<'basic' | 'permissions'>('basic')
  const [allPages, setAllPages]         = useState<PageDef[]>([])
  const [supervisorNames, setSupervisorNames] = useState<string[]>([])
  const [allSheets, setAllSheets]       = useState<{id:string,title:string,assignedTo:string}[]>([])
  const [saveError, setSaveError]       = useState('')

  const [formData, setFormData] = useState({
    username: '', password: '', confirmPassword: '',
    role: 'custom' as RolePreset, scopeMode: 'all',
    unit: '', party: '', notes: '',
  })
  const [formPerms, setFormPerms] = useState<UserPermissions>(DEFAULT_USER_PERMISSIONS)
  const [availableParties, setAvailableParties] = useState<string[]>([])

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => { loadData() }, [])

  const loadData = () => {
    setAllPages(buildPageList())
    const raw = localStorage.getItem('dyeflow_db')
    const db  = raw ? JSON.parse(raw) : {}
    // Migrate old users — ensure role and password fields exist
    let changed = false
    if (!db.users || db.users.length === 0) {
      db.users = [{
        id: 'USR-001', username: 'admin', password: 'dyeflow123',
        fullName: 'Admin', role: 'admin', scopeMode: 'all',
        notes: 'Default admin', createdAt: new Date().toLocaleString('en-GB'),
      }]
      db.activeUserId = 'USR-001'
      changed = true
    } else {
      // Patch existing users that are missing role or password
      db.users = db.users.map((u: any) => {
        const patched = { ...u }
        if (!patched.role) { patched.role = 'admin'; changed = true }
        if (!patched.username) { patched.username = patched.id || 'user'; changed = true }
        return patched
      })
    }
    if (changed) localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setUsers(db.users || [])
    setActiveUserId(db.activeUserId || db.users?.[0]?.id || '')
    setSupervisorNames((db.supervisors || []).map((s: any) => s.name).filter(Boolean))
    setAllSheets((db.orderSheets || []).map((s: any) => ({ id: s.id, title: s.title, assignedTo: s.assignedTo || '' })))
    const parties = [...new Set((db.orders || []).map((x: any) => x.party).filter(Boolean))].sort() as string[]
    setAvailableParties(parties)
  }

  const saveToLocalStorage = (updatedUsers: DyeflowUserWithPassword[], newActiveId?: string) => {
    const raw = localStorage.getItem('dyeflow_db')
    const db  = raw ? JSON.parse(raw) : {}
    db.users = updatedUsers
    if (newActiveId !== undefined) db.activeUserId = newActiveId
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
    loadData()
  }

  // ── Permission helpers ────────────────────────────────────────────────────

  const setPagePerm = (path: string, perm: PagePerm) =>
    setFormPerms(prev => ({ ...prev, pages: { ...prev.pages, [path]: perm } }))

  const applyRolePreset = (role: RolePreset) => {
    setFormPerms(buildPermissionsFromRole(role, allPages, formPerms.supervisorFilter))
    setFormData(f => ({ ...f, role }))
  }

  const grantGroupAll = (group: string, perm: PagePerm) => {
    const updates: Record<string, PagePerm> = {}
    allPages.filter(p => p.group === group).forEach(p => { updates[p.path] = perm })
    setFormPerms(prev => ({ ...prev, pages: { ...prev.pages, ...updates } }))
  }

  const grantAll = () => { const p: Record<string,PagePerm> = {}; allPages.forEach(pg => { p[pg.path] = FULL_PERM }); setFormPerms(prev => ({ ...prev, pages: p })) }
  const clearAll = () => setFormPerms(prev => ({ ...prev, pages: {} }))
  const viewAll  = () => { const p: Record<string,PagePerm> = {}; allPages.forEach(pg => { p[pg.path] = VIEW_PERM }); setFormPerms(prev => ({ ...prev, pages: p })) }

  // ── Modal ─────────────────────────────────────────────────────────────────

  const openAddModal = () => {
    setEditingUserId(''); setSaveError('')
    setFormData({ username: '', password: '', confirmPassword: '', role: 'custom', scopeMode: 'all', unit: '', party: '', notes: '' })
    setFormPerms(DEFAULT_USER_PERMISSIONS)
    setModalTab('basic'); setIsModalOpen(true)
  }

  const openEditModal = (userId: string) => {
    const user = users.find(u => u.id === userId)
    if (!user) return
    setEditingUserId(userId); setSaveError('')
    setFormData({
      username: user.username || '', password: '', confirmPassword: '',
      role: (user.role as RolePreset) || 'custom', scopeMode: user.scopeMode || 'all',
      unit: user.unit || '', party: user.party || '', notes: user.notes || '',
    })
    setFormPerms(user.permissions || DEFAULT_USER_PERMISSIONS)
    setModalTab('basic'); setIsModalOpen(true)
  }

  const closeModal = () => { setIsModalOpen(false); setEditingUserId(''); setSaveError('') }

  // ── Save ─────────────────────────────────────────────────────────────────

  const saveUser = () => {
    setSaveError('')
    if (!formData.username.trim()) { setSaveError('Username is required.'); return }

    // Password validation
    if (!editingUserId && !formData.password.trim()) {
      setSaveError('Password is required for new users.'); return
    }
    if (formData.password && formData.password.length < 4) {
      setSaveError('Password must be at least 4 characters.'); return
    }
    if (formData.password && formData.password !== formData.confirmPassword) {
      setSaveError('Passwords do not match.'); return
    }

    // Duplicate username check (only on create)
    if (!editingUserId) {
      const exists = users.some(u => u.username.toLowerCase() === formData.username.trim().toLowerCase())
      if (exists) { setSaveError('Username already exists. Choose a different one.'); return }
    }

    const userData: DyeflowUserWithPassword = {
      id:          editingUserId ? (users.find(u => u.id === editingUserId)?.id || nextUserId(users)) : nextUserId(users),
      username:    formData.username.trim().toLowerCase(),
      fullName:    formData.username.trim(),
      role:        formData.role,
      scopeMode:   formData.scopeMode,
      unit:        formData.unit.trim(),
      party:       formData.party.trim(),
      notes:       formData.notes.trim(),
      permissions: formData.role === 'admin' ? undefined : formPerms,
      createdAt:   new Date().toLocaleString('en-GB'),
    }

    // Set password: new user always sets it; edit only if provided
    if (formData.password.trim()) {
      userData.password = formData.password.trim()
    } else if (editingUserId) {
      // Keep existing password
      const existing = users.find(u => u.id === editingUserId)
      userData.password = existing?.password || ''
    }

    const updatedUsers = editingUserId
      ? users.map(u => u.id === editingUserId ? { ...u, ...userData } : u)
      : [...users, userData]

    saveToLocalStorage(updatedUsers)
    closeModal()
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteUser = (id: string) => {
    const user = users.find(u => u.id === id)
    if (!user) return
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return
    const updated = users.filter(u => u.id !== id)
    const newActive = activeUserId === id ? (updated[0]?.id || '') : activeUserId
    saveToLocalStorage(updated, newActive)
  }

  // ── Reset password ────────────────────────────────────────────────────────

  const resetPassword = (userId: string) => {
    const user = users.find(u => u.id === userId)
    if (!user) return
    const newPwd = prompt(`New password for "${user.username}":`)
    if (!newPwd || !newPwd.trim()) return
    if (newPwd.trim().length < 4) { alert('Password must be at least 4 characters.'); return }
    const updated = users.map(u => u.id === userId ? { ...u, password: newPwd.trim() } : u)
    saveToLocalStorage(updated)
    alert(`✓ Password updated for "${user.username}"`)
  }

  // ── Set active user ───────────────────────────────────────────────────────

  const setActiveUser = (id: string) => {
    const raw = localStorage.getItem('dyeflow_db')
    const db  = raw ? JSON.parse(raw) : {}
    db.activeUserId = id
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setActiveUserId(id)
    window.dispatchEvent(new Event('dyeflow-db-updated'))
  }

  const groupedPages = useMemo(() => {
    const groups: Record<string, PageDef[]> = {}
    for (const p of allPages) {
      if (!groups[p.group]) groups[p.group] = []
      groups[p.group].push(p)
    }
    return groups
  }, [allPages])

  const activeUser = users.find(u => u.id === activeUserId)
  // Determine who is actually logged in from the session
  const loggedInUsername = (() => {
    try {
      const s = localStorage.getItem('dyeflow_session')
      return s ? JSON.parse(s)?.username?.toLowerCase() : null
    } catch { return null }
  })()

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="content">

      {/* Active user banner */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--success-light)', borderRadius: 8, border: '1px solid var(--success)' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
            {activeUser ? activeUser.username.charAt(0).toUpperCase() : '?'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)' }}>
              {activeUser ? activeUser.username : 'No active user'}
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>({activeUser?.role || 'no role'})</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Data scope: {activeUser ? getScopeSummary(activeUser) : '-'} &nbsp;·&nbsp;
              Supervisor filter: <strong>{activeUser?.permissions?.supervisorFilter || 'all'}</strong> &nbsp;·&nbsp;
              Pages: <strong>{activeUser ? (activeUser.role === 'admin' ? 'All (admin)' : `${countGranted(activeUser.permissions || { pages: {}, supervisorFilter: 'all' })} granted`) : '-'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Users table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="card-title">Users</span>
            <span style={{ fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{users.length}</span>
          </div>
          <button className="primary" onClick={openAddModal}>+ Add User</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Role</th>
                <th>Password</th>
                <th>Data Scope</th>
                <th>Supervisor Filter</th>
                <th>Pages</th>
                <th>Session</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const isActive = (user.username || '').toLowerCase() === loggedInUsername
                const granted  = user.role === 'admin' ? '∞' : `${countGranted(user.permissions || { pages: {}, supervisorFilter: 'all' })}`
                const sfLabel  = user.permissions?.supervisorFilter || 'all'
                return (
                  <tr key={user.id}>
                    <td style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11 }}>{user.id}</td>
                    <td style={{ fontWeight: 600 }}>{user.username}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, fontWeight: 600, background: user.role === 'admin' ? 'var(--danger-light)' : 'var(--accent-light)', color: user.role === 'admin' ? 'var(--danger)' : 'var(--accent-dark)' }}>
                        {ROLE_LABELS[user.role as RolePreset] || user.role}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-tertiary)' }}>
                      {user.password ? '••••••••' : <span style={{ color: 'var(--danger)', fontSize: 11 }}>Not set</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>{getScopeSummary(user)}</td>
                    <td style={{ fontSize: 12 }}>
                      {sfLabel === 'all'
                        ? <span style={{ color: 'var(--text-tertiary)' }}>All</span>
                        : <span style={{ fontWeight: 600, color: 'var(--accent-dark)' }}>{sfLabel}</span>}
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{granted}</td>
                    <td>{isActive ? <span className="badge badge-done">✓ Current session</span> : <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="xs" style={{ marginRight: 4 }} onClick={() => openEditModal(user.id)}>Edit</button>
                      <button className="xs" style={{ marginRight: 4 }} onClick={() => resetPassword(user.id)}>Reset Pwd</button>
                      <button className="xs danger" onClick={() => deleteUser(user.id)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-light)' }}>
          ℹ Users and passwords are stored in the DyeFlow database and synced across all devices automatically.
        </div>
      </div>

      {/* Legend */}
      <div className="card">
        <div className="card-header"><span className="card-title" style={{ fontSize: 13 }}>Permission Legend</span></div>
        <div style={{ display: 'flex', gap: 24, padding: '0 16px 16px', flexWrap: 'wrap', fontSize: 12 }}>
          {[{ label: 'View', color: 'var(--accent)', desc: 'Can open and read the page' },
            { label: 'Edit', color: '#D97706', desc: 'Can create and update records' },
            { label: 'Delete', color: 'var(--danger)', desc: 'Can delete records' }].map(({ label, color, desc }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />
              <strong>{label}</strong> — {desc}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)' }}>↪</span>
            Dynamic pages auto-generated from machines / processes / supervisors
          </div>
        </div>
      </div>

      {/* ═══ MODAL ══════════════════════════════════════════════════════════ */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 860, width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

            <div className="modal-header" style={{ flexShrink: 0 }}>
              <span className="modal-title">{editingUserId ? `Edit User — ${users.find(u => u.id === editingUserId)?.username}` : 'Create New User'}</span>
              <button className="small" onClick={closeModal}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }}>
              {(['basic', 'permissions'] as const).map(tab => (
                <button key={tab} onClick={() => setModalTab(tab)} style={{
                  padding: '10px 20px', fontSize: 13, fontWeight: modalTab === tab ? 700 : 400,
                  border: 'none', borderBottom: modalTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                  background: 'transparent', color: modalTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer', marginBottom: -1,
                }}>
                  {tab === 'basic' ? '👤 Basic Info & Password' : `🔐 Permissions (${countGranted(formPerms)} pages)`}
                </button>
              ))}
            </div>

            {/* Body */}
            <form onSubmit={e => { e.preventDefault(); saveUser() }} style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

              {saveError && (
                <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--danger)', marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
                  ⚠ {saveError}
                </div>
              )}

              {/* ── BASIC TAB ─────────────────────────────────────────── */}
              {modalTab === 'basic' && (
                <div>
                  {/* Username + Role */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div className="form-group">
                      <label>Username *</label>
                      <input value={formData.username} onChange={e => setFormData(f => ({ ...f, username: e.target.value }))} placeholder="e.g. kundan.m" autoFocus />
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, display: 'block' }}>Stored lowercase. Used to log in.</span>
                    </div>
                    <div className="form-group">
                      <label>Role</label>
                      <select value={formData.role} onChange={e => applyRolePreset(e.target.value as RolePreset)}>
                        {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Password */}
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 16, marginBottom: 14, border: '1px solid var(--border-light)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                      🔑 Password
                      {editingUserId && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 8 }}>Leave blank to keep existing password</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                        <label>{editingUserId ? 'New Password' : 'Password *'}</label>
                        <PasswordInput
                          value={formData.password}
                          onChange={v => { setFormData(f => ({ ...f, password: v })); setSaveError('') }}
                          placeholder={editingUserId ? 'Leave blank to keep current' : 'Min. 4 characters'}
                          required={!editingUserId}
                        />
                      </div>
                      <div className="form-group">
                        <label>Confirm Password{!editingUserId && ' *'}</label>
                        <PasswordInput
                          value={formData.confirmPassword}
                          onChange={v => { setFormData(f => ({ ...f, confirmPassword: v })); setSaveError('') }}
                          placeholder="Re-enter password"
                        />
                      </div>
                    </div>
                    {/* Match indicator */}
                    {formData.password && formData.confirmPassword && (
                      <div style={{ fontSize: 11, marginTop: 6, color: formData.password === formData.confirmPassword ? 'var(--success)' : 'var(--danger)' }}>
                        {formData.password === formData.confirmPassword ? '✓ Passwords match' : '⚠ Passwords do not match'}
                      </div>
                    )}
                  </div>

                  {/* Scope */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div className="form-group">
                      <label>Data Scope</label>
                      <select value={formData.scopeMode} onChange={e => setFormData(f => ({ ...f, scopeMode: e.target.value }))}>
                        {SCOPE_MODES.map(m => <option key={m} value={m}>{SCOPE_LABELS[m]}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Unit</label>
                      <input value={formData.unit} onChange={e => setFormData(f => ({ ...f, unit: e.target.value }))}
                        placeholder="Unit name" disabled={formData.scopeMode === 'all' || formData.scopeMode === 'party'} />
                    </div>
                    <div className="form-group">
                      <label>Party</label>
                      <input value={formData.party} onChange={e => setFormData(f => ({ ...f, party: e.target.value }))}
                        placeholder="Party name" list="party-list"
                        disabled={formData.scopeMode === 'all' || formData.scopeMode === 'unit'} />
                      <datalist id="party-list">{availableParties.map(p => <option key={p} value={p} />)}</datalist>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 14 }}>
                    <label>Notes</label>
                    <input value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes about this user" />
                  </div>

                  {/* Supervisor filter */}
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 16, marginBottom: 14, border: '1px solid var(--border-light)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>🔍 Supervisor Data Filter</div>
                    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                        <input type="radio" name="sf" checked={formPerms.supervisorFilter === 'all'}
                          onChange={() => setFormPerms(p => ({ ...p, supervisorFilter: 'all' }))} />
                        All supervisors
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                          <input type="radio" name="sf" checked={formPerms.supervisorFilter !== 'all'}
                            onChange={() => setFormPerms(p => ({ ...p, supervisorFilter: supervisorNames[0] || '' }))} />
                          Specific supervisor:
                        </label>
                        <select
                          value={formPerms.supervisorFilter === 'all' ? '' : formPerms.supervisorFilter}
                          onChange={e => setFormPerms(p => ({ ...p, supervisorFilter: e.target.value }))}
                          disabled={formPerms.supervisorFilter === 'all'}
                          style={{ fontSize: 13, padding: '5px 8px' }}>
                          <option value="">— select —</option>
                          {supervisorNames.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
                      Restricts all data on every page to orders belonging to the selected supervisor only.
                    </p>
                  </div>

                  {formData.role === 'admin'
                    ? <div style={{ padding: '10px 14px', background: 'var(--danger-light)', borderRadius: 8, fontSize: 12, color: 'var(--danger)' }}>
                        <strong>Admin role:</strong> Bypasses all page-permission checks — full access to everything.
                      </div>
                    : <div style={{ padding: '10px 14px', background: 'var(--accent-light)', borderRadius: 8, fontSize: 12, color: 'var(--accent-dark)' }}>
                        <strong>Tip:</strong> Switch to the Permissions tab to control exactly which pages this user can access.
                      </div>
                  }
                </div>
              )}

              {/* ── PERMISSIONS TAB ───────────────────────────────────── */}
              {modalTab === 'permissions' && (
                <div>
                  {formData.role === 'admin' ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>👑</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>Admin bypasses all permission checks.</div>
                      <div style={{ fontSize: 12, marginTop: 6 }}>Change the role to configure page-level permissions.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginRight: 4 }}>Quick:</span>
                        <button className="xs primary" onClick={grantAll}>Grant All (Full)</button>
                        <button className="xs" onClick={viewAll}>View-Only All</button>
                        <button className="xs danger" onClick={clearAll}>Clear All</button>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>{countGranted(formPerms)} pages with view access</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 56px 56px', padding: '0 8px', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Page</span>
                        {['View', 'Edit', 'Del'].map(h => (
                          <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', textAlign: 'center' }}>{h}</span>
                        ))}
                      </div>
                      {Object.entries(groupedPages).map(([group, pages]) => (
                        <div key={group} style={{ marginBottom: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{group}</span>
                            <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
                            <button className="xs" onClick={() => grantGroupAll(group, FULL_PERM)} style={{ fontSize: 10, padding: '2px 7px' }}>All</button>
                            <button className="xs" onClick={() => grantGroupAll(group, VIEW_PERM)} style={{ fontSize: 10, padding: '2px 7px' }}>View</button>
                            <button className="xs" onClick={() => grantGroupAll(group, EMPTY_PERM)} style={{ fontSize: 10, padding: '2px 7px' }}>None</button>
                          </div>
                          {pages.map(page => (
                            <PagePermRow key={page.path} page={page}
                              perm={formPerms.pages[page.path] || EMPTY_PERM}
                              onChange={perm => setPagePerm(page.path, perm)} />
                          ))}
                        </div>
                      ))}

                      {/* ── Order Sheet Access ── */}
                      {allSheets.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>📋 Order Sheet Access</span>
                            <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
                            <button className="xs" onClick={() => setFormPerms(p => ({ ...p, allowedSheets: allSheets.map(s => s.id) }))} style={{ fontSize: 10, padding: '2px 7px' }}>All</button>
                            <button className="xs" onClick={() => setFormPerms(p => ({ ...p, allowedSheets: [] }))} style={{ fontSize: 10, padding: '2px 7px' }}>None</button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {allSheets.map(sheet => {
                              const allowed = (formPerms.allowedSheets || []).includes(sheet.id)
                              return (
                                <label key={sheet.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                                  background: allowed ? 'var(--accent-light)' : 'var(--bg-secondary)',
                                  border: `1px solid ${allowed ? 'var(--accent)' : 'var(--border-light)'}`,
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={allowed}
                                    onChange={e => {
                                      const current = formPerms.allowedSheets || []
                                      setFormPerms(p => ({
                                        ...p,
                                        allowedSheets: e.target.checked
                                          ? [...current, sheet.id]
                                          : current.filter(id => id !== sheet.id)
                                      }))
                                    }}
                                    style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
                                  />
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: allowed ? 700 : 400, color: allowed ? 'var(--accent-dark)' : 'var(--text-primary)' }}>
                                      {sheet.title}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                      {sheet.id} {sheet.assignedTo ? `· ${sheet.assignedTo}` : ''}
                                    </div>
                                  </div>
                                  {allowed && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>✓ Access granted</span>}
                                </label>
                              )
                            })}
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                            Checked sheets will be visible to this user when they log in. Unchecked sheets are hidden.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </form>

            {/* Footer */}
            <div style={{ flexShrink: 0, padding: '14px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              {saveError && <span style={{ fontSize: 12, color: 'var(--danger)', flex: 1 }}>⚠ {saveError}</span>}
              <button onClick={closeModal}>Cancel</button>
              <button className="primary" onClick={saveUser}>
                {editingUserId ? '✓ Update User' : '✓ Create User'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
