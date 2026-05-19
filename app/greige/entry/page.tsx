'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function GreigeEntryPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    party: '',
    challan: '',
    taka: '',
    qty: '',
    linkedOrderId: '',
    linkedOrderNo: '',
    article: '',
    blend: '',
  })
  const [parties, setParties] = useState<string[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [todayEntries, setTodayEntries] = useState<any[]>([])
  const [stats, setStats] = useState({
    total: 0,
    today: 0,
    lotPending: 0,
    erpPending: 0
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.greigeEntries) db.greigeEntries = []
    if (!db.customers) db.customers = []

    // Get unique parties from customers and existing entries
    const customerParties = db.customers.map((c: any) => c.name)
    const entryParties = [...new Set(db.greigeEntries.map((e: any) => e.party).filter(Boolean))]
    const allParties = [...new Set([...customerParties, ...entryParties])]
    setParties(allParties)

    // Load orders for linking
    setOrders((db.orders || []).filter((o: any) => !['done'].includes(o.status)))

    // Get today's entries
    const todayStr = new Date().toDateString()
    const today = db.greigeEntries.filter((e: any) =>
      new Date(e.entryTs).toDateString() === todayStr
    ).reverse()
    setTodayEntries(today)

    // Calculate stats
    const lotPending = db.greigeEntries.filter((e: any) => !e.lotDoneTs && (!e.lots || e.lots.length === 0)).length
    const erpPending = db.greigeEntries.filter((e: any) => !e.erpDoneTs).length

    setStats({
      total: db.greigeEntries.length,
      today: today.length,
      lotPending,
      erpPending
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.party.trim()) {
      alert('Party Name is required.')
      return
    }
    if (!formData.challan.trim()) {
      alert('Challan No. is required.')
      return
    }
    if (!formData.taka || parseInt(formData.taka) <= 0) {
      alert('No. of Taka is required.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.greigeEntries) db.greigeEntries = []

    // Generate ID
    const nextId = db.greigeEntries.length > 0
      ? 'GE-' + String(db.greigeEntries.length + 1).padStart(4, '0')
      : 'GE-0001'

    const entry = {
      id: nextId,
      entryTs: new Date().toISOString(),
      party: formData.party.trim(),
      challan: formData.challan.trim(),
      taka: parseInt(formData.taka),
      qty: formData.qty ? parseFloat(formData.qty) : null,
      article: formData.article.trim(),
      blend: formData.blend.trim(),
      linkedOrderId: formData.linkedOrderId,
      linkedOrderNo: formData.linkedOrderNo,
      lots: [],
      lotDoneTs: null,
      erpDoneTs: null,
      sikkaDoneTs: null
    }

    db.greigeEntries.unshift(entry)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))

    // Clear form
    setFormData({ party: '', challan: '', taka: '', qty: '', linkedOrderId: '', linkedOrderNo: '', article: '', blend: '' })
    
    // Reload data
    loadData()

    // Show success message
    alert(`Greige entry ${nextId} saved successfully! Please enter Lot No. within 6 hours and ERP entry within 24 hours.`)
  }

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  }

  const getTimeDiff = (entryTs: string, hoursLimit: number) => {
    const entryTime = new Date(entryTs).getTime()
    const deadline = entryTime + (hoursLimit * 3600000)
    const now = Date.now()
    const diff = deadline - now

    if (diff < 0) {
      const overdue = Math.abs(diff)
      const hours = Math.floor(overdue / 3600000)
      const minutes = Math.floor((overdue % 3600000) / 60000)
      return {
        overdue: true,
        label: `${hours}h ${minutes}m ago`
      }
    }

    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    return {
      overdue: false,
      label: `${hours}h ${minutes}m left`
    }
  }

  return (
    <div className="content">
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '6px' }}>
          New Greige Entry
        </h2>
        <p style={{ margin: 0, fontSize: '12px', color: '#6B7280', lineHeight: 1.5 }}>
          Record incoming greige fabric. Fill Party Name, Challan No, No. of Taka and optionally Qty. After saving, Lot No. entry must be done within <strong>6 hours</strong>, and ERP entry & Sikka within <strong>24 hours</strong>.
        </p>
        <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
          Visible by user Admin • All data access
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        {/* Total Entries */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px',
          border: '2px solid #F3F4F6',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '60px',
            height: '60px',
            background: 'linear-gradient(135deg, #F3F4F6 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Total Entries
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1F2937', marginBottom: '4px', lineHeight: 1 }}>
            {stats.total}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>All time</div>
        </div>

        {/* Today */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px',
          border: '2px solid #DBEAFE',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '60px',
            height: '60px',
            background: 'linear-gradient(135deg, #DBEAFE 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Today
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#3B82F6', marginBottom: '4px', lineHeight: 1 }}>
            {stats.today}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Today's entries</div>
        </div>

        {/* Lot Pending */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px',
          border: stats.lotPending > 0 ? '2px solid #FEE2E2' : '2px solid #D1FAE5',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '60px',
            height: '60px',
            background: stats.lotPending > 0 ? 'linear-gradient(135deg, #FEE2E2 0%, transparent 100%)' : 'linear-gradient(135deg, #D1FAE5 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Lot Pending
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: stats.lotPending > 0 ? '#EF4444' : '#10B981', marginBottom: '4px', lineHeight: 1 }}>
            {stats.lotPending}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Awaiting lot entry</div>
        </div>

        {/* ERP Pending */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 160px',
          minWidth: '160px',
          maxWidth: '200px',
          border: stats.erpPending > 0 ? '2px solid #FED7AA' : '2px solid #D1FAE5',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '60px',
            height: '60px',
            background: stats.erpPending > 0 ? 'linear-gradient(135deg, #FED7AA 0%, transparent 100%)' : 'linear-gradient(135deg, #D1FAE5 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            ERP Pending
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: stats.erpPending > 0 ? '#FB923C' : '#10B981', marginBottom: '4px', lineHeight: 1 }}>
            {stats.erpPending}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Not yet in ERP</div>
        </div>
      </div>

      {/* Entry Form Card */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        padding: '16px',
        marginBottom: '16px'
      }}>
        <form onSubmit={handleSubmit}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            marginBottom: '16px'
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>
                Party Name *
              </label>
              <input
                list="party-list"
                value={formData.party}
                onChange={(e) => setFormData({ ...formData, party: e.target.value })}
                placeholder="Select or type party name"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}
              />
              <datalist id="party-list">
                {parties.map((party, idx) => (
                  <option key={idx} value={party} />
                ))}
              </datalist>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>
                Challan No. *
              </label>
              <input
                type="text"
                value={formData.challan}
                onChange={(e) => setFormData({ ...formData, challan: e.target.value })}
                placeholder="e.g. 00367"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>
                No. of Taka *
              </label>
              <input
                type="number"
                min="1"
                value={formData.taka}
                onChange={(e) => setFormData({ ...formData, taka: e.target.value })}
                placeholder="e.g. 30"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>
                Qty (optional)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.qty}
                onChange={(e) => setFormData({ ...formData, qty: e.target.value })}
                placeholder="e.g. 300"
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>
                Article (optional)
              </label>
              <input
                type="text"
                value={formData.article}
                onChange={(e) => setFormData({ ...formData, article: e.target.value })}
                placeholder="e.g. VISCOSE SUPER 30S"
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>
                Blend (optional)
              </label>
              <input
                type="text"
                value={formData.blend}
                onChange={(e) => setFormData({ ...formData, blend: e.target.value })}
                placeholder="e.g. 100% Viscose"
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>
                Link to Order (optional)
              </label>
              <select
                value={formData.linkedOrderId}
                onChange={(e) => {
                  const order = orders.find((o: any) => o.id === e.target.value)
                  setFormData({
                    ...formData,
                    linkedOrderId: e.target.value,
                    linkedOrderNo: order ? order.orderNumber : '',
                    party: order ? order.party : formData.party,
                    article: order ? (order.article || '') : formData.article,
                    blend: order ? (order.blend || '') : formData.blend,
                  })
                }}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
              >
                <option value="">— Not linked to any order —</option>
                {orders.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} · {o.party} · {o.article} · {o.color} ({o.qtyKg} Kg)
                  </option>
                ))}
              </select>
              {formData.linkedOrderNo && (
                <div style={{ fontSize: '11px', color: '#10B981', marginTop: 4 }}>
                  ✓ Linked to {formData.linkedOrderNo} — party and article auto-filled
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              background: '#10B981',
              color: 'white',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ✓ Save Entry
          </button>
        </form>
      </div>

      {/* Recent Entries */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>
            Recent Entries (Today)
          </div>
          <button
            onClick={() => router.push('/greige/register')}
            style={{
              padding: '5px 10px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              background: 'white',
              color: '#374151',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            View All →
          </button>
        </div>

        {todayEntries.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#9CA3AF',
            fontSize: '14px'
          }}>
            No entries today yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={headerStyle}>TIME</th>
                  <th style={headerStyle}>PARTY</th>
                  <th style={headerStyle}>CHALLAN</th>
                  <th style={headerStyle}>TAKA</th>
                  <th style={headerStyle}>QTY</th>
                  <th style={headerStyle}>LOT STATUS</th>
                  <th style={headerStyle}>ERP STATUS</th>
                  <th style={headerStyle}>SIKKA STATUS</th>
                </tr>
              </thead>
              <tbody>
                {todayEntries.map((entry, idx) => {
                  const lotDone = entry.lots && entry.lots.length > 0
                  const lotDiff = getTimeDiff(entry.entryTs, 6)
                  const erpDone = !!entry.erpDoneTs
                  const erpDiff = getTimeDiff(entry.entryTs, 24)
                  const sikkaDone = !!entry.sikkaDoneTs

                  return (
                    <tr
                      key={entry.id}
                      style={{
                        background: idx % 2 === 0 ? 'white' : '#FAFAFA',
                        borderBottom: '1px solid #F3F4F6'
                      }}
                    >
                      <td style={{ ...cellStyle, fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {formatTime(entry.entryTs)}
                      </td>
                      <td style={{ ...cellStyle, fontWeight: 600 }}>{entry.party}</td>
                      <td style={cellStyle}>{entry.challan}</td>
                      <td style={{ ...cellStyle, fontWeight: 600 }}>{entry.taka}</td>
                      <td style={cellStyle}>{entry.qty || '-'}</td>
                      <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                        {lotDone ? (
                          <span style={{ color: '#10B981', fontWeight: 600 }}>✓ Done</span>
                        ) : lotDiff.overdue ? (
                          <span style={{ color: '#EF4444', fontWeight: 600 }}>⚠ Delayed {lotDiff.label}</span>
                        ) : (
                          <span style={{ color: '#FB923C' }}>Pending ({lotDiff.label})</span>
                        )}
                      </td>
                      <td style={cellStyle}>
                        {erpDone ? (
                          <span style={{ color: '#10B981', fontWeight: 600 }}>✓ Done</span>
                        ) : erpDiff.overdue ? (
                          <span style={{ color: '#EF4444' }}>⚠ Delayed</span>
                        ) : (
                          <span style={{ color: '#9CA3AF' }}>Pending</span>
                        )}
                      </td>
                      <td style={cellStyle}>
                        {sikkaDone ? (
                          <span style={{ color: '#10B981', fontWeight: 600 }}>✓ Done</span>
                        ) : (
                          <span style={{ color: '#9CA3AF' }}>Pending</span>
                        )}
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

const headerStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: '10px',
  fontWeight: 700,
  color: '#6B7280',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '1px solid #E5E7EB'
}

const cellStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: '12px',
  color: '#1F2937'
}
