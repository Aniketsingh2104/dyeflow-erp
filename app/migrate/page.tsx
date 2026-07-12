'use client'
import Link from 'next/link'

export default function MigratePage() {
  return (
    <div className="content">
      <div className="card" style={{ maxWidth: 580, margin: '40px auto', textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Migration Complete</div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 24 }}>
          DyeFlow ERP is now fully running on <strong>Supabase</strong>.<br />
          All data is stored in the cloud and syncs across every device automatically.<br />
          This migration tool is no longer needed.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/"><button className="primary">Go to Dashboard</button></Link>
          <Link href="/orders"><button className="small">View Orders</button></Link>
          <Link href="/setup"><button className="small">Setup</button></Link>
        </div>
        <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
          Supabase project: gsaupqjmuqbogvezvhci (ap-south-1)
        </div>
      </div>
    </div>
  )
}
