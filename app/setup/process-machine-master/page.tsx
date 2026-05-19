'use client'

import { useEffect, useState, useRef } from 'react'
import { loadOrSeedProcessList, ProcessDef } from '@/lib/processMap'

export default function ProcessMasterPage() {
  const [rules, setRules] = useState<any>({})
  const [knownArticles, setKnownArticles] = useState<string[]>([])
  const [processList, setProcessList] = useState<ProcessDef[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingArticle, setEditingArticle] = useState('')
  const [formData, setFormData] = useState({ article: '', processRoute: [] as string[] })
  const [importStatus, setImportStatus] = useState('')
  const [intelligenceLoaded, setIntelligenceLoaded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    // Load process list from db (user-managed), seed defaults if empty
    const list = loadOrSeedProcessList()
    setProcessList(list.filter(p => p.enabled).sort((a, b) => a.order - b.order))

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    setRules(db.articleProcessMap || {})
    setIntelligenceLoaded(!!(db.processIntelligenceLoaded))

    // Get known articles from orders and article mappings
    const articles = [...new Set([
      ...(db.orders || []).map((o: any) => o.article),
      ...Object.keys(db.articleSupervisorMap || {})
    ])].filter(Boolean)
    setKnownArticles(articles)
  }

  const handleImportIntelligence = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.json')) {
      setImportStatus('❌ Please upload a .json file.')
      setTimeout(() => setImportStatus(''), 3000)
      return
    }

    setImportStatus('Reading intelligence file...')

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        if (!e.target?.result) {
          setImportStatus('❌ Error reading file.')
          return
        }

        const jsonData = JSON.parse(e.target.result as string)
        
        if (typeof jsonData !== 'object') {
          setImportStatus('❌ Invalid JSON format. Expected object with article names as keys.')
          setTimeout(() => setImportStatus(''), 5000)
          return
        }

        const stored = localStorage.getItem('dyeflow_db')
        const db = stored ? JSON.parse(stored) : { articleProcessMap: {} }
        if (!db.articleProcessMap) db.articleProcessMap = {}

        let imported = 0
        let skipped = 0

        Object.entries(jsonData).forEach(([article, data]: [string, any]) => {
          if (!article || !data) {
            skipped++
            return
          }

          let processRoute: string[] = []

          // Handle two formats:
          // Format 1: { "processRoute": ["C", "S", "D"] }
          // Format 2: { "r": "C/S/D" } or just array of process codes
          
          if (Array.isArray(data)) {
            // Direct array format
            processRoute = data.map((code: string) => code.trim()).filter(Boolean)
          } else if (data.processRoute && Array.isArray(data.processRoute)) {
            // Standard format with processRoute field
            processRoute = data.processRoute
          } else if (data.r || data.route) {
            // Compact format with "r" or "route" field
            const routeStr = data.r || data.route
            processRoute = routeStr.split('/').map((code: string) => code.trim()).filter(Boolean)
          }

          // Only import if we have a valid process route
          if (processRoute.length > 0) {
            db.articleProcessMap[article] = processRoute
            imported++
          } else {
            skipped++
          }
        })

        db.processIntelligenceLoaded = true
        localStorage.setItem('dyeflow_db', JSON.stringify(db))
        
        setImportStatus(`✅ Imported ${imported} article rules${skipped > 0 ? `, ${skipped} skipped` : ''}`)
        setIntelligenceLoaded(true)
        loadData()

        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }

        setTimeout(() => setImportStatus(''), 5000)
      } catch (error) {
        console.error('JSON parsing error:', error)
        setImportStatus('❌ Error parsing JSON file. Please check the file format.')
        setTimeout(() => setImportStatus(''), 5000)
      }
    }
    reader.onerror = () => {
      setImportStatus('❌ Error reading file.')
      setTimeout(() => setImportStatus(''), 3000)
    }
    reader.readAsText(file)
  }

  const saveRule = () => {
    if (!formData.article.trim()) {
      alert('Please enter an article name.')
      return
    }

    if (formData.processRoute.length === 0) {
      alert('Please select at least one process.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { articleProcessMap: {} }
    if (!db.articleProcessMap) db.articleProcessMap = {}

    db.articleProcessMap[formData.article.trim()] = formData.processRoute

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
    closeModal()
  }

  const deleteRule = (article: string) => {
    if (!confirm(`Remove process route for "${article}"?`)) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    delete db.articleProcessMap[article]
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const openAddModal = (article?: string) => {
    setEditingArticle(article || '')
    const existing = article && rules[article] ? rules[article] : []
    setFormData({
      article: article || '',
      processRoute: Array.isArray(existing) ? existing : []
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingArticle('')
  }

  const toggleProcess = (code: string) => {
    setFormData(prev => ({
      ...prev,
      processRoute: prev.processRoute.includes(code)
        ? prev.processRoute.filter(c => c !== code)
        : [...prev.processRoute, code]
    }))
  }

  const ruleEntries = Object.entries(rules)

  return (
    <div className="content">
      {/* Import Intelligence Section - Compact Horizontal Layout */}
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
              <span className="card-title" style={{ margin: 0 }}>Import Intelligence from JSON</span>
              {intelligenceLoaded && (
                <span style={{ 
                  fontSize: '11px', 
                  background: '#EAF3DE', 
                  color: '#27500A', 
                  padding: '3px 8px', 
                  borderRadius: '10px',
                  fontWeight: 600
                }}>
                  ✓ Loaded
                </span>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.5 }}>
              Upload <strong>article_process_routes.json</strong> file to enable intelligent process route suggestions for known articles. This will automatically configure rules based on historical data.
            </p>
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              fontFamily: 'monospace',
              display: 'inline-block'
            }}>
              Format: {'"Article": ["S", "D", "F"]'}
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
              accept=".json"
              onChange={handleImportIntelligence}
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
              📄 Upload JSON File
            </button>
          </div>
        </div>
      </div>

      {/* Rules Table */}
      <div className="card" style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', maxHeight: '450px' }}>
        <div className="card-header" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="card-title">Article → Process Route Rules</span>
            <span style={{ 
              fontSize: '11px', 
              color: 'var(--text-tertiary)',
              background: 'var(--bg-secondary)',
              padding: '2px 8px',
              borderRadius: '10px',
              fontWeight: 600
            }}>
              {ruleEntries.length} rules
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
            + Add Rule
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', padding: '0 20px' }}>
          When a supervisor sets the process route for an order, these defaults will be <strong>pre-filled automatically</strong> based on the article.
        </p>

        {ruleEntries.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px 20px', margin: '0 20px' }}>
            No rules yet. Upload JSON or click "+ Add Rule" above to get started.
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <table style={{ width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '35%' }} />
                <col style={{ width: '50%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead style={{ 
                position: 'sticky', 
                top: 0, 
                zIndex: 10,
                background: 'var(--bg-secondary)'
              }}>
                <tr>
                  <th style={{ padding: '10px 20px', textAlign: 'left' }}>Article</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Default Process Route</th>
                  <th style={{ padding: '10px 20px 10px 12px', textAlign: 'left' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ruleEntries.map(([article, processRoute]: [string, any]) => {
                  const route = Array.isArray(processRoute) ? processRoute : []
                  return (
                    <tr key={article}>
                      <td style={{ 
                        fontWeight: 500, 
                        padding: '12px 20px',
                        wordBreak: 'break-word',
                        lineHeight: 1.4
                      }}>
                        {article}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {route.length > 0 ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {route.map((code: string, idx: number) => (
                              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{
                                  background: '#E6F0FF',
                                  color: '#3366CC',
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600
                                }}>
                                  {code}
                                </span>
                                {idx < route.length - 1 && (
                                  <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>→</span>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 20px 12px 12px', whiteSpace: 'nowrap' }}>
                        <button 
                          className="xs" 
                          onClick={() => openAddModal(article)}
                          style={{ fontSize: '12px', padding: '4px 12px', marginRight: '4px' }}
                        >
                          Edit
                        </button>
                        <button 
                          className="xs danger" 
                          onClick={() => deleteRule(article)}
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
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', padding: '0 20px' }}>
          Click any article to configure its process route.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0 20px 20px 20px' }}>
          {knownArticles.length === 0 ? (
            <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
              No articles found. Add orders or supervisor mappings first.
            </span>
          ) : (
            knownArticles.map(article => {
              const rule = rules[article]
              const complete = rule && Array.isArray(rule) && rule.length > 0
              const col = complete ? '#1D9E75' : '#888'
              
              return (
                <div
                  key={article}
                  style={{
                    border: `1.5px solid ${complete ? '#1D9E75' : 'var(--border-medium)'}`,
                    background: complete ? '#EAF3DE' : 'var(--bg-secondary)',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => openAddModal(article)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = complete ? '#DCECC8' : 'var(--bg-tertiary)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = complete ? '#EAF3DE' : 'var(--bg-secondary)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{article}</div>
                  <div style={{ fontSize: '11px', marginTop: '2px', color: complete ? '#27500A' : 'var(--text-tertiary)' }}>
                    {complete ? `✓ ${rule.length} steps configured` : 'Click to configure'}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Add/Edit Rule Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <span className="modal-title">
                Process Route Rule → {editingArticle || 'New Article'}
              </span>
              <button className="small" onClick={closeModal}>✕</button>
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label>Article Name</label>
              <input
                value={formData.article}
                onChange={(e) => setFormData({ ...formData, article: e.target.value })}
                placeholder="e.g. Georgette Plain"
                list="article-list"
                disabled={!!editingArticle}
              />
              <datalist id="article-list">
                {knownArticles.map(a => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Default Process Route (select all that apply)</label>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                padding: '10px',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                maxHeight: '300px',
                overflowY: 'auto'
              }}>
                {processList.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px' }}>
                    No processes configured. Go to{' '}
                    <a href="/setup/process-master" style={{ color: 'var(--accent)' }}>Process Master</a>{' '}
                    to add processes.
                  </div>
                ) : (
                  processList.map(proc => (
                    <label
                      key={proc.code}
                      title={proc.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        cursor: 'pointer',
                        padding: '5px 10px',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '13px',
                        userSelect: 'none',
                        background: formData.processRoute.includes(proc.code)
                          ? 'var(--accent-light)'
                          : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.processRoute.includes(proc.code)}
                        onChange={() => toggleProcess(proc.code)}
                        style={{ width: 'auto' }}
                      />
                      <strong>{proc.code}</strong>&nbsp;
                      <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                        {proc.name}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <button 
              onClick={saveRule}
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
              ✓ Save Rule
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
