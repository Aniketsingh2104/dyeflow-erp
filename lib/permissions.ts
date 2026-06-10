/**
 * lib/permissions.ts
 * Single source of truth for the DyeFlow permission system.
 * NOTE: No JSX here — AccessDenied component is in lib/AccessDenied.tsx
 */

'use client'

import { useState, useEffect } from 'react'

export interface PagePerm {
  view: boolean
  edit: boolean
  delete: boolean
}

export interface UserPermissions {
  pages: Record<string, PagePerm>
  supervisorFilter: string
  allowedSheets?: string[]   // array of sheet IDs the user can access
}

export interface PageDef {
  path: string
  label: string
  group: string
  dynamic?: boolean
}

export interface DyeflowUser {
  id: string
  username: string
  role: string
  scopeMode?: string
  unit?: string
  party?: string
  notes?: string
  createdAt?: string
  permissions?: UserPermissions
}

export const EMPTY_PERM: PagePerm = { view: false, edit: false, delete: false }
export const FULL_PERM:  PagePerm = { view: true,  edit: true,  delete: true  }
export const VIEW_PERM:  PagePerm = { view: true,  edit: false, delete: false }

export const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  pages: {},
  supervisorFilter: 'all',
}

export const STATIC_PAGES: PageDef[] = [
  { path: '/',                             label: 'Dashboard',               group: 'Operations' },
  { path: '/orders',                       label: 'Orders',                  group: 'Operations' },
  { path: '/order-sheets',                 label: 'Order Sheets',            group: 'Operations' },
  { path: '/pending-approvals',            label: 'Pending Approvals',       group: 'Operations' },
  { path: '/edited-orders',               label: 'Edited Orders',           group: 'Operations' },
  { path: '/splitted-orders',             label: 'Splitted Orders',         group: 'Operations' },
  { path: '/date-calculator',             label: 'Date Calculator',         group: 'Operations' },
  { path: '/batches',                     label: 'Batch Tracking',          group: 'Operations' },
  { path: '/batches/search',              label: 'Batch Trace',             group: 'Operations' },
  { path: '/import',                      label: 'Import Orders (Excel)',   group: 'Operations' },
  { path: '/repairing-order',             label: 'Repairing Order',         group: 'Operations' },
  { path: '/machines',                    label: 'Machine Sheets (All)',    group: 'Others' },
  { path: '/production',                  label: 'Production Kanban',       group: 'Others' },
  { path: '/timeline',                    label: 'Order Timeline',          group: 'Others' },
  { path: '/shifts',                      label: 'Shift Management',        group: 'Others' },
  { path: '/faulty',                      label: 'Faulty Records',          group: 'Faulty & FOB' },
  { path: '/fob',                         label: 'FOB Records',             group: 'Faulty & FOB' },
  { path: '/first-process-batch',         label: 'First Process Batch',     group: 'Faulty & FOB' },
  { path: '/greige/entry',                label: 'Greige Entry',            group: 'Greige' },
  { path: '/greige/register',             label: 'Greige Register',         group: 'Greige' },
  { path: '/greige/lots',                 label: 'Greige Lot Details',      group: 'Greige' },
  { path: '/greige/recheck',              label: 'Greige Recheck',          group: 'Greige' },
  { path: '/lab/indent',                  label: 'Lab Indent',              group: 'Lab' },
  { path: '/lab/requested',               label: 'Lab Requested',           group: 'Lab' },
  { path: '/lab/requested-unit',          label: 'Lab Requested (Unit)',    group: 'Lab' },
  { path: '/lab/rechecked',               label: 'Rechecked Lab',           group: 'Lab' },
  { path: '/lab/inhouse-recheck',         label: 'InHouse Lab Recheck',     group: 'Lab' },
  { path: '/lab/fms',                     label: 'Lab FMS',                 group: 'Lab' },
  { path: '/lab/submitted',               label: 'Lab Submitted',           group: 'Lab' },
  { path: '/lab/approval',                label: 'Approved Lab',            group: 'Lab' },
  { path: '/lab/receipe',                 label: 'Lab Recipe',              group: 'Lab' },
  { path: '/lab/with-issue',              label: 'Lab With Issue',          group: 'Lab' },
  { path: '/lab/pc-lab',                  label: 'PC Lab',                  group: 'Lab' },
  { path: '/reports',                     label: 'Reports',                 group: 'Reports' },
  { path: '/reports/daily',               label: 'Daily Summary',           group: 'Reports' },
  { path: '/report-agent',                label: 'Report Agent',            group: 'Reports' },
  { path: '/audit-log',                   label: 'Audit Log',               group: 'Reports' },
  { path: '/ai-assistant',                label: 'AI Assistant',            group: 'AI' },
  { path: '/supervisor',                  label: 'Supervisors Overview',    group: 'Supervisors' },
  { path: '/setup',                       label: 'Setup Overview',          group: 'Setup' },
  { path: '/setup/factory-settings',      label: 'Factory Settings',        group: 'Setup' },
  { path: '/setup/supervisor-master',     label: 'Supervisor Master',       group: 'Setup' },
  { path: '/setup/customer-master',       label: 'Customer Master',         group: 'Setup' },
  { path: '/setup/article-master',        label: 'Article→Supervisor Map',  group: 'Setup' },
  { path: '/setup/process-route-master',  label: 'Process Route Master',    group: 'Setup' },
  { path: '/setup/process-machine-master',label: 'Process & Machine Map',   group: 'Setup' },
  { path: '/setup/process-master',        label: 'Process Master',          group: 'Setup' },
  { path: '/setup/machine-master',        label: 'Machine Master',          group: 'Setup' },
  { path: '/setup/user-management',       label: 'User Management',         group: 'Setup' },
  { path: '/setup/colour-chemical-master',label: 'Colour Chemical Master',  group: 'Setup' },
  { path: '/setup/shade-master',          label: 'Shade Master',            group: 'Setup' },
  { path: '/setup/holiday-master',        label: 'Holiday Master',          group: 'Setup' },
  { path: '/setup/information',           label: 'System Information',      group: 'Setup' },
  { path: '/pc',                          label: 'PC Overview',             group: 'PC' },
  { path: '/mobile',                      label: 'Mobile / Floor View',     group: 'Other' },
]

