'use client'

import { useState, useEffect } from 'react'

interface Batch {
  batchId: string
  orderNumber: string
  orderId?: string
  color: string
  colourProcess?: string
  kg: number
  type?: string
  note?: string
}

interface CollabGroup {
  id: string
  batches: Batch[]
  totalKg: number
}

interface BatchCollaborationModalProps {
  isOpen: boolean
  onClose: () => void
  availableBatches: Batch[]
  machineCapacity: number
  machineName: string
  onConfirm: (groups: CollabGroup[], skipBatchIds: string[]) => void
}

// Helper: Extract base color from color string (removes codes)
const extractBaseColor = (colorStr: string): string => {
  return colorStr
    .replace(/\b[A-Z]{2,4}-\d+(-\d+)*(-B\d+)?\b/gi, '') // Remove codes like DYG-2026-20-B1
    .replace(/\bCKU-\d+\b/gi, '') // Remove CKU codes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
}

// Helper: Check if two colors are similar
const areSimilarColors = (color1: string, color2: string): boolean => {
  const c1 = (color1 || '').toLowerCase().trim()
  const c2 = (color2 || '').toLowerCase().trim()
  
  if (c1 === c2) return true
  
  const base1 = extractBaseColor(c1)
  const base2 = extractBaseColor(c2)
  
  if (base1 && base2 && base1 === base2) return true
  if (base1.includes(base2) || base2.includes(base1)) return true
  
  return false
}

// Helper: Group batches by similar colors
const groupBatchesByColor = (batches: Batch[]): { [key: string]: Batch[] } => {
  const groups: { [key: string]: Batch[] } = {}
  
  batches.forEach(batch => {
    const color = batch.colourProcess || batch.color || ''
    
    // Find if this color matches any existing group
    let groupKey = color
    for (const existingColor of Object.keys(groups)) {
      if (areSimilarColors(color, existingColor)) {
        groupKey = existingColor
        break
      }
    }
    
    if (!groups[groupKey]) {
      groups[groupKey] = []
    }
    groups[groupKey].push(batch)
  })
  
  return groups
}

