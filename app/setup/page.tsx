'use client'
/**
 * /setup — Setup overview: every master list with how many records it holds
 * (read live from the database). The old version only looked at browser
 * storage, so it showed nothing useful since the move to Supabase.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Master {
  path: string; icon: string; title: string; desc: string
  api?: string; count?: (data: any[]) => number; adminOnly?: boolean
}

const GROUPS: { label: string; items: Master[] }[] = [
  {
    label: 'Factory',
    items: [
      { path: '/setup/factory-settings', icon: '🏤', title: 'Factory Settings', desc: 'Factory name, city, GST, phone' },
      { path: '/setup/machine-master',   icon: '⚙', title: 'Machine Master',   desc: 'Machines, capacity, numbering start', api: '/api/machines' },
      { path: '/setup/process-master',   icon: '🔁', title: 'Process Master',   desc: 'Process codes, order, normal days, faulty / FOB allowed', api: '/api/processes' },
      { path: '/setup/holiday-master',   icon: '📅', title: 'Holiday Master',   desc: 'Factory and machine holidays (skipped by the Date Calculator)', api: '/api/holidays' },
    ],
  },
  {
    label: 'People & parties',
    items: [
      { path: '/setup/supervisor-master', icon: '👷', title: 'Supervisor Master', desc: 'Supervisors and the articles they handle', api: '/api/supervisors' },
      { path: '/setup/customer-master',   icon: '🏢', title: 'Customer Master',   desc: 'Parties, contact and phone', api: '/api/customers' },
      { path: '/setup/user-management',   icon: '🔐', title: 'User Management',   desc: 'Logins, roles and page permissions', api: '/api/users', adminOnly: true },
    ],
  },
  {
    label: 'Routing',
    items: [
      { path: '/setup/article-master',         icon: '🧵', title: 'Article → Supervisor Map', desc: 'Which supervisor gets each article automatically', api: '/api/article-supervisor-map' },
      { path: '/setup/process-route-master',   icon: '🗺', title: 'Process Route Master',     desc: 'Saved route templates', api: '/api/route-templates' },
      { path: '/setup/process-machine-master', icon: '🔗', title: 'Article → Process Route Rule', desc: 'Default process route for each article' },
    ],
  },
  {
    label: 'Colour',
    items: [
      { path: '/setup/shade-master',           icon: '🎨', title: 'Shade Master',           desc: 'Shade names and their group (Light / Medium / Dark)', api: '/api/shade-master' },
      { path: '/setup/colour-chemical-master', icon: '🧪', title: 'Colour Chemical Master', desc: 'Dyes and chemicals for the Colour Store', api: '/api/colour-chemicals' },
    ],
  },
]

export default function SetupPage() {
  const [counts, setCounts] = useState<Record<string, number | null>>({})

  useEffect(() => {
    const all = GROUPS.flatMap(g => g.items).filter(m => m.api)
    all.forEach(async m => {
      try {
        const res = await fetch(m.api!, { cache: 'no-store' }).then(r => r.json())
        const data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : null
        setCounts(prev => ({ ...prev, [m.path]: data ? (m.count ? m.count(data) : data.length) : null }))
      } catch {
        setCounts(prev => ({ ...prev, [m.path]: null }))
      }
    })
  }, [])

  return (
    <div className="content" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>⚙ Setup</div>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
          Master lists used everywhere in DyeFlow. Changes are saved straight to the database and seen by everyone.
        </div>
      </div>

      {GROUPS.map(g => (
        <div key={g.label} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{g.label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 12 }}>
            {g.items.map(m => {
              const c = counts[m.path]
              return (
                <Link key={m.path} href={m.path} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 16, height: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ fontSize: 22 }}>{m.icon}</div>
                      {m.api && (
                        <div style={{ fontSize: 20, fontWeight: 800, color: c ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                          {c === undefined ? '…' : c === null ? '—' : c}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>
                      {m.title}{m.adminOnly && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}> · admin</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{m.desc}</div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
