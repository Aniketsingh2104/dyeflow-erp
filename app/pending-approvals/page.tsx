'use client'

import { useEffect, useState, useCallback } from 'react'

async function getSheets() {
  const res = await fetch('/api/order-sheets', { cache: 'no-store' })
  return res.json()
}

async function updateSheetRows(id: string, rows: any[]) {
  const res = await fetch('/api/order-sheets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update_rows', id, rows }),
  })
  return res.json()
}

async function createOrderInSupabase(payload: Record<string, any>) {
  const res = await fetch('/api/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', ...payload }),
  })
  return res.json()
}

function genOrderNumber(existing: string[]): string {
  const year = new Date().getFullYear().toString().slice(2)
  const nums = existing
    .filter(n => n?.startsWith(`DYE${year}-`))
    .map(n => parseInt(n.split('-')[1]) || 0)
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `DYE${year}-${String(next).padStart(4, '0')}`
}

const fmtDate = (d?: string) => {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) }
  catch { return d }
}

const val = (v: any) => (v === undefined || v === null || v === '') ? '-' : String(v)

const ORDER_COLS: { label: string; key: string; bold?: boolean; numeric?: boolean; width?: number }[] = [
  { label: 'Party',           key: 'party',          bold: true,  width: 110 },
  { label: 'Sub Party',       key: 'subParty',                    width: 100 },
  { label: 'Sales Person',    key: 'salesPerson',                 width: 110 },
  { label: 'Article',         key: 'article',        bold: true,  width: 90  },
  { label: 'Blend',           key: 'blend',                       width: 60  },
  { label: 'Width',           key: 'width',                       width: 55  },
  { label: 'GSM',             key: 'gsm',                         width: 55  },
  { label: 'Color',           key: 'color',          bold: true,  width: 90  },
  { label: 'Lab No.',         key: 'labNo',                       width: 90  },
  { label: 'Lot No.',         key: 'lotNo',                       width: 80  },
  { label: 'Challan No.',     key: 'challanNo',                   width: 100 },
  { label: 'Qty (KG)',        key: 'qtyKg',    bold: true, numeric: true, width: 85 },
  { label: 'Qty (MTR)',       key: 'qtyMtr',          numeric: true, width: 85 },
  { label: 'No. of Taka',     key: 'noOfTa',          numeric: true, width: 90 },
  { label: 'Type of Finish',  key: 'typeOfFinish',                width: 120 },
  { label: 'Type of Packing', key: 'typeOfPacking',               width: 120 },
  { label: 'Remarks',         key: 'remarks',                     width: 140 },
]

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:  { bg: '#FEF3C7', color: '#92400E' },
  approved: { bg: '#D1FAE5', color: '#065F46' },
  rejected: { bg: '#FEE2E2', color: '#991B1B' },
  draft:    { bg: 'var(--bg-secondary)', color: 'var(--text-tertiary)' },
}

