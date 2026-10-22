'use client'
// Phone card list used by the Faulty, FOB and Repairing Orders pages: the page
// says how to draw a card (head / details / actions); this draws the list with
// tabs, search and expand.
import { useState, ReactNode } from 'react'
import Link from 'next/link'
import { SubProdTag } from '@/components/SubProd'

export interface CardHead { title: string; subProd?: string | null; line1?: string; line2?: string; big?: string; bigUnit?: string; small?: string
  chip?: { text: string; bg: string; fg: string }; edge: string; tags?: { text: string; bg: string; fg: string }[] }
export interface Tab { key: string; label: string; match: (r: any) => boolean }

export default function MobileRecordCards({ title, rows, idOf, head, details, actions, tabs, searchFields, batchLink, extra, onRefresh, toast }: {
  title: string
  rows: any[]
  idOf: (r: any) => string
  head: (r: any) => CardHead
  details: (r: any) => [string, any][]
  actions?: (r: any) => ReactNode
  tabs?: Tab[]
  searchFields: (r: any) => any[]
  batchLink?: (r: any) => string | null
  extra?: ReactNode
  onRefresh: () => void
  toast?: string | null
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState(tabs?.[0]?.key || 'all')
  const s = q.trim().toLowerCase()
  const t = tabs?.find(x => x.key === tab)
  const list = rows.filter(r => (!t || t.match(r)) && (!s || searchFields(r).some(v => String(v ?? '').toLowerCase().includes(s))))
  return (
    <div style={{ padding: '10px 10px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 800 }}>{title} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>{rows.length}</span></div>
        {extra}
        <button className="small" onClick={onRefresh} style={{ minWidth: 40 }}>⟳</button>
      </div>
      {toast && <div style={{ borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 13, fontWeight: 600, background: 'var(--success-light)', color: 'var(--success)' }}>{toast}</div>}
      {tabs && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6 }}>
          {tabs.map(x => (
            <button key={x.key} onClick={() => setTab(x.key)} style={{ padding: '8px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', border: '1px solid var(--border-medium)',
              background: tab === x.key ? '#2D3748' : 'var(--bg-primary)', color: tab === x.key ? '#fff' : 'var(--text-secondary)' }}>
              {x.label} ({rows.filter(x.match).length})
            </button>
          ))}
        </div>
      )}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ width: '100%', marginBottom: 10, borderRadius: 10 }} />
      {list.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>Nothing here.</div>}
      {list.map(r => {
        const id = idOf(r); const h = head(r); const isOpen = open === id
        return (
          <div key={id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderLeft: `5px solid ${h.edge}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => setOpen(isOpen ? null : id)} style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title}<SubProdTag value={h.subProd} /></div>
                  {h.line1 && <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.line1}</div>}
                  {h.line2 && <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.line2}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {h.big && <div style={{ fontSize: 16, fontWeight: 800 }}>{h.big} <span style={{ fontSize: 11, fontWeight: 500 }}>{h.bigUnit || ''}</span></div>}
                  {h.small && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{h.small}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                {h.chip && <span style={pill(h.chip.bg, h.chip.fg)}>{h.chip.text}</span>}
                {(h.tags || []).map((x, i) => <span key={i} style={pill(x.bg, x.fg)}>{x.text}</span>)}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border-light)', padding: '10px 12px', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', fontSize: 13, marginBottom: actions ? 10 : 0 }}>
                  {details(r).map(([k, v]) => (
                    <div key={k} style={{ gridColumn: String(v ?? '').length > 28 ? '1 / -1' : undefined }}><span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{k} </span><strong>{String(v ?? '-')}</strong></div>
                  ))}
                </div>
                {actions && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{actions(r)}</div>}
                {batchLink && batchLink(r) && <Link href={batchLink(r)!} style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Batch trace →</Link>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export const pill = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: bg, color: fg, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' })
export const mbtn = (bg: string, fg: string, border?: string, full?: boolean): React.CSSProperties => ({ minHeight: 44, fontSize: 14, fontWeight: 800, borderRadius: 8, background: bg, color: fg, border: border ? `1px solid ${border}` : 'none', gridColumn: full ? '1 / -1' : undefined })
