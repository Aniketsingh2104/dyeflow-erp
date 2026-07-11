'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface FactorySettings {
  orderPrefix: string
  factoryName: string
  city: string
  gstNumber: string
  phone: string
}

const DEFAULTS: FactorySettings = {
  orderPrefix: 'DYG', factoryName: '', city: '', gstNumber: '', phone: '',
}

export default function FactorySettingsPage() {
  const [form,    setForm]    = useState<FactorySettings>(DEFAULTS)
  const [saved,   setSaved]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [preview, setPreview] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/setup/settings?key=factory', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok && data.value) {
        const s = { ...DEFAULTS, ...data.value }
        setForm(s)
        updatePreview(s.orderPrefix)
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const updatePreview = (prefix: string) => {
    const year = new Date().getFullYear()
    const n = String(Math.floor(Math.random() * 900) + 100)
    setPreview(`${prefix || 'DYG'}-${year}-${n}`)
  }

  const handleChange = (field: keyof FactorySettings, value: string) => {
    const next = { ...form, [field]: value }
    setForm(next)
    if (field === 'orderPrefix') updatePreview(value)
  }

  const handleSave = async () => {
    if (!form.orderPrefix.trim()) { alert('Order number prefix is required.'); return }
    const clean = { ...form, orderPrefix: form.orderPrefix.trim().toUpperCase() }
    setSaving(true)
    try {
      const res = await fetch('/api/setup/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'factory', value: clean }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setForm(clean)
      // Also keep localStorage in sync for backward compat
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('dyeflow_db')
          const db  = raw ? JSON.parse(raw) : {}
          if (!db.settings) db.settings = {}
          db.settings.factory = clean
          localStorage.setItem('dyeflow_db', JSON.stringify(db))
          window.dispatchEvent(new Event('dyeflow-db-updated'))
        } catch {}
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      alert(`Save failed: ${err}`)
    } finally { setSaving(false) }
  }

  const Field = ({ label, field, placeholder, note }: { label: string; field: keyof FactorySettings; placeholder?: string; note?: string }) => (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      <input
        type="text"
        value={form[field] as string}
        onChange={e => handleChange(field, e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', maxWidth: 340, padding: '8px 12px', fontSize: 14,
          border: '1px solid var(--border-medium)', borderRadius: 6,
          background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      />
      {note && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{note}</div>}
    </div>
  )

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-tertiary)', fontSize: 14 }}>
      Loading settings…
    </div>
  )

  return (
    <div className="content" style={{ maxWidth: 700, margin: '0 auto', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>⚙ Factory Settings</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>Configure factory-level settings including the order number format</div>
        </div>
        <Link href="/setup"><button className="small">← Setup</button></Link>
      </div>

      {saved && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)', border: '1px solid #6EE7B7',
          borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          ✓ Settings saved to Supabase
        </div>
      )}

      {/* Order Number Format */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Order Number Format</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          Order numbers are generated as <code style={{ background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 4 }}>PREFIX-YYYY-N</code>. Set the prefix to match your factory's naming convention.
        </div>
        <Field label="Order Number Prefix *" field="orderPrefix" placeholder="e.g. DYG, FAB, TXT"
          note="3–6 uppercase letters. Will be auto-uppercased on save." />
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>PREVIEW</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', fontFamily: 'monospace' }}>{preview}</span>
          <button onClick={() => updatePreview(form.orderPrefix)}
            style={{ fontSize: 11, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>
            ↻ new sample
          </button>
        </div>
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF3C7', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
          ⚠️ Changing the prefix only affects <strong>new orders</strong> created after saving.
        </div>
      </div>

      {/* Factory Info */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Factory Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <Field label="Factory Name" field="factoryName" placeholder="e.g. ABC Dyeing Industries" />
          <Field label="City"         field="city"        placeholder="e.g. Surat" />
          <Field label="GST Number"   field="gstNumber"   placeholder="e.g. 24AAAAA0000A1Z5" />
          <Field label="Phone"        field="phone"       placeholder="e.g. +91 98765 43210" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '10px 24px', fontSize: 14, fontWeight: 700, border: 'none',
            borderRadius: 8, background: saving ? 'var(--bg-secondary)' : 'var(--accent)',
            color: saving ? 'var(--text-tertiary)' : '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        <Link href="/setup"><button style={{ padding: '10px 20px', fontSize: 14 }}>Cancel</button></Link>
      </div>
    </div>
  )
}