export default function BatchCollaborationModal({
  isOpen,
  onClose,
  availableBatches,
  machineCapacity,
  machineName,
  onConfirm
}: BatchCollaborationModalProps) {
  const [colorGroups, setColorGroups] = useState<{ [key: string]: Batch[] }>({})
  const [collabGroups, setCollabGroups] = useState<CollabGroup[]>([])
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set())
  const [draggedBatch, setDraggedBatch] = useState<Batch | null>(null)
  const [checkedBatches, setCheckedBatches] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (isOpen) {
      const groups = groupBatchesByColor(availableBatches)
      setColorGroups(groups)
      setCollabGroups([])
      setSelectedBatches(new Set())
      // Check all batches by default (user can uncheck to skip)
      setCheckedBatches(new Set(availableBatches.map(b => b.batchId)))
    }
  }, [isOpen, availableBatches])

  if (!isOpen) return null

  // Toggle batch selection
  const toggleBatchSelection = (batchId: string) => {
    console.log('toggleBatchSelection called for:', batchId);
    console.log('Current selectedBatches:', Array.from(selectedBatches));
    const newSelected = new Set(selectedBatches)
    if (newSelected.has(batchId)) {
      newSelected.delete(batchId)
      console.log('Removing from selection');
    } else {
      newSelected.add(batchId)
      console.log('Adding to selection');
    }
    console.log('New selectedBatches:', Array.from(newSelected));
    setSelectedBatches(newSelected)
  }

  // Create new collab group from selected batches
  const createCollabGroup = () => {
    if (selectedBatches.size < 2) {
      alert('Please select at least 2 batches to create a collaboration group')
      return
    }

    const selectedBatchObjs = availableBatches.filter(b => selectedBatches.has(b.batchId))
    const totalKg = selectedBatchObjs.reduce((sum, b) => sum + b.kg, 0)

    if (totalKg > machineCapacity) {
      if (!confirm(`Total ${totalKg}kg exceeds machine capacity of ${machineCapacity}kg. Continue anyway?`)) {
        return
      }
    }

    const newGroup: CollabGroup = {
      id: `collab-${Date.now()}`,
      batches: selectedBatchObjs,
      totalKg
    }

    setCollabGroups([...collabGroups, newGroup])
    setSelectedBatches(new Set())
  }

  // Remove a collab group
  const removeCollabGroup = (groupId: string) => {
    setCollabGroups(collabGroups.filter(g => g.id !== groupId))
  }

  // Remove batch from a collab group
  const removeBatchFromGroup = (groupId: string, batchId: string) => {
    setCollabGroups(collabGroups.map(group => {
      if (group.id === groupId) {
        const newBatches = group.batches.filter(b => b.batchId !== batchId)
        return {
          ...group,
          batches: newBatches,
          totalKg: newBatches.reduce((sum, b) => sum + b.kg, 0)
        }
      }
      return group
    }).filter(g => g.batches.length >= 2)) // Remove groups with less than 2 batches
  }

  // Check if batch is in any collab group
  const isBatchInGroup = (batchId: string): boolean => {
    return collabGroups.some(group => group.batches.some(b => b.batchId === batchId))
  }

  // Get batches not in any collab group
  const getAvailableBatches = (): Batch[] => {
    return availableBatches.filter(b => !isBatchInGroup(b.batchId))
  }

  // Drag and drop handlers
  const handleDragStart = (batch: Batch) => {
    setDraggedBatch(batch)
  }

  const handleDrop = (groupId: string) => {
    if (!draggedBatch) return

    // Check if batch is already in this group
    const group = collabGroups.find(g => g.id === groupId)
    if (group && group.batches.some(b => b.batchId === draggedBatch.batchId)) {
      setDraggedBatch(null)
      return
    }

    // Add batch to group
    setCollabGroups(collabGroups.map(g => {
      if (g.id === groupId) {
        const newBatches = [...g.batches, draggedBatch]
        return {
          ...g,
          batches: newBatches,
          totalKg: newBatches.reduce((sum, b) => sum + b.kg, 0)
        }
      }
      return g
    }))

    setDraggedBatch(null)
  }

  const handleConfirm = () => {
    // Get batches that are in collaboration groups
    const batchesInGroups = new Set(
      collabGroups.flatMap(g => g.batches.map((b: Batch) => b.batchId))
    )
    
    // Skip batches that are:
    // 1. NOT in any collaboration group AND
    // 2. Unchecked
    // (Batches in groups are ALWAYS numbered, regardless of checkbox state)
    const skipBatchIds = availableBatches
      .filter(b => !batchesInGroups.has(b.batchId)) // Not in a group
      .filter(b => !checkedBatches.has(b.batchId))  // And unchecked
      .map(b => b.batchId)

    onConfirm(collabGroups, skipBatchIds)
    onClose()
  }

  // Toggle batch checked state (for skip functionality)
  const toggleBatchChecked = (batchId: string) => {
    const newChecked = new Set(checkedBatches)
    if (newChecked.has(batchId)) {
      newChecked.delete(batchId)
    } else {
      newChecked.add(batchId)
    }
    setCheckedBatches(newChecked)
  }

  const availableBatchesFiltered = getAvailableBatches()
  const targetKg = machineCapacity * 0.8

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
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '1200px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1A202C', margin: 0 }}>
              Review batch collaboration - {machineName}
            </h2>
            <p style={{ fontSize: '13px', color: '#718096', margin: '4px 0 0 0' }}>
              Machine capacity: <strong>{machineCapacity} Kg</strong> • 
              Target fill: <strong>{targetKg} Kg (80%)</strong>
            </p>
            <p style={{ fontSize: '12px', color: '#10B981', margin: '4px 0 0 0', fontWeight: 600 }}>
              ✓ Checked batches will be numbered. Uncheck low-quantity batches to skip them.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              border: 'none',
              background: 'transparent',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#718096'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Left: Available Batches by Color */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A202C', marginBottom: '12px' }}>
                📦 Available Batches ({availableBatchesFiltered.length})
              </h3>
              
              {Object.entries(colorGroups).map(([color, batches]) => {
                // Filter out batches already in collab groups
                const availColor = batches.filter(b => !isBatchInGroup(b.batchId))
                if (availColor.length === 0) return null

                const totalKg = availColor.reduce((sum, b) => sum + b.kg, 0)
                const baseColor = extractBaseColor(color)

                return (
                  <div
                    key={color}
                    style={{
                      marginBottom: '16px',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{
                      padding: '10px 12px',
                      background: '#F7FAFC',
                      borderBottom: '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#E53E3E' }}>
                          {baseColor || color}
                        </div>
                        <div style={{ fontSize: '11px', color: '#718096' }}>
                          {availColor.length} batch{availColor.length > 1 ? 'es' : ''} • {totalKg.toFixed(1)} Kg total
                        </div>
                      </div>
                      {totalKg < targetKg && (
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: 600,
                          background: '#FFFBEB',
                          color: '#92400E'
                        }}>
                          Low qty
                        </span>
                      )}
                    </div>

                    <div style={{ padding: '8px' }}>
                      {availColor.map((batch) => (
                        <div
                          key={batch.batchId}
                          style={{
                            padding: '8px 10px',
                            marginBottom: '4px',
                            background: selectedBatches.has(batch.batchId) ? '#EBF8FF' : 'white',
                            border: selectedBatches.has(batch.batchId) ? '2px solid #4299E1' : '1px solid #E2E8F0',
                            borderRadius: '6px',
                            cursor: 'default',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            opacity: checkedBatches.has(batch.batchId) ? 1 : 0.5
                          }}
                        >
                          {/* Checkbox for skip/number */}
                          <input
                            type="checkbox"
                            checked={checkedBatches.has(batch.batchId)}
                            onChange={(e) => {
                              e.stopPropagation()
                              toggleBatchChecked(batch.batchId)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: '16px',
                              height: '16px',
                              cursor: 'pointer',
                              accentColor: '#48BB78',
                              flexShrink: 0
                            }}
                          />
                          
                          <div 
                            style={{ flex: 1, cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleBatchSelection(batch.batchId);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#1A202C' }}>
                              {batch.batchId}
                            </div>
                            <div style={{ fontSize: '10px', color: '#718096' }}>
                              {batch.orderNumber} • {batch.kg} Kg
                            </div>
                          </div>
                          
                          <div style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '3px',
                            border: selectedBatches.has(batch.batchId) ? '2px solid #4299E1' : '2px solid #CBD5E0',
                            background: selectedBatches.has(batch.batchId) ? '#4299E1' : 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '10px',
                            flexShrink: 0
                          }}>
                            {selectedBatches.has(batch.batchId) && '✓'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              <button
                onClick={createCollabGroup}
                disabled={selectedBatches.size < 2}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '6px',
                  background: selectedBatches.size >= 2 ? '#48BB78' : '#CBD5E0',
                  color: 'white',
                  cursor: selectedBatches.size >= 2 ? 'pointer' : 'not-allowed',
                  marginTop: '12px'
                }}
              >
                ➕ Create Collab Group ({selectedBatches.size} selected)
              </button>
            </div>

            {/* Right: Collaboration Groups */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A202C', marginBottom: '12px' }}>
                🤝 Collaboration Groups ({collabGroups.length})
              </h3>

              {collabGroups.length === 0 ? (
                <div style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  border: '2px dashed #E2E8F0',
                  borderRadius: '8px',
                  color: '#718096'
                }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎯</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                    No collaboration groups yet
                  </div>
                  <div style={{ fontSize: '11px' }}>
                    Select batches from the left and click "Create Collab Group"
                  </div>
                </div>
              ) : (
                collabGroups.map((group, idx) => {
                  const percentFilled = (group.totalKg / machineCapacity) * 100
                  const isOverCapacity = group.totalKg > machineCapacity
                  const isLowFill = group.totalKg < targetKg

                  return (
                    <div
                      key={group.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(group.id)}
                      style={{
                        marginBottom: '16px',
                        border: isOverCapacity ? '2px solid #FC8181' : '2px solid #68D391',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        background: isOverCapacity ? '#FFF5F5' : isLowFill ? '#FFFBEB' : '#F0FFF4'
                      }}
                    >
                      <div style={{
                        padding: '12px',
                        background: isOverCapacity ? '#FED7D7' : '#C6F6D5',
                        borderBottom: isOverCapacity ? '1px solid #FC8181' : '1px solid #68D391',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A202C' }}>
                            Collab Group #{idx + 1}
                          </div>
                          <div style={{ fontSize: '11px', color: '#718096', marginTop: '2px' }}>
                            {group.batches.length} batches • {group.totalKg.toFixed(1)} Kg
                            {isOverCapacity && ' ⚠️ OVER CAPACITY'}
                            {isLowFill && !isOverCapacity && ' 💡 Can add more'}
                          </div>
                        </div>
                        <button
                          onClick={() => removeCollabGroup(group.id)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            border: 'none',
                            borderRadius: '4px',
                            background: '#FC8181',
                            color: 'white',
                            cursor: 'pointer'
                          }}
                        >
                          Remove
                        </button>
                      </div>

                      {/* Capacity Bar */}
                      <div style={{ padding: '0 12px 12px 12px' }}>
                        <div style={{
                          height: '8px',
                          background: '#E2E8F0',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          marginBottom: '8px'
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.min(percentFilled, 100)}%`,
                            background: isOverCapacity ? '#FC8181' : '#48BB78',
                            transition: 'width 0.3s'
                          }} />
                        </div>
                        <div style={{ fontSize: '10px', color: '#718096', textAlign: 'center' }}>
                          {percentFilled.toFixed(1)}% of capacity ({group.totalKg} / {machineCapacity} Kg)
                        </div>
                      </div>

                      {/* Batches in group */}
                      <div style={{ padding: '0 8px 8px 8px' }}>
                        {group.batches.map((batch) => (
                          <div
                            key={batch.batchId}
                            style={{
                              padding: '8px 10px',
                              marginBottom: '4px',
                              background: 'white',
                              border: '1px solid #E2E8F0',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between'
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: '#1A202C' }}>
                                {batch.batchId}
                              </div>
                              <div style={{ fontSize: '10px', color: '#718096' }}>
                                {batch.orderNumber} • {batch.kg} Kg
                              </div>
                            </div>
                            <button
                              onClick={() => removeBatchFromGroup(group.id, batch.batchId)}
                              style={{
                                padding: '2px 6px',
                                fontSize: '10px',
                                border: '1px solid #E2E8F0',
                                borderRadius: '3px',
                                background: 'white',
                                color: '#718096',
                                cursor: 'pointer'
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#F7FAFC'
        }}>
          <div style={{ fontSize: '12px', color: '#718096' }}>
            {collabGroups.length} collaboration group{collabGroups.length !== 1 ? 's' : ''} • 
            {' '}{availableBatchesFiltered.length} batch{availableBatchesFiltered.length !== 1 ? 'es' : ''} available
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                background: 'white',
                color: '#718096',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '6px',
                background: '#48BB78',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              ✓ Run Numbering
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
