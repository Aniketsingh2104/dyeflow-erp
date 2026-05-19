'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  buildDbContext,
  buildAssignmentContext,
  buildDelayContext,
  buildCustomerContext,
  buildActionsContext,
  buildSchedulerContext,
  buildCostContext,
} from '@/lib/dbContext'
import { logAudit } from '@/lib/auditLog'

// ── Voice Input Hook ────────────────────────────────────────────────────────────

function useVoiceInput(onResult: (text: string) => void, lang: string = 'hi-IN') {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const [error, setError] = useState('')
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSupported(!!SpeechRecognition)
  }, [])

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { setError('Voice not supported in this browser. Use Chrome.'); return }

    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => { setListening(true); setError('') }
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setListening(false)
      onResult(transcript)
    }
    recognition.onerror = (event: any) => {
      setListening(false)
      if (event.error === 'not-allowed') setError('Microphone access denied. Allow mic in browser settings.')
      else if (event.error === 'no-speech') setError('No speech detected. Try again.')
      else setError(`Voice error: ${event.error}`)
    }
    recognition.onend = () => setListening(false)
    recognition.start()
  }, [onResult, lang])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  return { listening, supported, error, startListening, stopListening }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  loading?: boolean
}

interface ProposedAction {
  type: 'status_change' | 'assign_supervisor' | 'add_hold' | 'update_remark' | 'bulk_assign'
  orderNumber?: string
  orderNumbers?: string[]
  field: string
  oldValue?: string
  newValue: string
  description: string
}

type ActiveTab = 'chat' | 'briefing' | 'assign' | 'faulty' | 'delay' | 'actions' | 'report' | 'customer' | 'scheduler' | 'cost'

const SUGGESTIONS: Record<string, string[]> = {
  chat: [
    'Which orders are overdue or at risk?',
    'Which machine has the highest load right now?',
    'How many orders does each supervisor have?',
    'Show me all open faulty batches',
    'Which orders are in the Dyeing process right now?',
    'What is the total Kg in production today?',
    'Which party has the most orders pending?',
    'Are there any orders on hold? Why?',
  ],
}

// ── Anthropic API call ────────────────────────────────────────────────────────

