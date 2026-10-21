'use client'
// The recipe saved for an order's Lab No. (Lab → Receipe page, table
// lab_recipes), shown in the order's View window. Nothing when there is none.
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function LabRecipeBox({ labNo }: { labNo?: string | null }) {
  const [rec, setRec] = useState<any>(null)
  const key = String(labNo || '').trim().toUpperCase()
  useEffect(() => {
    setRec(null)
    if (!key || key === '-') return
    let gone = false
    fetch(`/api/lab?type=recipes&lab_no=${encodeURIComponent(key)}`, { cache: 'no-store' }).then(r => r.json())
      .then(j => { if (!gone && j.ok && j.data?.[0]) setRec(j.data[0]) }).catch(() => {})
    return () => { gone = true }
  }, [key])
  if (!rec) return null
  return (
    <div style={{ margin: '4px 0 12px', background: '#F3E8FF', border: '1px solid #D8B4FE', borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B21A8', textTransform: 'uppercase', marginBottom: 6 }}>
        Lab Recipe · {rec.lab_no}
        <Link href="/lab/receipe" style={{ marginLeft: 8, fontWeight: 500, textTransform: 'none', fontSize: 11 }}>open Recipe page →</Link>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(rec.recipe || []).map((ing: any, i: number) => (
          <span key={i} style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: '#6A1B9A', color: '#fff' }}>
            {ing.name}{ing.qty ? ` (${ing.qty})` : ''}
          </span>
        ))}
      </div>
      {rec.remarks && <div style={{ fontSize: 11, color: '#6B21A8', marginTop: 6 }}>{rec.remarks}</div>}
    </div>
  )
}
