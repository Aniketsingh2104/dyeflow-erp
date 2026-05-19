'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'

// Colour palette — assigned to supervisors in order
const SUP_PALETTE = [
  '#185FA5', '#1D9E75', '#D85A30', '#7C3AED',
  '#D97706', '#BE185D', '#0E7490', '#059669',
]

// Build a name → colour map from a list of supervisor names
function buildSupColors(names: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  names.forEach((name, i) => { map[name] = SUP_PALETTE[i % SUP_PALETTE.length] })
  return map
}

export default function ArticleMasterPage() {
  const [mounted, setMounted] = useState(false)
  const [articleMap, setArticleMap] = useState<Record<string, string>>({})
  const [knownArticles, setKnownArticles] = useState<string[]>([])
  const [supervisors, setSupervisors] = useState<string[]>([])
  const [supColors, setSupColors] = useState<Record<string, string>>({})
  const [importStatus, setImportStatus] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [prefillArticle, setPrefillArticle] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(() => {
    if (typeof window === 'undefined') return
    
    const stored = localStorage.getItem('dyeflow_db')
    if (stored) {
      const db = JSON.parse(stored)
      setArticleMap(db.articleSupervisorMap || {})
      
      // ── Dynamic supervisors from db.supervisors[] ──────────────────────────────────
      let supNames: string[] = []
      if (db.supervisors && Array.isArray(db.supervisors) && db.supervisors.length > 0) {
        supNames = db.supervisors.map((s: any) => s.name).filter(Boolean)
      } else {
        // Fallback: extract unique supervisor names from existing orders
        supNames = [...new Set(
          (db.orders || []).map((o: any) => o.supervisor).filter(Boolean)
        )] as string[]
      }
      setSupervisors(supNames)
      setSupColors(buildSupColors(supNames))

      // Get all unique articles from orders
      const articles = [...new Set((db.orders || []).map((o: any) => o.article).filter(Boolean))]
      setKnownArticles(articles as string[])
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    loadData()
  }, [loadData])

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportStatus('Reading file…')

    const processData = (rows: any[]) => {
      if (rows.length < 2) {
        setImportStatus('❌ File appears empty.')
        return
      }

      let imported = 0, skipped = 0

      const stored = localStorage.getItem('dyeflow_db')
      const db = stored ? JSON.parse(stored) : { articleSupervisorMap: {} }
      if (!db.articleSupervisorMap) db.articleSupervisorMap = {}

      // Process data rows (skip header row)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const art = row[0] ? String(row[0]).trim() : ''
        const sup = row[1] ? String(row[1]).trim() : ''
        
        if (!art || !sup) {
          skipped++
          continue
        }

        // Fuzzy match supervisor name against db.supervisors[]
        const matchedSup = supervisors.find(s => s.toLowerCase() === sup.toLowerCase()) || sup
        db.articleSupervisorMap[art] = matchedSup
        imported++
      }

      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      setImportStatus(`✅ Imported ${imported} mappings${skipped ? `, ${skipped} skipped` : ''}`)
      loadData()

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      setTimeout(() => setImportStatus(''), 5000)
    }

    if (file.name.endsWith('.csv')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result) {
          const csvText = e.target.result as string
          const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
          const rows = lines.map(line => {
            return line.split(',').map(c => c.replace(/"/g, '').trim())
          })
          processData(rows)
        }
      }
      reader.onerror = () => {
        setImportStatus('❌ Error reading file.')
      }
      reader.readAsText(file)
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      // Handle Excel files
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          if (!e.target?.result) {
            setImportStatus('❌ Error reading file.')
            return
          }

          const data = new Uint8Array(e.target.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          
          const firstSheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[firstSheetName]
          
          // Convert to array of arrays
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[]
          
          processData(rows)
        } catch (error) {
          console.error('Excel parsing error:', error)
          setImportStatus('❌ Error parsing Excel file.')
        }
      }
      reader.onerror = () => {
        setImportStatus('❌ Error reading file.')
      }
      reader.readAsArrayBuffer(file)
    } else {
      setImportStatus('❌ Please use Excel (.xlsx, .xls) or CSV format.')
    }
  }, [loadData])

  const openAddModal = useCallback((article?: string) => {
    setPrefillArticle(article || '')
    setIsModalOpen(true)
  }, [])

  const saveMapping = useCallback(() => {
    const articleInput = document.getElementById('map-article') as HTMLInputElement
    const supervisorSelect = document.getElementById('map-supervisor') as HTMLSelectElement

    const art = articleInput?.value.trim()
    const sup = supervisorSelect?.value

    if (!art) {
      alert('Please enter an article name.')
      return
    }
    if (!sup) {
      alert('Please select a supervisor.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { articleSupervisorMap: {} }
    if (!db.articleSupervisorMap) db.articleSupervisorMap = {}

    db.articleSupervisorMap[art] = sup
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    
    loadData()
    setIsModalOpen(false)
    setPrefillArticle('')
  }, [loadData])

  const deleteMapping = useCallback((article: string) => {
    if (!confirm(`Remove mapping for "${article}"?`)) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    delete db.articleSupervisorMap[article]
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }, [loadData])

  const getOrderCount = useCallback((article: string, supervisor: string) => {
    if (!mounted || typeof window === 'undefined') return 0
    
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return 0
    
    const db = JSON.parse(stored)
    return (db.orders || []).filter((o: any) => o.article === article && o.supervisor === supervisor).length
  }, [mounted])

  const getSupervisorOrders = useCallback((supervisor: string) => {
    if (!mounted || typeof window === 'undefined') {
      return { mapped: [], total: 0, active: 0 }
    }
    
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) {
      return { mapped: [], total: 0, active: 0 }
    }

    const db = JSON.parse(stored)
    const mapped = Object.entries(db.articleSupervisorMap || {})
      .filter(([, s]) => s === supervisor)
      .map(([a]) => a)
    
    const orders = (db.orders || []).filter((o: any) => o.supervisor === supervisor)
    const active = orders.filter((o: any) => !['done'].includes(o.status)).length

    return { mapped, total: orders.length, active }
  }, [mounted])

  const entries = useMemo(() => Object.entries(articleMap), [articleMap])

  // Show loading state until mounted
  if (!mounted) {
    return (
      <div className="content" style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="content">
      {/* Import Section - Horizontal Compact Layout */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          gap: '24px',
          padding: '20px'
        }}>
          {/* Left Content */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '16px' }}>📄</span>
              <span className="card-title" style={{ margin: 0 }}>Import Mapping from Excel / CSV</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.5 }}>
              Upload an Excel or CSV file with two columns: <strong>Article</strong> and <strong>Master Name</strong> (or Supervisor). All mappings will be imported at once.
            </p>
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              fontFamily: 'monospace',
              display: 'inline-block'
            }}>
              Column A: Article &nbsp;|&nbsp; Column B: Master Name
            </div>
          </div>

          {/* Right Content - Button & Status */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'flex-end',
            gap: '8px',
            minWidth: '200px'
          }}>
            {importStatus && (
              <span style={{ 
                fontSize: '12px',
                fontWeight: 500,
                color: importStatus.startsWith('✅') ? 'var(--success)' : importStatus.startsWith('❌') ? 'var(--danger)' : 'var(--text-secondary)' 
              }}>
                {importStatus}
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              style={{ 
                background: '#137E43',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              📄 Upload Excel / CSV
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* Article → Supervisor Mapping */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', maxHeight: '450px' }}>
          <div className="card-header" style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="card-title">Article → Supervisor Mapping</span>
              <span style={{ 
                fontSize: '11px', 
                color: 'var(--text-tertiary)',
                background: 'var(--bg-secondary)',
                padding: '2px 8px',
                borderRadius: '10px',
                fontWeight: 600
              }}>
                {entries.length} mappings
              </span>
            </div>
            <button 
              onClick={() => openAddModal()}
              style={{ 
                background: '#137E43',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              + Add Mapping
            </button>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', padding: '0 20px' }}>
            When an order is received for an article listed here, it is <strong>automatically assigned</strong> to the mapped supervisor.
          </p>
          {entries.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 20px', margin: '0 20px' }}>
              No mappings yet. Upload Excel or click "+ Add Mapping" above.
            </div>
          ) : (
            <div style={{ 
              flex: 1, 
              overflowY: 'auto',
              minHeight: 0
            }}>
              <table style={{ width: '100%', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '35%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '17%' }} />
                </colgroup>
                <thead style={{ 
                  position: 'sticky', 
                  top: 0, 
                  zIndex: 10,
                  background: 'var(--bg-secondary)'
                }}>
                  <tr>
                    <th style={{ padding: '10px 20px', textAlign: 'left' }}>Article</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Supervisor</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Auto-Assigned</th>
                    <th style={{ padding: '10px 20px 10px 12px', textAlign: 'left' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(([art, sup]) => {
                    const count = getOrderCount(art, sup)
                    const col = supColors[sup] || '#185FA5'
                    return (
                      <tr key={art}>
                        <td style={{ 
                          fontWeight: 500, 
                          padding: '12px 20px',
                          wordBreak: 'break-word',
                          lineHeight: 1.4
                        }}>
                          {art}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            background: `${col}18`,
                            color: col,
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap'
                          }}>
                            {sup}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px' }}>{count} order{count !== 1 ? 's' : ''}</td>
                        <td style={{ padding: '12px 20px 12px 12px' }}>
                          <button 
                            className="xs danger" 
                            onClick={() => deleteMapping(art)}
                            style={{ fontSize: '12px', padding: '4px 12px' }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Supervisor Load Summary */}
        <div className="card" style={{ maxHeight: '450px', display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ flexShrink: 0 }}>
            <span className="card-title">Supervisor Load Summary</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px 20px' }}>
            {supervisors.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                No supervisors configured yet.{' '}
                <a href="/setup/supervisor-master" style={{ color: 'var(--accent)' }}>Go to Supervisor Master →</a>
              </div>
            ) : (
              supervisors.map((sup, index) => {
                const { mapped, active } = getSupervisorOrders(sup)
                const col = supColors[sup] || '#185FA5'
                
                return (
                  <div key={sup} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 0',
                    borderBottom: index < supervisors.length - 1 ? '1px solid var(--border-light)' : 'none'
                  }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: `${col}18`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: col,
                      flexShrink: 0
                    }}>
                      {sup[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{sup}</div>
                      <div style={{ 
                        fontSize: '11px', 
                        color: 'var(--text-tertiary)',
                        lineHeight: 1.4,
                        wordBreak: 'break-word'
                      }}>
                        {mapped.length > 0 ? `Articles: ${mapped.join(', ')}` : 'No articles mapped'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, paddingTop: '4px' }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: col }}>{active}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>active</div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Quick Setup - All Known Articles */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Quick Setup - All Known Articles</span>
          <button 
            onClick={() => window.location.href = '/orders'}
            style={{ 
              background: '#137E43',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            ↻ Sync to Orders
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0 20px 20px 20px' }}>
          {knownArticles.length === 0 ? (
            <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
              No orders in system yet to detect articles from.
            </span>
          ) : (
            knownArticles.map(art => {
              const sup = articleMap[art]
              const col = sup ? (supColors[sup] || '#185FA5') : '#888'
              
              return (
                <div
                  key={art}
                  style={{
                    border: `1.5px solid ${col}40`,
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    background: sup ? `${col}05` : 'var(--bg-secondary)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onClick={() => openAddModal(art)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${col}15`
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = sup ? `${col}05` : 'var(--bg-secondary)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{art}</span>
                  <span style={{ color: col, fontWeight: 600 }}>→</span>
                  {sup ? (
                    <span style={{ color: col, fontWeight: 700, fontSize: '11px' }}>
                      {sup}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                      unmapped
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Add Mapping Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Article → Supervisor Mapping</span>
              <button className="small" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Once saved, any new order with this article will be <strong>automatically assigned</strong> to the selected supervisor.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group">
                <label>Article Name</label>
                <input
                  id="map-article"
                  defaultValue={prefillArticle}
                  placeholder="e.g. A-2069/N/72"
                  list="article-list"
                />
                <datalist id="article-list">
                  {knownArticles.map(a => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label>Assign to Supervisor</label>
                <select id="map-supervisor">
                  <option value="">-- Select Supervisor --</option>
                  {supervisors.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <button 
              onClick={saveMapping}
              style={{ 
                width: '100%',
                background: '#137E43',
                color: 'white',
                border: 'none',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              ✓ Save Mapping
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
