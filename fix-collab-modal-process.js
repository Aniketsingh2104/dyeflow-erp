// Run from C:\dyeflow-react: node fix-collab-modal-process.js
// Fix 1: Pass processName + currentProcess to BatchCollaborationModal
// Fix 2: Rewrite modal to group by Color+Process, enforce same-process collab only

const fs   = require('fs')
const path = require('path')

// ── Fix 1: machine page — pass processName to modal ──────────────────────
const pagePath = path.join(__dirname, 'app', 'machines', '[machineId]', 'page.tsx')
let page = fs.readFileSync(pagePath, 'utf8')

const oldCollabBatches = `        availableBatches={collabBatches.map(b => ({
          batchId: b.batchId,
          orderNumber: b.orderNo,
          orderId: b.orderId,
          color: b.color,
          colourProcess: b.color,
          kg: parseFloat(b.kg) || 0,
          type: b.type,
          note: b.note || ''
        }))}`

const newCollabBatches = `        availableBatches={collabBatches.map(b => ({
          batchId:      b.rowKey || b.batchId,  // use rowKey (batchId-processCode) as unique id
          batchIdLabel: b.batchId,               // display label (without process suffix)
          orderNumber:  b.orderNo,
          orderId:      b.orderId,
          color:        b.color,
          processCode:  b.currentProcess,        // e.g. 'S', 'D'
          processName:  b.processName,           // e.g. 'SCQ', 'Dyeing'
          kg:           parseFloat(b.kg) || 0,
          type:         b.type,
          note:         b.note || ''
        }))}`

if (page.includes(oldCollabBatches)) {
  page = page.replace(oldCollabBatches, newCollabBatches)
  fs.writeFileSync(pagePath, page, 'utf8')
  console.log('✓ Machine page passes processName + processCode to modal')
} else {
  console.error('✗ Machine page collab batches pattern not found')
}

// ── Fix 2: Rewrite BatchCollaborationModal ────────────────────────────────
const modalPath = path.join(__dirname, 'components', 'BatchCollaborationModal.tsx')

