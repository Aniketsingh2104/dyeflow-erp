'use client'

import { useState, useEffect } from 'react'

interface Batch {
  batchId: string        // unique key: batchId-processCode e.g. DYE26-0004-B1-S
  batchIdLabel?: string  // display: DYE26-0004-B1
  orderNumber: string
  orderId?: string
  color: string
  processCode?: string   // e.g. 'S', 'D'
  processName?: string   // e.g. 'SCQ', 'Dyeing'
  kg: number
  type?: string
  note?: string
}

interface CollabGroup {
  id: string
  batches: Batch[]
  totalKg: number
  processCode: string
  processName: string
}

interface BatchCollaborationModalProps {
  isOpen: boolean
  onClose: () => void
  availableBatches: Batch[]
  machineCapacity: number
  machineName: string
  onConfirm: (groups: CollabGroup[], skipBatchIds: string[]) => void
}

const processColors: Record<string, { bg: string; text: string }> = {
  S:    { bg: '#DBEAFE', text: '#1D4ED8' },
  D:    { bg: '#EDE9FE', text: '#6D28D9' },
  S2:   { bg: '#CFFAFE', text: '#0E7490' },
  Add:  { bg: '#FEF3C7', text: '#92400E' },
  Lev:  { bg: '#D1FAE5', text: '#065F46' },
  Fix:  { bg: '#FEE2E2', text: '#991B1B' },
  Wash: { bg: '#E0F2FE', text: '#0369A1' },
  Rc:   { bg: '#F3E8FF', text: '#7E22CE' },
}

const getProcessStyle = (code?: string) => processColors[code || ''] || { bg: '#F3F4F6', text: '#374151' }

// Group batches by Color + Process separately
const groupByColorProcess = (batches: Batch[]) => {
  const map: Record<string, { color: string; processCode: string; processName: string; batches: Batch[] }> = {}
  for (const b of batches) {
    const key = `${(b.color || '').trim()}____${b.processCode || ''}`
    if (!map[key]) map[key] = {
      color: b.color || '',
      processCode: b.processCode || '',
      processName: b.processName || b.processCode || '',
      batches: []
    }
    map[key].batches.push(b)
  }
  return Object.values(map)
}

