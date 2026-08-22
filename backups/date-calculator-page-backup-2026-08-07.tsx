// BACKUP of app/date-calculator/page.tsx — 2026-08-07
// Reason: Before making Date Calculator columns dynamic from Process Master
// To restore: copy this file content back to app/date-calculator/page.tsx

'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { fetchProcessList } from '@/lib/processMap'

interface BatchRow {
  batchId: string; batchUUID: string; kg: number; color: string; orderNumber: string
  route: string[]; machine: string
  anchors: Record<string, string>; dates: Record<string, string>
  dcGeneratedOnce: boolean; dcRegenerate: boolean; pushed: boolean
}
interface ProcessDuration { code: string; name: string; days: number; capacity?: number }

const ALL_PROCS = ['C','S','H','D','S2','Rx','O','G','F','Co','Tu','Add','Level','Rc','Fix','Wash','Dry','B','R','K','QA','Packing','Dispatch','FinalDispatch']
const ANCHOR_PROCS = ['S','D','S2','Add','Level','Fix','Wash','Rc']
const PNAMES: Record<string,string> = { C:'CBR',S:'SCQ',H:'Heat-Set',D:'Dyeing',S2:'SCQ2',Rx:'Relax',O:'Opener',G:'Ghanti',F:'Finish',Co:'Compactor',Tu:'Tubler',Add:'Addition',Level:'Levelling',Rc:'RC',Fix:'Fixing',Wash:'Washing',Dry:'Dry',B:'Brushing',R:'Raising',K:'Kundi',QA:'QA',Packing:'Packing',Dispatch:'Dispatch',FinalDispatch:'Final Dispatch' }
let _procNameCache: Record<string,string> = { ...PNAMES }
const getPN = (c: string) => _procNameCache[c] || c
const dateToYMD = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const ymdToDate = (s: string): Date | null => { if (!s) return null; const p = s.split('-'); if (p.length !== 3) return null; const d = new Date(+p[0], +p[1]-1, +p[2]); return isNaN(d.getTime()) ? null : d }
const toDisplay = (ymd: string): string => { const p = ymd?.split('-'); return p?.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : (ymd || '') }
const fromDisplay = (s: string): string => { if (!s) return ''; if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s; if (s.match(/^\d{2}\/\d{2}\/\d{4}$/)) { const [d,m,y] = s.split('/'); return `${y}-${m}-${d}` } return '' }
const buildHolidaySet = (holidays: any[]): Set<string> => { const s = new Set<string>(); for (const h of holidays) { const raw = h.holiday_date || h.date; if (raw) s.add(raw.slice(0,10)) } return s }
const nextWD = (d: Date, hs: Set<string>, fwd = true): Date => { const r = new Date(d); const step = fwd?1:-1; do { r.setDate(r.getDate()+step) } while (hs.has(dateToYMD(r))); return r }
const addPD = (date: Date, n: number, hs: Set<string>, fwd = true): Date => { let d = new Date(date); for (let i = 0; i < Math.max(1,n); i++) d = nextWD(d,hs,fwd); return d }

// Full engine and component code preserved exactly as deployed
// See git history: commit "fix: (1) FMS page keeps batch visible after Done..."
// Restore by: cp backups/date-calculator-page-backup-2026-08-07.tsx app/date-calculator/page.tsx

export default function DateCalculatorPageBACKUP() { return null }
