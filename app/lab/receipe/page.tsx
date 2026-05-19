'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LabReceipePage() {
  const router = useRouter()
  const [recipes, setRecipes] = useState<any[]>([])
  const [filteredRecipes, setFilteredRecipes] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [stats, setStats] = useState({
    total: 0,
    today: 0,
    uniqueRequests: 0,
    avgComponents: '0.0'
  })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [recipes, searchQuery])

  const loadData = () => {
    const stored = localStorage.getItem('dyeflow_db')
    if (!stored) return

    const db = JSON.parse(stored)
    if (!Array.isArray(db.labRecipes)) db.labRecipes = []

    const sorted = [...db.labRecipes].sort((a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
    )

    setRecipes(sorted)

    // Calculate stats
    const todayStr = new Date().toDateString()
    const todayCount = sorted.filter((x: any) =>
      new Date(x.updatedAt || x.createdAt || '').toDateString() === todayStr
    ).length

    const uniqueReq = new Set(sorted.map((x: any) => x.labRequestNo).filter(Boolean)).size

    const avgRows = sorted.length
      ? (sorted.reduce((sum: number, x: any) => sum + ((x.components || []).length), 0) / sorted.length).toFixed(1)
      : '0.0'

    setStats({
      total: sorted.length,
      today: todayCount,
      uniqueRequests: uniqueReq,
      avgComponents: avgRows
    })
  }

  const applyFilters = () => {
    if (!searchQuery) {
      setFilteredRecipes(recipes)
      return
    }

    const q = searchQuery.toLowerCase()
    const filtered = recipes.filter((r: any) =>
      (r.id || '').toLowerCase().includes(q) ||
      (r.labRequestNo || '').toLowerCase().includes(q) ||
      (r.unit || '').toLowerCase().includes(q) ||
      (r.party || '').toLowerCase().includes(q)
    )
    setFilteredRecipes(filtered)
  }

  const getComponentText = (components: any[]) => {
    if (!components || components.length === 0) return '-'
    return components.map((c: any) => `${c.name}: ${c.percentage}%`).join(', ')
  }

  const getTotalPercentage = (components: any[]) => {
    if (!components || components.length === 0) return 0
    return components.reduce((sum: number, c: any) => sum + (parseFloat(c.percentage) || 0), 0)
  }

  const parseDateString = (dateStr: string): Date | null => {
    if (!dateStr || typeof dateStr !== 'string') return null
    
    const trimmed = dateStr.trim()
    if (!trimmed) return null
    
    // Check if it's DD/MM/YYYY format
    const ddmmyyyyMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (ddmmyyyyMatch) {
      const [, day, month, year] = ddmmyyyyMatch
      const isoDate = `${year}-${month}-${day}`
      const date = new Date(isoDate)
      if (!isNaN(date.getTime())) {
        return date
      }
    }
    
    const date = new Date(trimmed)
    if (!isNaN(date.getTime())) {
      return date
    }
    
    return null
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-'
    
    const date = parseDateString(dateStr)
    if (!date) return '-'
    
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    
    return `${day}/${month}/${year}`
  }

  return (
    <div className="content">
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1F2937', marginBottom: '6px' }}>
            Lab Recipe
          </h2>
          <p style={{ margin: 0, fontSize: '12px', color: '#6B7280', lineHeight: 1.5 }}>
            Recipe entries created from Approved Lab are listed here.
          </p>
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
            Visible by user Admin • All data access
          </div>
        </div>
        <button 
          onClick={() => router.push('/lab/approval')}
          style={{
            padding: '7px 14px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            background: 'white',
            color: '#374151',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            height: 'fit-content'
          }}
        >
          Back to Approved Lab
        </button>
      </div>

      {/* Beautiful Stats Cards Grid */}
      <div style={{ 
        display: 'flex',
        gap: '10px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        {/* Total Recipes - Indigo */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 180px',
          minWidth: '180px',
          maxWidth: '220px',
          border: '2px solid #E0E7FF',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.15)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '60px',
            height: '60px',
            background: 'linear-gradient(135deg, #E0E7FF 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Total Recipes
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#4F46E5', marginBottom: '4px', lineHeight: 1 }}>
            {stats.total}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Saved entries</div>
        </div>

        {/* Updated Today - Blue */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 180px',
          minWidth: '180px',
          maxWidth: '220px',
          border: '2px solid #DBEAFE',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.15)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '60px',
            height: '60px',
            background: 'linear-gradient(135deg, #DBEAFE 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Updated Today
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#3B82F6', marginBottom: '4px', lineHeight: 1 }}>
            {stats.today}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>New/Edit today</div>
        </div>

        {/* Unique Requests - Orange */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 180px',
          minWidth: '180px',
          maxWidth: '220px',
          border: '2px solid #FED7AA',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(251, 146, 60, 0.15)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '60px',
            height: '60px',
            background: 'linear-gradient(135deg, #FED7AA 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Unique Requests
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#FB923C', marginBottom: '4px', lineHeight: 1 }}>
            {stats.uniqueRequests}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Lab request coverage</div>
        </div>

        {/* Avg Component Rows - Purple */}
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '16px',
          flex: '1 1 180px',
          minWidth: '180px',
          maxWidth: '220px',
          border: '2px solid #E9D5FF',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(168, 85, 247, 0.15)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: -10,
            width: '60px',
            height: '60px',
            background: 'linear-gradient(135deg, #E9D5FF 0%, transparent 100%)',
            borderRadius: '50%'
          }} />
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Avg Component Rows
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#A855F7', marginBottom: '4px', lineHeight: 1 }}>
            {stats.avgComponents}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Per recipe</div>
        </div>
      </div>

      {/* Table Card */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        overflow: 'hidden'
      }}>
        {/* Table Header */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>
            Recipe Register
          </div>
          <div style={{ fontSize: '12px', color: '#6B7280' }}>
            {filteredRecipes.length} record{filteredRecipes.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>
          <input
            type="text"
            placeholder="Search recipe / request / unit / party..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 12px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>

        {/* Table */}
        {filteredRecipes.length === 0 ? (
          <div style={{ 
            padding: '48px', 
            textAlign: 'center',
            color: '#9CA3AF',
            fontSize: '14px'
          }}>
            {recipes.length === 0 
              ? 'No recipe entries yet. Use Entry Recipe in Approved Lab page.'
              : 'No recipes match your search.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              width: '100%', 
              minWidth: '2060px',
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={headerStyle}>RECIPE NO</th>
                  <th style={headerStyle}>UPDATED AT</th>
                  <th style={headerStyle}>LAB REQUEST NO</th>
                  <th style={headerStyle}>SUBMISSION NO</th>
                  <th style={headerStyle}>UNIT</th>
                  <th style={headerStyle}>PARTY</th>
                  <th style={headerStyle}>SHADE / PANTONE</th>
                  <th style={headerStyle}>COLOUR TYPE</th>
                  <th style={headerStyle}>CHART NUMBER</th>
                  <th style={headerStyle}>COMMITMENT DATE</th>
                  <th style={headerStyle}>LAB APPROVED NO.</th>
                  <th style={headerStyle}>COMPONENTS</th>
                  <th style={headerStyle}>TOTAL %</th>
                  <th style={headerStyle}>NOTES</th>
                  <th style={headerStyle}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecipes.map((recipe, idx) => {
                  const total = getTotalPercentage(recipe.components)

                  return (
                    <tr 
                      key={recipe.id}
                      style={{ 
                        background: idx % 2 === 0 ? 'white' : '#FAFAFA',
                        borderBottom: '1px solid #F3F4F6'
                      }}
                    >
                      <td style={cellStyle}>
                        <span style={{ color: '#2563EB', fontWeight: 600 }}>{recipe.id}</span>
                      </td>
                      <td style={cellStyle}>{formatDate(recipe.updatedAt || recipe.createdAt)}</td>
                      <td style={cellStyle}>
                        <span style={{ fontWeight: 600 }}>{recipe.labRequestNo || '-'}</span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontWeight: 600 }}>{recipe.submissionNo || '-'}</span>
                      </td>
                      <td style={cellStyle}>{recipe.unit || '-'}</td>
                      <td style={cellStyle}>{recipe.party || '-'}</td>
                      <td style={cellStyle}>{recipe.shadePantone || '-'}</td>
                      <td style={cellStyle}>{recipe.colourType || '-'}</td>
                      <td style={cellStyle}>
                        <span style={{ fontWeight: 600 }}>{recipe.chartNumber || '-'}</span>
                      </td>
                      <td style={cellStyle}>{formatDate(recipe.commitmentDate)}</td>
                      <td style={cellStyle}>
                        <span style={{ 
                          fontWeight: 700, 
                          color: '#10B981',
                          padding: '3px 8px',
                          background: '#D1FAE5',
                          borderRadius: '4px',
                          fontSize: '11px'
                        }}>
                          {recipe.labApprovedNumber || '-'}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontSize: '12px', color: '#6B7280' }}>
                          {getComponentText(recipe.components)}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontWeight: 700 }}>{total.toFixed(2)}%</span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontSize: '12px', color: '#6B7280' }}>
                          {recipe.notes || '-'}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <button 
                          style={{
                            padding: '5px 12px',
                            border: '1px solid #D1D5DB',
                            borderRadius: '5px',
                            background: 'white',
                            color: '#374151',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#F9FAFB'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'white'
                          }}
                        >
                          Edit
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
    </div>
  )
}

const headerStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: '10px',
  fontWeight: 700,
  color: '#6B7280',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '1px solid #E5E7EB'
}

const cellStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: '12px',
  color: '#1F2937'
}
