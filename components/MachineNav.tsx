'use client'
// ← Prev · [machine ▾] · Next → on a machine sheet: moves through the machine
// sheets this user may open (same order as the Machines menu: section, then
// name), so the next sheet is one click away. Keyboard: Alt+← / Alt+→.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getActiveUserRecord, isAdminUser, DEFAULT_USER_PERMISSIONS } from '@/lib/permissions'
import { pageAccess, machinePaths } from '@/lib/pageAccess'
import { SECTIONS, sectionOf } from '@/lib/machineSections'

export default function MachineNav({ currentId }: { currentId: string }) {
  const router = useRouter()
  const [machines, setMachines] = useState<any[]>([])
  useEffect(() => {
    let off = false
    fetch('/api/machines', { cache: 'no-store' }).then(r => r.json()).then(j => { if (!off) setMachines(j.data || []) }).catch(() => {})
    return () => { off = true }
  }, [])

  // machines this user may view, in Machines-menu order
  const allowed = useMemo(() => {
    const user = getActiveUserRecord()
    const admin = isAdminUser(user)
    const pages = (user?.permissions || DEFAULT_USER_PERMISSIONS).pages
    const list = machines.filter(m => m.is_active !== false)
    const ordered: any[] = []
    for (const sec of SECTIONS) ordered.push(...list.filter(m => sectionOf(m) === sec).sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })))
    for (const m of list) if (!ordered.includes(m)) ordered.push(m)
    return ordered.filter(m => admin || pageAccess(pages, machinePaths(m), false).view)
  }, [machines])

  const idx = allowed.findIndex(m => m.id === currentId
    || String(m.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-') === String(currentId).toLowerCase())
  const prev = idx > 0 ? allowed[idx - 1] : null
  const next = idx >= 0 && idx < allowed.length - 1 ? allowed[idx + 1] : null
  const go = (m: any) => { if (m) router.push(`/machines/${m.id}`) }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (e.key === 'ArrowLeft' && prev) { e.preventDefault(); go(prev) }
      if (e.key === 'ArrowRight' && next) { e.preventDefault(); go(next) }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [prev, next]) // eslint-disable-line react-hooks/exhaustive-deps

  if (allowed.length < 2) return null
  const btn = (label: string, m: any, title: string) => (
    <button onClick={() => go(m)} disabled={!m} title={m ? `${title}: ${m.name}` : ''}
      style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)',
        background: m ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)', color: m ? '#2D3748' : '#A0AEC0', cursor: m ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Alt+← / Alt+→ also work">
      {btn('← Prev', prev, 'Previous machine')}
      <select value={idx >= 0 ? allowed[idx].id : ''} onChange={e => go(allowed.find(m => m.id === e.target.value))}
        style={{ padding: '6px 8px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.85)', color: '#2D3748', maxWidth: 220, width: 'auto' }}>
        {idx < 0 && <option value="">—</option>}
        {SECTIONS.map(sec => {
          const group = allowed.filter(m => sectionOf(m) === sec)
          return group.length ? <optgroup key={sec} label={sec}>{group.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup> : null
        })}
      </select>
      {btn('Next →', next, 'Next machine')}
      <span style={{ fontSize: 11, color: '#718096', whiteSpace: 'nowrap' }}>{idx >= 0 ? `${idx + 1} / ${allowed.length}` : ''}</span>
    </div>
  )
}
