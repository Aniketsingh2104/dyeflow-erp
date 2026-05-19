'use client'

import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'

interface ArticleMapping {
  article: string
  supervisor: string
}

export default function ArticleSupervisorMapPage() {
  const [mappings, setMappings] = useState<ArticleMapping[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number>(-1)
  const [formData, setFormData] = useState({ article: '', supervisor: '' })
  const [importStatus, setImportStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadMappings()
  }, [])

  const loadMappings = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (stored) {
      const db = JSON.parse(stored)
      setMappings(db.articleSupervisorMap || [])
    }
  }

  const saveMapping = () => {
    if (!formData.article.trim()) {
      alert('Article is required.')
      return
    }
    if (!formData.supervisor.trim()) {
      alert('Supervisor/Master Name is required.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { articleSupervisorMap: [] }
    if (!db.articleSupervisorMap) db.articleSupervisorMap = []

    const mappingObj = {
      article: formData.article.trim(),
      supervisor: formData.supervisor.trim()
    }

    if (editingIndex >= 0) {
      db.articleSupervisorMap[editingIndex] = mappingObj
    } else {
      db.articleSupervisorMap.push(mappingObj)
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadMappings()
    closeModal()
  }

  const deleteMapping = (index: number) => {
    if (!confirm('Delete this mapping?')) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    db.articleSupervisorMap.splice(index, 1)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadMappings()
  }

  const openAddModal = () => {
    setEditingIndex(-1)
    setFormData({ article: '', supervisor: '' })
    setIsModalOpen(true)
  }

  const openEditModal = (index: number) => {
    setEditingIndex(index)
    setFormData({ ...mappings[index] })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingIndex(-1)
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportStatus('Reading file...')

    const processData = (rows: any[]) => {
      if (rows.length < 2) {
        setImportStatus('❌ File appears empty.')
        return
      }

      const header = rows[0]
      
      const findColumnIndex = (keywords: string[]) => {
        return header.findIndex((h: any) => {
          const headerStr = String(h || '').toLowerCase().trim()
          return keywords.some(keyword => headerStr.includes(keyword))
        })
      }

      const articleIdx = findColumnIndex(['article'])
      const supervisorIdx = findColumnIndex(['master', 'supervisor', 'name'])

      if (articleIdx < 0) {
        setImportStatus('❌ No "Article" column found in header.')
        return
      }
      if (supervisorIdx < 0) {
        setImportStatus('❌ No "Master Name" or "Supervisor" column found in header.')
        return
      }

      const stored = localStorage.getItem('dyeflow_db')
      const db = stored ? JSON.parse(stored) : { articleSupervisorMap: [] }
      if (!db.articleSupervisorMap) db.articleSupervisorMap = []

      // Build a map for quick lookup: article -> supervisor
      const existingMap = new Map(
        db.articleSupervisorMap.map((m: ArticleMapping) => [m.article.trim().toLowerCase(), m])
      )

      let added = 0
      let updated = 0

      // Process data rows (skip header)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const get = (idx: number) => {
          if (idx < 0 || idx >= row.length) return ''
          const val = row[idx]
          return val ? String(val).trim() : ''
        }

        const article = get(articleIdx)
        const supervisor = get(supervisorIdx)

        if (!article || !supervisor) continue

        const articleKey = article.toLowerCase()
        
        if (existingMap.has(articleKey)) {
          // Update existing mapping
          const existing = existingMap.get(articleKey)!
          existing.supervisor = supervisor
          updated++
        } else {
          // Add new mapping
          db.articleSupervisorMap.push({ article, supervisor })
          existingMap.set(articleKey, { article, supervisor })
          added++
        }
      }

      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      setImportStatus(`✅ Imported ${added} new, updated ${updated} existing mappings.`)
      loadMappings()
      
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
          const lines = csvText.split(/\r?\n/).filter(l => l.trim())
          const rows = lines.map(line => {
            return line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) || []
          })
          processData(rows)
        }
      }
      reader.onerror = () => {
        setImportStatus('❌ Error reading file.')
      }
      reader.readAsText(file)
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
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
  }

  return (
    <div className="content">
      {/* Import Section - COMPACT VERSION */}
      <div className="card" style={{ marginBottom: '14px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          marginBottom: '10px'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '16px', fontWeight: 600 }}>📋 Import Article-Supervisor Mapping from Excel / CSV</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', maxWidth: '700px' }}>
              Upload an Excel or CSV file with columns: <strong>Article</strong>, <strong>Master Name</strong> (or Supervisor). Existing mappings will be updated.
            </p>
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 12px',
              fontSize: '12px',
              fontFamily: 'monospace',
              display: 'inline-block'
            }}>
              Article &nbsp;|&nbsp; Master Name
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
            {importStatus && (
              <span style={{ 
                fontSize: '12px', 
                color: importStatus.startsWith('✅') ? 'var(--success)' : importStatus.startsWith('❌') ? 'var(--danger)' : 'var(--text-secondary)',
                fontWeight: 500
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
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              📄 Choose File
            </button>
          </div>
        </div>
      </div>

      {/* Article-Supervisor Table - FIXED HEADER + SCROLLABLE BODY */}
      <div className="card" style={{ border: '2px solid #3b82f6', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)' }}>
        {/* Fixed Header Section */}
        <div className="card-header" style={{ paddingBottom: '16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="card-title">Article-Supervisor Mapping</span>
            <span style={{ 
              fontSize: '11px', 
              color: 'var(--text-tertiary)',
              background: 'var(--bg-secondary)',
              padding: '3px 10px',
              borderRadius: '11px',
              fontWeight: 500
            }}>
              {mappings.length} mappings
            </span>
          </div>
          <button 
            onClick={openAddModal} 
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

        {mappings.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 24px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            No mappings added yet. Click "+ Add Mapping" or import from Excel.
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
            {/* Fixed Table Header */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white' }}>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={{ width: '60px', padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', borderBottom: '1px solid var(--border-light)' }}>#</th>
                  <th style={{ width: '500px', padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', borderBottom: '1px solid var(--border-light)' }}>Article</th>
                  <th style={{ width: '500px', padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', borderBottom: '1px solid var(--border-light)' }}>Supervisor / Master Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', borderBottom: '1px solid var(--border-light)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-tertiary)', fontSize: '13px' }}>{index + 1}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '13px' }}>{mapping.article}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {mapping.supervisor}
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <button className="xs" onClick={() => openEditModal(index)} style={{ marginRight: '8px' }}>
                        Edit
                      </button>
                      <button
                        className="xs danger"
                        onClick={() => deleteMapping(index)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Mapping Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {editingIndex >= 0 ? 'Edit Mapping' : 'Add Mapping'}
              </span>
              <button className="small" onClick={closeModal}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group">
                <label>Article <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  value={formData.article}
                  onChange={(e) => setFormData({ ...formData, article: e.target.value })}
                  placeholder="Enter article code"
                />
              </div>
              <div className="form-group">
                <label>Supervisor / Master Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  value={formData.supervisor}
                  onChange={(e) => setFormData({ ...formData, supervisor: e.target.value })}
                  placeholder="Enter supervisor name"
                />
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
              ✓ Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
