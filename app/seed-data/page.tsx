'use client'

export default function SeedDataPage() {
  const seedDatabase = () => {
    const sampleData = {
      machines: [
        { id: 'M-001', name: 'U - Jet No. 01', type: 'U-Jet', capacity: 500, status: 'running' },
        { id: 'M-002', name: 'U - Jet No. 02', type: 'U-Jet', capacity: 600, status: 'idle' },
        { id: 'M-003', name: 'Long Tube Jet No. 17', type: 'Long Tube', capacity: 800, status: 'running' },
        { id: 'M-004', name: 'U - Jet No. 03', type: 'U-Jet', capacity: 400, status: 'running' },
        { id: 'M-005', name: 'U - Jet No. 04', type: 'U-Jet', capacity: 550, status: 'idle' }
      ],
      
      customers: [
        { id: 'C-001', name: 'Arvind Ltd', contact: '9876543210', address: 'Ahmedabad', gst: 'GST001' },
        { id: 'C-002', name: 'Welspun India', contact: '9876543211', address: 'Mumbai', gst: 'GST002' },
        { id: 'C-003', name: 'Trident Group', contact: '9876543212', address: 'Ludhiana', gst: 'GST003' },
        { id: 'C-004', name: 'Vardhman Textiles', contact: '9876543213', address: 'Delhi', gst: 'GST004' }
      ],

      orders: [
        {
          id: 'ORD-001',
          orderNumber: 'ON-8803',
          party: 'Shah Brothers',
          article: 'Chiffon',
          color: 'Sky Blue',
          qtyKg: 210,
          blend: '100% Polyester',
          lotNo: 'LOT-001',
          timestamp: '2024-01-15 09:30',
          supervisor: 'Kundan M.',
          processRoute: ['S', 'D', 'H', 'F'],
          machine: 'M-001',
          status: 'assigned',
          splits: []
        },
        {
          id: 'ORD-002',
          orderNumber: 'ON-8802',
          party: 'Patel Textiles',
          article: 'Crepe Satin',
          color: 'Maroon',
          qtyKg: 320,
          blend: '100% Polyester',
          lotNo: 'LOT-002',
          timestamp: '2024-01-16 10:15',
          supervisor: 'Nandlal M.',
          processRoute: ['S', 'D', 'H', 'F', 'R'],
          machine: 'M-002',
          status: 'in-process',
          splits: [
            {
              id: 'B-001',
              batchId: 'B001-A',
              kg: 160,
              qtyKg: 160,
              date: '2024-01-16',
              status: 'in-process'
            },
            {
              id: 'B-002',
              batchId: 'B001-B',
              kg: 160,
              qtyKg: 160,
              date: '2024-01-16',
              status: 'pending'
            }
          ]
        },
        {
          id: 'ORD-003',
          orderNumber: 'ON-8801',
          party: 'Rajesh Fabrics',
          article: 'Georgette Plain',
          color: 'Navy Blue',
          qtyKg: 500,
          blend: '100% Polyester',
          lotNo: 'LOT-003',
          timestamp: '2024-01-17 11:00',
          supervisor: 'Urvesh M.',
          processRoute: ['S', 'D', 'H'],
          machine: 'M-003',
          status: 'assigned',
          splits: []
        }
      ],

      labIndents: [],
      labRequests: [],
      labSubmitted: [],
      labIssues: [],
      labRecipes: [],
      greigeEntries: [],
      
      shadeMaster: [
        { id: 'SH-001', colourName: 'Sky Blue', colourType: 'Light', pantone: 'PANTONE 278' },
        { id: 'SH-002', colourName: 'Navy Blue', colourType: 'Dark', pantone: 'PANTONE 533' },
        { id: 'SH-003', colourName: 'Maroon', colourType: 'Dark', pantone: 'PANTONE 505' }
      ],

      colourChemicals: [
        { id: 'CC-001', name: 'Disperse Blue 79', type: 'Dye', unit: 'g/l' },
        { id: 'CC-002', name: 'Levelling Agent', type: 'Auxiliary', unit: 'g/l' },
        { id: 'CC-003', name: 'Acetic Acid', type: 'Auxiliary', unit: 'ml/l' }
      ],

      articleSupervisorMap: {
        'Chiffon': 'Kundan M.',
        'Crepe Satin': 'Nandlal M.',
        'Georgette Plain': 'Urvesh M.'
      },

      fmsStepNumbers: {
        greigeRfdFabricReceived: '',
        deliveryDateEntry: '',
        firstSubmission: '',
        partyApproval: ''
      },

      // ALL 20 STANDARD PROCESSES
      processes: [
        { code: 'C', name: 'CBR', machine: null },
        { code: 'S', name: 'SCQ', machine: null },
        { code: 'H', name: 'Heat-Set', machine: null },
        { code: 'D', name: 'Dyeing', machine: null },
        { code: 'S2', name: 'SCQ2', machine: null },
        { code: 'Rx', name: 'Relax', machine: null },
        { code: 'O', name: 'Opener', machine: null },
        { code: 'G', name: 'Ghanti', machine: null },
        { code: 'F', name: 'Finish', machine: null },
        { code: 'Co', name: 'Compactor', machine: null },
        { code: 'Tu', name: 'Tubler', machine: null },
        { code: 'Add', name: 'Addition', machine: null },
        { code: 'Lev', name: 'Levelling', machine: null },
        { code: 'Rc', name: 'RC', machine: null },
        { code: 'Fix', name: 'Fixing', machine: null },
        { code: 'Wash', name: 'Washing', machine: null },
        { code: 'Dry', name: 'Dry', machine: null },
        { code: 'B', name: 'Brushing', machine: null },
        { code: 'R', name: 'Raising', machine: null },
        { code: 'K', name: 'Kundi', machine: null }
      ],

      faultyRecords: [],
      holidays: [],
      machineHolidays: []
    }

    localStorage.setItem('dyeflow_db', JSON.stringify(sampleData))
    
    alert('✅ Sample data seeded successfully!\n\nThe database now contains:\n- 5 Machines\n- 4 Customers\n- 3 Orders\n- 20 Processes (all standard codes)\n- 3 Shade Master entries\n- 3 Colour Chemicals\n\nRefresh the page to see the data.')
    window.location.reload()
  }

  const clearDatabase = () => {
    if (confirm('⚠️ Are you sure you want to clear all data?\n\nThis will remove:\n- All machines\n- All customers\n- All orders\n- All lab data\n- All greige data\n- All master data\n\nThis action cannot be undone!')) {
      localStorage.removeItem('dyeflow_db')
      alert('✅ Database cleared successfully!')
      window.location.reload()
    }
  }

  const viewDatabase = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) {
      alert('Database is empty. Click "Seed Sample Data" to populate it.')
      return
    }

    const db = JSON.parse(stored)
    const summary = `
📊 CURRENT DATABASE CONTENTS:

Machines: ${db.machines?.length || 0}
Customers: ${db.customers?.length || 0}
Orders: ${db.orders?.length || 0}
Lab Indents: ${db.labIndents?.length || 0}
Lab Requests: ${db.labRequests?.length || 0}
Lab Submitted: ${db.labSubmitted?.length || 0}
Greige Entries: ${db.greigeEntries?.length || 0}
Shade Master: ${db.shadeMaster?.length || 0}
Colour Chemicals: ${db.colourChemicals?.length || 0}

Total localStorage size: ${(stored.length / 1024).toFixed(2)} KB
    `
    alert(summary)
  }

  return (
    <div className="content">
      <div className="card">
        <div className="card-header">
          <span className="card-title">🌱 Database Management</span>
        </div>
        
        <div style={{ padding: '20px' }}>
          {/* Seed Data Section */}
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px', color: 'var(--accent)' }}>
              Populate Sample Data
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.6' }}>
              Click below to populate the database with realistic sample data for testing and demonstration:
            </p>
            <ul style={{ color: 'var(--text-secondary)', marginLeft: '20px', marginBottom: '20px', lineHeight: '1.8' }}>
              <li><strong>5 Machines</strong> - U-Jet and Long Tube machines</li>
              <li><strong>4 Customers</strong> - Major textile companies</li>
              <li><strong>3 Orders</strong> - Sample orders with different statuses</li>
              <li><strong>20 Processes</strong> - All standard process codes (CBR, SCQ, Heat-Set, etc.)</li>
              <li><strong>Shade Master</strong> - Light and Dark colors</li>
              <li><strong>Colour Chemicals</strong> - Dyes and auxiliaries</li>
            </ul>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <button 
                className="primary"
                onClick={seedDatabase}
                style={{ padding: '10px 20px', fontSize: '14px' }}
              >
                🌱 Seed Sample Data
              </button>
              <button 
                onClick={viewDatabase}
                style={{ padding: '10px 20px', fontSize: '14px' }}
              >
                📊 View Database Stats
              </button>
            </div>
          </div>

          {/* Danger Zone */}
          <div style={{
            background: '#fff5f5',
            border: '2px solid #feb2b2',
            borderRadius: 'var(--radius-md)',
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px', color: '#c53030' }}>
              ⚠️ Danger Zone
            </h3>
            <p style={{ color: '#742a2a', marginBottom: '16px', lineHeight: '1.6' }}>
              Clear all data from the database. This action is <strong>permanent and cannot be undone</strong>.
            </p>
            <button 
              onClick={clearDatabase}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                background: '#c53030',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontWeight: 600
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#9b2c2c'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#c53030'}
            >
              🗑️ Clear All Data
            </button>
          </div>

          {/* Info Box */}
          <div style={{
            background: 'var(--bg-secondary)',
            padding: '16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)',
            marginTop: '24px'
          }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
              💡 How to Access
            </h4>
            <ul style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '20px', lineHeight: '1.8' }}>
              <li>Navigate to <strong>/seed-data</strong> in your browser</li>
              <li>Or use the browser's address bar: <code>http://localhost:6060/seed-data</code></li>
              <li>Seed data is stored in browser's localStorage</li>
              <li>Data persists until you clear it or clear browser data</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
