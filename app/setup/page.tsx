'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

interface DbStats {
  orders: number
  machines: number
  supervisors: number
  processes: number
  customers: number
  faultyRecords: number
  batches: number
  sizeKb: number
  lastUpdated: string
}

export default function SetupPage() {
  const [stats, setStats] = useState<DbStats | null>(null)
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'idle'; msg: string }>({ type: 'idle', msg: '' })
  const [exporting, setExporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = () => {
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) {
      setStats(null)
      return
    }
    try {
      const db = JSON.parse(raw)
      const allBatches = (db.orders || []).flatMap((o: any) => o.splits || [])
      setStats({
        orders: (db.orders || []).length,
        machines: (db.machines || []).length,
        supervisors: (db.supervisors || []).length,
        processes: (db.processList || []).length,
        customers: (db.customers || []).length,
        faultyRecords: (db.faultyRecords || []).length,
        batches: allBatches.length,
        sizeKb: Math.round(raw.length / 1024),
        lastUpdated: db._lastUpdated || 'Unknown'
      })
    } catch {
      setStats(null)
    }
  }

  // ── EXPORT ──────────────────────────────────────────────────────────────────
  const handleExport = () => {
    setExporting(true)
    try {
      const raw = localStorage.getItem('dyeflow_db')
      if (!raw) { alert('No data to export.'); setExporting(false); return }

      // Stamp export time
      const db = JSON.parse(raw)
      db._lastUpdated = new Date().toISOString()
      db._exportedAt = new Date().toISOString()
      const stamped = JSON.stringify(db, null, 2)
      localStorage.setItem('dyeflow_db', stamped)

      const blob = new Blob([stamped], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date()
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      a.href = url
      a.download = `dyeflow-backup-${dateStr}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      loadStats()
    } catch (e) {
      alert('Export failed: ' + String(e))
    }
    setExporting(false)
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────────
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.json')) {
      setImportStatus({ type: 'error', msg: 'Please select a valid .json backup file.' })
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const parsed = JSON.parse(text)

        // Basic validation — must have at least one known key
        const knownKeys = ['orders', 'machines', 'supervisors', 'processList', 'customers', 'faultyRecords']
        const hasKnownKey = knownKeys.some(k => k in parsed)
        if (!hasKnownKey) {
          setImportStatus({ type: 'error', msg: 'This file does not look like a DyeFlow backup.' })
          return
        }

        const confirmMsg = [
          `This will REPLACE all current data with the backup.`,
          ``,
          `Backup contains:`,
          `  • ${(parsed.orders || []).length} orders`,
          `  • ${(parsed.machines || []).length} machines`,
          `  • ${(parsed.supervisors || []).length} supervisors`,
          ``,
          `Are you sure you want to restore this backup?`
        ].join('\n')

        if (!confirm(confirmMsg)) {
          if (fileInputRef.current) fileInputRef.current.value = ''
          return
        }

        parsed._importedAt = new Date().toISOString()
        localStorage.setItem('dyeflow_db', JSON.stringify(parsed))
        window.dispatchEvent(new Event('dyeflow-db-updated'))
        loadStats()
        setImportStatus({ type: 'success', msg: `✓ Backup restored successfully — ${(parsed.orders || []).length} orders, ${(parsed.machines || []).length} machines.` })
      } catch {
        setImportStatus({ type: 'error', msg: 'Could not parse this file. Make sure it is a valid DyeFlow JSON backup.' })
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsText(file)
  }

  // ── CLEAR DB ──────────────────────────────────────────────────────────────
  const handleClearDb = () => {
    if (!confirm('⚠ This will permanently delete ALL data — orders, machines, supervisors, processes, everything.\n\nAre you absolutely sure? This cannot be undone.')) return
    if (!confirm('Last warning — all data will be deleted. Confirm?')) return
    localStorage.removeItem('dyeflow_db')
    window.dispatchEvent(new Event('dyeflow-db-updated'))
    loadStats()
    setImportStatus({ type: 'success', msg: 'Database cleared. You can now import a fresh backup.' })
  }

  const setupSections = [
    {
      title: 'Help & Reference',
      color: '#059669',
      bg: '#D1FAE5',
      items: [
        { name: 'ℹ System Information', path: '/setup/information', desc: 'All features, AI tools, keyboard shortcuts, and how everything works — built-in manual' },
      ]
    },
    {
      title: 'Core Masters',
      color: '#185FA5',
      bg: '#E6F1FB',
      items: [
        { name: 'Machine Master', path: '/setup/machine-master', desc: 'Add / edit dyeing machines and capacity' },
        { name: 'Supervisor Master', path: '/setup/supervisor-master', desc: 'Add / edit supervisors' },
        { name: 'Process Master', path: '/setup/process-master', desc: 'Manage FMS process list and order' },
        { name: 'Customer Master', path: '/setup/customer-master', desc: 'Manage party / customer list' },
      ]
    },
    {
      title: 'Mapping & Routes',
      color: '#3C3489',
      bg: '#EEEDFE',
      items: [
        { name: 'Process Route Master', path: '/setup/process-master', desc: 'Define named route templates' },
        { name: 'Article → Supervisor Map', path: '/setup/article-master', desc: 'Auto-assign supervisors by article' },
        { name: 'Process & Machine Map', path: '/setup/process-machine-master', desc: 'Which machines handle which processes' },
      ]
    },
    {
      title: 'Reference Data',
      color: '#1D9E75',
      bg: '#E1F5EE',
      items: [
        { name: 'Shade Master', path: '/setup/shade-master', desc: 'Shade classification setup' },
        { name: 'Colour Chemical Master', path: '/setup/colour-chemical-master', desc: 'Chemical / dye inventory' },
        { name: 'Holiday Master', path: '/setup/holiday-master', desc: 'Set holidays for date calculator' },
      ]
    },
    {
      title: 'System',
      color: '#633806',
      bg: '#FAEEDA',
      items: [
        { name: 'User Management', path: '/setup/user-management', desc: 'Manage app users and access' },
        { name: 'Audit Log', path: '/audit-log', desc: 'See every change: who, what, when' },
      ]
    },
  ]

  return (
    <div className="content" style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div className="topbar">
        <div className="topbar-title">Setup & Configuration</div>
      </div>

      {/* DB Status Card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Database Status</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {stats ? `${stats.sizeKb} KB in localStorage` : 'No data yet'}
          </span>
        </div>

        {stats ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Orders', value: stats.orders },
              { label: 'Batches', value: stats.batches },
              { label: 'Machines', value: stats.machines },
              { label: 'Supervisors', value: stats.supervisors },
              { label: 'Processes', value: stats.processes },
              { label: 'Customers', value: stats.customers },
              { label: 'Faulty Records', value: stats.faultyRecords },
              { label: 'Size', value: `${stats.sizeKb} KB` },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>{s.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '20px 0' }}>No database found. Start by adding machines and supervisors below.</div>
        )}

        {/* Export / Import / Clear */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingTop: 14, borderTop: '1px solid var(--border-light)' }}>

          {/* Export */}
          <button className="primary" onClick={handleExport} disabled={exporting} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            ⬇ {exporting ? 'Exporting...' : 'Export Backup (.json)'}
          </button>

          {/* Import */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: 'none' }}
              id="import-file"
            />
            <button onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              ⬆ Import Backup (.json)
            </button>
          </div>

          {/* Status message */}
          {importStatus.type !== 'idle' && (
            <div style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              background: importStatus.type === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
              color: importStatus.type === 'success' ? 'var(--success)' : 'var(--danger)',
            }}>
              {importStatus.msg}
            </div>
          )}

          {/* Clear DB — pushed to right */}
          <button
            className="danger"
            onClick={handleClearDb}
            style={{ marginLeft: 'auto' }}
          >
            🗑 Clear All Data
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10 }}>
          Export saves a complete backup of all orders, machines, supervisors, processes, and settings as a single .json file.
          Import restores from that file — useful when moving to a new computer or recovering after a browser clear.
        </p>
      </div>

      {/* Setup Sections */}
      {setupSections.map(section => (
        <div key={section.title} style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: section.color,
            textTransform: 'uppercase', letterSpacing: '0.07em',
            marginBottom: 10, paddingLeft: 2
          }}>
            {section.title}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {section.items.map(item => (
              <Link key={item.path + item.name} href={item.path} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderLeft: `4px solid ${section.color}`,
                  borderRadius: 8,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
