import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'DyeFlow Mobile',
  description: 'DyeFlow factory floor app',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F1F5F9',
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      maxWidth: 480,
      margin: '0 auto',
      position: 'relative',
    }}>
      {/* Page content — padded bottom so tab bar doesn't cover it */}
      <div style={{ paddingBottom: 72 }}>
        {children}
      </div>

      {/* Bottom Tab Bar */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        background: '#fff',
        borderTop: '1px solid #E2E8F0',
        display: 'flex',
        zIndex: 100,
        boxShadow: '0 -2px 12px rgba(0,0,0,0.08)',
      }}>
        {[
          { href: '/mobile', icon: '🏠', label: 'Home' },
          { href: '/mobile/fms', icon: '⚙', label: 'FMS' },
          { href: '/mobile/batches', icon: '📦', label: 'Batches' },
          { href: '/mobile/orders', icon: '📋', label: 'Orders' },
          { href: '/mobile/supervisor', icon: '👷', label: 'Supervisor' },
        ].map(tab => (
          <a
            key={tab.href}
            href={tab.href}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 4px 8px',
              textDecoration: 'none',
              color: '#64748B',
              fontSize: 10,
              fontWeight: 500,
              gap: 3,
              WebkitTapHighlightColor: 'transparent',
              minHeight: 56,
            }}
          >
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
