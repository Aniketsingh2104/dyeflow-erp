// ── Holiday Conflict Warnings ─────────────────────────────────────────────

function HolidayWarnings({ orders }: { orders: Order[] }) {
  interface HolidayConflict {
    orderNo: string
    party: string
    date: string
    dateLabel: string
    holidayName: string
    processLabel: string
  }

  const [conflicts, setConflicts] = React.useState<HolidayConflict[]>([])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return
    const db = JSON.parse(raw)
    const holidays: any[] = db.holidays || []
    const now = new Date()
    const future = new Date(now)
    future.setDate(future.getDate() + 14)

    const holidayMap: Record<string, string> = {}
    holidays.forEach((h: any) => {
      const iso = (h.date || '').slice(0, 10)
      if (iso) holidayMap[iso] = h.name || h.description || 'Holiday'
    })

    const found: HolidayConflict[] = []
    for (const order of orders) {
      if (['done', 'hold'].includes(order.status)) continue
      const planned = (order as any).plannedDates || {}
      for (const [processCode, dateVal] of Object.entries(planned)) {
        const iso = String(dateVal || '').slice(0, 10)
        if (!iso || !holidayMap[iso]) continue
        const d = new Date(iso)
        if (d < now || d > future) continue
        found.push({
          orderNo: order.orderNumber,
          party: order.party,
          date: iso,
          dateLabel: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
          holidayName: holidayMap[iso],
          processLabel: processCode,
        })
      }
    }
    found.sort((a, b) => a.date.localeCompare(b.date))
    setConflicts(found.slice(0, 10))
  }, [orders])

  if (conflicts.length === 0) return null

  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: '1px solid #FCD34D',
      borderLeft: '4px solid #D97706',
      borderRadius: 10, marginBottom: 14, overflow: 'hidden',
    }}>
      <div style={{ background: '#FEF3C7', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>📅</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>Holiday Conflicts — {conflicts.length} planned date{conflicts.length > 1 ? 's' : ''} fall on a holiday</span>
        <Link href="/date-calculator" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', padding: '2px 8px', border: '1px solid var(--accent-light)', borderRadius: 4 }}>Fix in Date Calculator →</Link>
      </div>
      <div style={{ padding: '8px 14px' }}>
        {conflicts.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < conflicts.length - 1 ? '1px solid var(--border-light)' : 'none', fontSize: 12 }}>
            <span style={{ background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 8, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{c.dateLabel}</span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.orderNo}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{c.party}</span>
            <span style={{ color: 'var(--text-tertiary)' }}>— {c.processLabel}</span>
            <span style={{ marginLeft: 'auto', color: '#D97706', fontWeight: 600, flexShrink: 0 }}>🗓 {c.holidayName}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
