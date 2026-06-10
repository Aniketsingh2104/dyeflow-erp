'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Please enter both User ID and password.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.error || 'Invalid User ID or password.')
        return
      }
      localStorage.setItem('dyeflow_session', JSON.stringify({
        username: json.user.username,
        fullName: json.user.full_name,
        role: json.user.role,
        loginAt: new Date().toISOString(),
      }))
      const raw = localStorage.getItem('dyeflow_db')
      const db = raw ? JSON.parse(raw) : {}
      db.activeUser = json.user.full_name
      db.currentUser = json.user.username
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      router.push('/')
    } catch {
      setError('Network error — please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f1117',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 16px',
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: '#13141f',
        border: '0.5px solid #2a2a35',
        borderRadius: 16,
        padding: '44px 40px',
      }}>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: '#185FA5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10"/>
              <path d="M12 2c0 5-4 8-4 12"/>
              <path d="M12 2c0 5 4 8 4 12"/>
            </svg>
          </div>
          <span style={{ fontSize: 20, fontWeight: 600, color: '#e8e8e4' }}>DyeFlow ERP</span>
        </div>

        {/* Heading */}
        <div style={{ fontSize: 16, fontWeight: 600, color: '#e8e8e4', marginBottom: 4 }}>Sign in</div>
        <div style={{ fontSize: 13, color: '#6a6a64', marginBottom: 28 }}>Enter your credentials to continue</div>

        <form onSubmit={handleLogin}>

          {/* Error */}
          {error && (
            <div style={{
              background: '#1e0f0f',
              border: '0.5px solid #5a1f1f',
              borderRadius: 8,
              padding: '10px 13px',
              fontSize: 12,
              color: '#f09595',
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f09595" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* User ID */}
          <div style={{ marginBottom: 18 }}>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 600,
              color: '#a0a09a', marginBottom: 7,
              textTransform: 'uppercase', letterSpacing: '.06em',
            }}>
              User ID
            </label>
            <div style={{ position: 'relative' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5f5e5a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); setError('') }}
                placeholder="Enter your User ID"
                autoFocus
                autoComplete="username"
                required
                style={{
                  width: '100%', padding: '11px 12px 11px 38px',
                  fontSize: 14, background: '#0d0e17',
                  border: `0.5px solid ${error && !username ? '#5a1f1f' : '#2a2a35'}`,
                  borderRadius: 8, color: '#e8e8e4', outline: 'none',
                  boxSizing: 'border-box', transition: 'border-color .15s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#185FA5' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#2a2a35' }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 600,
              color: '#a0a09a', marginBottom: 7,
              textTransform: 'uppercase', letterSpacing: '.06em',
            }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5f5e5a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                style={{
                  width: '100%', padding: '11px 42px 11px 38px',
                  fontSize: 14, background: '#0d0e17',
                  border: `0.5px solid ${error && !password ? '#5a1f1f' : '#2a2a35'}`,
                  borderRadius: 8, color: '#e8e8e4', outline: 'none',
                  boxSizing: 'border-box', transition: 'border-color .15s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#185FA5' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#2a2a35' }}
              />
              {/* Show / hide toggle */}
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: showPassword ? '#4A9FE0' : '#5f5e5a',
                  padding: '2px 4px', display: 'flex', alignItems: 'center',
                }}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Sign in button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px',
              background: loading ? '#0c447c' : '#185FA5',
              border: 'none', borderRadius: 8,
              color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background .15s',
              opacity: loading ? 0.8 : 1,
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#0c447c' }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#185FA5' }}
          >
            {loading ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"
                  style={{ animation: 'spin 0.8s linear infinite' }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </>
            )}
          </button>

        </form>

        {/* Footer */}
        <div style={{
          marginTop: 28, textAlign: 'center',
          fontSize: 11, color: '#3a3a45',
        }}>
          Ginza Limited · DyeFlow ERP
        </div>

      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
