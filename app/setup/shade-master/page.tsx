'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

// Shade groups in order (sorted by dye intensity)
const SHADE_GROUPS = ['White', 'Light', 'Medium', 'Dark']
const SHADE_COLORS: Record<string, string> = {
  White:  '#F5F5F5',
  Light:  '#BAE6FD',
  Medium: '#60A5FA',
  Dark:   '#1E3A5F',
}
const SHADE_TEXT: Record<string, string> = {
  White:  '#374151',
  Light:  '#1E40AF',
  Medium: '#1E40AF',
  Dark:   '#fff',
}

interface ShadeRule {
  id: string
  keyword: string      // colour name substring (case-insensitive)
  shadeGroup: string   // White | Light | Medium | Dark
}

const BUILTIN_RULES: ShadeRule[] = [
  { id: 'b1', keyword: 'white',   shadeGroup: 'White'  },
  { id: 'b2', keyword: 'bleach',  shadeGroup: 'White'  },
  { id: 'b3', keyword: 'optical', shadeGroup: 'White'  },
  { id: 'b4', keyword: 'light',   shadeGroup: 'Light'  },
  { id: 'b5', keyword: 'pale',    shadeGroup: 'Light'  },
  { id: 'b6', keyword: 'cream',   shadeGroup: 'Light'  },
  { id: 'b7', keyword: 'beige',   shadeGroup: 'Light'  },
  { id: 'b8', keyword: 'pastel',  shadeGroup: 'Light'  },
  { id: 'b9', keyword: 'dark',    shadeGroup: 'Dark'   },
  { id: 'b10', keyword: 'black',  shadeGroup: 'Dark'   },
  { id: 'b11', keyword: 'navy',   shadeGroup: 'Dark'   },
  { id: 'b12', keyword: 'deep',   shadeGroup: 'Dark'   },
  { id: 'b13', keyword: 'medium', shadeGroup: 'Medium' },
  { id: 'b14', keyword: 'normal', shadeGroup: 'Medium' },
]

function loadRules(): ShadeRule[] {
  try {
    const raw = localStorage.getItem('dyeflow_db')
    if (!raw) return []
    const db = JSON.parse(raw)
    return Array.isArray(db.shadeRules) ? db.shadeRules : []
  } catch { return [] }
}

function saveRules(rules: ShadeRule[]) {
  const raw = localStorage.getItem('dyeflow_db')
  const db = raw ? JSON.parse(raw) : {}
  db.shadeRules = rules
  localStorage.setItem('dyeflow_db', JSON.stringify(db))
  window.dispatchEvent(new Event('dyeflow-db-updated'))
}

function getShadeForColor(color: string, customRules: ShadeRule[]): string {
  const c = (color || '').toLowerCase()
  // Custom rules take priority (checked first)
  for (const rule of customRules) {
    if (c.includes(rule.keyword.toLowerCase())) return rule.shadeGroup
  }
  // Then built-in rules
  for (const rule of BUILTIN_RULES) {
    if (c.includes(rule.keyword.toLowerCase())) return rule.shadeGroup
  }
  return 'Medium'
}

