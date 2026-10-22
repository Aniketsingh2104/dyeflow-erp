'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { AUTO_REFRESH_OPTIONS, resetAutoRefreshCache } from '@/components/useAutoRefresh'

interface FactorySettings {
  orderPrefix: string
  factoryName: string
  city: string
  gstNumber: string
  phone: string
  /** Sundays are non-working days for the Date Calculator and machine sheets */
  sundayHoliday: boolean
  /** Auto Split loading (lib/loading.ts) */
  elongationPct: string
  cycleTimeMin: string
  minLoadPct: string
  maxLoadPct: string
  /** floor sheets re-fetch by themselves every N seconds (0 = off) — components/useAutoRefresh.tsx */
  autoRefreshSec: number
}

const DEFAULTS: FactorySettings = {
  orderPrefix: 'DYG', factoryName: '', city: '', gstNumber: '', phone: '', sundayHoliday: true,
  elongationPct: '14', cycleTimeMin: '1.7', minLoadPct: '60', maxLoadPct: '80', autoRefreshSec: 30,
}

// Defined OUTSIDE the page component — a component defined inside render is a
// new component on every keystroke, so the input lost focus after each letter.
function Field({ label, value, onChange, placeholder, note }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; note?: string
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', maxWidth: 340, padding: '8px 12px', fontSize: 14,
          border: '1px solid var(--border-medium)', borderRadius: 6,
          background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      />
      {note && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{note}</div>}
    </div>
  )
}

export default function FactorySettingsPage() {
  const [form,    setForm]    = useState<FactorySettings>(DEFAULTS)
  const [saved,   setSaved]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/setup/settings?key=factory', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok && data.value) {
        const s = { ...DEFAULTS, ...data.value }
        for (const k of ['elongationPct', 'cycleTimeMin', 'minLoadPct', 'maxLoadPct'] as const) s[k] = String(s[k] ?? DEFAULTS[k])
        s.autoRefreshSec = Number.isFinite(Number(s.autoRefreshSec)) ? Number(s.autoRefreshSec) : 30
        setForm(s)
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = (field: keyof FactorySettings, value: string | boolean | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    const clean = { ...form }
    const LABEL = { elongationPct: 'Elongation %', cycleTimeMin: 'Cycle time', minLoadPct: 'Min batch load %', maxLoadPct: 'Max batch load %' }
    for (const [k, lo, hi] of [['elongationPct', 0, 50], ['cycleTimeMin', 0.5, 10], ['minLoadPct', 10, 100], ['maxLoadPct', 10, 100]] as const) {
      const n = parseFloat(String(clean[k]))
      if (!isFinite(n) || n < lo || n > hi) { alert(`${LABEL[k]} must be between ${lo} and ${hi}.`); return }
    }
    if (parseFloat(clean.minLoadPct) > parseFloat(clean.maxLoadPct)) { alert('Min batch load % must not be more than Max batch load %.'); return }
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
      resetAutoRefreshCache()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      alert(`Save failed: ${err}`)
    } finally { setSaving(false) }
  }

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
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>Factory details used on reports and print-outs</div>
        </div>
        <Link href="/setup"><button className="small">← Setup</button></Link>
      </div>

      {saved && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)', border: '1px solid #6EE7B7',
          borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          ✓ Settings saved
        </div>
      )}

      {/* Order Number Format */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Order Number Format</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Order numbers are given by the database as{' '}
          <code style={{ background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 4 }}>DYE{String(new Date().getFullYear()).slice(2)}-0001</code>,
          {' '}one after another and never repeated, even when two people save at the same time.
          The year part changes by itself every January.
        </div>
      </div>

      {/* Factory Info */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Factory Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <Field label="Factory Name" value={form.factoryName} onChange={v => handleChange('factoryName', v)} placeholder="e.g. ABC Dyeing Industries" />
          <Field label="City" value={form.city} onChange={v => handleChange('city', v)} placeholder="e.g. Surat" />
          <Field label="GST Number" value={form.gstNumber} onChange={v => handleChange('gstNumber', v)} placeholder="e.g. 24AAAAA0000A1Z5" />
          <Field label="Phone" value={form.phone} onChange={v => handleChange('phone', v)} placeholder="e.g. +91 98765 43210" />
        </div>
      </div>

      {/* Working days */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Working Days</div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={form.sundayHoliday !== false}
            onChange={e => handleChange('sundayHoliday', e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            <strong>Sunday is a holiday</strong>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
              The Date Calculator and the machine sheets skip every Sunday (plus the dates in Holiday Master).
              If the factory works some Sundays, switch this off and add the Sundays you are closed to Holiday Master.
            </span>
          </span>
        </label>
      </div>

      {/* Auto Split — machine loading */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Auto Split — Machine Loading</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>
          Batches are split equally so each one is between machine size × min load % and × max load %.
          Loading Std Qty (cycle time × reel speed × nozzles ÷ hot length) is shown for information.
        </div>
        <Field label="Elongation (Hot length) %" value={form.elongationPct} onChange={v => handleChange('elongationPct', v)} placeholder="14" note="Default 14 %" />
        <Field label="Cycle time (min)" value={form.cycleTimeMin} onChange={v => handleChange('cycleTimeMin', v)} placeholder="1.7" note="Default 1.7" />
        <Field label="Min batch load %" value={form.minLoadPct} onChange={v => handleChange('minLoadPct', v)} placeholder="60" note="Default 60 % of the machine size (Capacity)" />
        <Field label="Max batch load %" value={form.maxLoadPct} onChange={v => handleChange('maxLoadPct', v)} placeholder="80" note="Default 80 % of the machine size (Capacity)" />
      </div>

      {/* Auto refresh */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Auto Refresh</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
          Floor sheets (Dashboard, Orders, Machine / FMS / Supervisor sheets, Faulty, FOB…) fetch fresh data by themselves while the tab is open,
          and straight away when you come back to the tab. Paused while a dialog is open or you are typing. Setup pages still use the ↻ button.
        </div>
        <select value={form.autoRefreshSec} onChange={e => handleChange('autoRefreshSec', Number(e.target.value) as any)}
          style={{ width: 240, padding: '8px 10px', fontSize: 13, border: '1px solid var(--border-medium)', borderRadius: 6, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
          {AUTO_REFRESH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Default: every 30 seconds. Open tabs pick up a change within 10 minutes, or on their next page load.</div>
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
