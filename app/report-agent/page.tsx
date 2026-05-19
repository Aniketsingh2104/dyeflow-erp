'use client'

import { useEffect, useRef, useState } from 'react'
import { QUERY_LIBRARY, QUERY_CATALOG, ReportResult } from '@/lib/reportQueries'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  reportData?: ReportResult | null
  loading?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtDT(s: string) {
  if (!s) return '-'
  try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return s }
}

function buildDbSnapshot(): string {
  const raw = localStorage.getItem('dyeflow_db')
  if (!raw) return 'Database is empty.'
  const db = JSON.parse(raw)
  const orders: any[] = db.orders || []
  const fobRecords: any[] = db.fobRecords || []
  const faultyRecords: any[] = db.faultyRecords || []
  const machines: any[] = db.machines || []
  const supervisors: any[] = db.supervisors || []
  const processList: any[] = db.processList || []
  const now = new Date()

  const statusMap: Record<string, number> = {}
  orders.forEach(o => { statusMap[o.status || 'new'] = (statusMap[o.status || 'new'] || 0) + 1 })

  const processCodeList = processList
    .filter((p: any) => p.enabled)
    .map((p: any) => `${p.code}=${p.name}`)
    .join(', ')

  const batchesByProcess: Record<string, number> = {}
  orders.forEach(o => {
    ;(o.splits || []).forEach((b: any) => {
      const proc = b.fmsCurrentProcess
      if (proc && !b.fmsDone) batchesByProcess[proc] = (batchesByProcess[proc] || 0) + 1
    })
  })

  return `TODAY: ${now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}

FACTORY STATS:
- Total orders: ${orders.length} | Status: ${Object.entries(statusMap).map(([s, n]) => s + ':' + n).join(', ')}
- Machines: ${machines.map((m: any) => m.name || m.id).join(', ')}
- Supervisors: ${supervisors.map((s: any) => s.name).join(', ')}
- FOB Records: ${fobRecords.length} total | Open: ${fobRecords.filter(r => r.status === 'open').length}
- Faulty Records: ${faultyRecords.length} total | Open: ${faultyRecords.filter(r => r.status === 'open').length}

PROCESS CODES (code=name): ${processCodeList || 'C=CBR, H=Heat-Set, D=Dyeing, F=Finish, Qa=QA'}

ACTIVE BATCHES BY PROCESS:
${Object.entries(batchesByProcess).map(([p, n]) => `  ${p}: ${n} batch(es)`).join('\n') || '  none'}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute query from library
// ─────────────────────────────────────────────────────────────────────────────
function executeQuery(fnName: string, params: any): ReportResult | null {
  try {
    const fn = QUERY_LIBRARY[fnName]
    if (!fn) return null
    return fn(params)
  } catch (e) {
    console.error('Query execution error:', fnName, e)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI call — AI only picks from the query catalog, never writes raw code
// ─────────────────────────────────────────────────────────────────────────────
async function callReportAgent(
  messages: { role: string; content: string }[],
  dbSnapshot: string
): Promise<string> {
  const system = `You are DyeFlow Report Agent. Your ONLY job is to pick the right pre-built query from the catalog and return the correct parameters.

FACTORY DATABASE SNAPSHOT:
${dbSnapshot}

${QUERY_CATALOG}

RESPONSE RULES:
1. Return ONLY a raw JSON object — no markdown, no backticks, no explanation
2. Start with { and end with }

RESPONSE FORMAT:

To run a report: {"type":"run","fn":"queryFunctionName","params":{...}}
To ask for clarification: {"type":"clarify","question":"...","suggestions":["...","..."]}
To answer a general question: {"type":"answer","text":"..."}

EXAMPLES:

User: "Total batch pending on CBR"
Response: {"type":"run","fn":"batchesAtProcess","params":{"processCode":"C","processName":"CBR"}}

User: "FOB approval pending more than 7 days"
Response: {"type":"run","fn":"fobPendingApproval","params":{"minDays":7}}

User: "Faulty batches open more than 5 days"
Response: {"type":"run","fn":"faultyOpenMoreThan","params":{"days":5}}

User: "Orders due in next 3 days"
Response: {"type":"run","fn":"ordersDueInDays","params":{"days":3}}

User: "Overdue orders by supervisor"
Response: {"type":"run","fn":"overdueOrders","params":{"groupBy":"supervisor"}}

User: "Machine wise active batch count"
Response: {"type":"run","fn":"machineWiseBatches","params":{}}

User: "Batches stuck at Dyeing for more than 2 days"
Response: {"type":"run","fn":"batchesStuckAtProcess","params":{"processCode":"D","processName":"Dyeing","days":2}}

User: "Party wise pending orders"
Response: {"type":"run","fn":"partyWiseOrders","params":{}}

User: "Orders on hold"
Response: {"type":"run","fn":"ordersOnHold","params":{}}

User: "FOB reprocess pending"
Response: {"type":"run","fn":"fobReprocessPending","params":{}}

IMPORTANT: Always use the PROCESS CODES from the snapshot to resolve process names to codes.
If user says "CBR" look up its code from the PROCESS CODES list and use that code.
Return ONLY JSON. No text before or after.`

  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system, max_tokens: 500 }),
  })
  if (!response.ok) throw new Error(`AI error ${response.status}`)
  const data = await response.json()
  return data.content?.[0]?.text || ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse AI response robustly
// ─────────────────────────────────────────────────────────────────────────────
function parseAiResponse(raw: string): any | null {
  const text = raw.trim()
  try { return JSON.parse(text) } catch {}
  try {
    const md = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (md) return JSON.parse(md[1].trim())
  } catch {}
  try {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) return JSON.parse(text.slice(start, end + 1))
  } catch {}
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Report Table
// ─────────────────────────────────────────────────────────────────────────────
function ReportTable({ report }: { report: ReportResult }) {
  const exportCSV = () => {
    const csv = [report.columns, ...report.rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${report.title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (report.totalRows === 0) {
    return (
      <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '12px 16px', marginTop: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#065F46' }}>✓ {report.title}</div>
        <div style={{ fontSize: 12, color: '#059669', marginTop: 4 }}>{report.summary || 'No records found matching your criteria.'}</div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10, border: '1px solid var(--border-light)', borderRadius: 8, overflow: 'hidden', fontSize: 12 }}>
      <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{report.title}</div>
          {report.subtitle && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{report.subtitle}</div>}
          {report.summary && <div style={{ fontSize: 11, color: '#185FA5', marginTop: 3, fontWeight: 600 }}>{report.summary}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{report.totalRows} rows</span>
          <button onClick={exportCSV}
            style={{ padding: '3px 9px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 5, background: '#1D9E75', color: '#fff', cursor: 'pointer' }}>
            ⬇ CSV
          </button>
        </div>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 380 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#F9FAFB', zIndex: 1 }}>
            <tr>
              {report.columns.map((col, i) => (
                <th key={i} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: '#111827' }}>
                    {String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '4px 10px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-light)', fontSize: 10, color: 'var(--text-tertiary)' }}>
        Generated {fmtDT(report.generatedAt)}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick report chips
// ─────────────────────────────────────────────────────────────────────────────
const QUICK_REPORTS: Array<{ label: string; fn: string; params: any }> = [
  { label: 'FOB approval pending > 7 days',    fn: 'fobPendingApproval',     params: { minDays: 7 } },
  { label: 'Faulty batches open > 5 days',     fn: 'faultyOpenMoreThan',     params: { days: 5 } },
  { label: 'Orders due in next 3 days',         fn: 'ordersDueInDays',        params: { days: 3 } },
  { label: 'Batches at CBR',                   fn: 'batchesAtProcess',       params: { processCode: 'C', processName: 'CBR' } },
  { label: 'Batches at Dyeing',                fn: 'batchesAtProcess',       params: { processCode: 'D', processName: 'Dyeing' } },
  { label: 'Overdue orders by supervisor',     fn: 'overdueOrders',          params: { groupBy: 'supervisor' } },
  { label: 'Machine wise batch count',         fn: 'machineWiseBatches',     params: {} },
  { label: 'All batches by process',           fn: 'batchesByProcess',       params: {} },
  { label: 'Party wise pending orders',        fn: 'partyWiseOrders',        params: {} },
  { label: 'Orders on hold',                   fn: 'ordersOnHold',           params: {} },
  { label: 'FOB not yet sent',                 fn: 'fobNotSent',             params: {} },
  { label: 'FOB reprocess pending',            fn: 'fobReprocessPending',    params: {} },
]

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportAgentPage() {
  const [messages, setMessages] = useState<Message[]>([{
    id: 'welcome',
    role: 'assistant',
    content: `I'm your **DyeFlow Report Agent**. Tell me what report you need in plain language — I'll run it instantly from your live factory data.\n\n**Examples:**\n• "Total batch pending on CBR"\n• "FOB approval pending more than 7 days"\n• "Batches stuck at Dyeing for more than 2 days"\n• "Overdue orders by supervisor"\n• "Party wise pending orders"\n\nOr click a quick report below.`,
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Run a query directly from the library (for quick chips — no AI needed)
  const runDirect = (fn: string, params: any, label: string) => {
    if (loading) return
    const userMsg: Message = { id: `u${Date.now()}`, role: 'user', content: label }
    const report = executeQuery(fn, params)
    const assistantMsg: Message = {
      id: `a${Date.now()}`,
      role: 'assistant',
      content: report ? `Report ready: **${report.title}** — ${report.totalRows} records` : '⚠ Could not run report.',
      reportData: report,
    }
    setMessages(prev => [...prev, userMsg, assistantMsg])
  }

  // Send via AI for natural language queries
  const send = async (text?: string) => {
    const question = (text || input).trim()
    if (!question || loading) return
    setInput('')

    const userMsg: Message = { id: `u${Date.now()}`, role: 'user', content: question }
    const loadingMsg: Message = { id: `a${Date.now()}`, role: 'assistant', content: '', loading: true }
    setMessages(prev => [...prev, userMsg, loadingMsg])
    setLoading(true)

    try {
      const dbSnapshot = buildDbSnapshot()
      const history = messages
        .filter(m => !m.loading && m.id !== 'welcome')
        .slice(-6)
        .map(m => ({ role: m.role, content: m.content }))

      const raw = await callReportAgent([...history, { role: 'user', content: question }], dbSnapshot)
      const parsed = parseAiResponse(raw)

      if (!parsed) {
        setMessages(prev => prev.map(m => m.loading ? { ...m, content: 'Could not understand the request. Please rephrase.', loading: false } : m))
        return
      }

      if (parsed.type === 'clarify') {
        const suggestions = (parsed.suggestions || []).map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')
        setMessages(prev => prev.map(m => m.loading ? {
          ...m,
          content: `**${parsed.question}**${suggestions ? '\n\n' + suggestions : ''}`,
          loading: false, reportData: null
        } : m))
        return
      }

      if (parsed.type === 'answer') {
        setMessages(prev => prev.map(m => m.loading ? { ...m, content: parsed.text, loading: false, reportData: null } : m))
        return
      }

      if (parsed.type === 'run' && parsed.fn) {
        const report = executeQuery(parsed.fn, parsed.params || {})
        setMessages(prev => prev.map(m => m.loading ? {
          ...m,
          content: report
            ? `Report ready: **${report.title}** — ${report.totalRows} records`
            : `⚠ Could not run report "${parsed.fn}". Try rephrasing.`,
          loading: false,
          reportData: report || null
        } : m))
        return
      }

      setMessages(prev => prev.map(m => m.loading ? { ...m, content: raw || 'Unexpected response.', loading: false } : m))

    } catch (err) {
      setMessages(prev => prev.map(m => m.loading ? { ...m, content: `Error: ${String(err)}`, loading: false } : m))
    } finally {
      setLoading(false)
    }
  }

  const renderMd = (text: string) =>
    text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 44px)' }}>

      {/* Header */}
      <div style={{ paddingBottom: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, background: 'linear-gradient(135deg, #185FA5, #7C3AED)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📊</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Report Agent</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Generate any report from your live factory data — always accurate, no guessing</div>
          </div>
        </div>
      </div>

      {/* Quick chips — bypass AI, run directly from verified library */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, flexShrink: 0 }}>
        {QUICK_REPORTS.map((r, i) => (
          <button key={i} onClick={() => runDirect(r.fn, r.params, r.label)} disabled={loading}
            style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, border: '1px solid var(--border-medium)', borderRadius: 20, background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: loading ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: loading ? 0.5 : 1 }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Chat messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 8 }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', width: '100%' }}>
            <div style={{
              maxWidth: msg.reportData ? '100%' : '78%',
              width: msg.reportData ? '100%' : undefined,
              background: msg.role === 'user' ? '#185FA5' : 'var(--bg-primary)',
              color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
              border: msg.role === 'assistant' ? '1px solid var(--border-light)' : 'none',
              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              padding: '10px 14px',
              fontSize: 13,
              lineHeight: 1.6,
            }}>
              {msg.loading ? (
                <span style={{ color: 'var(--text-tertiary)' }}>⏳ Running report…</span>
              ) : (
                <>
                  <div dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
                  {msg.reportData && <ReportTable report={msg.reportData} />}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ flexShrink: 0, marginTop: 6 }}>
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-medium)', borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask for any report… e.g. 'Batches at Heat-Set' · 'FOB pending approval 7 days' · 'Orders due this week'"
            rows={2}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, resize: 'none', background: 'transparent', fontFamily: 'inherit', color: 'var(--text-primary)' }}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 8, background: loading || !input.trim() ? 'var(--bg-secondary)' : '#185FA5', color: loading || !input.trim() ? 'var(--text-tertiary)' : '#fff', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
            Generate ↵
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 4 }}>
          Enter to generate · Shift+Enter for new line · All reports export as CSV
        </div>
      </div>
    </div>
  )
}