const newModal = `'use client'

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
  processCode: string    // all batches in group must share this process
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

// Group batches by Color + Process (not just color)
const groupBatchesByColorProcess = (batches: Batch[]): { key: string; color: string; processCode: string; processName: string; batches: Batch[] }[] => {
  const map: Record<string, { key: string; color: string; processCode: string; processName: string; batches: Batch[] }> = {}
  for (const b of batches) {
    const key = \`\${(b.color || '').toLowerCase().trim()}||||\${b.processCode || ''}\`
    if (!map[key]) map[key] = { key, color: b.color || '', processCode: b.processCode || '', processName: b.processName || b.processCode || '', batches: [] }
    map[key].batches.push(b)
  }
  return Object.values(map)
}

export default function BatchCollaborationModal({
  isOpen, onClose, availableBatches, machineCapacity, machineName, onConfirm
}: BatchCollaborationModalProps) {
  const [collabGroups,    setCollabGroups]    = useState<CollabGroup[]>([])
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set())
  const [selectedProcess, setSelectedProcess] = useState<string>('')  // active selection process
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

  const targetKg = machineCapacity * 0.8

  const isBatchInGroup = (batchId: string) => collabGroups.some(g => g.batches.some(b => b.batchId === batchId))
  const freeBatches    = availableBatches.filter(b => !isBatchInGroup(b.batchId))
  const colorGroups    = groupBatchesByColorProcess(freeBatches)

  const toggleSelect = (batch: Batch) => {
    const newSel = new Set(selectedIds)
    // Enforce: can only select batches of same processCode
    if (newSel.has(batch.batchId)) {
      newSel.delete(batch.batchId)
      // Clear process lock if nothing selected
      if (newSel.size === 0) setSelectedProcess('')
    } else {
      // If selecting first batch, lock process
      if (newSel.size === 0) setSelectedProcess(batch.processCode || '')
      // If different process — block
      if (batch.processCode !== selectedProcess && newSel.size > 0) return
      newSel.add(batch.batchId)
    }
    setSelectedIds(newSel)
  }

  const createGroup = () => {
    if (selectedIds.size < 2) { alert('Select at least 2 batches to collab'); return }
    const selBatches = freeBatches.filter(b => selectedIds.has(b.batchId))
    const totalKg    = selBatches.reduce((s, b) => s + b.kg, 0)
    if (totalKg > machineCapacity) {
      if (!confirm(\`Total \${totalKg}kg exceeds machine capacity \${machineCapacity}kg. Continue?\`)) return
    }
    const processCode = selBatches[0].processCode || ''
    const processName = selBatches[0].processName || processCode
    setCollabGroups(prev => [...prev, { id: \`g-\${Date.now()}\`, batches: selBatches, totalKg, processCode, processName }])
    setSelectedIds(new Set())
    setSelectedProcess('')
  }

  const removeGroup  = (id: string) => setCollabGroups(g => g.filter(x => x.id !== id))
  const removeBatch  = (groupId: string, batchId: string) =>
    setCollabGroups(g => g.map(x => x.id !== groupId ? x : {
      ...x,
      batches: x.batches.filter(b => b.batchId !== batchId),
      totalKg: x.batches.filter(b => b.batchId !== batchId).reduce((s, b) => s + b.kg, 0)
    }).filter(x => x.batches.length >= 2))

  const toggleChecked = (batchId: string) => {
    const s = new Set(checkedIds)
    s.has(batchId) ? s.delete(batchId) : s.add(batchId)
    setCheckedIds(s)
  }

  const handleConfirm = () => {
    const inGroups    = new Set(collabGroups.flatMap(g => g.batches.map(b => b.batchId)))
    const skipBatchIds = availableBatches
      .filter(b => !inGroups.has(b.batchId) && !checkedIds.has(b.batchId))
      .map(b => b.batchId)
    onConfirm(collabGroups, skipBatchIds)
    onClose()
  }

  const processColors: Record<string, string> = {
    S: '#2563EB', D: '#7C3AED', S2: '#0891B2', Add: '#EA580C',
    Lev: '#16A34A', Fix: '#DC2626', Wash: '#0284C7', Rc: '#9333EA',
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex',
      alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
      <div style={{ background:'white', borderRadius:12, maxWidth:1100, width:'100%',
        maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)' }}>

        {/* Header */}
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #E2E8F0',
          display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:17, fontWeight:700, color:'#1A202C' }}>
              Review batch collaboration — {machineName}
            </div>
            <div style={{ fontSize:12, color:'#718096', marginTop:3 }}>
              Capacity: <strong>{machineCapacity} Kg</strong> · Target fill: <strong>{targetKg} Kg (80%)</strong>
            </div>
            <div style={{ fontSize:11, color:'#10B981', marginTop:3, fontWeight:600 }}>
              ✓ Checked batches will be numbered. Only same-process batches can be grouped.
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#718096', lineHeight:1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflow:'auto', padding:20 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

            {/* Left: Available Batches grouped by Color + Process */}
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#1A202C', marginBottom:10 }}>
                📦 Available Batches ({freeBatches.length})
              </div>
              {selectedIds.size > 0 && (
                <div style={{ fontSize:11, color:'#7C3AED', fontWeight:600, marginBottom:8,
                  background:'#F5F3FF', padding:'6px 10px', borderRadius:6 }}>
                  ⚡ {selectedIds.size} selected · Process locked to: <strong>{selectedProcess}</strong> — only same-process batches can be added
                </div>
              )}
              {colorGroups.length === 0 && (
                <div style={{ padding:30, textAlign:'center', color:'#9CA3AF', fontSize:12 }}>
                  All batches are in collab groups
                </div>
              )}
              {colorGroups.map(group => {
                const totalKg = group.batches.reduce((s, b) => s + b.kg, 0)
                const procColor = processColors[group.processCode] || '#374151'
                return (
                  <div key={group.key} style={{ marginBottom:12, border:'1px solid #E2E8F0',
                    borderRadius:8, overflow:'hidden' }}>
                    <div style={{ padding:'8px 12px', background:'#F9FAFB', borderBottom:'1px solid #E2E8F0',
                      display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <span style={{ fontSize:13, fontWeight:700, color:'#E53E3E' }}>{group.color}</span>
                        <span style={{ marginLeft:8, fontSize:11, fontWeight:700, padding:'2px 8px',
                          borderRadius:12, background: procColor + '20', color: procColor }}>
                          {group.processName}
                        </span>
                      </div>
                      <span style={{ fontSize:11, color:'#718096' }}>
                        {group.batches.length} batch{group.batches.length > 1 ? 'es' : ''} · {totalKg.toFixed(0)} Kg
                        {totalKg < targetKg && <span style={{ color:'#F59E0B', marginLeft:6 }}>⚠ Low qty</span>}
                      </span>
                    </div>
                    <div style={{ padding:8 }}>
                      {group.batches.map(batch => {
                        const isSelected = selectedIds.has(batch.batchId)
                        const isLocked   = selectedIds.size > 0 && batch.processCode !== selectedProcess && !isSelected
                        return (
                          <div key={batch.batchId} style={{ padding:'7px 10px', marginBottom:4,
                            background: isSelected ? '#EEF2FF' : isLocked ? '#F9FAFB' : 'white',
                            border: isSelected ? '2px solid #6366F1' : '1px solid #E2E8F0',
                            borderRadius:6, display:'flex', alignItems:'center', gap:8,
                            opacity: isLocked ? 0.4 : checkedIds.has(batch.batchId) ? 1 : 0.5,
                            cursor: isLocked ? 'not-allowed' : 'pointer' }}>
                            <input type="checkbox" checked={checkedIds.has(batch.batchId)}
                              onChange={e => { e.stopPropagation(); toggleChecked(batch.batchId) }}
                              onClick={e => e.stopPropagation()}
                              style={{ width:15, height:15, accentColor:'#48BB78', flexShrink:0, cursor:'pointer' }} />
                            <div style={{ flex:1 }} onClick={() => !isLocked && toggleSelect(batch)}>
                              <div style={{ fontSize:12, fontWeight:600, color:'#1A202C' }}>
                                {batch.batchIdLabel || batch.batchId}
                              </div>
                              <div style={{ fontSize:10, color:'#718096' }}>
                                {batch.orderNumber} · {batch.kg} Kg
                              </div>
                            </div>
                            <div style={{ width:15, height:15, borderRadius:3, flexShrink:0,
                              border: isSelected ? '2px solid #6366F1' : '2px solid #CBD5E0',
                              background: isSelected ? '#6366F1' : 'white',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              color:'white', fontSize:10 }}>
                              {isSelected && '✓'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              <button onClick={createGroup} disabled={selectedIds.size < 2}
                style={{ width:'100%', padding:'9px 16px', fontSize:13, fontWeight:600,
                  border:'none', borderRadius:6, marginTop:8,
                  background: selectedIds.size >= 2 ? '#6366F1' : '#CBD5E0',
                  color:'white', cursor: selectedIds.size >= 2 ? 'pointer' : 'not-allowed' }}>
                ➕ Create Collab Group ({selectedIds.size} selected)
              </button>
            </div>

            {/* Right: Collab Groups */}
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#1A202C', marginBottom:10 }}>
                🤝 Collaboration Groups ({collabGroups.length})
              </div>
              {collabGroups.length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center', border:'2px dashed #E2E8F0',
                  borderRadius:8, color:'#718096' }}>
                  <div style={{ fontSize:30, marginBottom:8 }}>🎯</div>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>No collaboration groups yet</div>
                  <div style={{ fontSize:11 }}>Select same-process batches from the left and click "Create Collab Group"</div>
                </div>
              ) : collabGroups.map((group, idx) => {
                const pct         = (group.totalKg / machineCapacity) * 100
                const overCap     = group.totalKg > machineCapacity
                const procColor   = processColors[group.processCode] || '#374151'
                return (
                  <div key={group.id} style={{ marginBottom:14, border: overCap ? '2px solid #FC8181' : '2px solid #68D391',
                    borderRadius:8, overflow:'hidden', background: overCap ? '#FFF5F5' : '#F0FFF4' }}>
                    <div style={{ padding:'10px 12px', background: overCap ? '#FED7D7' : '#C6F6D5',
                      borderBottom: overCap ? '1px solid #FC8181' : '1px solid #68D391',
                      display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:'#1A202C' }}>
                          Collab #{idx + 1}
                          <span style={{ marginLeft:8, fontSize:11, fontWeight:700, padding:'2px 8px',
                            borderRadius:12, background: procColor + '20', color: procColor }}>
                            {group.processName}
                          </span>
                        </div>
                        <div style={{ fontSize:11, color:'#718096', marginTop:2 }}>
                          {group.batches.length} batches · {group.totalKg.toFixed(1)} Kg
                          {overCap && ' ⚠️ OVER CAPACITY'}
                        </div>
                      </div>
                      <button onClick={() => removeGroup(group.id)}
                        style={{ padding:'3px 8px', fontSize:11, border:'none', borderRadius:4,
                          background:'#FC8181', color:'white', cursor:'pointer' }}>
                        Remove
                      </button>
                    </div>
                    {/* Capacity bar */}
                    <div style={{ padding:'8px 12px 4px' }}>
                      <div style={{ height:7, background:'#E2E8F0', borderRadius:4, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:\`\${Math.min(pct,100)}%\`,
                          background: overCap ? '#FC8181' : '#48BB78', transition:'width 0.3s' }} />
                      </div>
                      <div style={{ fontSize:10, color:'#718096', textAlign:'center', marginTop:3 }}>
                        {pct.toFixed(1)}% · {group.totalKg} / {machineCapacity} Kg
                      </div>
                    </div>
                    <div style={{ padding:'4px 8px 8px' }}>
                      {group.batches.map(batch => (
                        <div key={batch.batchId} style={{ padding:'7px 10px', marginBottom:4,
                          background:'white', border:'1px solid #E2E8F0', borderRadius:6,
                          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <div>
                            <div style={{ fontSize:12, fontWeight:600 }}>{batch.batchIdLabel || batch.batchId}</div>
                            <div style={{ fontSize:10, color:'#718096' }}>{batch.orderNumber} · {batch.kg} Kg</div>
                          </div>
                          <button onClick={() => removeBatch(group.id, batch.batchId)}
                            style={{ padding:'2px 6px', fontSize:10, border:'1px solid #E2E8F0',
                              borderRadius:3, background:'white', color:'#718096', cursor:'pointer' }}>
                            ✕
                          </button>
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
        <div style={{ padding:'14px 24px', borderTop:'1px solid #E2E8F0',
          display:'flex', alignItems:'center', justifyContent:'space-between', background:'#F7FAFC' }}>
          <div style={{ fontSize:12, color:'#718096' }}>
            {collabGroups.length} group{collabGroups.length !== 1 ? 's' : ''} · {freeBatches.length} batch{freeBatches.length !== 1 ? 'es' : ''} available
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose}
              style={{ padding:'8px 16px', fontSize:13, fontWeight:600, border:'1px solid #E2E8F0',
                borderRadius:6, background:'white', color:'#718096', cursor:'pointer' }}>
              Cancel
            </button>
            <button onClick={handleConfirm}
              style={{ padding:'8px 16px', fontSize:13, fontWeight:600, border:'none',
                borderRadius:6, background:'#48BB78', color:'white', cursor:'pointer' }}>
              ✓ Run Numbering
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
`

fs.writeFileSync(modalPath, newModal, 'utf8')
console.log('✓ BatchCollaborationModal rewritten — groups by Color+Process, enforces same-process collab')
console.log('\n✓ Both fixes done.')
