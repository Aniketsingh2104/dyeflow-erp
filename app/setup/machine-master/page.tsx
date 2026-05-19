'use client'

import { useEffect, useState, useRef } from 'react'

interface Machine {
  id: string
  name: string
  type: string
  capacity: number
  status: 'running' | 'idle' | 'maintenance'
}

export default function MachineMasterPage() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({ id: '', name: '', type: '', capacity: 200 })
  const [importStatus, setImportStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadMachines()
  }, [])

  const loadMachines = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (stored) {
      const db = JSON.parse(stored)
      setMachines(db.machines || [])
    }
  }

  const calculateLoad = (machineId: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return 0
    
    const db = JSON.parse(stored)
    const loadKg = (db.orders || [])
      .filter((o: any) => o.machine === machineId)
      .flatMap((o: any) => o.splits || [])
      .filter((s: any) => s.status !== 'done')
      .reduce((sum: number, b: any) => sum + (parseInt(b.kg) || 0), 0)
    
    return loadKg
  }

  const updateMachineStatus = (id: string, status: string) => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const machine = db.machines.find((m: Machine) => m.id === id)
    if (machine) {
      machine.status = status
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadMachines()
    }
  }

  const saveMachine = () => {
    if (!formData.id.trim() || !formData.name.trim()) {
      alert('Machine ID and Name are required.')
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { machines: [] }
    if (!db.machines) db.machines = []

    if (db.machines.find((m: Machine) => m.id === formData.id)) {
      alert('Machine ID already exists.')
      return
    }

    db.machines.push({
      id: formData.id.trim(),
      name: formData.name.trim(),
      type: formData.type.trim(),
      capacity: formData.capacity,
      status: 'idle'
    })

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadMachines()
    closeModal()
  }

  const editMachine = (id: string) => {
    const machine = machines.find(m => m.id === id)
    if (!machine) return
    
    const newName = prompt('Machine Name:', machine.name)
    if (!newName) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    const m = db.machines.find((m: Machine) => m.id === id)
    if (m) {
      m.name = newName
      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      loadMachines()
    }
  }

  const deleteMachine = (id: string) => {
    if (!confirm('Delete this machine?')) return

    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    db.machines = db.machines.filter((m: Machine) => m.id !== id)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    loadMachines()
  }

  const nextMachineId = () => {
    if (machines.length === 0) return 'M-1'
    
    const nums = machines.map(m => {
      const match = m.id.match(/(\d+)/)
      return match ? parseInt(match[1]) : 0
    })
    return 'M-' + (Math.max(0, ...nums) + 1)
  }

  const openAddModal = () => {
    setFormData({ id: nextMachineId(), name: '', type: '', capacity: 200 })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
  }

  const processData = (data: any[][]) => {
    if (data.length < 2) {
      setImportStatus('❌ File appears empty.')
      setTimeout(() => setImportStatus(''), 3000)
      return
    }

    // Find the first non-empty row to use as header
    let headerRowIndex = 0
    let header: string[] = []
    
    for (let i = 0; i < Math.min(5, data.length); i++) {
      const row = data[i]
      if (row && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
        header = row.map(h => String(h || '').trim().toLowerCase())
        headerRowIndex = i
        break
      }
    }

    if (header.length === 0) {
      setImportStatus('❌ No header row found in file.')
      setTimeout(() => setImportStatus(''), 3000)
      return
    }

    // Try to find columns - look for ID, Name, Type, Capacity
    let idIdx = header.findIndex(h => h.includes('id') || h.includes('machine') || h.includes('uj') || h.includes('lj'))
    let nameIdx = header.findIndex(h => h.includes('name') || h.includes('jet') || h.includes('no'))
    let typeIdx = header.findIndex(h => h.includes('type'))
    let capIdx = header.findIndex(h => h.includes('capacity') || h.includes('cap'))

    // If no header found, assume standard column order: ID, Name, Type, Capacity
    if (idIdx < 0 && nameIdx < 0 && header.length >= 2) {
      console.log('No header detected, using column positions: ID, Name, Type, Capacity')
      idIdx = 0
      nameIdx = 1
      typeIdx = header.length > 2 ? 2 : -1
      capIdx = header.length > 3 ? 3 : -1
    } else if (idIdx < 0 || nameIdx < 0) {
      setImportStatus('❌ Required columns not found. Need: ID, Name')
      setTimeout(() => setImportStatus(''), 5000)
      return
    }

    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : { machines: [] }
    if (!db.machines) db.machines = []

    const existing = new Set(db.machines.map((m: Machine) => m.id.toLowerCase()))
    let added = 0, skipped = 0

    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i]
      if (!row || row.length === 0) continue

      const get = (idx: number) => idx >= 0 && row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : ''

      const id = get(idIdx)
      const name = get(nameIdx)
      
      if (!id || !name) continue
      if (existing.has(id.toLowerCase())) {
        skipped++
        continue
      }

      const type = get(typeIdx) || id.split('-')[0] || '' // Use ID prefix as type if not provided
      const capacity = parseInt(get(capIdx)) || 200

      db.machines.push({
        id,
        name,
        type,
        capacity,
        status: 'idle'
      })
      existing.add(id.toLowerCase())
      added++
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(db))
    setImportStatus(`✅ Imported ${added} machines${skipped > 0 ? `, ${skipped} skipped` : ''}`)
    loadMachines()

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    setTimeout(() => setImportStatus(''), 5000)
  }

  const processCSV = (csvText: string) => {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim())
    const data = lines.map(line => {
      const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || line.split(',')
      return cols.map(c => c.replace(/^"|"$/g, '').trim())
    })
    processData(data)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportStatus('Reading file…')

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

  const getMachineShortName = (name: string) => {
    return name.length > 20 ? name.substring(0, 20) + '...' : name
  }

  return (
    <div className="content">
      {/* Import Section - Compact Horizontal Layout */}
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
              <span className="card-title" style={{ margin: 0 }}>Import Machines from Excel / CSV</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.5 }}>
              Upload an <strong>Excel (.xlsx, .xls)</strong> or <strong>CSV</strong> file with columns: <strong>ID, Name, Type, Capacity</strong>. Excel files are automatically processed.
            </p>
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              fontFamily: 'monospace',
              display: 'inline-block'
            }}>
              Example: M-1, Jet Machine 1, Jet, 500
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
                color: importStatus.startsWith('✅') ? 'var(--success)' : importStatus.startsWith('❌') || importStatus.startsWith('⚠️') ? 'var(--danger)' : 'var(--text-secondary)' 
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

      {/* Machines Table */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="card-title">All Machines</span>
            <span style={{ 
              fontSize: '11px', 
              color: 'var(--text-tertiary)',
              background: 'var(--bg-secondary)',
              padding: '2px 8px',
              borderRadius: '10px',
              fontWeight: 600
            }}>
              {machines.length} machines
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
            + Add Machine
          </button>
        </div>
        
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px', padding: '0 20px' }}>
          Each machine you add here gets its own dedicated page in the sidebar under the <strong>Machines</strong> section automatically.
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>MACHINE ID</th>
                <th>MACHINE NAME</th>
                <th>TYPE</th>
                <th>CAPACITY (KG)</th>
                <th>STATUS</th>
                <th>LOAD</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {machines.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-tertiary)' }}>
                    No machines yet. Click "+ Add Machine" or upload an Excel/CSV file to get started.
                  </td>
                </tr>
              ) : (
                machines.map(machine => {
                  const loadKg = calculateLoad(machine.id)
                  
                  return (
                    <tr key={machine.id}>
                      <td style={{ fontWeight: 700 }}>{machine.id}</td>
                      <td style={{ fontWeight: 500 }}>{machine.name}</td>
                      <td>
                        <span style={{
                          background: '#E6F0FF',
                          color: '#3366CC',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600
                        }}>
                          {machine.type}
                        </span>
                      </td>
                      <td>{machine.capacity} Kg</td>
                      <td>
                        <select
                          value={machine.status}
                          onChange={(e) => updateMachineStatus(machine.id, e.target.value)}
                          style={{ width: 'auto', padding: '3px 8px', fontSize: '12px' }}
                        >
                          <option value="running">Running</option>
                          <option value="idle">Idle</option>
                          <option value="maintenance">Maintenance</option>
                        </select>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {loadKg}/{machine.capacity} Kg
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button 
                          className="xs"
                          style={{
                            background: '#137E43',
                            color: 'white',
                            border: 'none'
                          }}
                          onClick={() => window.location.href = `/machines/${machine.id}`}
                        >
                          Open Page
                        </button>
                        <button className="xs" style={{ marginLeft: '4px' }} onClick={() => editMachine(machine.id)}>
                          Edit
                        </button>
                        <button className="xs danger" style={{ marginLeft: '4px' }} onClick={() => deleteMachine(machine.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Machine Cards Grid */}
      {machines.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {machines.map((machine, idx) => {
            const colors = ['#185FA5', '#1D9E75', '#D85A30', '#7F77DD', '#BA7517', '#D4537E', '#378ADD', '#3B6D11']
            const col = colors[idx % 8]
            const stored = localStorage.getItem('dyeflow_db')
            const db = stored ? JSON.parse(stored) : { orders: [] }
            const batches = (db.orders || [])
              .filter((o: any) => o.machine === machine.id)
              .flatMap((o: any) => o.splits || [])
            const active = batches.filter((b: any) => b.status !== 'done').length

            return (
              <div
                key={machine.id}
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '14px',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.12s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = ''}
                onClick={() => window.location.href = `/machines/${machine.id}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: 'var(--radius-md)',
                    background: `${col}18`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: col
                  }}>
                    {machine.id.substring(0, 3)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{getMachineShortName(machine.name)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{machine.type}</div>
                  </div>
                </div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: col }}>{active}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>active batches</div>
                <div style={{ marginTop: '8px' }}>
                  <span className={`badge badge-${machine.status}`}>{machine.status}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Machine Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add New Machine</span>
              <button className="small" onClick={closeModal}>✕</button>
            </div>
            <div className="form-grid" style={{ marginBottom: '14px' }}>
              <div className="form-group">
                <label>Machine ID (e.g. M-5)</label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder="Machine ID"
                />
              </div>
              <div className="form-group">
                <label>Machine Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Machine Name"
                />
              </div>
              <div className="form-group">
                <label>Type (Jet/HT/Jigger/Winch)</label>
                <input
                  type="text"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  placeholder="Machine Type"
                />
              </div>
              <div className="form-group">
                <label>Capacity (Kg)</label>
                <input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 200 })}
                  placeholder="200"
                />
              </div>
            </div>
            <button 
              onClick={saveMachine}
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
              ✓ Save Machine
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
