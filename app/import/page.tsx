'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

export default function ImportPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string>('')
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [uploadingTemplate, setUploadingTemplate] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError('')
      setResult(null)
    }
  }

  const handleImport = async () => {
    if (!file) {
      setError('Please select a file first')
      return
    }

    setImporting(true)
    setError('')
    setResult(null)

    try {
      // Check file extension
      const fileName = file.name.toLowerCase()
      const isCSV = fileName.endsWith('.csv')
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')

      if (!isCSV && !isExcel) {
        throw new Error('Please upload a CSV or Excel file (.csv, .xlsx, .xls)')
      }

      let rows: string[][]

      if (isCSV) {
        // Parse CSV
        const text = await file.text()
        rows = parseCSV(text)
      } else {
        // Parse Excel using SheetJS
        rows = await parseExcel(file)
      }

      processImportData(rows)
    } catch (err: any) {
      setError(err.message || 'Failed to import file')
    } finally {
      setImporting(false)
    }
  }

  const parseCSV = (text: string): string[][] => {
    const lines = text.split('\n')
    return lines.map(line => {
      // Simple CSV parser (handles basic cases)
      const values: string[] = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      values.push(current.trim())
      return values
    }).filter(row => row.some(cell => cell.length > 0))
  }

  const parseExcel = async (file: File): Promise<string[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          const data = e.target?.result
          if (!data) {
            reject(new Error('Failed to read file'))
            return
          }

          // Read the workbook
          const workbook = XLSX.read(data, { type: 'array' })

          // Get the first sheet
          const firstSheetName = workbook.SheetNames[0]
          if (!firstSheetName) {
            reject(new Error('No sheets found in Excel file'))
            return
          }

          const worksheet = workbook.Sheets[firstSheetName]

          // Convert to array of arrays
          const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            defval: '',
            blankrows: false
          })

          // Convert all values to strings
          const rows = jsonData.map(row => 
            row.map(cell => String(cell || '').trim())
          )

          resolve(rows)
        } catch (err: any) {
          reject(new Error(`Failed to parse Excel file: ${err.message}`))
        }
      }

      reader.onerror = () => {
        reject(new Error('Failed to read file'))
      }

      reader.readAsArrayBuffer(file)
    })
  }

  const processImportData = (rows: any[][]) => {
    if (rows.length === 0) {
      throw new Error('File is empty')
    }

    // Assume first row is headers
    const headers = rows[0].map((h: any) => String(h).toLowerCase().trim())
    const dataRows = rows.slice(1)

    // Property name mapping from import headers to app property names
    const propertyMap: { [key: string]: string } = {
      'labno': 'labNo',
      'lotno': 'lotNo',
      'challannumber': 'challanNo',
      'qtykg': 'qtyKg',
      'qtymtr': 'qtyMtr',
      'nooftaka': 'noOfTaka',
      'typeoffinish': 'typeOfFinish',
      'typeofpacking': 'typeOfPacking',
      'subparty': 'subParty',
      'salesperson': 'salesPerson',
      'holdapproval': 'holdApproval',
      'holdreason': 'holdReason'
    }

    // Get existing orders to determine next serial number
    const stored = localStorage.getItem('dyeflow_db')
    const db = stored ? JSON.parse(stored) : {}
    if (!db.orders) db.orders = []

    // Get current year
    const currentYear = new Date().getFullYear()

    // Find highest serial number for current year
    let maxSerial = 0
    db.orders.forEach((order: any) => {
      const orderNum = order.orderNumber || ''
      // Match pattern ON-YYYY-XXX
      const match = orderNum.match(/^ON-(\d{4})-(\d+)$/)
      if (match) {
        const year = parseInt(match[1])
        const serial = parseInt(match[2])
        if (year === currentYear && serial > maxSerial) {
          maxSerial = serial
        }
      }
    })

    // Example: Import orders (you can extend this for other entities)
    const imported: any[] = []
    
    dataRows.forEach((row, index) => {
      if (row.length === 0 || !row.some(cell => cell)) return

      const obj: any = {}
      headers.forEach((header, i) => {
        // Use mapped property name if exists, otherwise use original
        const propertyName = propertyMap[header] || header
        obj[propertyName] = row[i] || ''
      })

      // Basic validation
      if (obj.party || obj.article || obj.color) {
        // Increment serial number for each new order
        maxSerial++
        const serialNumber = String(maxSerial).padStart(3, '0')
        
        // Convert numeric fields from strings to numbers
        if (obj.qtyKg) obj.qtyKg = parseFloat(obj.qtyKg) || 0
        if (obj.qtyMtr) obj.qtyMtr = parseFloat(obj.qtyMtr) || 0
        if (obj.noOfTaka) obj.noOfTaka = parseInt(obj.noOfTaka) || 0
        if (obj.width) obj.width = obj.width  // Keep as string
        if (obj.gsm) obj.gsm = obj.gsm  // Keep as string
        
        imported.push({
          id: `ORD-${currentYear}-${serialNumber}`,
          orderNumber: `ON-${currentYear}-${serialNumber}`,
          ...obj,
          timestamp: new Date().toISOString(),
          status: 'new',
          imported: true,
          source: 'import',
          splits: []
        })
      }
    })

    if (imported.length === 0) {
      throw new Error('No valid data found in file')
    }
    
    // Save to localStorage (db already loaded above)
    db.orders.push(...imported)
    localStorage.setItem('dyeflow_db', JSON.stringify(db))

    setResult({
      imported: imported.length,
      headers,
      preview: imported.slice(0, 5)
    })
  }

  const handleDownloadTemplate = () => {
    // Create CSV template
    const headers = [
      'party',
      'subparty',
      'salesperson',
      'article',
      'blend',
      'width',
      'gsm',
      'color',
      'labno',
      'lotno',
      'challannumber',
      'qtykg',
      'qtymtr',
      'nooftaka',
      'typeoffinish',
      'typeofpacking',
      'remarks'
    ]

    const exampleRow = [
      'Rajesh Fabrics',
      'Sub Party A',
      'John Doe',
      'Cotton Fabric',
      '100% Cotton',
      '44',
      '200',
      'Navy Blue',
      'L-2001',
      'LOT-445',
      'CH-1001',
      '500',
      '1200',
      '60',
      'Matt',
      'Roll',
      'Sample order for testing'
    ]

    const csv = headers.join(',') + '\n' + exampleRow.join(',')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'dyeflow_import_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadExcelTemplate = () => {
    // Create Excel template using SheetJS
    const headers = [
      'party',
      'subparty',
      'salesperson',
      'article',
      'blend',
      'width',
      'gsm',
      'color',
      'labno',
      'lotno',
      'challannumber',
      'qtykg',
      'qtymtr',
      'nooftaka',
      'typeoffinish',
      'typeofpacking',
      'remarks'
    ]

    const exampleRow = [
      'Rajesh Fabrics',
      'Sub Party A',
      'John Doe',
      'Cotton Fabric',
      '100% Cotton',
      '44',
      '200',
      'Navy Blue',
      'L-2001',
      'LOT-445',
      'CH-1001',
      '500',
      '1200',
      '60',
      'Matt',
      'Roll',
      'Sample order for testing'
    ]

    // Create worksheet from array of arrays
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow])

    // Create workbook
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Orders')

    // Generate Excel file and download
    XLSX.writeFile(wb, 'dyeflow_import_template.xlsx')
  }

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      const fileName = selectedFile.name.toLowerCase()
      if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
        alert('Please upload an Excel file (.xlsx or .xls)')
        return
      }
      setTemplateFile(selectedFile)
      setUploadingTemplate(true)
      
      // Save template to localStorage for future use
      const reader = new FileReader()
      reader.onload = (e) => {
        const data = e.target?.result
        if (data) {
          localStorage.setItem('dyeflow_import_template', JSON.stringify({
            name: selectedFile.name,
            data: Array.from(new Uint8Array(data as ArrayBuffer))
          }))
          alert(`✓ Template "${selectedFile.name}" uploaded successfully!\n\nYou can now use this template for future imports.`)
        }
        setUploadingTemplate(false)
      }
      reader.onerror = () => {
        alert('Failed to upload template')
        setUploadingTemplate(false)
      }
      reader.readAsArrayBuffer(selectedFile)
    }
  }

  const handleDownloadSavedTemplate = () => {
    const saved = localStorage.getItem('dyeflow_import_template')
    if (!saved) {
      alert('No custom template uploaded yet. Please upload a template first.')
      return
    }

    try {
      const { name, data } = JSON.parse(saved)
      const uint8Array = new Uint8Array(data)
      const blob = new Blob([uint8Array], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Failed to download saved template')
    }
  }

  return (
    <div className="content">
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '6px' }}>
          Import Data (CSV & Excel)
        </h2>
        <p style={{ margin: 0, fontSize: '12px', color: '#6B7280', lineHeight: 1.5 }}>
          Import orders from CSV or Excel files. Both formats are supported.
        </p>
        <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
          Visible by user Admin • All data access
        </div>
      </div>

      {/* Info Notice */}
      <div style={{
        background: '#D1FAE5',
        border: '1px solid #6EE7B7',
        borderRadius: '8px',
        padding: '12px 16px',
        marginBottom: '16px',
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-start'
      }}>
        <span style={{ fontSize: '18px' }}>✓</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#065F46', marginBottom: '4px' }}>
            CSV & Excel Support
          </div>
          <div style={{ fontSize: '12px', color: '#047857' }}>
            You can now import both CSV (.csv) and Excel (.xlsx, .xls) files directly. No conversion needed!
          </div>
        </div>
      </div>

      {/* Import Card */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        padding: '24px',
        marginBottom: '16px'
      }}>
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>
            Upload CSV or Excel File
          </h3>
          
          <div style={{
            border: '2px dashed #D1D5DB',
            borderRadius: '8px',
            padding: '32px',
            textAlign: 'center',
            background: '#F9FAFB'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>
              {file ? '📄' : '📁'}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#1F2937', marginBottom: '8px' }}>
              {file ? file.name : 'Choose a file to import'}
            </div>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '16px' }}>
              Supported formats: .csv, .xlsx, .xls
            </div>
            
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              style={{
                display: 'block',
                margin: '0 auto',
                padding: '8px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleImport}
            disabled={!file || importing}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              background: file && !importing ? '#3B82F6' : '#D1D5DB',
              color: 'white',
              fontSize: '13px',
              fontWeight: 600,
              cursor: file && !importing ? 'pointer' : 'not-allowed',
              opacity: file && !importing ? 1 : 0.6
            }}
          >
            {importing ? 'Importing...' : 'Import Data'}
          </button>
          
          <button
            onClick={handleDownloadTemplate}
            style={{
              padding: '10px 20px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              background: 'white',
              color: '#374151',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Download CSV Template
          </button>

          <button
            onClick={handleDownloadExcelTemplate}
            style={{
              padding: '10px 20px',
              border: '1px solid #10B981',
              borderRadius: '6px',
              background: '#D1FAE5',
              color: '#065F46',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Download Excel Template
          </button>

          <div style={{ position: 'relative' }}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleTemplateUpload}
              style={{
                position: 'absolute',
                opacity: 0,
                width: '100%',
                height: '100%',
                cursor: 'pointer'
              }}
              id="template-upload"
            />
            <button
              style={{
                padding: '10px 20px',
                border: '1px solid #3B82F6',
                borderRadius: '6px',
                background: '#DBEAFE',
                color: '#1E40AF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                pointerEvents: 'none'
              }}
            >
              {uploadingTemplate ? 'Uploading...' : '📤 Upload Excel Template'}
            </button>
          </div>

          <button
            onClick={handleDownloadSavedTemplate}
            style={{
              padding: '10px 20px',
              border: '1px solid #8B5CF6',
              borderRadius: '6px',
              background: '#F3E8FF',
              color: '#6B21A8',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Download My Template
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          background: '#FEE2E2',
          border: '1px solid #FCA5A5',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#991B1B', marginBottom: '4px' }}>
                Import Error
              </div>
              <div style={{ fontSize: '13px', color: '#7F1D1D' }}>
                {error}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Result */}
      {result && (
        <div style={{
          background: 'white',
          borderRadius: '8px',
          border: '1px solid #E5E7EB',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #E5E7EB',
            background: '#D1FAE5'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>✓</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#065F46', marginBottom: '4px' }}>
                  Import Successful
                </div>
                <div style={{ fontSize: '13px', color: '#047857' }}>
                  Successfully imported {result.imported} record{result.imported !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>
              Preview of imported data:
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px'
              }}>
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    {result.headers.map((header: string, i: number) => (
                      <th key={i} style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#6B7280',
                        textTransform: 'uppercase',
                        borderBottom: '1px solid #E5E7EB'
                      }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.preview.map((row: any, i: number) => (
                    <tr key={i} style={{
                      background: i % 2 === 0 ? 'white' : '#FAFAFA',
                      borderBottom: '1px solid #F3F4F6'
                    }}>
                      {result.headers.map((header: string, j: number) => (
                        <td key={j} style={{
                          padding: '8px 12px',
                          color: '#1F2937'
                        }}>
                          {row[header] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button
                onClick={() => router.push('/orders')}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#3B82F6',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                View Imported Orders
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        padding: '16px'
      }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#1F2937', marginBottom: '12px' }}>
          File Format Requirements
        </h3>
        
        <div style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.8 }}>
          <div style={{ marginBottom: '16px', padding: '12px', background: '#F9FAFB', borderRadius: '6px' }}>
            <strong>CSV Format (.csv):</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              <li>Comma-separated values</li>
              <li>First row must contain column headers</li>
              <li>Works with Excel, Google Sheets, and text editors</li>
            </ul>
          </div>

          <div style={{ marginBottom: '16px', padding: '12px', background: '#F9FAFB', borderRadius: '6px' }}>
            <strong>Excel Format (.xlsx, .xls):</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              <li>Microsoft Excel workbook format</li>
              <li>First sheet will be imported</li>
              <li>First row must contain column headers</li>
              <li>Empty rows will be skipped automatically</li>
            </ul>
          </div>

          <div style={{ padding: '12px', background: '#DBEAFE', borderRadius: '6px' }}>
            <strong>Required Columns:</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              <li>At least one of: <strong>party</strong>, <strong>article</strong>, or <strong>color</strong></li>
              <li>All column headers should be in lowercase</li>
              <li>Download the template to see the exact format</li>
            </ul>
          </div>

          <div style={{ marginTop: '16px', padding: '12px', background: '#F3E8FF', borderRadius: '6px', border: '1px solid #C084FC' }}>
            <strong>📤 Custom Template Feature:</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              <li>Upload your own Excel template with custom columns and formatting</li>
              <li>Your template will be saved and can be downloaded anytime</li>
              <li>Use "Download My Template" to get your saved custom template</li>
              <li>Perfect for maintaining your specific column structure</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