export function buildPageList(): PageDef[] {
  const pages: PageDef[] = [...STATIC_PAGES]
  if (typeof window === 'undefined') return pages
  try {
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return pages
    const db = JSON.parse(raw)
    for (const m of (db.machines || [])) {
      const slug = (m.id || m.name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      if (!slug) continue
      pages.push({ path: `/machines/${slug}`, label: m.name || m.id, group: 'Machines', dynamic: true })
    }
    for (const p of (db.processList || [])) {
      if (!p.enabled) continue
      pages.push({ path: `/fms/${p.code}`, label: `FMS — ${p.code} · ${p.name}`, group: 'FMS', dynamic: true })
    }
    for (const s of (db.supervisors || [])) {
      const idSlug = encodeURIComponent(s.id || s.name || '')
      if (!idSlug) continue
      pages.push({ path: `/supervisor/${idSlug}`, label: `Supervisor — ${s.name}`, group: 'Supervisors', dynamic: true })
    }
  } catch { /* ignore */ }
  return pages
}

export type RolePreset = 'admin' | 'machine_operator' | 'supervisor_role' | 'lab_technician' | 'viewer' | 'custom'

export const ROLE_LABELS: Record<RolePreset, string> = {
  admin:            'Admin (Full Access)',
  machine_operator: 'Machine Operator',
  supervisor_role:  'Supervisor',
  lab_technician:   'Lab Technician',
  viewer:           'Viewer (Read-Only)',
  custom:           'Custom',
}

export function buildPermissionsFromRole(
  role: RolePreset,
  allPages: PageDef[],
  supervisorFilter = 'all'
): UserPermissions {
  const pages: Record<string, PagePerm> = {}
  const grant = (path: string, perm: PagePerm) => { pages[path] = perm }
  const grantGroup = (group: string, perm: PagePerm) => allPages.filter(p => p.group === group).forEach(p => grant(p.path, perm))
  const grantAll   = (perm: PagePerm) => allPages.forEach(p => grant(p.path, perm))

  switch (role) {
    case 'admin':           grantAll(FULL_PERM); break
    case 'viewer':          grantAll(VIEW_PERM); break
    case 'machine_operator':
      ;['/orders', '/batches', '/batches/search', '/', '/supervisor'].forEach(p => grant(p, VIEW_PERM))
      allPages.filter(p => p.group === 'Machines' || p.group === 'FMS').forEach(p => grant(p.path, { view: true, edit: true, delete: false }))
      break
    case 'supervisor_role':
      ;['/orders', '/batches', '/batches/search', '/', '/supervisor'].forEach(p => grant(p, { view: true, edit: true, delete: false }))
      allPages.filter(p => p.group === 'Supervisors').forEach(p => grant(p.path, { view: true, edit: true, delete: false }))
      break
    case 'lab_technician':
      grantGroup('Lab', { view: true, edit: true, delete: false })
      ;['/orders', '/batches', '/'].forEach(p => grant(p, VIEW_PERM))
      break
    default: break
  }
  return { pages, supervisorFilter }
}

const SESSION_KEY = 'dyeflow_session'
const DB_KEY      = 'dyeflow_db'

export function getActiveUserRecord(): DyeflowUser | null {
  if (typeof window === 'undefined') return null
  try {
    const session = localStorage.getItem(SESSION_KEY)
    if (!session) return null
    const { username } = JSON.parse(session)
    const raw = localStorage.getItem(DB_KEY)
    if (!raw) return null
    const db = JSON.parse(raw)
    const users: DyeflowUser[] = db.users || []
    return users.find(u => u.username?.toLowerCase() === username?.toLowerCase()) || null
  } catch { return null }
}

export function isAdminUser(user: DyeflowUser | null): boolean {
  if (!user) return false
  // Only explicit 'admin' role gets admin access
  // Users with no permissions object AND no role get treated as admin (legacy)
  // Users with a role set always follow that role
  if (user.role === 'admin') return true
  if (!user.role && !user.permissions) return true  // legacy user with no setup
  return false
}

export interface PermResult {
  canView: boolean
  canEdit: boolean
  canDelete: boolean
  isAdmin: boolean
  loading: boolean
}

export function usePermission(path: string): PermResult {
  const [result, setResult] = useState<PermResult>({
    canView: true, canEdit: true, canDelete: true, isAdmin: true, loading: true,
  })
  useEffect(() => {
    const compute = () => {
      const user = getActiveUserRecord()
      if (!user || isAdminUser(user)) {
        setResult({ canView: true, canEdit: true, canDelete: true, isAdmin: true, loading: false })
        return
      }
      const perms = user.permissions || DEFAULT_USER_PERMISSIONS
      const pagePerm = perms.pages[path] || EMPTY_PERM
      setResult({ canView: pagePerm.view, canEdit: pagePerm.edit, canDelete: pagePerm.delete, isAdmin: false, loading: false })
    }
    compute()
    window.addEventListener('dyeflow-db-updated', compute)
    window.addEventListener('storage', compute)
    return () => {
      window.removeEventListener('dyeflow-db-updated', compute)
      window.removeEventListener('storage', compute)
    }
  }, [path])
  return result
}

export function useSupervisorFilter(): string | null {
  const [filter, setFilter] = useState<string | null>(null)
  useEffect(() => {
    const compute = () => {
      const user = getActiveUserRecord()
      if (!user || isAdminUser(user)) { setFilter(null); return }
      const sf = user.permissions?.supervisorFilter || 'all'
      setFilter(sf === 'all' || !sf ? null : sf)
    }
    compute()
    window.addEventListener('dyeflow-db-updated', compute)
    window.addEventListener('storage', compute)
    return () => {
      window.removeEventListener('dyeflow-db-updated', compute)
      window.removeEventListener('storage', compute)
    }
  }, [])
  return filter
}
