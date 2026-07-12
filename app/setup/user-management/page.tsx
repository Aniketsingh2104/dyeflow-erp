'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  fetchPageList, buildPermissionsFromRole,
  ROLE_LABELS, EMPTY_PERM, FULL_PERM, VIEW_PERM,
  DEFAULT_USER_PERMISSIONS,
  type DyeflowUser, type UserPermissions, type PagePerm, type RolePreset, type PageDef,
} from '@/lib/permissions'

// ── Types ────────────────────────────────────────────────────────────────────
interface DyeflowUserWithPassword extends DyeflowUser {
  password?: string
  fullName?: string
  isActive?: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const SCOPE_MODES  = ['all', 'unit', 'party', 'unit_or_party']
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

function countGranted(perms: UserPermissions): number {
  return Object.values(perms.pages).filter(p => p.view).length
}

// Shape Supabase row → DyeflowUserWithPassword
function shapeUser(row: any): DyeflowUserWithPassword {
  return {
    id:          row.id,
    username:    row.username,
    fullName:    row.full_name || row.username,
    role:        row.role || 'custom',
    scopeMode:   row.scope_mode || 'all',
    unit:        row.unit || '',
    party:       row.party || '',
    notes:       row.notes || '',
    permissions: row.permissions || DEFAULT_USER_PERMISSIONS,
    createdAt:   row.created_at,
    isActive:    row.is_active !== false,
    password:    row.password || '',   // plain text for now
  }
}

// ── PagePermRow ───────────────────────────────────────────────────────────────
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

// ── PasswordInput ─────────────────────────────────────────────────────────────
function PasswordInput({ value, onChange, placeholder, required }: {
  value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'Enter password'} required={required} autoComplete="new-password"
        style={{ paddingRight: 38 }} />
      <button type="button" onClick={() => setShow(s => !s)}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: show ? 'var(--accent)' : 'var(--text-tertiary)', fontSize: 14, padding: '2px 4px' }}>
        {show ? '🙈' : '👁'}
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UserManagementPage() {
  const [users,             setUsers]             = useState<DyeflowUserWithPassword[]>([])
  const [loading,           setLoading]           = useState(true)
  const [saving,            setSaving]            = useState(false)
  const [isModalOpen,       setIsModalOpen]       = useState(false)
  const [editingUserId,     setEditingUserId]     = useState('')
  const [modalTab,          setModalTab]          = useState<'basic'|'permissions'>('basic')
  const [allPages,          setAllPages]          = useState<PageDef[]>([])
  const [supervisorNames,   setSupervisorNames]   = useState<string[]>([])
  const [availableParties,  setAvailableParties]  = useState<string[]>([])
  const [saveError,         setSaveError]         = useState('')

  const [formData, setFormData] = useState({
    username: '', password: '', confirmPassword: '',
    role: 'custom' as RolePreset, scopeMode: 'all', unit: '', party: '', notes: '',
  })
  const [formPerms, setFormPerms] = useState<UserPermissions>(DEFAULT_USER_PERMISSIONS)

  // ── Load all data from Supabase ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [usersRes, pagesRes, supRes, ordersRes] = await Promise.all([
        fetch('/api/users',       { cache: 'no-store' }).then(r => r.json()),
        fetchPageList(),
        fetch('/api/supervisors', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/orders?limit=500', { cache: 'no-store' }).then(r => r.json()),
      ])

      const shapedUsers = (usersRes.data || []).map(shapeUser)
      setUsers(shapedUsers)
      setAllPages(pagesRes)
      setSupervisorNames((supRes.data || []).map((s: any) => s.name).filter(Boolean))
      const parties = [...new Set((ordersRes.data || []).map((o: any) => o.party).filter(Boolean))].sort() as string[]
      setAvailableParties(parties)

      // If no users exist at all, seed the admin into localStorage so login still works
      if (shapedUsers.length === 0) {
        console.warn('No users in Supabase — using fallback admin')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Permission helpers ────────────────────────────────────────────────────
  const setPagePerm    = (path: string, perm: PagePerm) =>
    setFormPerms(prev => ({ ...prev, pages: { ...prev.pages, [path]: perm } }))
  const applyRolePreset = (role: RolePreset) => {
    setFormPerms(buildPermissionsFromRole(role, allPages, formPerms.supervisorFilter))
    setFormData(f => ({ ...f, role }))
  }
  const grantGroupAll  = (group: string, perm: PagePerm) => {
    const updates: Record<string, PagePerm> = {}
    allPages.filter(p => p.group === group).forEach(p => { updates[p.path] = perm })
    setFormPerms(prev => ({ ...prev, pages: { ...prev.pages, ...updates } }))
  }
  const grantAll = () => { const p: Record<string,PagePerm> = {}; allPages.forEach(pg => { p[pg.path] = FULL_PERM }); setFormPerms(prev => ({ ...prev, pages: p })) }
  const clearAll = () => setFormPerms(prev => ({ ...prev, pages: {} }))
  const viewAll  = () => { const p: Record<string,PagePerm> = {}; allPages.forEach(pg => { p[pg.path] = VIEW_PERM }); setFormPerms(prev => ({ ...prev, pages: p })) }

  // ── Modal helpers ─────────────────────────────────────────────────────────
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

  // ── Save (create or update) via /api/users ────────────────────────────────
  const saveUser = async () => {
    setSaveError('')
    if (!formData.username.trim()) { setSaveError('Username is required.'); return }
    if (!editingUserId && !formData.password.trim()) { setSaveError('Password required for new users.'); return }
    if (formData.password && formData.password.length < 4) { setSaveError('Password must be ≥ 4 characters.'); return }
    if (formData.password && formData.password !== formData.confirmPassword) { setSaveError('Passwords do not match.'); return }

    setSaving(true)
    try {
      const payload: Record<string, any> = {
        username:    formData.username.trim().toLowerCase(),
        full_name:   formData.username.trim(),
        role:        formData.role,
        permissions: formData.role === 'admin' ? null : formPerms,
        scope_mode:  formData.scopeMode,
        unit:        formData.unit.trim() || null,
        party:       formData.party.trim() || null,
        notes:       formData.notes.trim() || null,
      }
      if (formData.password.trim()) payload.password = formData.password.trim()

      const action  = editingUserId ? 'update' : 'create'
      const body    = editingUserId ? { action, id: editingUserId, ...payload } : { action, ...payload }

      const res  = await fetch('/api/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()

      if (!data.ok) { setSaveError(data.error || 'Save failed'); return }

      closeModal()
      await loadData()
    } finally { setSaving(false) }
  }

  // ── Delete via /api/users ─────────────────────────────────────────────────
  const deleteUser = async (id: string) => {
    const user = users.find(u => u.id === id)
    if (!user) return
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return
    const res  = await fetch('/api/users', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'delete', id }),
    })
    const data = await res.json()
    if (!data.ok) { alert('Delete failed: ' + (data.error || 'Unknown error')); return }
    await loadData()
  }

  // ── Reset password via /api/users ─────────────────────────────────────────
  const resetPassword = async (userId: string) => {
    const user = users.find(u => u.id === userId)
    if (!user) return
    const newPwd = prompt(`New password for "${user.username}":`)
    if (!newPwd?.trim()) return
    if (newPwd.trim().length < 4) { alert('Password must be at least 4 characters.'); return }
    const res  = await fetch('/api/users', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'reset_password', id: userId, password: newPwd.trim() }),
    })
    const data = await res.json()
    if (data.ok) alert(`✓ Password updated for "${user.username}"`)
    else alert('Reset failed: ' + (data.error || 'Unknown'))
  }

  const groupedPages = useMemo(() => {
    const groups: Record<string, PageDef[]> = {}
    for (const p of allPages) {
      if (!groups[p.group]) groups[p.group] = []
      groups[p.group].push(p)
    }
    return groups
  }, [allPages])

  // Who is currently logged in (session stored in localStorage by login page)
  const loggedInUsername = (() => {
    if (typeof window === 'undefined') return null
    try { const s = localStorage.getItem('dyeflow_session'); return s ? JSON.parse(s)?.username?.toLowerCase() : null } catch { return null }
  })()

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="content">

      {/* Users table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="card-title">Users</span>
            <span style={{ fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{users.length}</span>
            {loading && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Loading…</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="small" onClick={loadData} disabled={loading}>↻ Refresh</button>
            <button className="primary" onClick={openAddModal} disabled={loading}>+ Add User</button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th><th>Role</th><th>Password</th><th>Data Scope</th>
                <th>Supervisor Filter</th><th>Pages</th><th>Session</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading users from Supabase…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={8} className="empty-state">No users found. Add your first user above.</td></tr>
              ) : (
                users.map(user => {
                  const isActive = (user.username || '').toLowerCase() === loggedInUsername
                  const granted  = user.role === 'admin' ? '∞' : `${countGranted(user.permissions || DEFAULT_USER_PERMISSIONS)}`
                  const sfLabel  = user.permissions?.supervisorFilter || 'all'
                  return (
                    <tr key={user.id}>
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
                        {sfLabel === 'all' ? <span style={{ color: 'var(--text-tertiary)' }}>All</span> : <span style={{ fontWeight: 600, color: 'var(--accent-dark)' }}>{sfLabel}</span>}
                      </td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{granted}</td>
                      <td>{isActive ? <span className="badge badge-done">✓ Current</span> : <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="xs" style={{ marginRight: 4 }} onClick={() => openEditModal(user.id)}>Edit</button>
                        <button className="xs" style={{ marginRight: 4 }} onClick={() => resetPassword(user.id)}>Reset Pwd</button>
                        <button className="xs danger" onClick={() => deleteUser(user.id)}>Delete</button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-light)' }}>
          ✓ Users are stored in Supabase and synced across all devices automatically.
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {saveError && (
                <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--danger)', marginBottom: 14 }}>
                  ⚠ {saveError}
                </div>
              )}

              {/* ── BASIC TAB ──────────────────────────────────────────── */}
              {modalTab === 'basic' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div className="form-group">
                      <label>Username *</label>
                      <input value={formData.username} onChange={e => setFormData(f => ({ ...f, username: e.target.value }))} placeholder="e.g. kundan.m" autoFocus autoComplete="off" />
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
                      {editingUserId && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 8 }}>Leave blank to keep existing</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                        <label>{editingUserId ? 'New Password' : 'Password *'}</label>
                        <PasswordInput value={formData.password} onChange={v => { setFormData(f => ({ ...f, password: v })); setSaveError('') }}
                          placeholder={editingUserId ? 'Leave blank to keep current' : 'Min. 4 characters'} required={!editingUserId} />
                      </div>
                      <div className="form-group">
                        <label>Confirm Password</label>
                        <PasswordInput value={formData.confirmPassword} onChange={v => { setFormData(f => ({ ...f, confirmPassword: v })); setSaveError('') }}
                          placeholder="Re-enter password" />
                      </div>
                    </div>
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
                        placeholder="Unit name" autoComplete="off"
                        disabled={formData.scopeMode === 'all' || formData.scopeMode === 'party'} />
                    </div>
                    <div className="form-group">
                      <label>Party</label>
                      <input value={formData.party} onChange={e => setFormData(f => ({ ...f, party: e.target.value }))}
                        placeholder="Party name" list="party-list" autoComplete="off"
                        disabled={formData.scopeMode === 'all' || formData.scopeMode === 'unit'} />
                      <datalist id="party-list">{availableParties.map(p => <option key={p} value={p} />)}</datalist>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 14 }}>
                    <label>Notes</label>
                    <input value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Optional notes about this user" autoComplete="off" />
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
                        <select value={formPerms.supervisorFilter === 'all' ? '' : formPerms.supervisorFilter}
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
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ flexShrink: 0, padding: '14px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              {saveError && <span style={{ fontSize: 12, color: 'var(--danger)', flex: 1 }}>⚠ {saveError}</span>}
              <button onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="primary" onClick={saveUser} disabled={saving}>
                {saving ? '⏳ Saving…' : editingUserId ? '✓ Update User' : '✓ Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
