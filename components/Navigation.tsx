'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { loadOrSeedProcessList, ProcessDef } from '@/lib/processMap'
import GlobalSearch from '@/components/GlobalSearch'
import { DarkModeToggle, NotificationCenter, KeyboardShortcuts } from '@/components/AppShell'

interface NavItem {
  name: string
  path: string
  adminOnly?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

export default function Navigation() {
  const pathname = usePathname()
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [machines, setMachines] = useState<NavItem[]>([])
  const [fmsItems, setFmsItems] = useState<NavItem[]>([])
  const [supervisorItems, setSupervisorItems] = useState<NavItem[]>([])
  const navRef = useRef<HTMLDivElement>(null)

  const loadDynamic = () => {
    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : {}

    if (db.machines && Array.isArray(db.machines)) {
      setMachines(
        db.machines.map((m: any) => ({
          name: m.name || m.id,
          path: `/machines/${(m.id || m.name).toLowerCase().replace(/\s+/g, '-')}`
        }))
      )
    }

    const processList: ProcessDef[] = loadOrSeedProcessList()

    // Count active batches per process for FMS nav badges
    const activeBatchesPerProcess: Record<string, number> = {}
    for (const order of (db.orders || [])) {
      for (const batch of (order.splits || [])) {
        const code = batch.fmsCurrentProcess
        if (code && !batch.fmsDone && batch.status !== 'done') {
          activeBatchesPerProcess[code] = (activeBatchesPerProcess[code] || 0) + 1
        }
      }
    }

    setFmsItems(
      processList
        .filter(p => p.enabled)
        .sort((a, b) => a.order - b.order)
        .map(p => {
          const count = activeBatchesPerProcess[p.code] || 0
          return {
            name: count > 0 ? `${p.code} - ${p.name} (${count})` : `${p.code} - ${p.name}`,
            path: `/fms/${p.code}`
          }
        })
    )

    if (db.supervisors && Array.isArray(db.supervisors) && db.supervisors.length > 0) {
      setSupervisorItems(
        db.supervisors
          .filter((s: any) => s.name)
          .map((s: any) => {
            // Count inbox orders (status === 'assigned') for this supervisor
            const inbox = (db.orders || []).filter((o: any) =>
              o.status === 'assigned' &&
              (o.supervisor || '').toLowerCase() === (s.name || '').toLowerCase()
            ).length
            return {
              name: inbox > 0 ? `${s.name}  (${inbox})` : s.name,
              path: `/supervisor/${encodeURIComponent(s.id || s.name)}`
            }
          })
      )
    } else {
      setSupervisorItems([{ name: 'No supervisors yet', path: '/setup/supervisor-master' }])
    }
  }

  useEffect(() => {
    loadDynamic()
    const handle = () => loadDynamic()
    window.addEventListener('storage', handle)
    window.addEventListener('dyeflow-db-updated', handle)
    return () => {
      window.removeEventListener('storage', handle)
      window.removeEventListener('dyeflow-db-updated', handle)
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenDropdown(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const sections: NavSection[] = [
    {
      label: 'Operations',
      items: [
        { name: 'Dashboard', path: '/' },
        { name: 'Orders', path: '/orders' },
        { name: 'Order Sheets', path: '/order-sheets', adminOnly: true },
        { name: 'Pending Approvals', path: '/pending-approvals', adminOnly: true },
        { name: 'Edited Orders', path: '/edited-orders', adminOnly: true },
        { name: 'Splitted Orders', path: '/splitted-orders' },
        { name: 'Date Calculator', path: '/date-calculator' },
        { name: 'Supervisors Overview', path: '/supervisor' },
        { name: 'Machine Sheets', path: '/machines' },
        { name: '📌 Production Kanban', path: '/production' },
        { name: '📅 Order Timeline', path: '/timeline' },
        { name: '⏰ Shift Management', path: '/shifts' },
        { name: 'Batch Tracking', path: '/batches' },
        { name: '🔍 Batch Trace', path: '/batches/search' },
        { name: 'Import Orders (Excel)', path: '/import' },
        { name: 'Repairing Order', path: '/repairing-order' },
      ]
    },
    {
      label: 'Machines',
      items: machines.length > 0 ? machines : [{ name: 'No machines yet', path: '/setup/machine-master' }]
    },
    { label: 'First Process', items: [{ name: 'First Process Batch', path: '/first-process-batch' }] },
    {
      label: 'Faulty and FOB',
      items: [
        { name: 'Faulty', path: '/faulty' },
        { name: '🔄 FOB Records', path: '/fob' },
      ]
    },
    {
      label: 'FMS',
      items: fmsItems.length > 0 ? fmsItems : [{ name: 'No processes yet', path: '/setup/process-master' }]
    },
    { label: 'Supervisors', items: supervisorItems },
    {
      label: 'Greige',
      items: [
        { name: 'New Entry', path: '/greige/entry' },
        { name: 'Greige Register', path: '/greige/register' },
        { name: 'Lot Details', path: '/greige/lots' },
        { name: 'Greige Recheck', path: '/greige/recheck' },
      ]
    },
    {
      label: 'Lab',
      items: [
        { name: 'Indent', path: '/lab/indent' },
        { name: 'Lab Requested', path: '/lab/requested' },
        { name: 'Lab Requested (Unit)', path: '/lab/requested-unit' },
        { name: 'Rechecked Lab', path: '/lab/rechecked' },
        { name: 'InHouse Lab Recheck', path: '/lab/inhouse-recheck' },
        { name: 'FMS', path: '/lab/fms' },
        { name: 'Lab Submitted', path: '/lab/submitted' },
        { name: 'Approved Lab', path: '/lab/approval' },
        { name: 'Lab Receipe', path: '/lab/receipe' },
        { name: 'Lab With Issue', path: '/lab/with-issue' },
        { name: 'PC Lab', path: '/lab/pc-lab' },
      ]
    },
    { label: 'Reports', items: [
      { name: 'Reports', path: '/reports' },
      { name: '📋 Daily Summary', path: '/reports/daily' },
      { name: '📊 Report Agent', path: '/report-agent' },
      { name: 'Audit Log', path: '/audit-log' }
    ] },
    { label: 'AI Assistant', items: [
      { name: '🤖 AI Assistant', path: '/ai-assistant' },
      { name: '── Tier 1 ──────────', path: '/ai-assistant' },
      { name: '💬 Chat Assistant', path: '/ai-assistant' },
      { name: '📋 Daily Briefing', path: '/ai-assistant' },
      { name: '🎯 Smart Assignment', path: '/ai-assistant' },
      { name: '⚠ Faulty Analyzer', path: '/ai-assistant' },
      { name: '── Tier 2 ──────────', path: '/ai-assistant' },
      { name: '⏱ Delay Predictor', path: '/ai-assistant' },
      { name: '✏ AI Actions Agent', path: '/ai-assistant' },
      { name: '📄 Weekly Report', path: '/ai-assistant' },
      { name: '💬 Customer Reply', path: '/ai-assistant' },
    ] },
    {
      label: 'Setup',
      items: [
        { name: 'ℹ System Information', path: '/setup/information' },
        { name: '⚙ Setup Overview', path: '/setup' },
        { name: '🏤 Factory Settings', path: '/setup/factory-settings' },
        { name: 'Supervisor Master', path: '/setup/supervisor-master' },
        { name: 'Customer Master', path: '/setup/customer-master' },
        { name: 'Article→Supervisor Map', path: '/setup/article-master' },
        { name: 'Process Route Master', path: '/setup/process-route-master' },
        { name: 'Process & Machine Map', path: '/setup/process-machine-master' },
        { name: 'Process Master', path: '/setup/process-master' },
        { name: 'Machine Master', path: '/setup/machine-master' },
        { name: 'User Management', path: '/setup/user-management' },
        { name: 'Colour Chemical Master', path: '/setup/colour-chemical-master' },
        { name: 'Shade Master', path: '/setup/shade-master' },
        { name: 'Holiday Master', path: '/setup/holiday-master' },
      ]
    },
    { label: 'PC', items: [{ name: 'PC Overview', path: '/pc' }] }
  ]

  const isActive = (path: string) => pathname === path

  return (
    <nav ref={navRef} style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', padding: '0 20px', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', minHeight: '42px' }}>
        {sections.map(section => {
          const isOpen = openDropdown === section.label
          const hasActiveItem = section.items.some(item => isActive(item.path))
          return (
            <div key={section.label} style={{ position: 'relative' }}>
              <button
                onClick={() => setOpenDropdown(isOpen ? null : section.label)}
                style={{
                  padding: '9px 14px', fontSize: '13px', fontWeight: 500,
                  color: hasActiveItem ? 'var(--accent)' : 'var(--text-primary)',
                  background: hasActiveItem ? 'var(--accent-light)' : 'transparent',
                  border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', whiteSpace: 'nowrap',
                  borderBottom: hasActiveItem ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '4px'
                }}
              >
                {section.label}
                <span style={{ fontSize: '10px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
              </button>

              {isOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', minWidth: '200px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 1000, maxHeight: '400px', overflowY: 'auto' }}>
                  {section.items.map(item => (
                    <Link
                      key={item.path + item.name}
                      href={item.path}
                      onClick={() => setOpenDropdown(null)}
                      style={{
                        display: 'block', padding: '8px 14px', fontSize: '13px',
                        color: isActive(item.path) ? 'var(--accent)' : 'var(--text-primary)',
                        background: isActive(item.path) ? 'var(--accent-light)' : 'transparent',
                        textDecoration: 'none', fontWeight: isActive(item.path) ? 600 : 400,
                        borderLeft: isActive(item.path) ? '3px solid var(--accent)' : '3px solid transparent'
                      }}
                      onMouseEnter={e => { if (!isActive(item.path)) e.currentTarget.style.background = 'var(--bg-secondary)' }}
                      onMouseLeave={e => { if (!isActive(item.path)) e.currentTarget.style.background = 'transparent' }}
                    >
                      {item.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Global Search */}
        <GlobalSearch />

        {/* App shell — Notifications, Dark Mode, Keyboard Shortcuts */}
        <NotificationCenter />
        <DarkModeToggle />
        <KeyboardShortcuts />

        {/* Mobile View link */}
        <Link href="/mobile" style={{
          padding: '6px 10px', fontSize: '12px', fontWeight: 500,
          color: 'var(--text-tertiary)', textDecoration: 'none',
          border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
          whiteSpace: 'nowrap'
        }}
          title="Open mobile/floor view"
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >📱</Link>

        {/* AI Assistant quick link */}
        <Link href="/ai-assistant" style={{
          padding: '6px 12px', fontSize: '12px', fontWeight: 600,
          color: isActive('/ai-assistant') ? '#fff' : 'var(--accent-dark)',
          background: isActive('/ai-assistant') ? 'var(--accent)' : 'var(--accent-light)',
          border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)',
          textDecoration: 'none', whiteSpace: 'nowrap'
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { if (!isActive('/ai-assistant')) { e.currentTarget.style.background = 'var(--accent-light)'; e.currentTarget.style.color = 'var(--accent-dark)' } }}
        >🤖 AI</Link>

        {/* Setup quick link */}
        <Link href="/setup" style={{
          padding: '6px 12px', fontSize: '12px',
          color: isActive('/setup') ? 'var(--accent-dark)' : 'var(--text-secondary)',
          background: isActive('/setup') ? 'var(--accent-light)' : 'transparent',
          border: 'none', borderRadius: 'var(--radius-sm)', textDecoration: 'none', fontWeight: 500
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)' }}
          onMouseLeave={e => { if (!isActive('/setup')) e.currentTarget.style.background = 'transparent' }}
        >⚙ Setup</Link>

        {/* Sheet Login */}
        <Link href="/sheet-login" style={{
          padding: '6px 12px', fontSize: '12px',
          color: isActive('/sheet-login') ? 'var(--accent-dark)' : 'var(--text-primary)',
          background: isActive('/sheet-login') ? 'var(--accent-light)' : 'var(--bg-primary)',
          border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)',
          textDecoration: 'none', fontWeight: 500
        }}
          onMouseEnter={e => { if (!isActive('/sheet-login')) { e.currentTarget.style.background = 'var(--accent-light)'; e.currentTarget.style.borderColor = 'var(--accent)' } }}
          onMouseLeave={e => { if (!isActive('/sheet-login')) { e.currentTarget.style.background = 'var(--bg-primary)'; e.currentTarget.style.borderColor = 'var(--border-light)' } }}
        >Sheet Login</Link>
      </div>
    </nav>
  )
}