export default function ShadeMasterPage() {
  const [rules, setRules] = useState<ShadeRule[]>([])
  const [newKeyword, setNewKeyword] = useState('')
  const [newGroup, setNewGroup] = useState<string>('Medium')
  const [testColor, setTestColor] = useState('')
  const [testResult, setTestResult] = useState('')
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ added: number; skipped: number; invalid: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setRules(loadRules())
  }, [])

  // ── Excel Upload ───────────────────────────────────────────────────────────
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert('Please upload an .xlsx, .xls, or .csv file.')
      return
    }
    setUploading(true)
    setUploadResult(null)
    try {
      if (file.name.match(/\.csv$/i)) {
        // Parse CSV
        const text = await file.text()
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
        importRows(lines.slice(1).map(line => {
          const parts = line.split(',')
          return [parts[0]?.replace(/"/g, '').trim(), parts[1]?.replace(/"/g, '').trim()]
        }))
      } else {
        // Parse XLSX using SheetJS loaded from CDN
        const buffer = await file.arrayBuffer()
        const XLSX = await import('xlsx')
        const wb = XLSX.read(buffer, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        // Skip header row, map Colour Name (col 0) + Type (col 1)
        importRows(data.slice(1).map(row => [String(row[0] || '').trim(), String(row[1] || '').trim()]))
      }
    } catch (err: any) {
      alert('Failed to read file: ' + (err.message || 'Unknown error'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const importRows = (rows: [string, string][]) => {
    const validGroups = ['white', 'light', 'medium', 'dark']
    const existing = loadRules()
    const existingKeywords = new Set(existing.map(r => r.keyword.toLowerCase()))

    let added = 0, skipped = 0, invalid = 0
    const newRules: ShadeRule[] = []
    const seen = new Set<string>()

    for (const [colourName, type] of rows) {
      const keyword = colourName.toLowerCase().trim()
      const groupRaw = type.toLowerCase().trim()

      if (!keyword) { invalid++; continue }

      // Normalize group: accept Light/Medium/Dark/White (case-insensitive)
      const groupMap: Record<string, string> = { white: 'White', light: 'Light', medium: 'Medium', dark: 'Dark' }
      const shadeGroup = groupMap[groupRaw]

      if (!shadeGroup) { invalid++; continue }

      // Skip duplicates within the file and duplicates vs existing rules
      if (seen.has(keyword) || existingKeywords.has(keyword)) { skipped++; continue }

      seen.add(keyword)
      existingKeywords.add(keyword)
      newRules.push({ id: `xl-${Date.now()}-${added}`, keyword, shadeGroup })
      added++
    }

    const merged = [...existing, ...newRules]
    setRules(merged)
    saveRules(merged)
    setUploadResult({ added, skipped, invalid })
    flash()
  }

  const addRule = () => {
    const kw = newKeyword.trim().toLowerCase()
    if (!kw) { alert('Keyword is required.'); return }
    if (rules.some(r => r.keyword.toLowerCase() === kw)) { alert(`Keyword "${kw}" already exists.`); return }
    const next = [...rules, { id: `cr-${Date.now()}`, keyword: kw, shadeGroup: newGroup }]
    setRules(next)
    saveRules(next)
    setNewKeyword('')
    flash()
  }

  const removeRule = (id: string) => {
    const next = rules.filter(r => r.id !== id)
    setRules(next)
    saveRules(next)
  }

  const updateGroup = (id: string, group: string) => {
    const next = rules.map(r => r.id === id ? { ...r, shadeGroup: group } : r)
    setRules(next)
    saveRules(next)
  }

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  const runTest = () => {
    if (!testColor.trim()) return
    const shade = getShadeForColor(testColor.trim(), rules)
    setTestResult(shade)
  }

  const ShadeBadge = ({ group }: { group: string }) => (
    <span style={{ background: SHADE_COLORS[group] || '#F3F4F6', color: SHADE_TEXT[group] || '#374151', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, border: '1px solid #E5E7EB' }}>
      {group}
    </span>
  )

  return (
    <div className="content" style={{ maxWidth: 780, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>🎨 Shade Rule Master</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Configure how colour names map to shade groups (White / Light / Medium / Dark). Used by Machine Sheets, AI Scheduler, and Production Kanban.
          </div>
        </div>
        <Link href="/setup"><button className="small">← Setup</button></Link>
      </div>

      {saved && (
        <div style={{ background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7', borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 12, fontWeight: 600 }}>
          ✓ Rules saved
        </div>
      )}

      {/* How it works */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 12, color: '#1E40AF' }}>
        <strong>How it works:</strong> When a colour name (e.g. "Navy Blue") is checked, each keyword is tested as a substring match (case-insensitive). The first matching rule wins. Custom rules below are checked <em>before</em> the built-in rules, so you can override defaults.
      </div>

      {/* Excel Upload */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '16px 20px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>📤 Import from Excel</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              Upload an <strong>.xlsx</strong> or <strong>.csv</strong> file with columns: <code style={{ background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 3 }}>Colour Name</code> and <code style={{ background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 3 }}>Type</code> (White / Light / Medium / Dark)
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelUpload}
              style={{ display: 'none' }}
              id="shade-excel-upload"
            />
            <label
              htmlFor="shade-excel-upload"
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 600,
                background: uploading ? 'var(--bg-secondary)' : 'var(--accent)',
                color: uploading ? 'var(--text-tertiary)' : '#fff',
                border: 'none', borderRadius: 6, cursor: uploading ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {uploading ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ animation: 'spin 0.8s linear infinite' }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  Importing…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Upload Excel / CSV
                </>
              )}
            </label>
          </div>
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div style={{
            display: 'flex', gap: 16, flexWrap: 'wrap',
            background: 'var(--bg-secondary)', borderRadius: 8,
            padding: '10px 14px', fontSize: 12, marginTop: 8,
          }}>
            <span style={{ color: '#065F46', fontWeight: 700 }}>✓ {uploadResult.added} rules added</span>
            {uploadResult.skipped > 0 && <span style={{ color: 'var(--text-tertiary)' }}>⏭ {uploadResult.skipped} skipped (duplicates)</span>}
            {uploadResult.invalid > 0 && <span style={{ color: 'var(--danger)' }}>⚠ {uploadResult.invalid} invalid rows (missing/unknown shade type)</span>}
          </div>
        )}
      </div>

      {/* Add new rule */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '16px 20px', marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Add Custom Rule</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Colour Keyword *</label>
            <input
              value={newKeyword}
              onChange={e => setNewKeyword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addRule() }}
              placeholder="e.g. sky, royal, olive"
              style={{ width: 200, padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-medium)', borderRadius: 6 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Shade Group *</label>
            <select
              value={newGroup}
              onChange={e => setNewGroup(e.target.value)}
              style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-medium)', borderRadius: 6 }}
            >
              {SHADE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <button
            onClick={addRule}
            style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 6, background: 'var(--accent)', color: '#fff', cursor: 'pointer', height: 38 }}
          >
            + Add Rule
          </button>
        </div>
      </div>

      {/* Custom rules */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Custom Rules ({rules.length})</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Checked before built-in rules</span>
        </div>
        {rules.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            No custom rules yet. Add one above to override built-in behaviour.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>KEYWORD</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SHADE GROUP</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CHANGE GROUP</th>
                <th style={{ padding: '8px 14px', width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)', background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, fontFamily: 'monospace' }}>{r.keyword}</td>
                  <td style={{ padding: '10px 14px' }}><ShadeBadge group={r.shadeGroup} /></td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {SHADE_GROUPS.map(g => (
                        <button key={g} onClick={() => updateGroup(r.id, g)} style={{ padding: '2px 8px', fontSize: 11, fontWeight: r.shadeGroup === g ? 700 : 400, border: `1px solid ${r.shadeGroup === g ? 'var(--accent)' : 'var(--border-medium)'}`, borderRadius: 4, background: r.shadeGroup === g ? 'var(--accent-light)' : 'var(--bg-primary)', cursor: 'pointer', color: r.shadeGroup === g ? 'var(--accent-dark)' : 'var(--text-secondary)' }}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => removeRule(r.id)} style={{ padding: '3px 10px', fontSize: 11, border: '1px solid #FCA5A5', borderRadius: 4, background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontWeight: 600 }}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Built-in rules (read-only reference) */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Built-in Rules</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Read-only · applied after custom rules</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '14px 16px' }}>
          {BUILTIN_RULES.map(r => (
            <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg-secondary)', padding: '3px 10px', borderRadius: 8, fontSize: 12, border: '1px solid var(--border-light)' }}>
              <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{r.keyword}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>→</span>
              <ShadeBadge group={r.shadeGroup} />
            </span>
          ))}
        </div>
      </div>

      {/* Test tool */}
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🧪 Test a Colour Name</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={testColor}
            onChange={e => setTestColor(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runTest() }}
            placeholder="e.g. Navy Blue, Light Pink, Dark Olive"
            style={{ flex: 1, maxWidth: 300, padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-medium)', borderRadius: 6 }}
          />
          <button onClick={runTest} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6, background: 'var(--bg-secondary)', cursor: 'pointer' }}>
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
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
