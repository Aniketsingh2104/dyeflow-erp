'use client'

import { withSubProd } from '@/lib/subProd'
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

// compact: a 🔍 button (phone menu bar) that opens the search box full width
export default function GlobalSearch({ compact = false }: { compact?: boolean } = {}) {
  const [expanded, setExpanded] = useState(false)
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

  // searched in the database (app/api/search), a moment after typing stops
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)
  const search = (q: string) => {
    setQuery(q)
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) { seq.current++; setResults([]); return }   // a search still on its way is dropped
    timer.current = setTimeout(async () => {
      const mine = ++seq.current
      const j = await fetch('/api/search?q=' + encodeURIComponent(q.trim()), { cache: 'no-store' })
        .then(r => r.json()).catch(() => null)
      if (mine !== seq.current || !j?.ok) return     // a newer search is on its way
      const statusColors: Record<string, string> = {
        new: '#EF9F27', assigned: '#185FA5', 'in-process': '#185FA5', pending: '#888',
        done: '#1D9E75', hold: '#A32D2D', splitting: '#3C3489', faulty: '#DC2626', 'written-off': '#6B7280', reprocessed: '#6B7280',
      }
      const d = j.data || {}
      const found: SearchResult[] = []
      for (const o of d.orders || []) found.push({
        type: 'order', id: o.id,
        title: `${o.order_number || 'No #'} — ${o.party || '?'}`,
        subtitle: `${o.article || ''} · ${o.color || ''} · ${o.qty_kg ?? '?'} Kg${o.supervisors?.name ? ' · ' + o.supervisors.name : ''}`,
        path: '/orders', badge: o.status || 'new', badgeColor: statusColors[o.status] || '#888',
      })
      for (const b of d.batches || []) found.push({
        type: 'batch', id: b.id,
        title: `Batch ${withSubProd(b.batch_id, b.sub_prod_no)}`,
        subtitle: `${b.kg ?? '?'} Kg${b.current_process ? ' · at ' + b.current_process : ''}`,
        path: '/batches/search', badge: b.status || 'pending', badgeColor: statusColors[b.status] || '#888',
      })
      for (const m of d.machines || []) found.push({
        type: 'machine', id: m.id, title: m.name,
        subtitle: `${m.machine_type || 'Machine'}${parseFloat(m.capacity) ? ' · ' + m.capacity + ' Kg' : ''}`,
        path: `/machines/${m.id}`, badge: 'machine', badgeColor: '#888',
      })
      for (const sp of d.supervisors || []) found.push({
        type: 'supervisor', id: sp.id, title: sp.name, subtitle: 'Supervisor inbox',
        path: `/supervisor/${encodeURIComponent(sp.id)}`, badge: 'supervisor', badgeColor: '#3C3489',
      })
      setResults(found.slice(0, 16))
      setSelected(0)
    }, 250)
  }

  const navigate = (path: string) => {
    seq.current++
    router.push(path)
    setOpen(false); setExpanded(false)
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

  if (compact && !expanded) {
    return (
      <button aria-label="Search" onClick={() => { setExpanded(true); setTimeout(() => inputRef.current?.focus(), 50) }}
        style={{ width: 40, height: 40, border: 'none', background: 'transparent', fontSize: 18, padding: 0 }}>🔍</button>
    )
  }
  return (
    <div ref={boxRef} style={compact
      ? { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1100, background: 'var(--bg-primary)', padding: '7px 10px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: 6, alignItems: 'center' }
      : { position: 'relative', flex: '1 1 0', maxWidth: 320, minWidth: 160 }}>
      {compact && <button onClick={() => { setExpanded(false); setOpen(false); setQuery('') }} style={{ border: 'none', background: 'transparent', fontSize: 18, width: 36, height: 36 }}>←</button>}
      {/* Input */}
      <div style={{ position: 'relative', flex: 1 }}>
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
            fontSize: compact ? 16 : 12, border: '1px solid var(--border-medium)',
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
          position: 'absolute', top: 'calc(100% + 6px)', left: compact ? 10 : 0, right: compact ? 10 : 0,
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