async function callClaude(
  messages: { role: 'user' | 'assistant'; content: string }[],
  systemPrompt: string,
  maxTokens = 1000
): Promise<string> {
  // Call our server-side proxy route — avoids CORS and keeps the API key secure
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-2.0-flash',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `API error ${response.status}`)
  return (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('') || '(no response)'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ResultCard({ title, content, onCopy, onRegen, regenLoading, accent }: { title: string; content: string; onCopy: () => void; onRegen: () => void; regenLoading: boolean; accent?: string }) {
  return (
    <div style={{ background: 'var(--bg-primary)', borderRadius: 10, border: '1px solid var(--border-light)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: accent ? accent + '15' : 'var(--bg-secondary)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: accent || 'var(--text-primary)' }}>{title}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="small" onClick={onCopy}>Copy</button>
          <button className="small" onClick={onRegen} disabled={regenLoading}>{regenLoading ? '…' : '↻ Redo'}</button>
        </div>
      </div>
      <div style={{ padding: '18px 22px', fontSize: 13, lineHeight: 1.8, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
        {content}
      </div>
    </div>
  )
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '50px 30px', textAlign: 'center', border: '1px solid var(--border-light)' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{desc}</div>
    </div>
  )
}

function LoadingState({ text }: { text: string }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '50px 30px', textAlign: 'center', border: '1px solid var(--border-light)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{text}</div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AIAssistantPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat')
  const [dbSummary, setDbSummary] = useState('')

  // Chat
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Voice input
  const [voiceLang, setVoiceLang] = useState<'hi-IN' | 'en-IN' | 'en-US'>('hi-IN')
  const voice = useVoiceInput((transcript) => {
    setInput(transcript)
    setTimeout(() => { sendMessage(transcript) }, 400)
  }, voiceLang)

  // Briefing
  const [briefing, setBriefing] = useState('')
  const [briefingLoading, setBriefingLoading] = useState(false)

  // Smart Assignment
  const [assignResult, setAssignResult] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignOrder, setAssignOrder] = useState({ party: '', article: '', color: '', qtyKg: '', blend: '' })

  // Faulty Analyzer
  const [faultyAnalysis, setFaultyAnalysis] = useState('')
  const [faultyLoading, setFaultyLoading] = useState(false)

  // Delay Predictor
  const [delayResult, setDelayResult] = useState('')
  const [delayLoading, setDelayLoading] = useState(false)

  // Actions Agent
  const [actionInput, setActionInput] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionPlan, setActionPlan] = useState('')
  const [proposedActions, setProposedActions] = useState<ProposedAction[]>([])
  const [actionExecuting, setActionExecuting] = useState(false)
  const [actionResult, setActionResult] = useState('')

  // Weekly Report
  const [report, setReport] = useState('')
  const [reportLoading, setReportLoading] = useState(false)

  // Customer Query
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerTone, setCustomerTone] = useState<'formal' | 'friendly'>('friendly')
  const [customerLang, setCustomerLang] = useState<'english' | 'hindi' | 'hinglish'>('english')
  const [customerResult, setCustomerResult] = useState('')
  const [customerLoading, setCustomerLoading] = useState(false)

  // Production Scheduler
  const [schedulerResult, setSchedulerResult] = useState('')
  const [schedulerLoading, setSchedulerLoading] = useState(false)
  const [schedulerPriority, setSchedulerPriority] = useState<'deadline' | 'shade' | 'balanced'>('balanced')

  // Cost Estimator
  const [costResult, setCostResult] = useState('')
  const [costLoading, setCostLoading] = useState(false)
  const [costOrder, setCostOrder] = useState('')
  const [ratePerDay, setRatePerDay] = useState('500')

  useEffect(() => {
    const ctx = buildDbContext()
    setDbSummary(ctx.summary)
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I'm your DyeFlow AI Assistant.\n\nI have live access to your factory database — ${ctx.summary}.\n\nAsk me anything about orders, batches, machines, supervisors, or faulty records. I answer from real data.`,
      timestamp: new Date()
    }])
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── TAB CONFIG ───────────────────────────────────────────────────────────────

  const tabs: { id: ActiveTab; label: string; tier: 1 | 2 }[] = [
    { id: 'chat',      label: '💬 Chat',             tier: 1 },
    { id: 'briefing',  label: '📋 Daily Briefing',    tier: 1 },
    { id: 'assign',    label: '🎯 Smart Assign',      tier: 1 },
    { id: 'faulty',    label: '⚠ Faulty Analyzer',   tier: 1 },
    { id: 'delay',     label: '⏱ Delay Predictor',   tier: 2 },
    { id: 'actions',   label: '✏ AI Actions',         tier: 2 },
    { id: 'report',    label: '📄 Weekly Report',     tier: 2 },
    { id: 'customer',  label: '💬 Customer Reply',    tier: 2 },
    { id: 'scheduler', label: '🗓 Prod. Scheduler',   tier: 2 },
    { id: 'cost',      label: '💰 Cost Estimator',    tier: 2 },
  ]

  const tabStyle = (t: ActiveTab, tier: 1 | 2) => {
    const isActive = activeTab === t
    return {
      padding: '7px 14px', fontSize: 12, fontWeight: isActive ? 600 : 400,
      border: isActive ? 'none' : '1px solid var(--border-light)',
      borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' as const,
      background: isActive ? (tier === 2 ? '#3C3489' : 'var(--accent)') : 'var(--bg-secondary)',
      color: isActive ? '#fff' : 'var(--text-secondary)',
    }
  }

  // ── CHAT ─────────────────────────────────────────────────────────────────────

  const sendMessage = async (text?: string) => {
    const question = (text || input).trim()
    if (!question || chatLoading) return
    setInput('')
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: question, timestamp: new Date() }
    const loadingMsg: Message = { id: `a-${Date.now()}`, role: 'assistant', content: '', timestamp: new Date(), loading: true }
    setMessages(prev => [...prev, userMsg, loadingMsg])
    setChatLoading(true)
    try {
      const ctx = buildDbContext()
      const system = `You are the AI assistant for DyeFlow, a dyeing factory ERP in Surat, India. Answer accurately using ONLY the live data provided below.

KEY CONCEPTS YOU MUST UNDERSTAND:
- "Booked till" or "booked until" = the BOOKED_TILL field in the machine data — this is the LATEST date among ALL planned dates of all active orders on that machine. It means the machine will be occupied until that date and is only free AFTER that date.
- "Available from" or "free from" = the day after the BOOKED_TILL date
- "Machine load" = loaded Kg vs capacity Kg shown as percentage
- "Which orders are on [machine]" = look at orders:[] list in that machine's data
- "Overdue" = orders where dispatch date has already passed
- "Dispatch date" = planned date when fabric leaves factory
- "FMS process" = the current process stage a batch is at (CBR, Dyeing, Finishing etc.)
- "Supervisor inbox" = orders assigned to supervisor but not yet started
- When asked about specific machines, supervisors, or orders — look for exact name matches in the data

ANSWER FORMAT:
- Be direct and specific — give exact dates, numbers, names
- For "booked till" questions: state the date clearly e.g. "Long Tube Jet No. 30 is booked till 22 May 2026"
- For "load" questions: state Kg and % e.g. "Loaded with 4160kg (832% of 500kg capacity)"
- Use bullet points only for lists of 3+ items
- Never say "data not available" if the information is in the context below

${ctx.full}`
      const history = messages.filter(m => !m.loading && m.id !== 'welcome').map(m => ({ role: m.role, content: m.content }))
      const reply = await callClaude([...history, { role: 'user', content: question }], system)
      setMessages(prev => prev.map(m => m.loading ? { ...m, content: reply, loading: false } : m))
    } catch (err) {
      setMessages(prev => prev.map(m => m.loading ? { ...m, content: `Error: ${String(err)}`, loading: false } : m))
    } finally {
      setChatLoading(false)
    }
  }

  // ── BRIEFING ──────────────────────────────────────────────────────────────────

  const generateBriefing = async () => {
    setBriefingLoading(true); setBriefing('')
    try {
      const ctx = buildDbContext()
      const system = `You are a factory operations assistant. Generate a clear morning briefing for a dyeing factory manager. Format:
📅 DATE: [date]
📊 OVERVIEW: [2-3 sentence status]
⚠️ URGENT: [bullet list of things needing attention today]
📋 STATUS: [key numbers]
✅ POSITIVES: [what's going well]
💡 RECOMMENDATION: [1-2 specific actions]
Base strictly on data. Be direct.`
      const reply = await callClaude([{ role: 'user', content: `Generate briefing from:\n\n${ctx.full}` }], system, 1200)
      setBriefing(reply)
    } catch (err) { setBriefing(`Error: ${String(err)}`) }
    finally { setBriefingLoading(false) }
  }

  // ── SMART ASSIGNMENT ──────────────────────────────────────────────────────────

  const getAssignmentSuggestion = async () => {
    if (!assignOrder.party || !assignOrder.article || !assignOrder.qtyKg) { alert('Fill in Party, Article, and Qty.'); return }
    setAssignLoading(true); setAssignResult('')
    try {
      const ctx = buildAssignmentContext()
      const system = `You are a production planner for a dyeing factory. Recommend the best supervisor and machine for a new order. Format:
RECOMMENDED SUPERVISOR: [name]
Reason: [1-2 sentences]
RECOMMENDED MACHINE: [name]
Reason: [1-2 sentences]
NOTES: [up to 2 bullet points]
Be specific. Base on current loads.`
      const desc = `New order: Party:${assignOrder.party} | Article:${assignOrder.article} | Color:${assignOrder.color||'?'} | Qty:${assignOrder.qtyKg}kg | Blend:${assignOrder.blend||'?'}\n\nCurrent state:\n${ctx}`
      const reply = await callClaude([{ role: 'user', content: desc }], system)
      setAssignResult(reply)
    } catch (err) { setAssignResult(`Error: ${String(err)}`) }
    finally { setAssignLoading(false) }
  }

  // ── FAULTY ANALYZER ───────────────────────────────────────────────────────────

  const analyzeFaulty = async () => {
    setFaultyLoading(true); setFaultyAnalysis('')
    try {
      const ctx = buildDbContext()
      const system = `You are a quality analyst for a dyeing factory. Analyze faulty records and find patterns. Format:
🔴 KEY FINDINGS: [bullet points with numbers]
📈 HIGHEST RISK AREAS: [where most faults occur]
🔍 ROOT CAUSE HINTS: [based on patterns]
💡 RECOMMENDATIONS: [2-3 specific actions]
Be specific with counts. Do not invent data.`
      const reply = await callClaude([{ role: 'user', content: `Analyze faulty records:\n\n${ctx.full}` }], system)
      setFaultyAnalysis(reply)
    } catch (err) { setFaultyAnalysis(`Error: ${String(err)}`) }
    finally { setFaultyLoading(false) }
  }

  // ── DELAY PREDICTOR ───────────────────────────────────────────────────────────

  const predictDelays = async () => {
    setDelayLoading(true); setDelayResult('')
    try {
      const ctx = buildDelayContext()
      const system = `You are a production planning assistant for a dyeing factory. Analyze orders and predict which ones are at risk of missing their planned dispatch date. Format:
🔴 HIGH RISK (very likely to miss dispatch date):
[order number - party - reason - days left vs processes remaining]

🟡 MEDIUM RISK (possible delay):
[same format]

🟢 ON TRACK:
[order number - party - estimated comfortable]

⚠️ NO PLANNED DATE SET:
[list orders with no dispatch date]

💡 RECOMMENDATIONS: [2-3 specific actions]

Be precise. Show actual numbers. Mark "AT RISK" if remaining processes > days left.`
      const reply = await callClaude([{ role: 'user', content: `Analyze delays:\n\n${ctx}` }], system, 1200)
      setDelayResult(reply)
    } catch (err) { setDelayResult(`Error: ${String(err)}`) }
    finally { setDelayLoading(false) }
  }

  // ── AI ACTIONS AGENT ──────────────────────────────────────────────────────────

  const proposeAction = async () => {
    if (!actionInput.trim()) return
    setActionLoading(true); setActionPlan(''); setProposedActions([]); setActionResult('')
    try {
      const ctx = buildActionsContext()
      const system = `You are an AI agent for a dyeing factory ERP. The user wants to make changes to orders. You must:
1. Understand what changes are needed
2. Respond with a JSON array of specific actions to execute
3. ONLY use these action types: status_change, assign_supervisor, add_hold, update_remark, bulk_assign
4. For each action include: type, orderNumber (or orderNumbers for bulk), field, oldValue, newValue, description

Respond with ONLY a JSON object in this exact format:
{
  "plan": "Plain English description of what you will do",
  "actions": [
    {"type": "status_change", "orderNumber": "DYG-2026-1", "field": "status", "oldValue": "assigned", "newValue": "hold", "description": "Put order DYG-2026-1 on hold"},
    {"type": "assign_supervisor", "orderNumber": "DYG-2026-2", "field": "supervisor", "oldValue": "none", "newValue": "Kundan M.", "description": "Assign order to Kundan M."}
  ]
}

IMPORTANT: Only use valid order numbers, supervisors, and statuses from the data. Respond with ONLY the JSON, no extra text.

${ctx}`
      const reply = await callClaude([{ role: 'user', content: actionInput }], system, 1500)

      // Parse JSON response
      const cleaned = reply.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed = JSON.parse(cleaned)
      setActionPlan(parsed.plan || 'AI will execute the following changes:')
      setProposedActions(parsed.actions || [])
    } catch (err) {
      setActionPlan(`Could not parse AI response. Error: ${String(err)}\n\nTry rephrasing your request more specifically, e.g. "Put order DYG-2026-5 on hold" or "Assign all new orders to Arpit".`)
      setProposedActions([])
    } finally {
      setActionLoading(false)
    }
  }

  const executeActions = () => {
    if (proposedActions.length === 0) return
    setActionExecuting(true)
    try {
      const raw = localStorage.getItem('dyeflow_db')
      if (!raw) throw new Error('No database found')
      const db = JSON.parse(raw)
      const results: string[] = []

      for (const action of proposedActions) {
        const orderNums = action.orderNumbers || (action.orderNumber ? [action.orderNumber] : [])

        for (const orderNum of orderNums) {
          const order = (db.orders || []).find((o: any) => o.orderNumber === orderNum)
          if (!order) { results.push(`❌ Order ${orderNum} not found`); continue }

          switch (action.type) {
            case 'status_change':
              const oldStatus = order.status
              order.status = action.newValue
              logAudit({ action: 'status_change', entityType: 'order', entityId: orderNum, field: 'status', oldValue: oldStatus, newValue: action.newValue, note: 'AI Actions Agent' })
              results.push(`✅ ${orderNum}: status ${oldStatus} → ${action.newValue}`)
              break
            case 'assign_supervisor':
              const oldSup = order.supervisor || 'none'
              order.supervisor = action.newValue
              if (order.status === 'new') order.status = 'assigned'
              logAudit({ action: 'assign', entityType: 'order', entityId: orderNum, field: 'supervisor', oldValue: oldSup, newValue: action.newValue, note: 'AI Actions Agent' })
              results.push(`✅ ${orderNum}: supervisor → ${action.newValue}`)
              break
            case 'add_hold':
              order.status = 'hold'
              order.holdReason = action.newValue
              order.holdApproval = 'Hold'
              logAudit({ action: 'status_change', entityType: 'order', entityId: orderNum, field: 'status', oldValue: order.status, newValue: 'hold', note: `AI hold: ${action.newValue}` })
              results.push(`✅ ${orderNum}: put on hold — ${action.newValue}`)
              break
            case 'update_remark':
              const oldRemark = order.remarks || ''
              order.remarks = action.newValue
              logAudit({ action: 'edit', entityType: 'order', entityId: orderNum, field: 'remarks', oldValue: oldRemark, newValue: action.newValue, note: 'AI Actions Agent' })
              results.push(`✅ ${orderNum}: remark updated`)
              break
            case 'bulk_assign':
              const oldBulkSup = order.supervisor || 'none'
              order.supervisor = action.newValue
              if (order.status === 'new') order.status = 'assigned'
              logAudit({ action: 'assign', entityType: 'order', entityId: orderNum, field: 'supervisor', oldValue: oldBulkSup, newValue: action.newValue, note: 'AI bulk assign' })
              results.push(`✅ ${orderNum}: supervisor → ${action.newValue}`)
              break
            default:
              results.push(`⚠️ Unknown action type: ${action.type}`)
          }
        }
      }

      localStorage.setItem('dyeflow_db', JSON.stringify(db))
      window.dispatchEvent(new Event('dyeflow-db-updated'))
      setActionResult(results.join('\n'))
      setProposedActions([])
      setActionPlan('')
      setActionInput('')
      // Refresh db summary
      const ctx = buildDbContext()
      setDbSummary(ctx.summary)
    } catch (err) {
      setActionResult(`Execution failed: ${String(err)}`)
    } finally {
      setActionExecuting(false)
    }
  }

  // ── WEEKLY REPORT ─────────────────────────────────────────────────────────────

  const generateReport = async () => {
    setReportLoading(true); setReport('')
    try {
      const ctx = buildDbContext()
      const system = `You are a factory management reporter for a dyeing factory. Generate a comprehensive weekly production report. Format as a professional document:

WEEKLY PRODUCTION REPORT
Period: [this week]
Generated: [today's date]

1. EXECUTIVE SUMMARY
[3-4 sentence overview]

2. ORDERS SUMMARY
[orders received, completed, in progress, held — with numbers]

3. PRODUCTION METRICS
[Kg ordered, Kg completed, Kg in process, completion rate]

4. MACHINE UTILIZATION
[each machine with load %, status]

5. SUPERVISOR PERFORMANCE
[each supervisor with orders handled, completed, pending]

6. QUALITY & FAULTY
[faulty count, open vs resolved, top fault types]

7. OVERDUE & AT-RISK ORDERS
[list with details]

8. NEXT WEEK PRIORITIES
[3-5 specific recommendations]

Use actual data. Be specific with numbers. Professional tone.`
      const reply = await callClaude([{ role: 'user', content: `Generate weekly report from:\n\n${ctx.full}` }], system, 1500)
      setReport(reply)
    } catch (err) { setReport(`Error: ${String(err)}`) }
    finally { setReportLoading(false) }
  }

  // ── CUSTOMER QUERY RESPONDER ───────────────────────────────────────────────────

  const generateCustomerReply = async () => {
    if (!customerQuery.trim()) { alert('Enter a party name or order number.'); return }
    setCustomerLoading(true); setCustomerResult('')
    try {
      const ctx = buildCustomerContext(customerQuery)
      const langInstructions: Record<string, string> = {
        english: 'Write in professional English.',
        hindi: 'Write in Hindi (Devanagari script).',
        hinglish: 'Write in Hinglish (mix of Hindi and English, roman script, like how people WhatsApp in India).',
      }
      const toneInstructions = customerTone === 'formal'
        ? 'Use formal, professional business language. Address the customer respectfully.'
        : 'Use a warm, friendly tone. Keep it conversational and reassuring.'
      const system = `You are writing a customer status update message for a dyeing factory. ${toneInstructions} ${langInstructions[customerLang]}

Write a message that:
- Confirms which orders you found
- Gives clear current status for each order
- Mentions current process if in production
- Gives estimated dispatch date if available
- Is ready to send directly via WhatsApp or email (no placeholders)
- Sounds natural and professional

If no orders found, write a polite message saying so and asking for the correct order number.`
      const reply = await callClaude([{ role: 'user', content: `Write a customer status update based on:\n\n${ctx}` }], system, 800)
      setCustomerResult(reply)
    } catch (err) { setCustomerResult(`Error: ${String(err)}`) }
    finally { setCustomerLoading(false) }
  }

  // ── PRODUCTION SCHEDULER ──────────────────────────────────────────────────

  const generateSchedule = async () => {
    setSchedulerLoading(true); setSchedulerResult('')
    try {
      const ctx = buildSchedulerContext()

      const priorityInstructions = {
        deadline: 'PRIORITY RULE: Sort strictly by dispatch deadline. Most urgent deadline = first. Ignore shade sequencing if it conflicts with deadlines.',
        shade:    'PRIORITY RULE: Sort strictly by shade sequence (White → Light → Medium → Dark within each machine). Ignore deadlines if they conflict. This minimises rinsing/cleaning between batches.',
        balanced: 'PRIORITY RULE: Balance both. First process all OVERDUE batches regardless of shade. Then group remaining batches by shade sequence BUT within each shade group, sort by deadline urgency.',
      }

      const system = `You are a production scheduling expert for a dyeing factory. Given the current state of all machines and pending batches, generate the optimal processing sequence for each machine.

${priorityInstructions[schedulerPriority]}

OTHER SCHEDULING RULES:
- Shade sequencing within a machine: always process White/Light before Dark shades to avoid contamination
- Flag any FAULTY batches — do not schedule them first
- Flag any batches missing dispatch dates
- If a machine is overloaded (>90%), say so explicitly
- If a machine has capacity available, suggest which unassigned orders should go there next

FOR EACH MACHINE output:
1. Current recommended sequence (numbered list with batch ID, party, color, Kg, deadline)
2. Estimated completion order
3. Any issues or warnings
4. Capacity recommendation

Then at the end:
- UNASSIGNED ORDERS: which machine each should go to and why
- OVERALL RISK: top 3 things that could cause delays this week
- KEY ACTION: single most important thing to do right now

Be specific with batch IDs, dates, and Kg. No generic advice.`

      const reply = await callClaude(
        [{ role: 'user', content: `Generate optimal production schedule from this factory data:\n\n${ctx}` }],
        system,
        1500
      )
      setSchedulerResult(reply)
    } catch (err) { setSchedulerResult(`Error: ${String(err)}`) }
    finally { setSchedulerLoading(false) }
  }

  // ── COST ESTIMATOR ──────────────────────────────────────────────────

  const generateCostEstimate = async () => {
    setCostLoading(true); setCostResult('')
    try {
      const ctx = buildCostContext()
      const rate = parseFloat(ratePerDay) || 500
      const filterNote = costOrder.trim()
        ? `Only estimate for order: ${costOrder.trim()}`
        : 'Estimate for all orders'

      const system = `You are a cost estimation expert for a textile dyeing factory in Surat, India. Estimate processing costs per order based on factory data.

Machine rate assumption: ₹${rate} per machine-day per batch (adjustable by user).

FOR EACH ORDER output a table row:
| Order # | Party | Article | Qty Kg | Process Steps | Est. Days | Machine Cost | Chem Est. | Total Est. | Cost/Kg |

Cost calculation logic:
- Machine cost = (number of process steps) × (days per step) × (₹${rate} ÷ machine capacity in Kg) × order Kg
- Chemical cost = estimate based on article type and blend:
  * Dyeing process: ₹15-40/Kg for standard colours, ₹30-60/Kg for dark/reactive
  * Finishing: ₹5-15/Kg
  * Washing/Scouring: ₹3-8/Kg
- Use Indian dyeing industry standard rates for Surat
- Note assumptions clearly

${filterNote}

After the table:
SUMMARY:
- Highest cost order and why
- Lowest cost order and why
- Average cost per Kg across all
- Cost optimisation suggestion (1-2 specific ideas)

ASSUMPTIONS USED:
[List all rate assumptions made]

Be specific with numbers. Show ₹ symbol. All costs in INR.`

      const reply = await callClaude(
        [{ role: 'user', content: `Estimate processing costs from this data:\n\n${ctx}` }],
        system,
        1500
      )
      setCostResult(reply)
    } catch (err) { setCostResult(`Error: ${String(err)}`) }
    finally { setCostLoading(false) }
  }

  // ── RENDER ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 44px)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '12px 20px 0', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-primary)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>🤖 DyeFlow AI Assistant</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Live data · {dbSummary || 'Loading…'}</div>
          </div>
          <button className="small" onClick={() => { const ctx = buildDbContext(); setDbSummary(ctx.summary) }}>↻ Refresh</button>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', paddingBottom: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', alignSelf: 'center', paddingRight: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>T1</span>
          {tabs.filter(t => t.tier === 1).map(t => (
            <button key={t.id} style={tabStyle(t.id, 1)} onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
          <span style={{ fontSize: 10, fontWeight: 700, color: '#3C3489', alignSelf: 'center', paddingLeft: 8, paddingRight: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>T2</span>
          {tabs.filter(t => t.tier === 2).map(t => (
            <button key={t.id} style={tabStyle(t.id, 2)} onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── CHAT ──────────────────────────────────────────────────────────────── */}
      {activeTab === 'chat' && (
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ width: 210, flexShrink: 0, borderRight: '1px solid var(--border-light)', padding: '12px 10px', overflowY: 'auto', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Quick Questions</div>
            {SUGGESTIONS.chat.map((s, i) => (
              <button key={i} onClick={() => sendMessage(s)} disabled={chatLoading} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', marginBottom: 5, fontSize: 11, background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 6, cursor: chatLoading ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', lineHeight: 1.4, opacity: chatLoading ? 0.5 : 1 }}
                onMouseEnter={e => { if (!chatLoading) e.currentTarget.style.background = 'var(--accent-light)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-primary)' }}
              >{s}</button>
            ))}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {messages.map(msg => (
                <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                  {msg.role === 'assistant' && <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, marginRight: 7, flexShrink: 0, marginTop: 2 }}>🤖</div>}
                  <div style={{ maxWidth: '72%', padding: '9px 13px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-secondary)', color: msg.role === 'user' ? '#fff' : 'var(--text-primary)', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: msg.role === 'assistant' ? '1px solid var(--border-light)' : 'none' }}>
                    {msg.loading ? (
                      <span style={{ display: 'flex', gap: 5, alignItems: 'center', color: 'var(--text-tertiary)' }}>
                        {['●','●','●'].map((d, i) => <span key={i} style={{ animation: `pulse 1.2s infinite ${i * 0.2}s` }}>{d}</span>)}
                        <span style={{ fontSize: 12, marginLeft: 4 }}>Thinking…</span>
                        <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
                      </span>
                    ) : msg.content}
                  </div>
                  {msg.role === 'user' && <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, marginLeft: 7, flexShrink: 0, marginTop: 2 }}>👤</div>}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-light)', background: 'var(--bg-primary)', flexShrink: 0 }}>
              {/* Voice error message */}
              {voice.error && (
                <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6, padding: '4px 8px', background: 'var(--danger-light)', borderRadius: 4 }}>
                  {voice.error}
                </div>
              )}
              {/* Listening indicator */}
              {voice.listening && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '6px 10px', background: '#FEF3C7', borderRadius: 6, border: '1px solid #F59E0B' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#EF4444', animation: 'pulse 0.8s ease-in-out infinite' }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#92400E' }}>Listening… speak now</span>
                  <button onClick={voice.stopListening} style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Stop</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                {/* Mic button + language selector */}
                {voice.supported && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
                    <button
                      onClick={voice.listening ? voice.stopListening : voice.startListening}
                      disabled={chatLoading}
                      title={voice.listening ? 'Stop listening' : 'Start voice input'}
                      style={{
                        width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: chatLoading ? 'not-allowed' : 'pointer',
                        background: voice.listening ? '#EF4444' : 'var(--accent)',
                        color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, boxShadow: voice.listening ? '0 0 0 4px rgba(239,68,68,0.2)' : 'none',
                        transition: 'all 0.2s',
                      }}
                    >
                      {voice.listening ? '■' : '🎤'}
                    </button>
                    <select
                      value={voiceLang}
                      onChange={e => setVoiceLang(e.target.value as any)}
                      style={{ fontSize: 9, padding: '1px 2px', border: '1px solid var(--border-light)', borderRadius: 3, width: 38, textAlign: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-secondary)' }}
                      title="Voice language"
                    >
                      <option value="hi-IN">HI</option>
                      <option value="en-IN">EN-IN</option>
                      <option value="en-US">EN-US</option>
                    </select>
                  </div>
                )}
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder={voice.supported ? 'Ask anything… or click 🎤 to speak in Hindi/English (Enter to send)' : 'Ask anything… (Enter to send)'}
                  disabled={chatLoading || voice.listening}
                  rows={2}
                  style={{ flex: 1, resize: 'none', padding: '9px 11px', border: '1px solid var(--border-medium)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: voice.listening ? '#FEFCE8' : 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', lineHeight: 1.5 }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={chatLoading || !input.trim() || voice.listening}
                  className="primary"
                  style={{ padding: '9px 16px', borderRadius: 8, fontSize: 13, flexShrink: 0, opacity: (chatLoading || !input.trim() || voice.listening) ? 0.5 : 1 }}
                >
                  {chatLoading ? '…' : 'Send →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BRIEFING ──────────────────────────────────────────────────────────── */}
      {activeTab === 'briefing' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Morning Factory Briefing</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>AI generates a complete factory status report from live data — urgent items, machine loads, supervisor workloads, overdue orders.</div>
              </div>
              <button className="primary" onClick={generateBriefing} disabled={briefingLoading} style={{ padding: '9px 20px', fontSize: 13, flexShrink: 0 }}>{briefingLoading ? '⏳ Generating…' : '📋 Generate Briefing'}</button>
            </div>
            {!briefing && !briefingLoading && <EmptyState icon="📋" title="Ready to generate" desc="Click the button. AI reads your live factory data and produces a morning report in seconds." />}
            {briefingLoading && <LoadingState text="Reading factory database and generating briefing…" />}
            {briefing && <ResultCard title={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} content={briefing} onCopy={() => navigator.clipboard.writeText(briefing)} onRegen={generateBriefing} regenLoading={briefingLoading} accent="var(--accent)" />}
          </div>
        </div>
      )}

      {/* ── SMART ASSIGNMENT ──────────────────────────────────────────────────── */}
      {activeTab === 'assign' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ maxWidth: 820, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>New Order Details</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>AI suggests the best supervisor and machine based on current factory loads.</div>
              <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="form-group"><label>Party Name *</label><input type="text" value={assignOrder.party} onChange={e => setAssignOrder({ ...assignOrder, party: e.target.value })} placeholder="e.g. Ravi Textiles" /></div>
                <div className="form-group"><label>Article *</label><input type="text" value={assignOrder.article} onChange={e => setAssignOrder({ ...assignOrder, article: e.target.value })} placeholder="e.g. Cotton 60s" /></div>
                <div className="form-group"><label>Color</label><input type="text" value={assignOrder.color} onChange={e => setAssignOrder({ ...assignOrder, color: e.target.value })} placeholder="e.g. Navy Blue" /></div>
                <div className="form-group"><label>Quantity (Kg) *</label><input type="number" value={assignOrder.qtyKg} onChange={e => setAssignOrder({ ...assignOrder, qtyKg: e.target.value })} placeholder="e.g. 500" /></div>
                <div className="form-group"><label>Blend</label><input type="text" value={assignOrder.blend} onChange={e => setAssignOrder({ ...assignOrder, blend: e.target.value })} placeholder="e.g. PC 65/35" /></div>
              </div>
              <button className="primary" onClick={getAssignmentSuggestion} disabled={assignLoading} style={{ marginTop: 14, width: '100%', padding: '11px', fontSize: 13 }}>{assignLoading ? '⏳ Analyzing…' : '🎯 Get AI Suggestion'}</button>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>AI Recommendation</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>Based on current machine capacities and supervisor workloads.</div>
              {!assignResult && !assignLoading && <EmptyState icon="🎯" title="Waiting for order details" desc="Fill in the form and click Get AI Suggestion." />}
              {assignLoading && <LoadingState text="Checking machine loads and supervisor workloads…" />}
              {assignResult && !assignLoading && <ResultCard title={`Recommendation for ${assignOrder.party}`} content={assignResult} onCopy={() => navigator.clipboard.writeText(assignResult)} onRegen={getAssignmentSuggestion} regenLoading={assignLoading} accent="var(--accent)" />}
            </div>
          </div>
        </div>
      )}

      {/* ── FAULTY ANALYZER ───────────────────────────────────────────────────── */}
      {activeTab === 'faulty' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Faulty Pattern Analyzer</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>AI reads all faulty records, finds patterns by process/machine/supervisor/article, and suggests root causes.</div>
              </div>
              <button onClick={analyzeFaulty} disabled={faultyLoading} style={{ padding: '9px 20px', fontSize: 13, flexShrink: 0, background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>{faultyLoading ? '⏳ Analyzing…' : '⚠ Analyze Patterns'}</button>
            </div>
            {!faultyAnalysis && !faultyLoading && <EmptyState icon="🔍" title="Faulty Pattern Detection" desc="Works best with 5+ faulty records. Click to analyze." />}
            {faultyLoading && <LoadingState text="Reading faulty records and identifying patterns…" />}
            {faultyAnalysis && <ResultCard title="Faulty Analysis Report" content={faultyAnalysis} onCopy={() => navigator.clipboard.writeText(faultyAnalysis)} onRegen={analyzeFaulty} regenLoading={faultyLoading} accent="var(--danger)" />}
          </div>
        </div>
      )}

      {/* ── DELAY PREDICTOR ───────────────────────────────────────────────────── */}
      {activeTab === 'delay' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>⏱ Delay Predictor</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  AI analyzes each active order's current position in the process route vs planned dispatch date — and flags orders at risk <em>before</em> they actually become late. Works best when planned dates are set in Date Calculator.
                </div>
              </div>
              <button className="primary" onClick={predictDelays} disabled={delayLoading} style={{ padding: '9px 20px', fontSize: 13, flexShrink: 0, background: '#EF9F27', borderColor: '#EF9F27' }}>{delayLoading ? '⏳ Analyzing…' : '⏱ Predict Delays'}</button>
            </div>
            {!delayResult && !delayLoading && <EmptyState icon="⏱" title="Early Warning System" desc="AI checks remaining processes vs planned dispatch dates and flags at-risk orders before they miss deadlines." />}
            {delayLoading && <LoadingState text="Analyzing order positions and planned dates…" />}
            {delayResult && <ResultCard title="Delay Risk Assessment" content={delayResult} onCopy={() => navigator.clipboard.writeText(delayResult)} onRegen={predictDelays} regenLoading={delayLoading} accent="#EF9F27" />}
          </div>
        </div>
      )}

      {/* ── AI ACTIONS AGENT ──────────────────────────────────────────────────── */}
      {activeTab === 'actions' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ maxWidth: 820, margin: '0 auto' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>✏ AI Actions Agent</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Tell the AI what changes to make in plain language. It proposes the exact changes, you review and confirm before anything is written. All changes are logged in the Audit Trail.
            </div>

            {/* Example commands */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Example commands</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  'Put order DYG-2026-5 on hold due to shade mismatch',
                  'Assign all unassigned orders to Arpit',
                  'Change status of DYG-2026-3 to done',
                  'Move order DYG-2026-7 supervisor to Nandlal',
                ].map((ex, i) => (
                  <button key={i} onClick={() => setActionInput(ex)} style={{ fontSize: 11, padding: '4px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 20, cursor: 'pointer', color: 'var(--text-primary)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-light)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-primary)' }}
                  >{ex}</button>
                ))}
              </div>
            </div>

            {/* Input */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <textarea value={actionInput} onChange={e => setActionInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); proposeAction() } }} placeholder="Describe what changes you want to make… (Enter to analyze)" rows={2} style={{ flex: 1, resize: 'none', padding: '9px 11px', border: '1px solid var(--border-medium)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
              <button className="primary" onClick={proposeAction} disabled={actionLoading || !actionInput.trim()} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, flexShrink: 0, background: '#3C3489', borderColor: '#3C3489', opacity: (actionLoading || !actionInput.trim()) ? 0.5 : 1 }}>{actionLoading ? '⏳ Analyzing…' : 'Analyze →'}</button>
            </div>

            {/* Proposal */}
            {actionPlan && !actionLoading && (
              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '12px 16px', background: '#EEEDFE', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#3C3489', marginBottom: 4 }}>AI Plan</div>
                  <div style={{ fontSize: 13, color: '#26215C' }}>{actionPlan}</div>
                </div>
                {proposedActions.length > 0 && (
                  <div style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                      Proposed Changes ({proposedActions.length})
                    </div>
                    {proposedActions.map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 6, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>📝</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{a.description}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                            {a.orderNumber || (a.orderNumbers || []).join(', ')} · {a.field}: {a.oldValue ? `${a.oldValue} → ` : ''}{a.newValue}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <button onClick={executeActions} disabled={actionExecuting} style={{ padding: '9px 20px', fontSize: 13, fontWeight: 600, background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        {actionExecuting ? '⏳ Executing…' : `✅ Confirm & Execute ${proposedActions.length} change${proposedActions.length !== 1 ? 's' : ''}`}
                      </button>
                      <button onClick={() => { setActionPlan(''); setProposedActions([]) }} style={{ padding: '9px 16px', fontSize: 13, background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-primary)' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Execution result */}
            {actionResult && (
              <div style={{ background: 'var(--success-light)', border: '1px solid #c6f6d5', borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', marginBottom: 8 }}>Execution Complete</div>
                <div style={{ fontSize: 13, color: 'var(--success)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{actionResult}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── WEEKLY REPORT ─────────────────────────────────────────────────────── */}
      {activeTab === 'report' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>📄 Weekly Production Report</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  AI generates a complete weekly summary — orders received/completed, Kg processed, machine utilization, supervisor performance, faulty rate, priorities for next week. Ready to share with management.
                </div>
              </div>
              <button className="primary" onClick={generateReport} disabled={reportLoading} style={{ padding: '9px 20px', fontSize: 13, flexShrink: 0 }}>{reportLoading ? '⏳ Writing…' : '📄 Generate Report'}</button>
            </div>
            {!report && !reportLoading && <EmptyState icon="📄" title="Weekly Report" desc="Click to generate a complete production summary. Ready to copy to WhatsApp, email, or print." />}
            {reportLoading && <LoadingState text="Compiling weekly production data and writing report…" />}
            {report && <ResultCard title="Weekly Production Report" content={report} onCopy={() => navigator.clipboard.writeText(report)} onRegen={generateReport} regenLoading={reportLoading} accent="var(--accent)" />}
          </div>
        </div>
      )}

      {/* ── CUSTOMER QUERY ─────────────────────────────────────────────────────── */}
      {activeTab === 'customer' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ maxWidth: 820, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>💬 Customer Query Responder</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>
                Type a party name or order number. AI finds their orders and writes a professional status update message ready to send via WhatsApp or email.
              </div>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Party name or Order number *</label>
                <input type="text" value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') generateCustomerReply() }} placeholder="e.g. Ravi Textiles  or  DYG-2026-5" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="form-group">
                  <label>Tone</label>
                  <select value={customerTone} onChange={e => setCustomerTone(e.target.value as any)}>
                    <option value="friendly">Friendly / Warm</option>
                    <option value="formal">Formal / Business</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Language</label>
                  <select value={customerLang} onChange={e => setCustomerLang(e.target.value as any)}>
                    <option value="english">English</option>
                    <option value="hindi">Hindi</option>
                    <option value="hinglish">Hinglish</option>
                  </select>
                </div>
              </div>

              <button className="primary" onClick={generateCustomerReply} disabled={customerLoading} style={{ width: '100%', padding: '11px', fontSize: 13 }}>
                {customerLoading ? '⏳ Writing message…' : '💬 Generate Reply Message'}
              </button>

              <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-light)', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>How it works:</strong> AI finds all orders matching the party name or order number, checks current status and process, then writes a ready-to-send message. Just copy and paste to WhatsApp or email.
              </div>
            </div>

            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Generated Message</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>Ready to copy and send.</div>
              {!customerResult && !customerLoading && <EmptyState icon="💬" title="Waiting for customer name" desc="Enter a party name or order number on the left and click Generate." />}
              {customerLoading && <LoadingState text="Finding orders and writing customer message…" />}
              {customerResult && !customerLoading && <ResultCard title={`Message for: ${customerQuery}`} content={customerResult} onCopy={() => navigator.clipboard.writeText(customerResult)} onRegen={generateCustomerReply} regenLoading={customerLoading} accent="#3C3489" />}
            </div>
          </div>
        </div>
      )}

      {/* ── PRODUCTION SCHEDULER ────────────────────────────────────────── */}
      {activeTab === 'scheduler' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>🗓 AI Production Scheduler</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 18 }}>
              AI reads all active batches across every machine and generates the optimal processing sequence — considering dispatch deadlines, shade groups (light before dark to avoid contamination), machine capacity, and overdue orders.
            </div>

            {/* Priority selector */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Scheduling Priority</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([
                  ['balanced', '⚖ Balanced',       'Mix deadline urgency with shade sequencing. Best for most factories.'],
                  ['deadline', '🔴 Deadline First', 'Process most urgent dispatch date first. Ignores shade order if needed.'],
                  ['shade',    '🎨 Shade First',    'Group White → Light → Medium → Dark. Minimises machine rinsing.'],
                ] as const).map(([val, label, desc]) => (
                  <div key={val} onClick={() => setSchedulerPriority(val)} style={{ flex: '1 1 200px', padding: '10px 14px', border: `2px solid ${schedulerPriority === val ? 'var(--accent)' : 'var(--border-light)'}`, borderRadius: 8, background: schedulerPriority === val ? 'var(--accent-light)' : 'var(--bg-primary)', cursor: 'pointer' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: schedulerPriority === val ? 'var(--accent-dark)' : 'var(--text-primary)', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={generateSchedule}
              disabled={schedulerLoading}
              style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 600, background: schedulerLoading ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #0f172a, #185FA5)', color: schedulerLoading ? 'var(--text-tertiary)' : '#fff', border: 'none', borderRadius: 8, cursor: schedulerLoading ? 'not-allowed' : 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {schedulerLoading ? <><span>⏳</span> Analysing all machines and batches…</> : <>🗓 Generate Optimal Production Schedule</>}
            </button>

            {!schedulerResult && !schedulerLoading && <EmptyState icon="🗓" title="Ready to schedule" desc="AI reads every active batch on every machine, applies your priority rule, and outputs the optimal sequence per machine — with batch IDs, deadlines, shade groups, capacity warnings, and what to do next." />}
            {schedulerLoading && <LoadingState text="Reading all machines, batches, deadlines, and shade groups…" />}
            {schedulerResult && !schedulerLoading && <ResultCard title="Production Schedule" content={schedulerResult} onCopy={() => navigator.clipboard.writeText(schedulerResult)} onRegen={generateSchedule} regenLoading={schedulerLoading} accent="#0f172a" />}
          </div>
        </div>
      )}

      {/* ── COST ESTIMATOR ────────────────────────────────────────── */}
      {activeTab === 'cost' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>💰 AI Cost Estimator</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 18 }}>
              AI estimates the processing cost per order and per Kg — based on process route, number of steps, machine time, and industry-standard chemical rates for Surat dyeing factories. Useful for quotation and margin analysis.
            </div>

            {/* Controls */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="form-group">
                <label>Machine Rate (₹ per machine-day)</label>
                <input type="number" value={ratePerDay} onChange={e => setRatePerDay(e.target.value)} placeholder="500" min="100" style={{ width: '100%' }} />
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Typical Surat range: ₹300–800 per machine-day</div>
              </div>
              <div className="form-group">
                <label>Filter by Order # (optional)</label>
                <input type="text" value={costOrder} onChange={e => setCostOrder(e.target.value)} placeholder="e.g. DYG-2026-5 — leave blank for all orders" />
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Leave blank to estimate all active orders</div>
              </div>
            </div>

            <button
              onClick={generateCostEstimate}
              disabled={costLoading}
              style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 600, background: costLoading ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #059669, #0D9488)', color: costLoading ? 'var(--text-tertiary)' : '#fff', border: 'none', borderRadius: 8, cursor: costLoading ? 'not-allowed' : 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {costLoading ? <><span>⏳</span> Calculating costs…</> : <>💰 Estimate Processing Costs</>}
            </button>

            {!costResult && !costLoading && (
              <EmptyState
                icon="💰"
                title="Ready to estimate"
                desc="AI estimates machine time cost + chemical cost per order, outputs a full cost table with Cost/Kg for each order. Adjust the machine rate above to match your factory."
              />
            )}
            {costLoading && <LoadingState text="Analysing process routes, Kg quantities, and calculating costs…" />}
            {costResult && !costLoading && (
              <ResultCard
                title="Cost Estimation Report"
                content={costResult}
                onCopy={() => navigator.clipboard.writeText(costResult)}
                onRegen={generateCostEstimate}
                regenLoading={costLoading}
                accent="#059669"
              />
            )}
          </div>
        </div>
      )}

    </div>
  )
}