export default function PendingApprovalsPage() {
  const [items,        setItems]        = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [rejectModal,  setRejectModal]  = useState<any>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [toast,        setToast]        = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getSheets()
      if (!res.ok) return
      const pending: any[] = []
      for (const sheet of (res.data || [])) {
        for (let i = 0; i < (sheet.rows || []).length; i++) {
          const row = sheet.rows[i]
          if (row.isBatchRow) continue
          if (row.approvalStatus !== 'pending' && !row.submitForApproval) continue
          pending.push({ sheet, row, rowIndex: i })
        }
      }
      setItems(pending)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleApprove = async (item: any) => {
    if (!confirm('Approve this row and create an order?')) return
    setSaving(true)
    try {
      const existRes    = await fetch('/api/orders', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] }))
      const orderNumber = genOrderNumber((existRes.data || []).map((o: any) => o.order_number))
      const { row }     = item

      // Create order using only columns that exist in the orders table
      const result = await createOrderInSupabase({
        order_number:    orderNumber,
        party:           row.party           || '',
        article:         row.article         || '',
        blend:           row.blend           || '',
        color:           row.color           || '',
        challan_no:      row.challanNo       || '',
        qty_kg:          parseFloat(row.qtyKg)  || 0,
        qty_mtr:         parseFloat(row.qtyMtr) || 0,
        no_of_taka:      parseInt(row.noOfTa)   || 0,
        width:           row.width           || '',
        gsm:             row.gsm             || '',
        lab_no:          row.labNo           || '',
        lot_no:          row.lotNo           || '',
        sub_party:       row.subParty        || '',
        sales_person:    row.salesPerson     || '',
        type_of_finish:  row.typeOfFinish    || '',
        type_of_packing: row.typeOfPacking   || '',
        delivery_date:   row.deliveryDate    || '',
        remarks:         row.remarks         || '',
        status:          'new',
        process_route:   [],
      })

      if (!result.ok) { alert('Error creating order: ' + result.error); return }

      // Update the sheet row status to approved
      const updatedRows = [...item.sheet.rows]
      updatedRows[item.rowIndex] = {
        ...row,
        approvalStatus:    'approved',
        orderNumber,
        submitForApproval: false,
        requestEdit:       false,
        receivedAt:        new Date().toISOString(),
      }

      const res2 = await updateSheetRows(item.sheet.id, updatedRows)
      if (!res2.ok) { alert('Warning: order created but sheet update failed'); return }
      showToast(`✓ Approved! Order ${orderNumber} created.`)
      load()
    } finally { setSaving(false) }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) { alert('Enter a rejection reason.'); return }
    if (!rejectModal) return
    setSaving(true)
    try {
      const updatedRows = [...rejectModal.sheet.rows]
      updatedRows[rejectModal.rowIndex] = {
        ...rejectModal.row,
        approvalStatus:    'rejected',
        submitForApproval: false,
        requestEdit:       false,
        rejectionReason:   rejectReason,
        receivedAt:        new Date().toISOString(),
      }
      await updateSheetRows(rejectModal.sheet.id, updatedRows)
      setRejectModal(null); setRejectReason('')
      showToast('Row rejected.')
      load()
    } finally { setSaving(false) }
  }

  return (
    <div className="content" style={{ padding: '16px 20px' }}>

      {toast && (
        <div style={{ position:'fixed', top:16, right:20, zIndex:9999, background:'#D1FAE5', border:'1px solid #6EE7B7', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:600, color:'#065F46', boxShadow:'0 4px 12px rgba(0,0,0,0.1)' }}>
          {toast}
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18, fontWeight:800 }}>Pending Approvals</span>
          <span style={{ fontSize:13, fontWeight:700, padding:'3px 12px', borderRadius:20,
            background: items.length > 0 ? '#FEF3C7' : 'var(--bg-secondary)',
            color:      items.length > 0 ? '#92400E' : 'var(--text-tertiary)' }}>
            {items.length}
          </span>
        </div>
        <button className="small" onClick={load} disabled={loading}>
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-tertiary)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign:'center', padding:60 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:15, fontWeight:600, color:'var(--success)' }}>No rows pending approval.</div>
        </div>
      ) : (
        <div style={{ background:'var(--bg-primary)', border:'1px solid var(--border-light)', borderRadius:12, overflow:'hidden' }}>
          <div style={{ overflowX:'auto', maxHeight:'calc(100vh - 160px)', overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead style={{ position:'sticky', top:0, zIndex:10, background:'var(--bg-secondary)' }}>
                <tr>
                  <th style={{ ...th, position:'sticky', left:0, zIndex:12, background:'var(--bg-secondary)' }}>SHEET</th>
                  <th style={th}>ROW</th>
                  <th style={th}>STATUS</th>
                  <th style={th}>SUBMITTED ON</th>
                  {ORDER_COLS.map(c => (
                    <th key={c.key} style={{ ...th, minWidth: c.width || 90 }}>{c.label.toUpperCase()}</th>
                  ))}
                  <th style={{ ...th, position:'sticky', right:0, zIndex:12, background:'var(--bg-secondary)', boxShadow:'-2px 0 6px rgba(0,0,0,0.08)' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const status = item.row.approvalStatus || 'pending'
                  const sty    = STATUS_STYLE[status] || STATUS_STYLE.draft
                  const rowBg  = status === 'pending' ? '#FFFBEB' : i%2===0 ? 'var(--bg-primary)' : 'var(--bg-secondary)'
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid var(--border-light)', background: rowBg }}>
                      <td style={{ ...td, position:'sticky', left:0, zIndex:2, background: rowBg, fontWeight:700, color:'var(--accent)', whiteSpace:'nowrap', boxShadow:'2px 0 4px rgba(0,0,0,0.04)' }}>
                        {item.sheet.title}
                      </td>
                      <td style={{ ...td, textAlign:'center', color:'var(--text-tertiary)', fontWeight:600 }}>
                        {item.rowIndex + 1}
                      </td>
                      <td style={{ ...td, whiteSpace:'nowrap' }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:sty.bg, color:sty.color }}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </td>
                      <td style={{ ...td, whiteSpace:'nowrap', fontSize:11, color:'var(--text-secondary)' }}>
                        {fmtDate(item.row.submittedOn || item.row.receivedAt)}
                      </td>
                      {ORDER_COLS.map(c => (
                        <td key={c.key} style={{ ...td,
                          fontWeight:   c.bold ? 600 : 400,
                          color:        c.numeric && item.row[c.key] ? 'var(--accent-dark)' : 'var(--text-primary)',
                          textAlign:    c.numeric ? 'right' : 'left',
                          whiteSpace:   'nowrap',
                          maxWidth:     c.key === 'remarks' ? 180 : undefined,
                          overflow:     'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {val(item.row[c.key])}
                        </td>
                      ))}
                      <td style={{ ...td, whiteSpace:'nowrap', position:'sticky', right:0, background: rowBg, zIndex:2, boxShadow:'-2px 0 6px rgba(0,0,0,0.08)' }}>
                        <button
                          style={{ padding:'5px 14px', fontSize:11, fontWeight:700, border:'none', borderRadius:6, background:'#059669', color:'#fff', cursor:'pointer', marginRight:6 }}
                          disabled={saving} onClick={()=>handleApprove(item)}>
                          Approve
                        </button>
                        <button
                          style={{ padding:'5px 10px', fontSize:11, fontWeight:700, border:'1px solid #FCA5A5', borderRadius:6, background:'#FEF2F2', color:'#DC2626', cursor:'pointer' }}
                          onClick={()=>{ setRejectModal(item); setRejectReason('') }}>
                          Reject
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'8px 16px', borderTop:'1px solid var(--border-light)', fontSize:11, color:'var(--text-tertiary)', display:'flex', justifyContent:'space-between' }}>
            <span>{items.length} row{items.length!==1?'s':''} pending approval</span>
            <span>Approve creates a new order in Supabase</span>
          </div>
        </div>
      )}

      {rejectModal && (
        <div className="modal-overlay" onClick={()=>setRejectModal(null)}>
          <div className="modal" style={{ maxWidth:480 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Reject Row</span>
              <button className="small" onClick={()=>setRejectModal(null)}>✕</button>
            </div>
            <div style={{ background:'var(--bg-secondary)', borderRadius:8, padding:'10px 12px', marginBottom:14, fontSize:12 }}>
              <div><strong>Sheet:</strong> {rejectModal.sheet.title} · Row {rejectModal.rowIndex+1}</div>
              <div style={{ marginTop:4 }}>
                <strong>Party:</strong> {rejectModal.row.party} ·{' '}
                <strong>Article:</strong> {rejectModal.row.article} ·{' '}
                <strong>Color:</strong> {rejectModal.row.color} ·{' '}
                <strong>Qty:</strong> {rejectModal.row.qtyKg} Kg
              </div>
            </div>
            <div className="form-group" style={{ marginBottom:14 }}>
              <label>Rejection reason *</label>
              <textarea value={rejectReason} rows={4} autoFocus
                onChange={e=>setRejectReason(e.target.value)}
                placeholder="Enter rejection reason…" />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button style={{ background:'var(--danger)', color:'#fff', border:'none', padding:'9px 18px', borderRadius:6, fontWeight:700, cursor:'pointer', flex:1 }}
                disabled={saving} onClick={handleReject}>
                {saving ? 'Rejecting…' : 'Reject Row'}
              </button>
              <button onClick={()=>setRejectModal(null)} style={{ flex:1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em',
  borderBottom: '2px solid var(--border-light)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12, color: 'var(--text-primary)' }
