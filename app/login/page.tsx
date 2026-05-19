'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
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
        setError(json.error || 'Login failed')
        return
      }
      // Store session in localStorage
      localStorage.setItem('dyeflow_session', JSON.stringify({
        username: json.user.username,
        fullName: json.user.full_name,
        role: json.user.role,
        loginAt: new Date().toISOString(),
      }))
      // Also set activeUser in the main DB object for audit logs
      const raw = localStorage.getItem('dyeflow_db')
      const db = raw ? JSON.parse(raw) : {}
      db.activeUser = json.user.full_name
      db.currentUser = json.user.username
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      router.push('/')
    } catch (err: any) {
      setError('Network error — check your connection')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg-primary)'
    }}>
      <div className="card" style={{ width: 360, padding: '32px 28px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎨</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>DyeFlow ERP</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Sign in to your account
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoFocus
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14,
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14,
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', marginBottom: 16, borderRadius: 8,
              background: '#FEE2E2', color: '#991B1B', fontSize: 13,
              border: '1px solid #FCA5A5'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="primary"
            style={{ width: '100%', padding: '11px', fontSize: 15, fontWeight: 600 }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 20 }}>
          Default: admin / dyeflow123
        </p>
      </div>
    </div>
  )
}
