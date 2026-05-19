'use client'

import { useState } from 'react'
import { ColumnConfig } from './column-config'

interface ColumnSettingsModalProps {
  columns: ColumnConfig[]
  onSave: (columns: ColumnConfig[]) => void
  onClose: () => void
  onReset: () => void
}

export default function ColumnSettingsModal({ columns, onSave, onClose, onReset }: ColumnSettingsModalProps) {
  const [localColumns, setLocalColumns] = useState<ColumnConfig[]>([...columns])

  const toggleVisibility = (id: string) => {
    setLocalColumns(prev => prev.map(col =>
      col.id === id ? { ...col, visible: !col.visible } : col
    ))
  }

  const updateWidth = (id: string, width: number) => {
    setLocalColumns(prev => prev.map(col =>
      col.id === id ? { ...col, width: Math.max(col.minWidth, width) } : col
    ))
  }

  const handleSave = () => {
    onSave(localColumns)
    onClose()
  }

  const handleReset = () => {
    onReset()
    onClose()
  }

  const visibleCount = localColumns.filter(c => c.visible).length

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '700px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h3 style={{
              fontSize: '18px',
              fontWeight: 700,
              color: '#1F2937',
              margin: 0,
              marginBottom: '4px'
            }}>
              Table Column Settings
            </h3>
            <p style={{
              fontSize: '13px',
              color: '#6B7280',
              margin: 0
            }}>
              Show/hide columns and adjust widths • {visibleCount} of {localColumns.length} visible
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              color: '#6B7280',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        {/* Column List */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 24px'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {localColumns.map((col) => (
              <div
                key={col.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  background: col.visible ? '#F9FAFB' : '#FAFAFA',
                  border: `1px solid ${col.visible ? '#E5E7EB' : '#F3F4F6'}`,
                  borderRadius: '8px'
                }}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => toggleVisibility(col.id)}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    accentColor: '#3B82F6'
                  }}
                />

                {/* Column Name */}
                <div style={{
                  flex: 1,
                  fontSize: '13px',
                  fontWeight: col.visible ? 600 : 400,
                  color: col.visible ? '#1F2937' : '#9CA3AF'
                }}>
                  {col.label}
                </div>

                {/* Width Control */}
                {col.visible && col.resizable && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <label style={{
                      fontSize: '12px',
                      color: '#6B7280',
                      whiteSpace: 'nowrap'
                    }}>
                      Width:
                    </label>
                    <input
                      type="number"
                      value={col.width}
                      onChange={(e) => updateWidth(col.id, parseInt(e.target.value) || col.minWidth)}
                      min={col.minWidth}
                      max={800}
                      style={{
                        width: '80px',
                        padding: '4px 8px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '4px',
                        fontSize: '12px',
                        textAlign: 'center'
                      }}
                    />
                    <span style={{
                      fontSize: '12px',
                      color: '#9CA3AF'
                    }}>
                      px
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #E5E7EB',
          display: 'flex',
          gap: '8px',
          justifyContent: 'space-between'
        }}>
          <button
            onClick={handleReset}
            style={{
              padding: '8px 16px',
              background: 'white',
              color: '#DC2626',
              border: '1px solid #DC2626',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Reset to Default
          </button>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: 'white',
                color: '#374151',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: '8px 16px',
                background: '#3B82F6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
