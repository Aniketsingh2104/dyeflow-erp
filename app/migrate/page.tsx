'use client'
import { useState } from 'react'

export default function MigratePage() {
  const [status, setStatus] = useState<'idle'|'running'|'done'|'error'>('idle')
  const [message, setMessage] = useState('')
  const [stats, setStats] = useState<any>(null)

  const migrate = async () => {
    setStatus('running')
    setMessage('Reading local data...')
    try {
      const raw = localStorage.getItem('dyeflow_db')
      if (!raw) { setStatus('error'); setMessage('No local data found in this browser.'); return }
      const d = JSON.parse(raw)
      const orders  = d.orders?.length || 0
      const batches = (d.orders || []).reduce((s: number, o: any) => s + (o.splits?.length || 0), 0)
      const fob     = d.fobRecords?.length || 0
      const faulty  = d.faultyRecords?.length || 0
      setMessage(`Found ${orders} orders, ${batches} batches. Uploading to Supabase...`)
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: raw
      })
      if (!res.ok) throw new Error('Server error ' + res.status)
      setStats({ orders, batches, fob, faulty })
      setStatus('done')
      setMessage('All data migrated to Supabase successfully!')
    } catch (e: any) {
      setStatus('error')
      setMessage('Failed: ' + e.message)
    }
  }

  const verify = async () => {
    try {
      const res = await fetch('/api/db?_t=' + Date.now())
      const j = await res.json()
      const d = j.data || {}
      setMessage(`Server has: ${d.orders?.length || 0} orders | ${d.fobRecords?.length || 0} FOB | ${d.faultyRecords?.length || 0} faulty`)
    } catch (e: any) {
      setMessage('Verify failed: ' + e.message)
    }
  }

  const bgCol  = status === 'done' ? '#D1FAE5' : status === 'error' ? '#FEE2E2' : '#EFF6FF'
  const txtCol = status === 'done' ? '#065F46' : status === 'error' ? '#991B1B' : '#1E40AF'

  return (
    <div className="content">
      <div className="card" style={{ maxWidth: 620, margin: '40px auto' }}>
        <div className="card-header">
          <span className="card-title">Migrate Data to Server</span>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 16 }}>
          This copies all factory data from <strong>this browser</strong> to Supabase so{' '}
          <strong>every device shares the same data</strong>.<br />
          Run this <strong>once</strong> from the PC that has all your existing data.
        </p>
        {message && (
          <div style={{
            padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13,
            background: bgCol, color: txtCol,
            border: `1px solid ${status === 'done' ? '#6EE7B7' : status === 'error' ? '#FCA5A5' : '#BFDBFE'}`
          }}>
            {status === 'running' && '⏳ '}
            {status === 'done' && '✅ '}
            {status === 'error' && '❌ '}
            {message}
          </div>
        )}
        {stats && status === 'done' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            {[['Orders', stats.orders], ['Batches', stats.batches], ['FOB', stats.fob], ['Faulty', stats.faulty]].map(([l, v]) => (
              <div key={String(l)} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)' }}>{v}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={migrate} disabled={status === 'running'} className="primary"
            style={{ padding: '10px 24px', fontSize: 14, fontWeight: 700 }}>
            {status === 'running' ? '⏳ Migrating...' : 'Migrate to Server'}
          </button>
          <button onClick={verify} style={{ padding: '10px 20px', fontSize: 13 }}>
            Verify Server Data
          </button>
        </div>
        {status === 'done' && (
          <div style={{
            marginTop: 20, padding: '14px 16px', background: 'var(--bg-secondary)',
            borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8
          }}>
            <strong>Migration complete!</strong><br />
            All devices now share the same data via Supabase.<br />
            Changes sync automatically every 5 seconds.
          </div>
        )}
      </div>
    </div>
  )
}
