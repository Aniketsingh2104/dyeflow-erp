'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function GreigeRegisterPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<any[]>([])
  const [filteredEntries, setFilteredEntries] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [stats, setStats] = useState({
    total: 0,
    today: 0,
    lotPending: 0,
    erpPending: 0
  })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [entries, searchQuery])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.greigeEntries) db.greigeEntries = []

    setEntries(db.greigeEntries)

    // Calculate stats
    const todayStr = new Date().toDateString()
    const totalToday = db.greigeEntries.filter((e: any) =>
      new Date(e.entryTs).toDateString() === todayStr
    ).length

    const lotPending = db.greigeEntries.filter((e: any) => !e.lotDoneTs).length
    const erpPending = db.greigeEntries.filter((e: any) => !e.erpDoneTs).length

    setStats({
      total: db.greigeEntries.length,
      today: totalToday,
      lotPending,
      erpPending
    })
  }

  const applyFilters = () => {
    if (!searchQuery) {
      setFilteredEntries(entries)
      return
    }

    const q = searchQuery.toLowerCase()
    const filtered = entries.filter((e: any) =>
      (e.party || '').toLowerCase().includes(q) ||
      (e.challan || '').toLowerCase().includes(q) ||
      (e.lots && e.lots.some((l: any) => (l.lotNo || '').toLowerCase().includes(q)))
    )
    setFilteredEntries(filtered)
  }

  const getPlannedDate = (entryTs: string, hours: number) => {
    if (!entryTs) return ''
    const date = new Date(entryTs)
    date.setHours(date.getHours() + hours)
    return date.toISOString()
  }

  const getStatus = (actual: string) => {
    return !!actual
  }

  const getDelay = (planned: string, actual: string) => {
    if (!planned) return '-'
    if (!actual) {
      const now = Date.now()
      const plannedTime = new Date(planned).getTime()
      if (now > plannedTime) {
        const hours = Math.floor((now - plannedTime) / (1000 * 60 * 60))
        return `${hours}h late`
      }
      return 'On time'
    }
    const actualTime = new Date(actual).getTime()
    const plannedTime = new Date(planned).getTime()
    if (actualTime > plannedTime) {
      const hours = Math.floor((actualTime - plannedTime) / (1000 * 60 * 60))
      return `${hours}h late`
    }
    return 'On time'
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="content">
      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '14px' }}>
        <div className="stat-card">
          <div className="stat-label">Total Entries</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-sub">All time</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Today</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{stats.today}</div>
          <div className="stat-sub">Today's entries</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Lot Pending</div>
          <div className="stat-value" style={{ color: stats.lotPending > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {stats.lotPending}
          </div>
          <div className="stat-sub">Awaiting lot entry</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">ERP Pending</div>
          <div className="stat-value" style={{ color: stats.erpPending > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {stats.erpPending}
          </div>
          <div className="stat-sub">Not yet in ERP</div>
        </div>
      </div>

      {/* Greige Register */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>Greige Register</span>
          <input
            placeholder="Search party / challan / lot..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '5px 10px',
              fontSize: '12px',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              width: '220px',
              marginLeft: '8px'
            }}
          />
          <button className="primary" onClick={() => router.push('/greige/entry')} style={{ marginLeft: 'auto' }}>
            + New Entry
          </button>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px' }}>
            {entries.length === 0 ? (
              <>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>📋</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>No Greige Entries Yet</div>
                <button className="primary" onClick={() => router.push('/greige/entry')}>+ Make First Entry</button>
              </>
            ) : (
              'No entries match your search.'
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#F0F0F0' }}>
                  <th rowSpan={2} style={{ padding: '8px', textAlign: 'left', fontSize: '10px', border: '1px solid #ddd' }}>
                    TIME STAMP
                  </th>
                  <th rowSpan={2} style={{ padding: '8px', textAlign: 'left', fontSize: '10px', border: '1px solid #ddd' }}>
                    CHALLAN NO.
                  </th>
                  <th rowSpan={2} style={{ padding: '8px', textAlign: 'left', fontSize: '10px', border: '1px solid #ddd' }}>
                    PARTY NAME
                  </th>
                  <th rowSpan={2} style={{ padding: '8px', textAlign: 'center', fontSize: '10px', border: '1px solid #ddd' }}>
                    NO. OF TAKA
                  </th>
                  <th rowSpan={2} style={{ padding: '8px', textAlign: 'center', fontSize: '10px', border: '1px solid #ddd' }}>
                    QTY
                  </th>
                  <th rowSpan={2} style={{ padding: '8px', textAlign: 'left', fontSize: '10px', border: '1px solid #ddd' }}>
                    LOT NO.
                  </th>
                  <th rowSpan={2} style={{ padding: '8px', textAlign: 'left', fontSize: '10px', border: '1px solid #ddd' }}>
                    LINKED ORDER
                  </th>
                  <th colSpan={4} style={{
                    padding: '6px',
                    textAlign: 'center',
                    fontSize: '10px',
                    fontWeight: 700,
                    background: '#BBDEFB',
                    color: '#0C447C',
                    border: '1px solid #90CAF9'
                  }}>
                    LOT NO. ALLOCATION
                  </th>
                  <th colSpan={4} style={{
                    padding: '6px',
                    textAlign: 'center',
                    fontSize: '10px',
                    fontWeight: 700,
                    background: '#C8E6C9',
                    color: '#1B5E20',
                    border: '1px solid #A5D6A7'
                  }}>
                    LOT NO. ENTRY IN ERP
                  </th>
                  <th colSpan={4} style={{
                    padding: '6px',
                    textAlign: 'center',
                    fontSize: '10px',
                    fontWeight: 700,
                    background: '#FFE0B2',
                    color: '#E65100',
                    border: '1px solid #FFCC80'
                  }}>
                    SIKKA ON GREIGE
                  </th>
                </tr>
                <tr style={{ background: '#F5F5F5' }}>
                  {/* Lot Allocation */}
                  <th style={{ padding: '5px 4px', fontSize: '10px', background: '#BBDEFB', color: '#0C447C', border: '1px solid #90CAF9' }}>
                    PLANNED
                  </th>
                  <th style={{ padding: '5px 4px', fontSize: '10px', background: '#BBDEFB', color: '#0C447C', border: '1px solid #90CAF9' }}>
                    ACTUAL
                  </th>
                  <th style={{ padding: '5px 4px', fontSize: '10px', background: '#BBDEFB', color: '#0C447C', border: '1px solid #90CAF9' }}>
                    STATUS
                  </th>
                  <th style={{ padding: '5px 4px', fontSize: '10px', background: '#BBDEFB', color: '#0C447C', border: '1px solid #90CAF9' }}>
                    DELAY
                  </th>
                  {/* ERP Entry */}
                  <th style={{ padding: '5px 4px', fontSize: '10px', background: '#C8E6C9', color: '#1B5E20', border: '1px solid #A5D6A7' }}>
                    PLANNED
                  </th>
                  <th style={{ padding: '5px 4px', fontSize: '10px', background: '#C8E6C9', color: '#1B5E20', border: '1px solid #A5D6A7' }}>
                    ACTUAL
                  </th>
                  <th style={{ padding: '5px 4px', fontSize: '10px', background: '#C8E6C9', color: '#1B5E20', border: '1px solid #A5D6A7' }}>
                    STATUS
                  </th>
                  <th style={{ padding: '5px 4px', fontSize: '10px', background: '#C8E6C9', color: '#1B5E20', border: '1px solid #A5D6A7' }}>
                    DELAY
                  </th>
                  {/* Sikka */}
                  <th style={{ padding: '5px 4px', fontSize: '10px', background: '#FFE0B2', color: '#E65100', border: '1px solid #FFCC80' }}>
                    PLANNED
                  </th>
                  <th style={{ padding: '5px 4px', fontSize: '10px', background: '#FFE0B2', color: '#E65100', border: '1px solid #FFCC80' }}>
                    ACTUAL
                  </th>
                  <th style={{ padding: '5px 4px', fontSize: '10px', background: '#FFE0B2', color: '#E65100', border: '1px solid #FFCC80' }}>
                    STATUS
                  </th>
                  <th style={{ padding: '5px 4px', fontSize: '10px', background: '#FFE0B2', color: '#E65100', border: '1px solid #FFCC80' }}>
                    DELAY
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map(entry => {
                  const lotPlanned = getPlannedDate(entry.entryTs, 6)
                  const erpPlanned = getPlannedDate(entry.entryTs, 24)
                  const sikkaPlanned = getPlannedDate(entry.entryTs, 24)

                  const lotStatus = getStatus(entry.lotDoneTs)
                  const erpStatus = getStatus(entry.erpDoneTs)
                  const sikkaStatus = getStatus(entry.sikkaDoneTs)

                  const lotDelay = getDelay(lotPlanned, entry.lotDoneTs)
                  const erpDelay = getDelay(erpPlanned, entry.erpDoneTs)
                  const sikkaDelay = getDelay(sikkaPlanned, entry.sikkaDoneTs)

                  const lotNos = entry.lots && entry.lots.length > 0
                    ? entry.lots.map((l: any) => l.lotNo).join(', ')
                    : '-'

                  return (
                    <tr key={entry.id}>
                      <td style={{ padding: '6px 8px', fontSize: '11px', whiteSpace: 'nowrap', border: '1px solid #ddd' }}>
                        {formatDate(entry.entryTs)}
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 600, border: '1px solid #ddd' }}>
                        {entry.challan}
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 600, border: '1px solid #ddd' }}>
                        {entry.party}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #ddd' }}>
                        {entry.taka}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #ddd' }}>
                        {entry.qty || '-'}
                      </td>
                      <td style={{ padding: '6px 8px', fontSize: '11px', border: '1px solid #ddd' }}>
                        {lotNos}
                      </td>
                      <td style={{ padding: '6px 8px', fontSize: '11px', border: '1px solid #ddd' }}>
                        {entry.linkedOrderNo ? (
                          <span style={{ fontWeight: 600, color: '#185FA5', background: '#E6F1FB', padding: '2px 7px', borderRadius: 4, fontSize: 10 }}>
                            {entry.linkedOrderNo}
                          </span>
                        ) : (
                          <span style={{ color: '#9CA3AF' }}>—</span>
                        )}
                      </td>

                      {/* Lot Allocation */}
                      <td style={{ padding: '4px', fontSize: '10px', background: '#BBDEFB', border: '1px solid #90CAF9', whiteSpace: 'nowrap' }}>
                        {formatDateShort(lotPlanned)}
                      </td>
                      <td style={{ padding: '4px', fontSize: '10px', background: '#BBDEFB', border: '1px solid #90CAF9', whiteSpace: 'nowrap', fontWeight: 700, color: '#1B5E20' }}>
                        {formatDateShort(entry.lotDoneTs)}
                      </td>
                      <td style={{ padding: '4px', textAlign: 'center', background: '#BBDEFB', border: '1px solid #90CAF9' }}>
                        {lotStatus ? '✓' : '-'}
                      </td>
                      <td style={{ padding: '4px', fontSize: '10px', background: '#BBDEFB', border: '1px solid #90CAF9' }}>
                        {lotDelay}
                      </td>

                      {/* ERP Entry */}
                      <td style={{ padding: '4px', fontSize: '10px', background: '#C8E6C9', border: '1px solid #A5D6A7', whiteSpace: 'nowrap' }}>
                        {formatDateShort(erpPlanned)}
                      </td>
                      <td style={{ padding: '4px', fontSize: '10px', background: '#C8E6C9', border: '1px solid #A5D6A7', whiteSpace: 'nowrap', fontWeight: 700, color: '#1B5E20' }}>
                        {formatDateShort(entry.erpDoneTs)}
                      </td>
                      <td style={{ padding: '4px', textAlign: 'center', background: '#C8E6C9', border: '1px solid #A5D6A7' }}>
                        {erpStatus ? '✓' : '-'}
                      </td>
                      <td style={{ padding: '4px', fontSize: '10px', background: '#C8E6C9', border: '1px solid #A5D6A7' }}>
                        {erpDelay}
                      </td>

                      {/* Sikka */}
                      <td style={{ padding: '4px', fontSize: '10px', background: '#FFE0B2', border: '1px solid #FFCC80', whiteSpace: 'nowrap' }}>
                        {formatDateShort(sikkaPlanned)}
                      </td>
                      <td style={{ padding: '4px', fontSize: '10px', background: '#FFE0B2', border: '1px solid #FFCC80', whiteSpace: 'nowrap', fontWeight: 700, color: '#1B5E20' }}>
                        {formatDateShort(entry.sikkaDoneTs)}
                      </td>
                      <td style={{ padding: '4px', textAlign: 'center', background: '#FFE0B2', border: '1px solid #FFCC80' }}>
                        {sikkaStatus ? '✓' : '-'}
                      </td>
                      <td style={{ padding: '4px', fontSize: '10px', background: '#FFE0B2', border: '1px solid #FFCC80' }}>
                        {sikkaDelay}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
