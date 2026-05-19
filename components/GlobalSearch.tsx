'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface SearchResult {
  type: 'order' | 'batch' | 'machine' | 'supervisor'
  id: string
  title: string
  subtitle: string
  path: string
  badge?: string
  badgeColor?: string
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }

    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return
    const db = JSON.parse(raw)
    const term = q.toLowerCase().trim()
    const found: SearchResult[] = []

    const statusColors: Record<string, string> = {
      new: '#EF9F27', assigned: '#185FA5', 'in-process': '#185FA5',
      done: '#1D9E75', hold: '#A32D2D', splitting: '#3C3489'
    }

    // Orders
    ;(db.orders || []).forEach((o: any) => {
      const haystack = [o.orderNumber, o.party, o.color, o.article, o.supervisor, o.challanNo, o.lotNo, o.labNo]
        .join(' ').toLowerCase()
      if (haystack.includes(term)) {
        found.push({
          type: 'order', id: o.id,
          title: `${o.orderNumber || 'No #'} — ${o.party || '?'}`,
          subtitle: `${o.article || ''} · ${o.color || ''} · ${o.qtyKg || '?'} Kg`,
          path: '/orders',
          badge: o.status || 'new',
          badgeColor: statusColors[o.status] || '#888'
        })
      }
    })

    // Batches
    ;(db.orders || []).forEach((o: any) => {
      ;(o.splits || []).forEach((b: any) => {
        if ((b.batchId || '').toLowerCase().includes(term)) {
          found.push({
            type: 'batch', id: b.batchId,
            title: `Batch ${b.batchId}`,
            subtitle: `Order ${o.orderNumber} · ${o.party} · ${b.kg} Kg`,
            path: '/batches',
            badge: b.status || 'pending',
            badgeColor: statusColors[b.status] || '#888'
          })
        }
      })
    })

    // Machines
    ;(db.machines || []).forEach((m: any) => {
      if ((m.name || m.id || '').toLowerCase().includes(term)) {
        found.push({
          type: 'machine', id: m.id,
          title: m.name || m.id,
          subtitle: `Capacity: ${m.capacity} Kg · ${m.status || 'idle'}`,
          path: `/machines/${(m.id || '').toLowerCase().replace(/\s+/g, '-')}`,
          badge: m.status || 'idle',
          badgeColor: m.status === 'running' ? '#1D9E75' : '#888'
        })
      }
    })

    // Supervisors
    ;(db.supervisors || []).forEach((s: any) => {
      if ((s.name || '').toLowerCase().includes(term)) {
        const supOrders = (db.orders || []).filter((o: any) =>
          (o.supervisor || '').toLowerCase() === (s.name || '').toLowerCase()
        )
        found.push({
          type: 'supervisor', id: s.id,
          title: s.name,
          subtitle: `${supOrders.length} orders · ${supOrders.filter((o: any) => o.status === 'assigned').length} in inbox`,
          path: `/supervisor/${encodeURIComponent(s.id || s.name)}`,
          badge: 'supervisor',
          badgeColor: '#3C3489'
        })
      }
    })

    setResults(found.slice(0, 12))
    setSelected(0)
  }

  const navigate = (path: string) => {
    router.push(path)
    setOpen(false)
    setQuery('')
    setResults([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && results[selected]) { navigate(results[selected].path) }
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
  }

  const typeIcon: Record<string, string> = { order: '📋', batch: '📦', machine: '⚙', supervisor: '👷' }

  return (
    <div ref={boxRef} style={{ position: 'relative', flex: '1 1 0', maxWidth: 320, minWidth: 160 }}>
      {/* Input */}
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-tertiary)', pointerEvents: 'none' }}>🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search orders, batches… (Ctrl+K)"
          onFocus={() => setOpen(true)}
          onChange={e => search(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%', padding: '6px 10px 6px 30px',
            fontSize: 12, border: '1px solid var(--border-medium)',
            borderRadius: 6, background: 'var(--bg-secondary)',
            color: 'var(--text-primary)', outline: 'none',
            boxSizing: 'border-box'
          }}
          onFocusCapture={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'; (e.target as HTMLInputElement).style.background = 'var(--bg-primary)' }}
          onBlurCapture={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border-medium)'; (e.target as HTMLInputElement).style.background = 'var(--bg-secondary)' }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-tertiary)', padding: 0, lineHeight: 1 }}
          >×</button>
        )}
      </div>

      {/* Dropdown */}
      {open && query.trim() && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 9999, overflow: 'hidden', maxHeight: 380, overflowY: 'auto'
        }}>
          {results.length === 0 ? (
            <div style={{ padding: '16px', fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              No results for "{query}"
            </div>
          ) : (
            <>
              <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {results.length} result{results.length !== 1 ? 's' : ''}
              </div>
              {results.map((r, i) => (
                <div
                  key={r.id + i}
                  onClick={() => navigate(r.path)}
                  onMouseEnter={() => setSelected(i)}
                  style={{
                    padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    background: i === selected ? 'var(--accent-light)' : 'transparent',
                    borderLeft: i === selected ? '3px solid var(--accent)' : '3px solid transparent',
                    transition: 'background 0.1s'
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{typeIcon[r.type]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: i === selected ? 'var(--accent-dark)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.subtitle}
                    </div>
                  </div>
                  {r.badge && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 12, background: r.badgeColor + '22', color: r.badgeColor, flexShrink: 0, textTransform: 'capitalize' }}>
                      {r.badge}
                    </span>
                  )}
                </div>
              ))}
              <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between' }}>
                <span>↑↓ navigate</span><span>Enter to open</span><span>Esc to close</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
