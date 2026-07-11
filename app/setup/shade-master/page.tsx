'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'

const SHADE_GROUPS = ['White', 'Light', 'Medium', 'Dark']
const SHADE_COLORS: Record<string, string> = { White: '#F5F5F5', Light: '#BAE6FD', Medium: '#60A5FA', Dark: '#1E3A5F' }
const SHADE_TEXT:   Record<string, string> = { White: '#374151', Light: '#1E40AF', Medium: '#1E40AF', Dark: '#fff' }

interface ShadeRule { id: string; keyword: string; shadeGroup: string }

const BUILTIN_RULES: ShadeRule[] = [
  { id: 'b1', keyword: 'white',   shadeGroup: 'White'  }, { id: 'b2', keyword: 'bleach',  shadeGroup: 'White'  },
  { id: 'b3', keyword: 'optical', shadeGroup: 'White'  }, { id: 'b4', keyword: 'light',   shadeGroup: 'Light'  },
  { id: 'b5', keyword: 'pale',    shadeGroup: 'Light'  }, { id: 'b6', keyword: 'cream',   shadeGroup: 'Light'  },
  { id: 'b7', keyword: 'beige',   shadeGroup: 'Light'  }, { id: 'b8', keyword: 'pastel',  shadeGroup: 'Light'  },
  { id: 'b9', keyword: 'dark',    shadeGroup: 'Dark'   }, { id: 'b10', keyword: 'black',  shadeGroup: 'Dark'   },
  { id: 'b11', keyword: 'navy',   shadeGroup: 'Dark'   }, { id: 'b12', keyword: 'deep',   shadeGroup: 'Dark'   },
  { id: 'b13', keyword: 'medium', shadeGroup: 'Medium' }, { id: 'b14', keyword: 'normal', shadeGroup: 'Medium' },
]

function getShade(color: string, custom: ShadeRule[]): string {
  const c = (color || '').toLowerCase()
  for (const r of custom) { if (c.includes(r.keyword.toLowerCase())) return r.shadeGroup }
  for (const r of BUILTIN_RULES) { if (c.includes(r.keyword.toLowerCase())) return r.shadeGroup }
  return 'Medium'
}

const ShadeBadge = ({ group }: { group: string }) => (
  <span style={{ background: SHADE_COLORS[group] || '#F3F4F6', color: SHADE_TEXT[group] || '#374151',
    padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, border: '1px solid #E5E7EB' }}>
    {group}
  </span>
)