export default function BatchCollaborationModal({
  isOpen, onClose, availableBatches, machineCapacity, machineName, onConfirm
}: BatchCollaborationModalProps) {
  const [collabGroups,    setCollabGroups]    = useState<CollabGroup[]>([])
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set())
  const [selectedProcess, setSelectedProcess] = useState<string>('')
  const [checkedIds,      setCheckedIds]      = useState<Set<string>>(new Set())

  useEffect(() => {
    if (isOpen) {
      setCollabGroups([])
      setSelectedIds(new Set())
      setSelectedProcess('')
      setCheckedIds(new Set(availableBatches.map(b => b.batchId)))
    }
  }, [isOpen, availableBatches])

  if (!isOpen) return null

  const targetKg       = machineCapacity * 0.8
  const isBatchInGroup = (id: string) => collabGroups.some(g => g.batches.some(b => b.batchId === id))
  const freeBatches    = availableBatches.filter(b => !isBatchInGroup(b.batchId))
  const colorGroups    = groupByColorProcess(freeBatches)

  // Toggle selection — each batchId is fully unique (includes process suffix)
  const toggleSelect = (batch: Batch) => {
    const newSel = new Set(selectedIds)
    if (newSel.has(batch.batchId)) {
      newSel.delete(batch.batchId)
      if (newSel.size === 0) setSelectedProcess('')
    } else {
      if (newSel.size === 0) setSelectedProcess(batch.processCode || '')
      else if (batch.processCode !== selectedProcess) return  // block different process
      newSel.add(batch.batchId)
    }
    setSelectedIds(newSel)
  }

  const createGroup = () => {
    if (selectedIds.size < 2) { alert('Select at least 2 batches to collab'); return }
    const sel     = freeBatches.filter(b => selectedIds.has(b.batchId))
    const totalKg = sel.reduce((s, b) => s + b.kg, 0)
    if (totalKg > machineCapacity) {
      if (!confirm(`Total ${totalKg}kg exceeds capacity ${machineCapacity}kg. Continue?`)) return
    }
    setCollabGroups(prev => [...prev, {
      id: `g-${Date.now()}`,
      batches: sel,
      totalKg,
      processCode: sel[0].processCode || '',
      processName: sel[0].processName || sel[0].processCode || '',
    }])
    setSelectedIds(new Set())
    setSelectedProcess('')
  }

  const removeGroup = (id: string) => setCollabGroups(g => g.filter(x => x.id !== id))
  const removeBatch = (groupId: string, batchId: string) =>
    setCollabGroups(g => g.map(x => x.id !== groupId ? x : {
      ...x,
      batches: x.batches.filter(b => b.batchId !== batchId),
      totalKg: x.batches.filter(b => b.batchId !== batchId).reduce((s, b) => s + b.kg, 0),
    }).filter(x => x.batches.length >= 2))

  const toggleChecked = (id: string) => {
    const s = new Set(checkedIds)
    s.has(id) ? s.delete(id) : s.add(id)
    setCheckedIds(s)
  }

  const handleConfirm = () => {
    const inGroups     = new Set(collabGroups.flatMap(g => g.batches.map(b => b.batchId)))
    const skipBatchIds = availableBatches
      .filter(b => !inGroups.has(b.batchId) && !checkedIds.has(b.batchId))
      .map(b => b.batchId)
    onConfirm(collabGroups, skipBatchIds)
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex',
      alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
      <div style={{ background:'white', borderRadius:12, maxWidth:1100, width:'100%',
        maxHeight:'90vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)' }}>

        {/* Header */}
        <div style={{ padding:'16px 24px', borderBottom:'1px solid #E2E8F0',
          display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:17, fontWeight:700 }}>Review batch collaboration — {machineName}</div>
            <div style={{ fontSize:12, color:'#718096', marginTop:2 }}>
              Capacity: <strong>{machineCapacity} Kg</strong> · Target: <strong>{targetKg} Kg (80%)</strong>
            </div>
            <div style={{ fontSize:11, color:'#10B981', marginTop:3, fontWeight:600 }}>
              ✓ Checked batches will be numbered · Only same-process batches can be grouped together
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22,
            cursor:'pointer', color:'#718096' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflow:'auto', padding:20 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

            {/* LEFT — Available Batches */}
            <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>
                📦 Available Batches ({freeBatches.length})
              </div>

              {/* Process lock banner */}
              {selectedIds.size > 0 && (() => {
                const ps = getProcessStyle(selectedProcess)
                return (
                  <div style={{ fontSize:11, fontWeight:600, marginBottom:8, padding:'6px 10px',
                    borderRadius:6, background: ps.bg, color: ps.text, display:'flex', alignItems:'center', gap:6 }}>
                    <span>⚡ {selectedIds.size} selected — locked to process:</span>
                    <span style={{ padding:'1px 8px', borderRadius:10, background:'white',
                      border:`1px solid ${ps.text}`, color: ps.text }}>
                      {selectedProcess}
                    </span>
                    <span style={{ marginLeft:'auto', fontWeight:400, opacity:0.8 }}>
                      Other-process batches are dimmed
                    </span>
                  </div>
                )
              })()}

              <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
              {colorGroups.length === 0 && (
                <div style={{ padding:30, textAlign:'center', color:'#9CA3AF', fontSize:12 }}>
                  All batches are in collab groups
                </div>
              )}

              {colorGroups.map(group => {
                const ps      = getProcessStyle(group.processCode)
                const totalKg = group.batches.reduce((s, b) => s + b.kg, 0)
                const isLockedOut = selectedIds.size > 0 && group.processCode !== selectedProcess

                return (
                  <div key={`${group.color}-${group.processCode}`}
                    style={{ marginBottom:10, border:'1px solid #E2E8F0', borderRadius:8, overflow:'hidden',
                      opacity: isLockedOut ? 0.4 : 1, transition:'opacity 0.15s' }}>

                    {/* Group header — Color + Process */}
                    <div style={{ padding:'8px 12px', background:'#F9FAFB',
                      borderBottom:'1px solid #E2E8F0', display:'flex',
                      alignItems:'center', justifyContent:'space-between' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:13, fontWeight:700, color:'#E53E3E' }}>{group.color}</span>
                        <span style={{ fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:10,
                          background: ps.bg, color: ps.text }}>
                          {group.processName}
                        </span>
                      </div>
                      <span style={{ fontSize:11, color:'#718096' }}>
                        {group.batches.length} batch{group.batches.length !== 1 ? 'es' : ''} · {totalKg} Kg
                        {totalKg < targetKg && <span style={{ color:'#F59E0B', marginLeft:4 }}>⚠ Low qty</span>}
                      </span>
                    </div>

                    {/* Batch rows */}
                    <div style={{ padding:6 }}>
                      {group.batches.map(batch => {
                        const isSelected = selectedIds.has(batch.batchId)
                        const canSelect  = !isLockedOut

                        return (
                          <div key={batch.batchId}
                            onClick={() => canSelect && toggleSelect(batch)}
                            style={{ padding:'7px 10px', marginBottom:3, borderRadius:6,
                              display:'flex', alignItems:'center', gap:8,
                              background: isSelected ? ps.bg : 'white',
                              border: isSelected ? `2px solid ${ps.text}` : '1px solid #E2E8F0',
                              cursor: canSelect ? 'pointer' : 'not-allowed',
                              opacity: checkedIds.has(batch.batchId) ? 1 : 0.5,
                              transition:'all 0.15s' }}>

                            {/* Number checkbox (for skip/include) */}
                            <input type="checkbox"
                              checked={checkedIds.has(batch.batchId)}
                              onChange={e => { e.stopPropagation(); toggleChecked(batch.batchId) }}
                              onClick={e => e.stopPropagation()}
                              title="Include in numbering"
                              style={{ width:14, height:14, accentColor:'#48BB78',
                                flexShrink:0, cursor:'pointer' }} />

                            {/* Batch info */}
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:'#1A202C' }}>
                                {batch.batchIdLabel || batch.batchId}
                              </div>
                              <div style={{ fontSize:10, color:'#718096' }}>
                                {batch.orderNumber} · {batch.kg} Kg
                              </div>
                            </div>

                            {/* Process badge — key addition so user knows which process this row is */}
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px',
                              borderRadius:8, background: ps.bg, color: ps.text,
                              border:`1px solid ${ps.text}`, flexShrink:0 }}>
                              {group.processName}
                            </span>

                            {/* Collab select indicator */}
                            <div style={{ width:15, height:15, borderRadius:3, flexShrink:0,
                              border: isSelected ? `2px solid ${ps.text}` : '2px solid #CBD5E0',
                              background: isSelected ? ps.text : 'white',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              color:'white', fontSize:9 }}>
                              {isSelected && '✓'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              </div>{/* end scrollable groups */}
              <button onClick={createGroup} disabled={selectedIds.size < 2}
                style={{ width:'100%', padding:'9px 0', fontSize:13, fontWeight:600,
                  border:'none', borderRadius:6, marginTop:6,
                  background: selectedIds.size >= 2 ? '#6366F1' : '#CBD5E0',
                  color:'white', cursor: selectedIds.size >= 2 ? 'pointer' : 'not-allowed' }}>
                ➕ Create Collab Group ({selectedIds.size} selected)
              </button>
            </div>

            {/* RIGHT — Collab Groups */}
            <div>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>
                🤝 Collaboration Groups ({collabGroups.length})
              </div>

              {collabGroups.length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center',
                  border:'2px dashed #E2E8F0', borderRadius:8, color:'#718096' }}>
                  <div style={{ fontSize:30, marginBottom:8 }}>🎯</div>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>No collaboration groups yet</div>
                  <div style={{ fontSize:11 }}>
                    Select batches of the same process from the left, then click "Create Collab Group"
                  </div>
                </div>
              ) : collabGroups.map((group, idx) => {
                const ps      = getProcessStyle(group.processCode)
                const pct     = (group.totalKg / machineCapacity) * 100
                const overCap = group.totalKg > machineCapacity

                return (
                  <div key={group.id}
                    style={{ marginBottom:12, border: overCap ? '2px solid #FC8181' : '2px solid #68D391',
                      borderRadius:8, overflow:'hidden',
                      background: overCap ? '#FFF5F5' : '#F0FFF4' }}>
                    <div style={{ padding:'10px 12px',
                      background: overCap ? '#FED7D7' : '#C6F6D5',
                      borderBottom: overCap ? '1px solid #FC8181' : '1px solid #68D391',
                      display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:13, fontWeight:700 }}>Collab #{idx + 1}</span>
                          <span style={{ fontSize:11, fontWeight:700, padding:'2px 10px',
                            borderRadius:10, background: ps.bg, color: ps.text }}>
                            {group.processName}
                          </span>
                        </div>
                        <div style={{ fontSize:11, color:'#555', marginTop:2 }}>
                          {group.batches.length} batches · {group.totalKg.toFixed(1)} Kg
                          {overCap && ' ⚠️ OVER CAPACITY'}
                        </div>
                      </div>
                      <button onClick={() => removeGroup(group.id)}
                        style={{ padding:'3px 10px', fontSize:11, border:'none',
                          borderRadius:4, background:'#FC8181', color:'white', cursor:'pointer' }}>
                        Remove
                      </button>
                    </div>

                    {/* Capacity bar */}
                    <div style={{ padding:'8px 12px 4px' }}>
                      <div style={{ height:7, background:'#E2E8F0', borderRadius:4, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${Math.min(pct,100)}%`,
                          background: overCap ? '#FC8181' : '#48BB78', transition:'width 0.3s' }} />
                      </div>
                      <div style={{ fontSize:10, color:'#718096', textAlign:'center', marginTop:2 }}>
                        {pct.toFixed(1)}% · {group.totalKg} / {machineCapacity} Kg
                      </div>
                    </div>

                    <div style={{ padding:'4px 8px 8px' }}>
                      {group.batches.map(batch => (
                        <div key={batch.batchId}
                          style={{ padding:'6px 10px', marginBottom:3, background:'white',
                            border:'1px solid #E2E8F0', borderRadius:6,
                            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <div>
                            <div style={{ fontSize:12, fontWeight:600 }}>
                              {batch.batchIdLabel || batch.batchId}
                            </div>
                            <div style={{ fontSize:10, color:'#718096' }}>
                              {batch.orderNumber} · {batch.kg} Kg
                            </div>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px',
                              borderRadius:8, background: ps.bg, color: ps.text }}>
                              {group.processName}
                            </span>
                            <button onClick={() => removeBatch(group.id, batch.batchId)}
                              style={{ padding:'2px 6px', fontSize:10, border:'1px solid #E2E8F0',
                                borderRadius:3, background:'white', color:'#718096', cursor:'pointer' }}>
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 24px', borderTop:'1px solid #E2E8F0',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          background:'#F7FAFC' }}>
          <div style={{ fontSize:12, color:'#718096' }}>
            {collabGroups.length} group{collabGroups.length !== 1 ? 's' : ''} · {freeBatches.length} batch{freeBatches.length !== 1 ? 'es' : ''} available
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose}
              style={{ padding:'8px 18px', fontSize:13, fontWeight:600,
                border:'1px solid #E2E8F0', borderRadius:6, background:'white',
                color:'#718096', cursor:'pointer' }}>
              Cancel
            </button>
            <button onClick={handleConfirm}
              style={{ padding:'8px 18px', fontSize:13, fontWeight:600,
                border:'none', borderRadius:6, background:'#48BB78',
                color:'white', cursor:'pointer' }}>
              ✓ Run Numbering
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
