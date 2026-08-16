'use client'
import React from 'react'

interface ReprocessData {
  reprocess_type:   'full' | 'partial'
  reprocess_kg?:    number
  reprocess_mtr?:   number
  reprocess_taka?:  number
  reprocess_reason: string
}

interface Props {
  record:      any
  onClose:     () => void
  onConfirm:   (data: ReprocessData) => void
  saving:      boolean
  sourceLabel: string
  kgField:     string
}

export default function ReprocessModal({ record, onClose, onConfirm, saving, sourceLabel, kgField }: Props) {
  const [type,   setType]   = React.useState<'full'|'partial'>('full')
  const [kg,     setKg]     = React.useState('')
  const [mtr,    setMtr]    = React.useState('')
  const [taka,   setTaka]   = React.useState('')
  const [reason, setReason] = React.useState('')

  const totalKg  = parseFloat(record?.[kgField] || record?.kg || 0)
  const remainKg = type === 'partial' && parseFloat(kg) > 0
    ? Math.max(0, totalKg - parseFloat(kg))
    : 0
  const canSubmit = reason.trim().length > 0 &&
    (type === 'full' || (parseFloat(kg) > 0 && parseFloat(kg) <= totalKg))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <span className="modal-title">🔄 Reprocess — {record?.batch_id_str}</span>
          <button className="small" onClick={onClose}>✕</button>
        </div>

        {/* Batch info */}
        <div style={{ background: '#FFFBEB', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          <strong style={{ color: '#D97706' }}>{record?.batch_id_str}</strong>
          <span style={{ marginLeft: 8, color: '#374151' }}>
            {record?.color} · Total: <strong>{totalKg} Kg</strong> · {sourceLabel} at <strong>{record?.process_code}</strong>
          </span>
        </div>

        {/* Full / Partial toggle */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Reprocess Type
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['full', 'partial'] as const).map(t => (
              <button key={t} onClick={() => setType(t)} style={{
                flex: 1, padding: '10px 0', fontSize: 13,
                fontWeight: type === t ? 700 : 400,
                border: `2px solid ${type === t ? '#D97706' : 'var(--border-medium)'}`,
                borderRadius: 8, cursor: 'pointer',
                background: type === t ? '#FEF3C7' : 'var(--bg-primary)',
                color: type === t ? '#D97706' : 'var(--text-secondary)',
              }}>
                {t === 'full' ? `♻ Full (${totalKg} Kg)` : '✂ Partial (enter qty)'}
              </button>
            ))}
          </div>
        </div>

        {/* Partial inputs */}
        {type === 'partial' && (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Reprocess Quantity</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>KG *</label>
                <input type="number" min="0.1" max={totalKg} step="0.1" value={kg}
                  onChange={e => setKg(e.target.value)}
                  placeholder={`max ${totalKg}`}
                  style={{ width: '100%', padding: '6px 8px', fontSize: 13,
                    border: `1px solid ${parseFloat(kg) > totalKg ? 'var(--danger)' : 'var(--border-medium)'}`,
                    borderRadius: 4, background: 'var(--bg-primary)' }} />
                {parseFloat(kg) > totalKg && (
                  <div style={{ fontSize: 10, color: 'var(--danger)', marginTop: 2 }}>Cannot exceed {totalKg} Kg</div>
                )}
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>MTR</label>
                <input type="number" min="0" step="0.1" value={mtr}
                  onChange={e => setMtr(e.target.value)} placeholder="optional"
                  style={{ width: '100%', padding: '6px 8px', fontSize: 13,
                    border: '1px solid var(--border-medium)', borderRadius: 4, background: 'var(--bg-primary)' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>TAKA</label>
                <input type="number" min="0" step="1" value={taka}
                  onChange={e => setTaka(e.target.value)} placeholder="optional"
                  style={{ width: '100%', padding: '6px 8px', fontSize: 13,
                    border: '1px solid var(--border-medium)', borderRadius: 4, background: 'var(--bg-primary)' }} />
              </div>
            </div>
            {parseFloat(kg) > 0 && parseFloat(kg) < totalKg && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: '#DCFCE7', borderRadius: 6, fontSize: 12, color: '#166534' }}>
                ✓ Remaining <strong>{remainKg.toFixed(1)} Kg</strong> will continue to next process
              </div>
            )}
          </div>
        )}

        {/* Reason */}
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Reason / Remark <span style={{ color: 'var(--danger)' }}>*</span></label>
          <textarea value={reason} rows={3} autoFocus
            placeholder="e.g. Shade variation — needs re-dyeing…"
            onChange={e => setReason(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button
            disabled={!canSubmit || saving}
            onClick={() => onConfirm({
              reprocess_type:   type,
              reprocess_kg:     type === 'partial' ? parseFloat(kg) || 0 : undefined,
              reprocess_mtr:    type === 'partial' ? parseFloat(mtr) || 0 : undefined,
              reprocess_taka:   type === 'partial' ? parseFloat(taka) || 0 : undefined,
              reprocess_reason: reason,
            })}
            style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700, border: 'none',
              borderRadius: 6, cursor: canSubmit ? 'pointer' : 'not-allowed',
              background: canSubmit ? '#D97706' : '#CBD5E0', color: 'white' }}>
            {saving ? 'Processing…' : '🔄 Send to Repairing'}
          </button>
        </div>
      </div>
    </div>
  )
}
