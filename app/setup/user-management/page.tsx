'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  buildPageList, buildPermissionsFromRole,
  ROLE_LABELS, EMPTY_PERM, FULL_PERM, VIEW_PERM,
  DEFAULT_USER_PERMISSIONS,
  type DyeflowUser, type UserPermissions, type PagePerm, type RolePreset, type PageDef,
} from '@/lib/permissions'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SCOPE_MODES = ['all', 'unit', 'party', 'unit_or_party']

const SCOPE_LABELS: Record<string, string> = {
  all:          'All Data',
  unit:         'Unit Only',
  party:        'Party Only',
  unit_or_party:'Unit OR Party',
}

function getScopeSummary(user: DyeflowUser): string {
  if (user.scopeMode === 'all' || !user.scopeMode) return 'All data'
  if (user.scopeMode === 'unit')   return `Unit: ${user.unit || '-'}`
  if (user.scopeMode === 'party')  return `Party: ${user.party || '-'}`
  if (user.scopeMode === 'unit_or_party') {
    const parts: string[] = []
    if (user.unit)  parts.push(`Unit: ${user.unit}`)
    if (user.party) parts.push(`Party: ${user.party}`)
    return parts.join(' OR ') || '-'
  }
  return '-'
}

function nextUserId(users: DyeflowUser[]): string {
  const nums = users.map(u => { const m = (u.id || '').match(/(\d+)/); return m ? parseInt(m[1]) : 0 })
  return 'USR-' + String(Math.max(0, ...nums) + 1).padStart(3, '0')
}

