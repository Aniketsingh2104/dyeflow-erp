'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function GreigeLotsPage() {
  const router = useRouter()
  const [flatRows, setFlatRows] = useState<any[]>([])
  const [filteredRows, setFilteredRows] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [stats, setStats] = useState({
    totalEntries: 0,
    totalLots: 0,
    totalTaka: 0,
    awaitingLot: 0
  })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [flatRows, searchQuery])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.greigeEntries) db.greigeEntries = []

    const entries = db.greigeEntries
    const rows: any[] = []

    // Flatten entries with their lots
    for (const e of entries) {
      const lots = e.lots && e.lots.length > 0 ? e.lots : null
      if (lots) {
        lots.forEach((lot: any, li: number) => {
          rows.push({
            entry: e,
            lot,
            lotIdx: li,
            totalLots: lots.length
          })
        })
      } else {
        rows.push({
          entry: e,
          lot: null,
          lotIdx: 0,
          totalLots: 0
        })
      }
    }

    setFlatRows(rows)

    // Calculate stats
    const totalLotCount = rows.filter(r => r.lot).length
    const pendingLot = entries.filter((e: any) => !e.lots || !e.lots.length).length
    const totalTakaAll = rows
      .filter(r => r.lot)
      .reduce((s: number, r: any) => s + (parseInt(r.lot.taka) || 0), 0)

    setStats({
      totalEntries: entries.length,
      totalLots: totalLotCount,
      totalTaka: totalTakaAll,
      awaitingLot: pendingLot
    })
  }

  const applyFilters = () => {
    if (!searchQuery) {
      setFilteredRows(flatRows)
      return
    }

    const q = searchQuery.toLowerCase()
    const filtered = flatRows.filter((r: any) =>
      (r.entry.party || '').toLowerCase().includes(q) ||
      (r.entry.challan || '').toLowerCase().includes(q) ||
      (r.lot?.lotNo || '').toLowerCase().includes(q)
    )
    setFilteredRows(filtered)
  }

  const getTotalTaka = (entry: any) => {
    if (!entry.lots || entry.lots.length === 0) return entry.taka || 0
    return entry.lots.reduce((sum: number, lot: any) => sum + (parseInt(lot.taka) || 0), 0)
  }

  const getTotalQty = (entry: any) => {
    if (!entry.lots || entry.lots.length === 0) return entry.qty || 0
    return entry.lots.reduce((sum: number, lot: any) => sum + (parseFloat(lot.qty) || 0), 0)
  }

  const formatDate = (ts: string) => {
    if (!ts) return '-'
    const date = new Date(ts)
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateShort = (ts: string) => {
    if (!ts) return '-'
    const date = new Date(ts)
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
          <div className="stat-value">{stats.totalEntries}</div>
          <div className="stat-sub">All time</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Lots</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{stats.totalLots}</div>
          <div className="stat-sub">Across all entries</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Taka</div>
          <div className="stat-value">{stats.totalTaka}</div>
          <div className="stat-sub">Sum of all lot taka</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Awaiting Lot</div>
          <div className="stat-value" style={{ color: stats.awaitingLot > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {stats.awaitingLot}
          </div>
          <div className="stat-sub">No lot entered yet</div>
        </div>
      </div>

      {/* Lot Details */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>Lot Details</span>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Each lot shown separately — multi-lot entries expand into multiple rows
          </span>
          <input
            placeholder="Search party / challan / lot no..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '5px 10px',
              fontSize: '12px',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              width: '240px',
              marginLeft: 'auto'
            }}
          />
        </div>

        {filteredRows.length === 0 ? (
          <div className="empty-state" style={{ padding: '36px' }}>
            {flatRows.length === 0 ? 'No greige entries yet.' : 'No lots match your search.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#F0F0F0' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, border: '1px solid #ddd', whiteSpace: 'nowrap' }}>
                    TIME STAMP
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, border: '1px solid #ddd' }}>
                    CHALLAN
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, border: '1px solid #ddd', minWidth: '140px' }}>
                    PARTY NAME
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '10px', fontWeight: 700, border: '1px solid #ddd', background: '#BBDEFB', color: '#0C447C' }}>
                    LOT #
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '10px', fontWeight: 700, border: '1px solid #ddd', background: '#BBDEFB', color: '#0C447C', minWidth: '80px' }}>
                    LOT NO.
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '10px', fontWeight: 700, border: '1px solid #ddd', background: '#BBDEFB', color: '#0C447C' }}>
                    TAKA
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '10px', fontWeight: 700, border: '1px solid #ddd', background: '#BBDEFB', color: '#0C447C' }}>
                    QTY
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '10px', fontWeight: 700, border: '1px solid #ddd' }}>
                    TOTAL LOTS
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '10px', fontWeight: 700, border: '1px solid #ddd' }}>
                    TOTAL TAKA
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '10px', fontWeight: 700, border: '1px solid #ddd' }}>
                    TOTAL QTY
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '10px', fontWeight: 700, border: '1px solid #ddd', background: '#C8E6C9', color: '#1B5E20' }}>
                    ERP DONE
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '10px', fontWeight: 700, border: '1px solid #ddd', background: '#FFE0B2', color: '#E65100' }}>
                    SIKKA DONE
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let prevId: string | null = null
                  return filteredRows.map((r, idx) => {
                    const isFirst = r.entry.id !== prevId
                    prevId = r.entry.id
                    const rowspan = isFirst ? flatRows.filter((fr: any) => fr.entry.id === r.entry.id).length : 0

                    return (
                      <tr key={`${r.entry.id}-${r.lotIdx}`}>
                        {isFirst && (
                          <>
                            <td rowSpan={rowspan} style={{ padding: '6px 8px', fontSize: '11px', whiteSpace: 'nowrap', border: '1px solid #ddd', verticalAlign: 'top' }}>
                              {formatDate(r.entry.entryTs)}
                            </td>
                            <td rowSpan={rowspan} style={{ padding: '6px 8px', fontWeight: 600, border: '1px solid #ddd', verticalAlign: 'top' }}>
                              {r.entry.challan}
                            </td>
                            <td rowSpan={rowspan} style={{ padding: '6px 8px', fontWeight: 600, border: '1px solid #ddd', verticalAlign: 'top' }}>
                              {r.entry.party}
                            </td>
                          </>
                        )}
                        <td style={{ padding: '6px 8px', textAlign: 'center', background: '#BBDEFB', border: '1px solid #90CAF9' }}>
                          {r.lot ? r.lotIdx + 1 : '-'}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, background: '#BBDEFB', border: '1px solid #90CAF9' }}>
                          {r.lot?.lotNo || '-'}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', background: '#BBDEFB', border: '1px solid #90CAF9' }}>
                          {r.lot?.taka || '-'}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', background: '#BBDEFB', border: '1px solid #90CAF9' }}>
                          {r.lot?.qty || '-'}
                        </td>
                        {isFirst && (
                          <>
                            <td rowSpan={rowspan} style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #ddd', verticalAlign: 'top' }}>
                              {r.totalLots || '-'}
                            </td>
                            <td rowSpan={rowspan} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, border: '1px solid #ddd', verticalAlign: 'top' }}>
                              {getTotalTaka(r.entry)}
                            </td>
                            <td rowSpan={rowspan} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, border: '1px solid #ddd', verticalAlign: 'top' }}>
                              {getTotalQty(r.entry).toFixed(2)}
                            </td>
                            <td rowSpan={rowspan} style={{ padding: '6px 8px', textAlign: 'center', background: '#C8E6C9', border: '1px solid #A5D6A7', verticalAlign: 'top' }}>
                              {r.entry.erpDoneTs ? (
                                <div>
                                  <div style={{ color: '#1B5E20', fontWeight: 700 }}>✓</div>
                                  <div style={{ fontSize: '10px', marginTop: '2px' }}>
                                    {formatDateShort(r.entry.erpDoneTs)}
                                  </div>
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td rowSpan={rowspan} style={{ padding: '6px 8px', textAlign: 'center', background: '#FFE0B2', border: '1px solid #FFCC80', verticalAlign: 'top' }}>
                              {r.entry.sikkaDoneTs ? (
                                <div>
                                  <div style={{ color: '#E65100', fontWeight: 700 }}>✓</div>
                                  <div style={{ fontSize: '10px', marginTop: '2px' }}>
                                    {formatDateShort(r.entry.sikkaDoneTs)}
                                  </div>
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