export default function ShadeMasterPage() {
  const [rules,      setRules]      = useState<ShadeRule[]>([])
  const [loading,    setLoading]    = useState(true)
  const [newKw,      setNewKw]      = useState('')
  const [newGroup,   setNewGroup]   = useState('Medium')
  const [testColor,  setTestColor]  = useState('')
  const [testResult, setTestResult] = useState('')
  const [saved,      setSaved]      = useState(false)
  const [importing,  setImporting]  = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadRules = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/setup/settings?key=shadeRules', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) setRules(Array.isArray(data.value) ? data.value : [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadRules() }, [loadRules])

  const persist = async (updated: ShadeRule[]) => {
    setRules(updated)
    await fetch('/api/setup/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'shadeRules', value: updated }),
    })
    // Also sync to localStorage for backward compat
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('dyeflow_db')
        const db  = raw ? JSON.parse(raw) : {}
        db.shadeRules = updated
        localStorage.setItem('dyeflow_db', JSON.stringify(db))
      } catch {}
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const addRule = async () => {
    const kw = newKw.trim().toLowerCase()
    if (!kw) { alert('Keyword required.'); return }
    if (rules.some(r => r.keyword.toLowerCase() === kw)) { alert(`"${kw}" already exists.`); return }
    await persist([...rules, { id: `cr-${Date.now()}`, keyword: kw, shadeGroup: newGroup }])
    setNewKw('')
  }

  const removeRule = async (id: string) => { await persist(rules.filter(r => r.id !== id)) }

  const updateGroup = async (id: string, group: string) => {
    await persist(rules.map(r => r.id === id ? { ...r, shadeGroup: group } : r))
  }

  const importRows = async (rows: [string, string][]) => {
    const validMap: Record<string, string> = { white: 'White', light: 'Light', medium: 'Medium', dark: 'Dark' }
    const existing = new Set(rules.map(r => r.keyword.toLowerCase()))
    let added = 0, skipped = 0, invalid = 0
    const newRules: ShadeRule[] = []
    const seen = new Set<string>()
    for (const [col, type] of rows) {
      const kw = (col || '').toLowerCase().trim()
      const sg = validMap[(type || '').toLowerCase().trim()]
      if (!kw)  { invalid++; continue }
      if (!sg)  { invalid++; continue }
      if (seen.has(kw) || existing.has(kw)) { skipped++; continue }
      seen.add(kw); existing.add(kw)
      newRules.push({ id: `xl-${Date.now()}-${added}`, keyword: kw, shadeGroup: sg })
      added++
    }
    await persist([...rules, ...newRules])
    alert(`✅ Added ${added} rules${skipped ? `, ${skipped} skipped` : ''}${invalid ? `, ${invalid} invalid` : ''}`)
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    if (file.name.endsWith('.csv')) {
      const text = await file.text()
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      importRows(lines.slice(1).map(line => {
        const p = line.split(',')
        return [p[0]?.replace(/"/g,'').trim(), p[1]?.replace(/"/g,'').trim()] as [string, string]
      }))
    } else {
      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array' })
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as any[][]
      importRows(data.slice(1).map(row => [String(row[0]||'').trim(), String(row[1]||'').trim()] as [string, string]))
    }
  }

  return (
    <div className="content" style={{ maxWidth: 780, margin: '0 auto', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🎨 Shade Rule Master</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Configure how colour names map to shade groups. Used by Machine Sheets, AI Scheduler, and Kanban.
          </div>
        </div>
        <Link href="/setup"><button className="small">← Setup</button></Link>
      </div>

      {saved && (
        <div style={{ background: 'var(--success-light)', color: 'var(--success)', border: '1px solid #6EE7B7',
          borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 12, fontWeight: 600 }}>✓ Rules saved to Supabase</div>
      )}

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10,
        padding: '12px 16px', marginBottom: 18, fontSize: 12, color: '#1E40AF' }}>
        <strong>How it works:</strong> Each keyword is tested as a case-insensitive substring of the colour name. First match wins. Custom rules are checked before built-in rules.
      </div>

      {/* Import */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10,
        padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>📤 Import from Excel</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Columns: <code>Colour Name</code> | <code>Type</code> (White / Light / Medium / Dark)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
              background: importing ? 'var(--bg-secondary)' : 'var(--accent)', color: importing ? 'var(--text-tertiary)' : '#fff', cursor: importing ? 'not-allowed' : 'pointer' }}>
            {importing ? 'Importing…' : '⬆ Upload Excel / CSV'}
          </button>
        </div>
      </div>

      {/* Add rule */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        borderRadius: 10, padding: '14px 18px', marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Add Custom Rule</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>Keyword *</label>
            <input value={newKw} onChange={e => setNewKw(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addRule() }}
              placeholder="e.g. sky, royal, olive"
              style={{ width: 200, padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-medium)',
                borderRadius: 6, background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase' }}>Shade Group *</label>
            <select value={newGroup} onChange={e => setNewGroup(e.target.value)}
              style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-medium)', borderRadius: 6,
                background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
              {SHADE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <button onClick={addRule}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 6,
              background: 'var(--accent)', color: '#fff', cursor: 'pointer', height: 36 }}>
            + Add Rule
          </button>
        </div>
      </div>

      {/* Custom rules */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Custom Rules ({loading ? '…' : rules.length})</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Checked before built-in rules</span>
        </div>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : rules.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            No custom rules. Add above to override built-in behaviour.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--bg-secondary)' }}>
              <tr>
                {['Keyword','Shade Group','Change Group',''].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                    color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border-light)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)',
                  background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, fontFamily: 'monospace' }}>{r.keyword}</td>
                  <td style={{ padding: '10px 14px' }}><ShadeBadge group={r.shadeGroup} /></td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {SHADE_GROUPS.map(g => (
                        <button key={g} onClick={() => updateGroup(r.id, g)}
                          style={{ padding: '2px 8px', fontSize: 11, fontWeight: r.shadeGroup === g ? 700 : 400,
                            border: `1px solid ${r.shadeGroup === g ? 'var(--accent)' : 'var(--border-medium)'}`,
                            borderRadius: 4, cursor: 'pointer',
                            background: r.shadeGroup === g ? 'var(--accent-light)' : 'var(--bg-primary)',
                            color: r.shadeGroup === g ? 'var(--accent-dark)' : 'var(--text-secondary)' }}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => removeRule(r.id)}
                      style={{ padding: '3px 10px', fontSize: 11, border: '1px solid #FCA5A5',
                        borderRadius: 4, background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontWeight: 600 }}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Built-in rules */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Built-in Rules</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Read-only · applied after custom rules</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 14px' }}>
          {BUILTIN_RULES.map(r => (
            <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'var(--bg-secondary)', padding: '3px 10px', borderRadius: 8,
              fontSize: 12, border: '1px solid var(--border-light)' }}>
              <span style={{ fontFamily: 'monospace' }}>{r.keyword}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>→</span>
              <ShadeBadge group={r.shadeGroup} />
            </span>
          ))}
        </div>
      </div>

      {/* Test tool */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 18px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🧪 Test a Colour Name</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={testColor} onChange={e => setTestColor(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setTestResult(getShade(testColor, rules)) }}
            placeholder="e.g. Navy Blue, Light Pink, Dark Olive"
            style={{ flex: 1, maxWidth: 300, padding: '7px 10px', fontSize: 13,
              border: '1px solid var(--border-medium)', borderRadius: 6,
              background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          <button onClick={() => setTestResult(getShade(testColor, rules))}
            style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
              background: 'var(--bg-secondary)', cursor: 'pointer', color: 'var(--text-primary)' }}>
            Test
          </button>
          {testResult && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--text-tertiary)' }}>"{testColor}" →</span>
              <ShadeBadge group={testResult} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
