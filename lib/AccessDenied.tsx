'use client'

export function AccessDenied({ pageName }: { pageName?: string }) {
  return (
    <div className="content">
      <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          Access Denied
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
          You do not have permission to view{pageName ? ` "${pageName}"` : ' this page'}.
          Contact your administrator to request access.
        </div>
        <button className="primary" onClick={() => window.history.back()}>
          ← Go Back
        </button>
      </div>
    </div>
  )
}
