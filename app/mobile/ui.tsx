// Shared mobile UI components and helpers
// Used across all /mobile/* pages

export const M = {
  // Page wrapper with sticky header
  Page: ({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) => (
    <div>
      <div style={{
        background: '#185FA5',
        padding: '16px 16px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
    </div>
  ),

  // Section header
  SectionTitle: ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '14px 16px 6px' }}>
      {children}
    </div>
  ),

  // Card
  Card: ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <div style={{ background: '#fff', borderRadius: 12, margin: '0 12px 10px', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', ...style }}>
      {children}
    </div>
  ),

  // Status badge
  Badge: ({ status }: { status: string }) => {
    const cfg: Record<string, { bg: string; color: string }> = {
      new:        { bg: '#FEF3C7', color: '#92400E' },
      assigned:   { bg: '#DBEAFE', color: '#1E40AF' },
      'in-process': { bg: '#DBEAFE', color: '#1E40AF' },
      splitting:  { bg: '#EDE9FE', color: '#5B21B6' },
      done:       { bg: '#D1FAE5', color: '#065F46' },
      hold:       { bg: '#FCE7F3', color: '#9D174D' },
      pending:    { bg: '#F1F5F9', color: '#64748B' },
    }
    const c = cfg[status] || cfg.pending
    return (
      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: c.bg, color: c.color, textTransform: 'capitalize' }}>
        {status}
      </span>
    )
  },

  // Big stat card
  Stat: ({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) => (
    <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || '#1A1A18' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>{sub}</div>}
    </div>
  ),

  // Row item (for lists)
  Row: ({ left, right, sub, onClick, accent }: { left: string; right?: React.ReactNode; sub?: string; onClick?: () => void; accent?: boolean }) => (
    <div
      onClick={onClick}
      style={{
        padding: '14px 16px',
        borderBottom: '1px solid #F1F5F9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        cursor: onClick ? 'pointer' : 'default',
        background: accent ? '#EFF6FF' : '#fff',
        WebkitTapHighlightColor: 'transparent',
        activeOpacity: 0.7,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</div>
        {sub && <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{right}</div>
    </div>
  ),

  // Big touch button
  BigButton: ({ label, icon, onClick, color, disabled }: { label: string; icon?: string; onClick: () => void; color?: string; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '16px',
        fontSize: 15,
        fontWeight: 600,
        background: disabled ? '#E2E8F0' : (color || '#185FA5'),
        color: disabled ? '#94A3B8' : '#fff',
        border: 'none',
        borderRadius: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        WebkitTapHighlightColor: 'transparent',
        transition: 'opacity 0.1s',
      }}
    >
      {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      {label}
    </button>
  ),

  // Search input
  Search: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <div style={{ padding: '10px 12px 6px' }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: '#94A3B8' }}>🔍</span>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || 'Search…'}
          style={{
            width: '100%',
            padding: '11px 12px 11px 36px',
            fontSize: 14,
            border: '1px solid #E2E8F0',
            borderRadius: 10,
            background: '#fff',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  ),

  // Empty state
  Empty: ({ icon, text }: { icon?: string; text: string }) => (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
      {icon && <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>}
      <div style={{ fontSize: 14 }}>{text}</div>
    </div>
  ),

  // Load from db helper
  loadDb: () => {
    if (typeof window === 'undefined') return {}
    const raw = localStorage.getItem('dyeflow_db')
    return raw ? JSON.parse(raw) : {}
  },

  // Save to db helper
  saveDb: (db: any) => {
    if (typeof window === 'undefined') return
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    window.dispatchEvent(new Event('dyeflow-db-updated'))
  },
}
