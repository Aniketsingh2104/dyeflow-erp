'use client'

import { useEffect, useState, useRef } from 'react'

export default function ColourChemicalMasterPage() {
  const [items, setItems] = useState<any[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [formData, setFormData] = useState({ name: '' })
  const [todayCount, setTodayCount] = useState(0)
  const [importStatus, setImportStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!db.colourChemicals) db.colourChemicals = []

    const sorted = [...db.colourChemicals].sort((a, b) => a.name.localeCompare(b.name))
    setItems(sorted)

    // Calculate today's count
    const todayStr = new Date().toDateString()
    const count = sorted.filter(x => new Date(x.createdAt).toDateString() === todayStr).length
    setTodayCount(count)
  }

  const nextId = () => {
    if (items.length === 0) return 'CCM-001'
    const nums = items.map(item => {
      const match = item.id.match(/(\d+)/)
      return match ? parseInt(match[1]) : 0
    })
    return 'CCM-' + String(Math.max(0, ...nums) + 1).padStart(3, '0')
  }

  const saveItem = () => {
    if (!formData.name.trim()) {
      alert('Please enter name.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { colourChemicals: [] }
    if (!db.colourChemicals) db.colourChemicals = []

    // Check for duplicates
    const duplicate = db.colourChemicals.find(
      (x: any) => x.name.toLowerCase() === formData.name.trim().toLowerCase() && x.id !== editingId
    )
    if (duplicate) {
      alert('Name already exists.')
      return
    }

    if (editingId) {
      const index = db.colourChemicals.findIndex((x: any) => x.id === editingId)
      if (index >= 0) {
        db.colourChemicals[index].name = formData.name.trim()
      }
    } else {
      db.colourChemicals.push({
        id: nextId(),
        name: formData.name.trim(),
        createdAt: new Date().toISOString()
      })
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
    closeModal()
  }

  const deleteItem = (id: string) => {
    const item = items.find(x => x.id === id)
    if (!item) return

    if (!confirm(`Delete "${item.name}" from Colour Chemical Master?`)) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    db.colourChemicals = db.colourChemicals.filter((x: any) => x.id !== id)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
  }

  const openAddModal = () => {
    setEditingId('')
    setFormData({ name: '' })
    setIsModalOpen(true)
  }

  const openEditModal = (id: string) => {
    const item = items.find(x => x.id === id)
    if (!item) return

    setEditingId(id)
    setFormData({ name: item.name })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingId('')
  }

  const processData = (data: any[][]) => {
    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { colourChemicals: [] }
    if (!db.colourChemicals) db.colourChemicals = []

    if (data.length === 0) {
      setImportStatus('❌ File appears empty.')
      setTimeout(() => setImportStatus(''), 3000)
      return
    }

    // Find first non-empty row
    let startIndex = 0
    for (let i = 0; i < Math.min(5, data.length); i++) {
      const row = data[i]
      if (row && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
        // Check if this looks like a header row
        const firstCell = String(row[0] || '').toLowerCase()
        if (/name|colour|color|chemical|id/i.test(firstCell)) {
          startIndex = i + 1 // Skip header
        } else {
          startIndex = i // Start from this row
        }
        break
      }
    }

    let imported = 0
    let skipped = 0
    const existingNames = new Set(db.colourChemicals.map((x: any) => x.name.toLowerCase()))

    for (let i = startIndex; i < data.length; i++) {
      const row = data[i]
      if (!row || row.length === 0) continue

      // Get first non-empty cell
      const name = row.find(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
      if (!name) continue

      const nameStr = String(name).trim()
      const key = nameStr.toLowerCase()

      if (existingNames.has(key)) {
        skipped++
        continue
      }

      db.colourChemicals.push({
        id: `CCM-${String(db.colourChemicals.length + 1).padStart(3, '0')}`,
        name: nameStr,
        createdAt: new Date().toISOString()
      })
      existingNames.add(key)
      imported++
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadData()
    setImportStatus(`✅ Imported ${imported} names${skipped > 0 ? `, ${skipped} skipped` : ''}`)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    setTimeout(() => setImportStatus(''), 5000)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportStatus('Reading file…')

    const processCSV = (csvText: string) => {
      const lines = csvText.split(/\r?\n/).filter(l => l.trim())
      const data = lines.map(line => {
        const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || line.split(',')
        return cols.map(c => c.replace(/^"|"$/g, '').trim())
      })
      processData(data)
    }

    if (file.name.endsWith('.csv')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result) {
          processCSV(e.target.result as string)
        }
      }
      reader.readAsText(file)
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      // Load SheetJS library dynamically
      setImportStatus('Loading Excel processor…')
      
      const loadXLSX = async () => {
        if (!(window as any).XLSX) {
          const script = document.createElement('script')
          script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js'
          await new Promise((resolve, reject) => {
            script.onload = resolve
            script.onerror = reject
            document.head.appendChild(script)
          })
        }
        return (window as any).XLSX
      }

      try {
        const XLSX = await loadXLSX()
        
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer)
            const workbook = XLSX.read(data, { type: 'array' })
            
            // Get first sheet
            const firstSheetName = workbook.SheetNames[0]
            const worksheet = workbook.Sheets[firstSheetName]
            
            // Convert to array of arrays
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false })
            
            processData(jsonData as any[][])
          } catch (error) {
            console.error('Excel parsing error:', error)
            setImportStatus('❌ Error parsing Excel file. Please check the file format.')
            setTimeout(() => setImportStatus(''), 5000)
          }
        }
        reader.readAsArrayBuffer(file)
      } catch (error) {
        console.error('Error loading XLSX library:', error)
        setImportStatus('❌ Error loading Excel processor. Please try CSV format.')
        setTimeout(() => setImportStatus(''), 5000)
      }
    } else {
      setImportStatus('❌ Please upload a CSV or Excel file.')
      setTimeout(() => setImportStatus(''), 3000)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('en-GB')
  }

  return (
    <div className="content">
      {/* Import Section */}
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
              <span style={{ fontSize: '16px' }}>🎨</span>
              <span className="card-title" style={{ margin: 0 }}>Import Colour / Chemical Names</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.5 }}>
              Upload an <strong>Excel (.xlsx, .xls)</strong> or <strong>CSV</strong> file with colour or chemical names. Put one name per row in the first column.
            </p>
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              fontFamily: 'monospace',
              display: 'inline-block'
            }}>
              Example: Red, Blue, Yellow (each in separate row)
            </div>
          </div>

          {/* Right Content - Button & Status */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'flex-end',
            gap: '8px',
            minWidth: '220px'
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
              accept=".csv,.xlsx,.xls"
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

      {/* Stats Grid */}
      <div className="stat-grid" style={{ marginBottom: '16px' }}>
        <div className="stat-card">
          <div className="stat-label">Total Names</div>
          <div className="stat-value">{items.length}</div>
          <div className="stat-sub">Master records</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Added Today</div>
          <div className="stat-value" style={{ color: '#137E43' }}>{todayCount}</div>
          <div className="stat-sub">New names</div>
        </div>
      </div>

      {/* Master Register */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="card-title">Master Register</span>
            <span style={{ 
              fontSize: '11px', 
              color: 'var(--text-tertiary)',
              background: 'var(--bg-secondary)',
              padding: '2px 8px',
              borderRadius: '10px',
              fontWeight: 600
            }}>
              {items.length} names
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
            + Add Name
          </button>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px', padding: '0 20px' }}>
          Names imported here will appear in the colour dropdown while creating Lab Recipe.
        </p>

        {items.length === 0 ? (
          <div className="empty-state" style={{ padding: '28px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            No colour/chemical names yet. Click "+ Add Name" or upload an Excel/CSV file to get started.
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ minWidth: '780px' }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 700, color: '#3366CC' }}>{item.id}</td>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '11px' }}>
                      {formatDate(item.createdAt)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="xs" onClick={() => openEditModal(item.id)}>
                        Edit
                      </button>
                      <button className="xs danger" style={{ marginLeft: '4px' }} onClick={() => deleteItem(item.id)}>
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

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {editingId ? 'Edit Name' : 'Add Colour / Chemical Name'}
              </span>
              <button className="small" onClick={closeModal}>✕</button>
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label>Name *</label>
              <input
                value={formData.name}
                onChange={(e) => setFormData({ name: e.target.value })}
                placeholder="Enter colour or chemical name"
                autoFocus
              />
            </div>

            <button 
              onClick={saveItem}
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
