'use client'
// Client-side pagination for master tables. The whole list is fetched once;
// only the chosen page is rendered, so a 3,000-row master stays quick.
//   const pg = usePagination(filteredRows, 'dyeflow_pg_articles')
//   pg.rows.map(...)          ← rows of the current page
//   <PaginationBar {...pg} /> ← "1–50 of 3163", page size, Prev / Next
import { useEffect, useMemo, useState } from 'react'

export const PAGE_SIZES = [25, 50, 100, 0] as const   // 0 = All
const DEFAULT_SIZE = 50

export function usePagination<T>(items: T[], storageKey: string) {
  const [size, setSizeState] = useState<number>(DEFAULT_SIZE)
  const [page, setPage] = useState(1)

  // remembered page size (per browser)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      const v = saved === null ? NaN : Number(saved)
      if ((PAGE_SIZES as readonly number[]).includes(v)) setSizeState(v)
    } catch {}
  }, [storageKey])
  const setSize = (n: number) => {
    setSizeState(n); setPage(1)
    try { localStorage.setItem(storageKey, String(n)) } catch {}
  }

  const total = items.length
  const pages = size === 0 ? 1 : Math.max(1, Math.ceil(total / size))
  // list shrank (search / filter) → stay on a page that exists
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])

  const start = size === 0 ? 0 : (Math.min(page, pages) - 1) * size
  const rows = useMemo(() => size === 0 ? items : items.slice(start, start + size), [items, start, size])

  return { rows, page: Math.min(page, pages), pages, size, total, start, setPage, setSize, resetPage: () => setPage(1) }
}

export function PaginationBar({ page, pages, size, total, start, setPage, setSize, rowsShown }: {
  page: number; pages: number; size: number; total: number; start: number
  setPage: (p: number) => void; setSize: (n: number) => void; rowsShown: number
}) {
  const end = total === 0 ? 0 : start + rowsShown
  // page numbers: first, last, and a window around the current page
  const nums: (number | '…')[] = []
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) nums.push(p)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  const btn = (label: string, onClick: () => void, disabled: boolean, active = false) => (
    <button key={label} onClick={onClick} disabled={disabled}
      style={{ minWidth: 34, padding: '6px 10px', fontSize: 13, fontWeight: active ? 800 : 600, borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
        border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border-light)'),
        background: active ? 'var(--accent)' : 'var(--bg-primary)', color: active ? '#fff' : disabled ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
      {label}
    </button>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      padding: '10px 16px', borderTop: '1px solid var(--border-light)', position: 'sticky', bottom: 0, background: 'var(--bg-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
        <span>Showing <strong>{total === 0 ? 0 : start + 1}–{end}</strong> of <strong>{total}</strong></span>
        <span style={{ color: 'var(--border-medium)' }}>|</span>
        <span>Rows per page</span>
        <select value={size} onChange={e => setSize(Number(e.target.value))}
          style={{ padding: '5px 8px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', width: 'auto' }}>
          {PAGE_SIZES.map(n => <option key={n} value={n}>{n === 0 ? 'All' : n}</option>)}
        </select>
      </div>
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {btn('‹ Prev', () => setPage(page - 1), page <= 1)}
          {nums.map((n, i) => n === '…'
            ? <span key={'e' + i} style={{ padding: '0 4px', color: 'var(--text-tertiary)' }}>…</span>
            : btn(String(n), () => setPage(n), false, n === page))}
          {btn('Next ›', () => setPage(page + 1), page >= pages)}
        </div>
      )}
    </div>
  )
}