function countGranted(perms: UserPermissions): number {
  return Object.values(perms.pages).filter(p => p.view).length
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny checkbox group for a single page row
// ─────────────────────────────────────────────────────────────────────────────

function PagePermRow({
  page, perm, onChange,
}: {
  page: PageDef
  perm: PagePerm
  onChange: (p: PagePerm) => void
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 56px 56px 56px',
      alignItems: 'center',
      padding: '5px 8px',
      borderRadius: 6,
      background: perm.view ? 'var(--accent-light)' : 'var(--bg-secondary)',
      marginBottom: 3,
      gap: 4,
    }}>
      <span style={{ fontSize: 12, color: perm.view ? 'var(--accent-dark)' : 'var(--text-tertiary)', fontWeight: perm.view ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {page.dynamic ? '↪ ' : ''}{page.label}
      </span>
      {(['view', 'edit', 'delete'] as const).map(k => (
        <label key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!perm[k]}
            onChange={e => {
              const next = { ...perm, [k]: e.target.checked }
              // If enabling edit/delete, also enable view
              if ((k === 'edit' || k === 'delete') && e.target.checked) next.view = true
              // If disabling view, also disable edit/delete
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
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function UserManagementPage() {
  const [users, setUsers]         = useState<DyeflowUser[]>([])
  const [activeUserId, setActiveUserId] = useState('')
  const [isModalOpen, setIsModalOpen]   = useState(false)
  const [editingUserId, setEditingUserId] = useState('')
  const [modalTab, setModalTab]   = useState<'basic' | 'permissions'>('basic')
  const [allPages, setAllPages]   = useState<PageDef[]>([])
  const [supervisorNames, setSupervisorNames] = useState<string[]>([])

  // Form state
  const [formData, setFormData] = useState({
    username:   '',
    role:       'custom' as RolePreset,
    scopeMode:  'all',
    unit:       '',
    party:      '',
    notes:      '',
  })
  const [formPerms, setFormPerms] = useState<UserPermissions>(DEFAULT_USER_PERMISSIONS)

  // Available units/parties for datalist
  const [availableUnits,   setAvailableUnits]   = useState<string[]>([])
  const [availableParties, setAvailableParties] = useState<string[]>([])

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => { loadData() }, [])

  const loadData = () => {
    const pages = buildPageList()
    setAllPages(pages)

    const raw = localStorage.getItem('dyeflow_db')
    const db  = raw ? JSON.parse(raw) : {}

    if (!db.users || db.users.length === 0) initDefaultAdmin(db)

    setUsers(db.users || [])
    setActiveUserId(db.activeUserId || db.users?.[0]?.id || '')

    // Supervisor names for the filter dropdown
    setSupervisorNames((db.supervisors || []).map((s: any) => s.name).filter(Boolean))

    // Units / parties for datalist
    const units = [...new Set([
      ...(db.orders || []).map((x: any) => x.party),
    ].filter(Boolean))].sort() as string[]
    const parties = [...new Set([
      ...(db.orders || []).map((x: any) => x.party),
    ].filter(Boolean))].sort() as string[]

    setAvailableUnits(units)
    setAvailableParties(parties)
  }

  const initDefaultAdmin = (db: any) => {
    const admin: DyeflowUser = {
      id: 'USR-001',
      username: 'Admin',
      role: 'admin',
      scopeMode: 'all',
      notes: 'Default full-access admin',
      createdAt: new Date().toLocaleString('en-GB'),
    }
    db.users = [admin]
    db.activeUserId = 'USR-001'
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const saveToDB = (updatedUsers: DyeflowUser[], newActiveId?: string) => {
    const raw = localStorage.getItem('dyeflow_db')
    const db  = raw ? JSON.parse(raw) : {}
    db.users = updatedUsers
    if (newActiveId !== undefined) db.activeUserId = newActiveId
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
    loadData()
  }

  // ── Permission helpers ────────────────────────────────────────────────────

  const setPagePerm = (path: string, perm: PagePerm) => {
    setFormPerms(prev => ({ ...prev, pages: { ...prev.pages, [path]: perm } }))
  }

  const applyRolePreset = (role: RolePreset) => {
    const perms = buildPermissionsFromRole(role, allPages, formPerms.supervisorFilter)
    setFormPerms(perms)
    setFormData(f => ({ ...f, role }))
  }

  const grantGroupAll = (group: string, perm: PagePerm) => {
    const updates: Record<string, PagePerm> = {}
    allPages.filter(p => p.group === group).forEach(p => { updates[p.path] = perm })
    setFormPerms(prev => ({ ...prev, pages: { ...prev.pages, ...updates } }))
  }

  const grantAll   = () => { const p: Record<string,PagePerm> = {}; allPages.forEach(pg => { p[pg.path] = FULL_PERM }); setFormPerms(prev => ({ ...prev, pages: p })) }
  const clearAll   = () => { setFormPerms(prev => ({ ...prev, pages: {} })) }
  const viewAll    = () => { const p: Record<string,PagePerm> = {}; allPages.forEach(pg => { p[pg.path] = VIEW_PERM }); setFormPerms(prev => ({ ...prev, pages: p })) }

  // ── Modal open/close ──────────────────────────────────────────────────────

  const openAddModal = () => {
    setEditingUserId('')
    setFormData({ username: '', role: 'custom', scopeMode: 'all', unit: '', party: '', notes: '' })
    setFormPerms(DEFAULT_USER_PERMISSIONS)
    setModalTab('basic')
    setIsModalOpen(true)
  }

  const openEditModal = (userId: string) => {
    const user = users.find(u => u.id === userId)
    if (!user) return
    setEditingUserId(userId)
    setFormData({
      username:  user.username  || '',
      role:      (user.role as RolePreset) || 'custom',
      scopeMode: user.scopeMode || 'all',
      unit:      user.unit      || '',
      party:     user.party     || '',
      notes:     user.notes     || '',
    })
    setFormPerms(user.permissions || DEFAULT_USER_PERMISSIONS)
    setModalTab('basic')
    setIsModalOpen(true)
  }

  const closeModal = () => { setIsModalOpen(false); setEditingUserId('') }

  // ── Save user ─────────────────────────────────────────────────────────────

  const saveUser = () => {
    if (!formData.username.trim()) { alert('Please enter a username.'); return }

    const userData: Partial<DyeflowUser> = {
      username:    formData.username.trim(),
      role:        formData.role,
      scopeMode:   formData.scopeMode,
      unit:        formData.unit.trim(),
      party:       formData.party.trim(),
      notes:       formData.notes.trim(),
      permissions: formData.role === 'admin' ? undefined : formPerms,
      createdAt:   new Date().toLocaleString('en-GB'),
    }

    let updatedUsers: DyeflowUser[]
    if (editingUserId) {
      updatedUsers = users.map(u => u.id === editingUserId ? { ...u, ...userData } : u)
    } else {
      updatedUsers = [...users, { id: nextUserId(users), ...userData } as DyeflowUser]
    }
    saveToDB(updatedUsers)
    closeModal()
  }

  const deleteUser = (id: string) => {
    if (!confirm('Delete this user?')) return
    const updated = users.filter(u => u.id !== id)
    const newActive = activeUserId === id ? (updated[0]?.id || '') : activeUserId
    saveToDB(updated, newActive)
  }

  const setActiveUser = (id: string) => {
    const raw = localStorage.getItem('dyeflow_db')
    const db  = raw ? JSON.parse(raw) : {}
    db.activeUserId = id
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setActiveUserId(id)
    window.dispatchEvent(new Event('dyeflow-db-updated'))
  }

  // ── Group pages for the matrix ────────────────────────────────────────────

  const groupedPages = useMemo(() => {
    const groups: Record<string, PageDef[]> = {}
    for (const p of allPages) {
      if (!groups[p.group]) groups[p.group] = []
      groups[p.group].push(p)
    }
    return groups
  }, [allPages])

  const activeUser = users.find(u => u.id === activeUserId)

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="content">

      {/* ── Active User Banner ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--success-light)', borderRadius: 8, border: '1px solid var(--success)' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
            {activeUser ? activeUser.username.charAt(0).toUpperCase() : '?'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)' }}>
              {activeUser ? activeUser.username : 'No active user'} &nbsp;
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>
                ({activeUser?.role || 'no role'})
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Data scope: {activeUser ? getScopeSummary(activeUser) : '-'} &nbsp;·&nbsp;
              Supervisor filter: <strong>{activeUser?.permissions?.supervisorFilter || 'all'}</strong> &nbsp;·&nbsp;
              Pages: <strong>{activeUser ? (activeUser.role === 'admin' ? 'All (admin)' : `${countGranted(activeUser.permissions || { pages: {}, supervisorFilter: 'all' })} granted`) : '-'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ── Users Table ───────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="card-title">Users</span>
            <span style={{ fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
              {users.length}
            </span>
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
                <th>Data Scope</th>
                <th>Supervisor Filter</th>
                <th>Pages Granted</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const isActive = user.id === activeUserId
                const granted  = user.role === 'admin' ? '∞ All' : `${countGranted(user.permissions || { pages: {}, supervisorFilter: 'all' })}`
                const sfLabel  = user.permissions?.supervisorFilter || 'all'
                return (
                  <tr key={user.id}>
                    <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{user.id}</td>
                    <td style={{ fontWeight: 600 }}>{user.username}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: user.role === 'admin' ? 'var(--danger-light)' : 'var(--accent-light)', color: user.role === 'admin' ? 'var(--danger)' : 'var(--accent-dark)', fontWeight: 600 }}>
                        {ROLE_LABELS[user.role as RolePreset] || user.role}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{getScopeSummary(user)}</td>
                    <td style={{ fontSize: 12 }}>
                      {sfLabel === 'all'
                        ? <span style={{ color: 'var(--text-tertiary)' }}>All supervisors</span>
                        : <span style={{ fontWeight: 600, color: 'var(--accent-dark)' }}>{sfLabel}</span>
                      }
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{granted}</td>
                    <td>
                      {isActive
                        ? <span className="badge badge-done">✓ Active</span>
                        : <span className="badge badge-pending">Inactive</span>
                      }
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="xs primary" onClick={() => setActiveUser(user.id)} disabled={isActive} style={{ opacity: isActive ? 0.4 : 1, marginRight: 4 }}>
                        {isActive ? 'Using' : 'Use'}
                      </button>
                      <button className="xs" style={{ marginRight: 4 }} onClick={() => openEditModal(user.id)}>Edit</button>
                      <button className="xs danger" onClick={() => deleteUser(user.id)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header"><span className="card-title" style={{ fontSize: 13 }}>Permission Legend</span></div>
        <div style={{ display: 'flex', gap: 24, padding: '0 16px 16px', flexWrap: 'wrap', fontSize: 12 }}>
          {[
            { label: 'View',   color: 'var(--accent)',   desc: 'Can open and read the page' },
            { label: 'Edit',   color: '#D97706',         desc: 'Can create and update records' },
            { label: 'Delete', color: 'var(--danger)',   desc: 'Can delete records' },
          ].map(({ label, color, desc }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />
              <strong>{label}</strong> — {desc}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)' }}>↪</span>
            Dynamic pages (auto-generated from machines / processes / supervisors you add)
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL
      ════════════════════════════════════════════════════════════════════ */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 860, width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

            {/* Modal header */}
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <span className="modal-title">{editingUserId ? 'Edit User' : 'Create User'}</span>
              <button className="small" onClick={closeModal}>✕</button>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }}>
              {(['basic', 'permissions'] as const).map(tab => (
                <button key={tab} onClick={() => setModalTab(tab)} style={{
                  padding: '10px 20px', fontSize: 13, fontWeight: modalTab === tab ? 700 : 400,
                  border: 'none', borderBottom: modalTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                  background: 'transparent', color: modalTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer', marginBottom: -1,
                }}>
                  {tab === 'basic' ? '👤 Basic Info' : `🔐 Permissions (${countGranted(formPerms)} pages)`}
                </button>
              ))}
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

              {/* ── BASIC TAB ─────────────────────────────────────────── */}
              {modalTab === 'basic' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div className="form-group">
                      <label>Username *</label>
                      <input value={formData.username} onChange={e => setFormData(f => ({ ...f, username: e.target.value }))} placeholder="e.g. Machine Operator 1" />
                    </div>
                    <div className="form-group">
                      <label>Role</label>
                      <select value={formData.role} onChange={e => applyRolePreset(e.target.value as RolePreset)}>
                        {Object.entries(ROLE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Data Visibility (Scope)</label>
                      <select value={formData.scopeMode} onChange={e => setFormData(f => ({ ...f, scopeMode: e.target.value }))}>
                        {SCOPE_MODES.map(m => <option key={m} value={m}>{SCOPE_LABELS[m]}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Unit <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>(for unit-based scope)</span></label>
                      <input value={formData.unit} onChange={e => setFormData(f => ({ ...f, unit: e.target.value }))}
                        placeholder="Type or select unit" list="unit-list"
                        disabled={formData.scopeMode === 'all' || formData.scopeMode === 'party'} />
                      <datalist id="unit-list">{availableUnits.map(u => <option key={u} value={u} />)}</datalist>
                    </div>
                    <div className="form-group">
                      <label>Party <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>(for party-based scope)</span></label>
                      <input value={formData.party} onChange={e => setFormData(f => ({ ...f, party: e.target.value }))}
                        placeholder="Type or select party" list="party-list"
                        disabled={formData.scopeMode === 'all' || formData.scopeMode === 'unit'} />
                      <datalist id="party-list">{availableParties.map(p => <option key={p} value={p} />)}</datalist>
                    </div>
                    <div className="form-group">
                      <label>Notes</label>
                      <input value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
                    </div>
                  </div>

                  {/* ── Supervisor Filter ─────────────────────────────── */}
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '16px', marginBottom: 14, border: '1px solid var(--border-light)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
                      🔍 Data Visibility — Supervisor Filter
                    </div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                        <input type="radio" name="sf" checked={formPerms.supervisorFilter === 'all'}
                          onChange={() => setFormPerms(p => ({ ...p, supervisorFilter: 'all' }))} />
                        All supervisors — see everyone's data
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                          <input type="radio" name="sf" checked={formPerms.supervisorFilter !== 'all'}
                            onChange={() => {
                              const first = supervisorNames[0] || ''
                              setFormPerms(p => ({ ...p, supervisorFilter: first }))
                            }} />
                          Specific supervisor only:
                        </label>
                        <select
                          value={formPerms.supervisorFilter === 'all' ? '' : formPerms.supervisorFilter}
                          onChange={e => setFormPerms(p => ({ ...p, supervisorFilter: e.target.value }))}
                          disabled={formPerms.supervisorFilter === 'all'}
                          style={{ fontSize: 13, padding: '5px 8px' }}
                        >
                          <option value="">— select —</option>
                          {supervisorNames.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10, marginBottom: 0, lineHeight: 1.6 }}>
                      When a specific supervisor is selected, this user will only see orders, batches, FMS entries, and machine sheets
                      belonging to that supervisor — even on pages they have full view access to.
                    </p>
                  </div>

                  {formData.role !== 'admin' && (
                    <div style={{ padding: '10px 14px', background: 'var(--accent-light)', borderRadius: 8, fontSize: 12, color: 'var(--accent-dark)', lineHeight: 1.6 }}>
                      <strong>Tip:</strong> Switch to the <em>Permissions</em> tab to grant page-level access (View / Edit / Delete per page).
                      Role preset above auto-fills a sensible starting set.
                    </div>
                  )}
                  {formData.role === 'admin' && (
                    <div style={{ padding: '10px 14px', background: 'var(--danger-light)', borderRadius: 8, fontSize: 12, color: 'var(--danger)', lineHeight: 1.6 }}>
                      <strong>Admin role:</strong> This user bypasses all page-permission checks and can see/edit/delete everything.
                    </div>
                  )}
                </div>
              )}

              {/* ── PERMISSIONS TAB ───────────────────────────────────── */}
              {modalTab === 'permissions' && (
                <div>
                  {formData.role === 'admin' ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>👑</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>Admin bypasses all permission checks.</div>
                      <div style={{ fontSize: 12, marginTop: 6 }}>Change the role to Custom or another preset to configure page permissions.</div>
                    </div>
                  ) : (
                    <>
                      {/* Quick actions */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginRight: 4 }}>Quick:</span>
                        <button className="xs primary" onClick={grantAll}>Grant All (Full)</button>
                        <button className="xs" onClick={viewAll}>View-Only All</button>
                        <button className="xs danger" onClick={clearAll}>Clear All</button>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                          {countGranted(formPerms)} pages with view access
                        </span>
                      </div>

                      {/* Column headers */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 56px 56px', padding: '0 8px', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Page</span>
                        {['View', 'Edit', 'Del'].map(h => (
                          <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', textAlign: 'center' }}>{h}</span>
                        ))}
                      </div>

                      {/* Groups */}
                      {Object.entries(groupedPages).map(([group, pages]) => (
                        <div key={group} style={{ marginBottom: 16 }}>
                          {/* Group header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{group}</span>
                            <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
                            <button className="xs" onClick={() => grantGroupAll(group, FULL_PERM)} style={{ fontSize: 10, padding: '2px 7px' }}>All</button>
                            <button className="xs" onClick={() => grantGroupAll(group, VIEW_PERM)} style={{ fontSize: 10, padding: '2px 7px' }}>View</button>
                            <button className="xs" onClick={() => grantGroupAll(group, EMPTY_PERM)} style={{ fontSize: 10, padding: '2px 7px' }}>None</button>
                          </div>
                          {pages.map(page => (
                            <PagePermRow
                              key={page.path}
                              page={page}
                              perm={formPerms.pages[page.path] || EMPTY_PERM}
                              onChange={perm => setPagePerm(page.path, perm)}
                            />
                          ))}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ flexShrink: 0, padding: '14px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
