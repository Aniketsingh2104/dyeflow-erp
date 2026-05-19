'use client'

import React, { useState } from 'react'
import Link from 'next/link'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS = [
  'Overview',
  'Core Modules',
  'AI Features',
  'Keyboard Shortcuts',
  'Mobile App',
  'Setup & Masters',
  'Data & Storage',
  'UX Features',
  'Changelog',
] as const
type Section = typeof SECTIONS[number]

// ─────────────────────────────────────────────────────────────────────────────
// TINY UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function Pill({ children, color = 'var(--accent)' }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: color + '20', color, border: `1px solid ${color}40`,
      whiteSpace: 'nowrap', display: 'inline-block',
    }}>
      {children}
    </span>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      display: 'inline-block', padding: '2px 8px', fontSize: 12, fontWeight: 700,
      background: 'var(--bg-secondary)', border: '1px solid var(--border-medium)',
      borderRadius: 5, fontFamily: 'monospace', color: 'var(--text-primary)',
      boxShadow: '0 2px 0 var(--border-medium)', lineHeight: 1.5,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </kbd>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
      {children}
    </h2>
  )
}

function H3({ children, icon }: { children: React.ReactNode; icon?: string }) {
  return (
    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '20px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      {children}
    </h3>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 8px' }}>{children}</p>
}

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: '1px solid var(--border-light)',
      borderLeft: accent ? `4px solid ${accent}` : '1px solid var(--border-light)',
      borderRadius: 10, padding: '16px 20px', marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border-light)', marginBottom: 14 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            {headers.map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border-light)' : 'none', background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '8px 12px', color: 'var(--text-primary)', verticalAlign: 'top' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const bgMap: Record<string, string> = {
    green: '#D1FAE5', amber: '#FEF3C7', red: '#FEE2E2', blue: '#EFF6FF', purple: '#EDE9FE', gray: '#F3F4F6'
  }
  const textMap: Record<string, string> = {
    green: '#065F46', amber: '#92400E', red: '#991B1B', blue: '#1E40AF', purple: '#5B21B6', gray: '#374151'
  }
  return (
    <span style={{ background: bgMap[color] || '#F3F4F6', color: textMap[color] || '#374151', padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, display: 'inline-block' }}>
      {children}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────

function SectionOverview() {
  return (
    <div>
      <Card accent="var(--accent)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 48 }}>🏭</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>DyeFlow ERP</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, maxWidth: 600 }}>
              Complete factory management system for dyeing operations. Built on <strong>Next.js 16.2.4</strong>, React 19, TypeScript, Tailwind 4. All data stored locally in your browser (localStorage) — no backend, no server, no internet required after the app loads.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            ['stack', 'Next.js 16 · React 19 · TypeScript'],
            ['storage', 'localStorage (browser)'],
            ['ai', 'Claude Sonnet 4 (Anthropic API)'],
            ['port', 'localhost:6060'],
          ].map(([label, val]) => (
            <div key={label} style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '4px 10px', fontSize: 11 }}>
              <span style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}: </span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{val}</span>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          ['📦', 'Orders', 'Create, assign, track orders'],
          ['⚙', 'FMS', 'Per-process stage tracking'],
          ['🤖', 'AI Assistant', '10 AI-powered tools'],
          ['📱', 'Mobile App', 'Factory floor phone view'],
          ['📊', 'Reports', '5 tabs + Excel export'],
          ['🌙', 'Dark Mode', 'Night-friendly UI'],
          ['🔔', 'Notifications', 'Live factory alerts'],
          ['⌨', 'Shortcuts', '14 keyboard shortcuts'],
          ['📋', 'Daily Summary', 'Auto WhatsApp report'],
          ['🔍', 'Batch Trace', 'Full batch journey view'],
          ['📅', 'Holiday Warnings', '14-day conflict alerts'],
          ['🟥', 'Heatmap', 'Production activity chart'],
        ].map(([icon, label, desc]) => (
          <div key={label} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{desc}</div>
          </div>
        ))}
      </div>

      <H3 icon="🗂">Page Map — Where to Find Everything</H3>
      <Table
        headers={['Page', 'URL', 'What it does']}
        rows={[
          ['Dashboard', '/', 'Live factory overview — stats, heatmap, AI insights, anomaly alerts, holiday warnings'],
          ['Orders', '/orders', 'Create and manage all orders. Bulk selection, drag-drop priority, process route visualiser'],
          ['Production Kanban', '/production', 'Visual Kanban board — each column = FMS process, each card = active batch'],
          ['Order Timeline', '/timeline', 'Gantt chart of all orders — planned dates as horizontal bars with TODAY line'],
          ['Batch Tracking', '/batches', 'Find and track any batch across all process stages'],
          ['Batch Trace', '/batches/[id]', 'Full journey of a single batch — every stage, entry/exit dates, faulty events, reprocess history'],
          ['Date Calculator', '/date-calculator', 'Calculate planned dates for each process step per batch'],
          ['FMS (per process)', '/fms/[code]', 'Per-process floor management sheet — search, dispatch batches, mark done, Kg loss tracking'],
          ['First Process Batch', '/first-process-batch', 'Send batches to their first FMS process. Requires planned dates.'],
          ['Supervisors', '/supervisor', 'Overview of all supervisors — cards with Kg, inbox, active, done counts'],
          ['Machine Sheets', '/machines', 'Per-machine batch view sorted by shade sequence'],
          ['Shift Management', '/shifts', 'Morning / Evening / Night shift assignment and handover notes'],
          ['Faulty Management', '/faulty', 'Faulty batch records — IF OK, Reprocess (Full/Partial), Excel export'],
          ['Reports', '/reports', '5-tab analytics dashboard with Excel export'],
          ['Daily Summary', '/reports/daily', 'Auto-generated daily production report — ready to WhatsApp management'],
          ['AI Assistant', '/ai-assistant', '10 AI tools — chat, briefing, scheduler, cost estimator, and more'],
          ['Audit Log', '/audit-log', 'Full change history — every status change, assignment, and edit'],
          ['Mobile App', '/mobile', 'Phone-optimised factory floor view'],
          ['Party CRM', '/party/[name]', 'Per-party history — all orders, Kg, completion rate, avg delay, faulty rate'],
          ['Setup', '/setup', 'All master data — supervisors, machines, processes, articles, customers'],
          ['Factory Settings', '/setup/factory-settings', 'Configure order number prefix, factory name, GST number'],
          ['Shade Master', '/setup/shade-master', 'Configure colour keyword → shade group (White/Light/Medium/Dark) rules'],
        ]}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE MODULES
// ─────────────────────────────────────────────────────────────────────────────

function SectionCoreModules() {
  return (
    <div>
      <H3 icon="📋">Orders</H3>
      <P>The central module. Every piece of fabric that enters the factory starts as an order.</P>
      <Card accent="#185FA5">
        <Table
          headers={['Feature', 'How it works']}
          rows={[
            ['New Order', 'Click + New Order or press N. Auto-generates order number using configured prefix (default: DYG-YYYY-N, configurable in Factory Settings). Captures party, article, color, blend, qty, lab no, lot no, challan no, finish, packing, remarks, hold status.'],
            ['Lab No. Autocomplete', 'Lab No. field shows autocomplete from db.labRecipes[]. If the number matches a recipe, a 🔬 View Recipe link appears.'],
            ['Linked Greige', 'When creating a Greige entry, it can be linked to an order. The linked order number appears in the Greige Register.'],
            ['AI Order Acceptance Advisor', 'Inside the New Order form — click 🤖 Check Capacity & Advise. AI reads current machine loads, supervisor workloads, pipeline Kg, overdue count, and party history. Returns ACCEPT / NEGOTIATE / DELAY with reasoning.'],
            ['Auto Supervisor Assignment', 'If Article Master has a mapping for this article, the supervisor is auto-assigned when the order is saved.'],
            ['Supervisor Assignment', 'Assign supervisor manually. Order moves to "assigned" status and appears in supervisor\'s inbox.'],
            ['Split Order', 'Divide one order into multiple batches (e.g. 500 Kg → 3 batches of 200/200/100). Each batch gets a unique batch ID.'],
            ['Bulk Actions', 'Select multiple orders with checkboxes → Bulk Action Bar appears: Assign Supervisor, Change Status, Put on Hold (with reason), Release Hold. Green toast on success. Selection clears when filters change.'],
            ['Order Priority Drag-Drop', 'Click ↕ Set Priority to enter Priority Mode. Drag rows up/down to set processing priority. Priority number (#1, #2…) saved and used to sort FMS, Kanban, and AI Scheduler.'],
            ['Status Flow', 'new → assigned → splitting → in-process → done. Can also be put on hold at any stage.'],
            ['Process Route Visualiser', 'The Order Detail modal shows the process route as a horizontal pipeline: ✓ green = done, blue = current, gray = pending. Connector bars between stages. Legend included.'],
            ['Party CRM Link', 'Party name in the orders table is a clickable link to /party/[name] — shows full order history for that party.'],
            ['Excel Import', 'Bulk import orders from an Excel file via 📄 Import Excel button.'],
            ['Column Filters', 'Filter by any column using the filter row under each header. Supports word-based matching for process route.'],
          ]}
        />
      </Card>

      <H3 icon="⚙">FMS — Factory Management System</H3>
      <P>Each process stage (Dyeing, Finishing, Washing etc.) has its own FMS page. Supervisors use these to move batches through the factory.</P>
      <Card accent="#7C3AED">
        <Table
          headers={['Step', 'What happens']}
          rows={[
            ['Split & Dispatch', 'After splitting, supervisor sends batches to their first process from First Process Batch page. Requires planned dates.'],
            ['Search & Autocomplete', 'FMS search bar filters by batch ID, order, party, color, article, supervisor. Typing a batch ID shows autocomplete suggestions (ID + party + color) from a datalist.'],
            ['Mark Done', 'At each process page (/fms/[code]), supervisor marks a batch done. A prompt asks for actual Kg out — leave blank if same, or enter a different value to record Kg loss.'],
            ['Kg Loss Tracking', 'If actual Kg out differs from in, batch.kgAtProcess[code] = {in, out, loss} is saved. The batch\'s running Kg is updated. Loss is logged to Audit Trail.'],
            ['Auto-advance', 'When a batch is marked done at process N, it automatically moves to process N+1 in the route.'],
            ['Actual Dates', 'fmsActualDates[processCode] stores the completion date. Used by Anomaly Detection, Batch Trace, and Daily Summary.'],
            ['Faulty Flag', 'Any batch can be flagged as faulty with a reason. Creates a faulty record and highlights the batch in red across all views.'],
            ['Delete from FMS', 'Sends a batch back to the previous process (or back to First Process Batch if it is the first process).'],
          ]}
        />
      </Card>

      <H3 icon="🔍">Batch Trace</H3>
      <P>Access at <strong>/batches/[batchId]</strong> or via Operations → Batch Trace in the nav. Enter any batch ID to see its complete factory journey.</P>
      <Card accent="#059669">
        <Table
          headers={['Section', 'What it shows']}
          rows={[
            ['Batch info', 'Order #, party, article, color, Kg, blend, supervisor, machine, status, started date, overall progress bar (N of M stages, %)'],
            ['FMS Journey timeline', 'Every process stage in route order. Circle colour: green ✓ = done, blue ● = active, numbered = pending. Each stage shows: Entered, Completed, Time Spent (days + hours, red if >2 days)'],
            ['Faulty Events', 'Appears only if batch has faulty history — process code, when flagged, reason'],
            ['Repairing Orders', 'If this batch was sent for full or partial reprocess, shows repair order ID, issue type, status'],
          ]}
        />
      </Card>

      <H3 icon="📅">Date Calculator</H3>
      <P>Calculates planned dates for every process step in every batch, based on process durations and machine capacity.</P>
      <Card accent="#059669">
        <Table
          headers={['Feature', 'How it works']}
          rows={[
            ['Generate Dates', 'Click ⚙ Generate Dates. Reads the machine-required process dates (entered manually), then calculates forward/backward to fill all other process steps.'],
            ['Process Days', 'Click Process Days to set how many days each process takes. Defaults come from Process Master → defaultDays.'],
            ['Capacity-aware', 'If a process has a capacity (Kg/day) set, it will delay batches that would exceed capacity on the same day.'],
            ['Holiday-aware', 'Dates automatically skip holidays configured in Holiday Master.'],
            ['Save to Orders', 'Critical: click ⬇ Save to Orders to push calculated dates into order.plannedDates. This is what Delay Predictor, Reports, AI, Anomaly Detection, and Holiday Warnings all read.'],
          ]}
        />
      </Card>

      <H3 icon="📊">Reports</H3>
      <P>Live analytics dashboard — reads directly from localStorage, always up to date.</P>
      <Table
        headers={['Tab / Feature', 'What it shows']}
        rows={[
          ['Overview', 'Total orders, today/week/month counts, status breakdown, Kg ordered/in-process/completed, completion progress bar, batch counts'],
          ['Supervisors', 'Per-supervisor: inbox, active, done, total, completion %, workload bar'],
          ['Machines', 'Per-machine: capacity, loaded Kg, load % with colour bar (green/amber/red), status'],
          ['Processes', 'Per process: active batches, completed batches, relative throughput bar'],
          ['Faulty', 'Total faulty, open vs resolved, faulty count by process/type with share %'],
          ['⬇ Export Tab', 'Exports the current tab as a single-sheet Excel file'],
          ['⬇ Full Report (.xlsx)', 'Exports all 8 sheets: Overview, All Orders, Batches, Supervisors, Machines, Process Throughput, Faulty Records, Faulty by Process'],
        ]}
      />

      <H3 icon="📋">Daily Production Summary</H3>
      <P>Access at <strong>/reports/daily</strong> or via Reports → Daily Summary in the nav. Auto-generated from FMS activity stamped on the selected date.</P>
      <Card accent="#059669">
        <Table
          headers={['Section', 'Content']}
          rows={[
            ['Overview stats', 'Batches completed, Kg processed, new orders received, orders fully finished, faults raised'],
            ['By Process', 'Each FMS stage that had activity — click to expand and see individual batch list (batch ID, order, party, Kg, supervisor)'],
            ['Supervisor Output', 'Each supervisor\'s Kg processed, batch count, which processes they handled'],
            ['Faults raised', 'Any faulty records dated today with link to Faulty page'],
            ['New orders', 'All orders created today as clickable badges'],
            ['WhatsApp Share', 'Pre-formatted bold text (*bold*) ready to paste. "📋 Copy for WhatsApp" + "Open WhatsApp" buttons'],
          ]}
        />
      </Card>

      <H3 icon="📌">Production Kanban Board</H3>
      <P>Visual Kanban view. Each FMS process stage is a column. Each active batch is a card.</P>
      <Table
        headers={['Feature', 'Detail']}
        rows={[
          ['Card colours', '🔴 Red border = overdue. 🟡 Amber = ≤2 days left. 🔵 Blue = on track. ⚠ Faulty = red with FAULTY tag.'],
          ['Card info', 'Batch ID, order #, party, color, Kg, supervisor, days left until dispatch'],
          ['Filter', 'Search box filters across all columns simultaneously'],
          ['List view', 'Toggle ☰ List for a flat table view of all active batches'],
          ['Auto-refresh', 'Reloads data every 60 seconds automatically'],
        ]}
      />

      <H3 icon="📅">Order Timeline (Gantt View)</H3>
      <P>Shows all orders as horizontal bars spanning their planned start → dispatch date.</P>
      <Table
        headers={['Feature', 'Detail']}
        rows={[
          ['Bars', 'Each order is a coloured bar. Blue = in-process, Green = done, Red = overdue, Amber = new'],
          ['Process step markers', 'Small square dots on the bar show each planned process step date'],
          ['TODAY line', 'Vertical red line shows today\'s position on the timeline'],
          ['Window', 'Choose 14 / 30 / 60 / 90 day view window'],
          ['Requires dates', 'Bars only appear for orders that have planned dates set via Date Calculator → Save to Orders'],
        ]}
      />

      <H3 icon="⏰">Shift Management</H3>
      <P>Track which supervisor handles which machines on each shift every day.</P>
      <Table
        headers={['Feature', 'Detail']}
        rows={[
          ['Three shifts', 'Morning (06:00–14:00) 🌅, Evening (14:00–22:00) 🌆, Night (22:00–06:00) 🌙'],
          ['ACTIVE NOW badge', 'The current shift (based on time) shows a green ACTIVE NOW badge'],
          ['Per-shift data', 'Supervisor assigned, machines running, batches completed, shift notes, handover notes for next shift'],
          ['Handover notes', 'Critical field — tells the next supervisor what they need to know'],
        ]}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AI FEATURES
// ─────────────────────────────────────────────────────────────────────────────

function SectionAI() {
  return (
    <div>
      <Card accent="var(--accent)">
        <H2>🤖 AI Assistant — 10 Tools</H2>
        <P>Located at <strong>/ai-assistant</strong>. All tools use <strong>claude-sonnet-4-20250514</strong> via the Anthropic API. All data sent to AI is read live from your localStorage — no manual copy-pasting. The AI sees your actual factory data.</P>
      </Card>

      <H3>Tier 1 — Daily Use</H3>

      <Card accent="#185FA5">
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>💬 Chat Assistant</div>
        <P>Free-form conversation with AI about your factory. Ask anything: "Which orders are overdue?", "Which machine has the most load?", "What should I prioritise today?". AI reads the full database before answering. Supports voice input (🎤) in Hindi, English-India, or English-US.</P>
        <P style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Has quick-question buttons on the left sidebar. Full conversation history maintained during the session.</P>
      </Card>

      <Card accent="#185FA5">
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>📋 Daily Briefing</div>
        <P>Click "Generate Briefing". AI reads all orders, machines, supervisors, and faulty records and produces a morning status report: urgent items, machine loads, supervisor workloads, overdue orders, what to focus on today.</P>
      </Card>

      <Card accent="#185FA5">
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>🎯 Smart Assignment</div>
        <P>Enter a new order's details. AI checks all machine capacities and supervisor workloads and recommends the best supervisor and machine combination with reasoning.</P>
      </Card>

      <Card accent="#185FA5">
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>⚠ Faulty Analyzer</div>
        <P>Reads all faulty records and identifies patterns: which processes cause the most faults, which machines, which supervisors, which article types. Suggests root causes and preventive actions.</P>
      </Card>

      <H3>Tier 2 — Power Tools</H3>

      <Card accent="#7C3AED">
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>⏱ Delay Predictor</div>
        <P>Reads each active order's current process position and compares against planned dispatch dates. Flags orders at risk of missing their deadline before they actually become late.</P>
      </Card>

      <Card accent="#7C3AED">
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>✏ AI Actions Agent</div>
        <P>Tell the AI what to change in plain language: "Put order DYG-2026-5 on hold due to shade mismatch" or "Assign all unassigned orders to Arpit". AI proposes the exact changes for you to review. You confirm before anything is written. All changes logged in Audit Trail.</P>
      </Card>

      <Card accent="#7C3AED">
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>📄 Weekly Report</div>
        <P>Generates a complete weekly production report — orders received/completed, Kg processed, machine utilization, supervisor performance, faulty rate, overdue list, priorities for next week. Formatted for copy-paste to WhatsApp, email, or printing.</P>
      </Card>

      <Card accent="#7C3AED">
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>💬 Customer Reply</div>
        <P>Type a party name or order number. AI finds all matching orders and writes a ready-to-send status update message. Choose tone (formal/friendly) and language (English / Hindi / Hinglish). Output is ready to copy directly to WhatsApp.</P>
      </Card>

      <Card accent="#7C3AED">
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>🗓 Production Scheduler</div>
        <P>Reads all active batches across every machine and generates the optimal processing sequence. Three priority modes:</P>
        <div style={{ marginLeft: 16, marginTop: 6, marginBottom: 8 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}><strong>⚖ Balanced</strong> — Process overdue first, then group by shade sequence with deadline sorting. Best for most factories.</div>
          <div style={{ fontSize: 13, marginBottom: 4 }}><strong>🔴 Deadline First</strong> — Strictly sort by dispatch deadline. Ignores shade order if needed.</div>
          <div style={{ fontSize: 13 }}><strong>🎨 Shade First</strong> — Group White → Light → Medium → Dark to minimise machine rinsing between batches.</div>
        </div>
        <P>Output: numbered sequence per machine, deadlines, capacity warnings, top 3 delay risks, and the single most important action to take now.</P>
      </Card>

      <Card accent="#059669">
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>💰 Cost Estimator</div>
        <P>Estimates processing cost per order and per Kg. You set the machine rate (₹/machine-day, default ₹500). AI calculates machine time cost + chemical cost using Surat dyeing industry standard rates. Outputs a formatted table with Cost/Kg for each order plus optimisation suggestions.</P>
        <P style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Chemical rates: ₹15–40/Kg dyeing, ₹5–15/Kg finishing, ₹3–8/Kg washing. All costs in INR.</P>
      </Card>

      <H3 icon="🤖">AI in New Order Modal</H3>
      <Card accent="#185FA5">
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>Order Acceptance Advisor</div>
        <P>Inside the + New Order form. Click 🤖 Check Capacity & Advise after filling in article, qty, party. AI checks: machine loads, supervisor workloads, total Kg in pipeline, overdue orders, party history.</P>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
          <Badge color="green">✅ ACCEPT</Badge>
          <Badge color="amber">🤝 NEGOTIATE</Badge>
          <Badge color="red">⏸ DELAY</Badge>
        </div>
        <P>Each verdict includes: capacity analysis, realistic timing, main risk, and a specific recommendation (e.g. "Ask for 3-week delivery window").</P>
      </Card>

      <H3 icon="⚠️">AI Anomaly Detection (Dashboard)</H3>
      <Card accent="#DC2626">
        <P>Runs automatically on the Dashboard every 5 minutes. Checks how long each active batch has been at its current FMS process vs expected days (from Process Master defaultDays).</P>
        <Table
          headers={['Severity', 'Trigger', 'Colour']}
          rows={[
            ['🔴 Critical', 'Stuck for 2× the expected time', 'Red'],
            ['⚠️ Warning', 'Stuck for 1×–2× expected time', 'Amber'],
            ['🔵 Watch', 'Slightly over expected', 'Blue'],
          ]}
        />
        <P>Shows: batch ID, order, party, process stuck in, days stuck vs expected, responsible supervisor. Panel is hidden when all clear.</P>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────────────────────

function SectionKeyboardShortcuts() {
  // Note: this section renders its own JSX directly instead of using the Table component
  // to avoid TSX parsing issues with JSX in array literals
  const globalKeys = [
    { key: '?', action: 'Show / hide the shortcuts cheat-sheet overlay', note: 'Works on any page' },
    { key: 'Esc', action: 'Close modals, dropdowns, overlays', note: 'Works everywhere' },
    { key: 'S', action: 'Focus the search bar', note: 'Puts cursor in GlobalSearch instantly' },
    { key: 'R', action: 'Refresh current page data', note: 'Fires dyeflow-refresh event — pages reload their data' },
    { key: 'N', action: 'Open New Order modal', note: 'Only on /orders page' },
    { key: '1–5', action: 'Switch tabs', note: 'Reports and AI Assistant — switches to tab 1, 2, 3, 4, or 5' },
  ]

  const gotoKeys = [
    { combo: 'G + O', dest: 'Orders', url: '/orders' },
    { combo: 'G + D', dest: 'Dashboard', url: '/' },
    { combo: 'G + R', dest: 'Reports', url: '/reports' },
    { combo: 'G + A', dest: 'AI Assistant', url: '/ai-assistant' },
    { combo: 'G + P', dest: 'Production Kanban', url: '/production' },
    { combo: 'G + T', dest: 'Order Timeline', url: '/timeline' },
    { combo: 'G + S', dest: 'Setup', url: '/setup' },
    { combo: 'G + F', dest: 'FMS Overview', url: '/fms' },
    { combo: 'G + B', dest: 'Batch Tracking', url: '/batches' },
    { combo: 'G + M', dest: 'Mobile App', url: '/mobile' },
  ]

  return (
    <div>
      <Card accent="var(--accent)">
        <H2>⌨ Keyboard Shortcuts</H2>
        <P>Press <Kbd>?</Kbd> anywhere in the app to open the shortcuts overlay. Shortcuts don't fire when you're typing in an input field.</P>
      </Card>

      <H3>Global Shortcuts</H3>
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border-light)', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>Key</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>Action</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {globalKeys.map((row, i) => (
              <tr key={i} style={{ borderBottom: i < globalKeys.length - 1 ? '1px solid var(--border-light)' : 'none', background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}>
                <td style={{ padding: '8px 12px' }}><Kbd>{row.key}</Kbd></td>
                <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{row.action}</td>
                <td style={{ padding: '8px 12px', color: 'var(--text-tertiary)', fontSize: 12 }}>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H3>Go To Navigation — G + Letter</H3>
      <P>Press <Kbd>G</Kbd> then a letter within 1.5 seconds to navigate to that page.</P>
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border-light)', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>Keys</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>Navigates to</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-light)' }}>URL</th>
            </tr>
          </thead>
          <tbody>
            {gotoKeys.map((row, i) => (
              <tr key={i} style={{ borderBottom: i < gotoKeys.length - 1 ? '1px solid var(--border-light)' : 'none', background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}>
                <td style={{ padding: '8px 12px' }}>
                  {row.combo.split(' + ').map((k, ki) => (
                    <React.Fragment key={ki}>
                      {ki > 0 && <span style={{ margin: '0 4px', color: 'var(--text-tertiary)' }}>+</span>}
                      <Kbd>{k}</Kbd>
                    </React.Fragment>
                  ))}
                </td>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.dest}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{row.url}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card>
        <P>The shortcut overlay (press <Kbd>?</Kbd>) shows all shortcuts grouped by category, with a search box to quickly find any shortcut.</P>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE APP
// ─────────────────────────────────────────────────────────────────────────────

function SectionMobile() {
  return (
    <div>
      <Card accent="#7C3AED">
        <H2>📱 Mobile App — Factory Floor View</H2>
        <P>Open <strong>/mobile</strong> on your phone (same WiFi network as the server). Bookmark to your home screen for instant access. Designed for one-thumb use with large touch targets — no horizontal scrolling.</P>
        <P><strong>Access from desktop:</strong> Click the 📱 button in the top navigation bar.</P>
      </Card>

      <H3 icon="🏠">Mobile Home</H3>
      <P>Current time and date, alert banners (overdue orders, open faults, new unassigned orders), 4 stat boxes (New/Active/Done/Hold), quick access cards to all sections, and Live Process Activity — which FMS processes have active batches right now (tap to open that process).</P>

      <H3 icon="⚙">Mobile FMS</H3>
      <Table
        headers={['Feature', 'Detail']}
        rows={[
          ['Process selector', 'Horizontal scrolling pill buttons at the top — tap to switch process'],
          ['Batch cards', 'Shows batch ID, order, party, article, color, Kg, supervisor, planned date'],
          ['✓ Mark as Done', 'Large green button on each card. Confirms, records actual date, auto-advances to next process'],
          ['Search', 'Filter by batch ID, order number, party, or color'],
          ['Faulty flag', 'Faulty batches show ⚠ FAULTY in red on their card'],
          ['Auto-refresh', 'Reloads every 60 seconds'],
        ]}
      />

      <H3 icon="📦">Mobile Batch Tracker</H3>
      <P>Find any batch instantly. Filter tabs: Active / All / Done / Faulty. Search by batch ID, order, party, color, supervisor. Each card shows full batch status, article, Kg, and current process stage.</P>

      <H3 icon="📋">Mobile Orders</H3>
      <P>Simplified order list. Status filter scroll at top. Search by order #, party, color, article. Tap any order to expand — shows blend, width, GSM, machine, lab no, lot no, full process route (with colour-coded done/active/pending steps), and all batch details.</P>

      <H3 icon="👷">Mobile Supervisor View</H3>
      <P>Each supervisor sees their own workspace. Tap your name at the top. Three tabs: Inbox (assigned orders), Active (in-process), Done.</P>
      <P>In the Inbox tab, each order shows three checkboxes you can tick directly on your phone: <strong>🔬 Lab Recheck</strong>, <strong>📥 Lab Receive</strong>, <strong>🧵 Greige Check</strong>.</P>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP & MASTERS
// ─────────────────────────────────────────────────────────────────────────────

function SectionSetup() {
  return (
    <div>
      <Card accent="#D97706">
        <H2>⚙ Setup & Masters</H2>
        <P>All master configuration lives under <strong>/setup</strong>. Changes here affect the entire ERP. Always configure masters before using the main modules.</P>
      </Card>

      <Table
        headers={['Master', 'URL', 'What it controls', 'Important notes']}
        rows={[
          ['Factory Settings', '/setup/factory-settings', 'Order number prefix (e.g. DYG, FAB), factory name, city, GST, phone', 'Prefix change only affects new orders. Existing order numbers are not renamed.'],
          ['Process Master', '/setup/process-master', 'All FMS process stages — name, code, order, enabled/disabled, defaultDays', 'defaultDays feeds into Date Calculator. Disabled processes are hidden everywhere.'],
          ['Machine Master', '/setup/machine-master', 'Machines — name, type, capacity (Kg)', 'Capacity used for machine load % in Reports and Notifications'],
          ['Supervisor Master', '/setup/supervisor-master', 'Supervisors — name, phone, email', 'All supervisor dropdowns read from here. Add supervisor here first.'],
          ['Customer Master', '/setup/customer-master', 'Customers / parties — name, phone, email', 'Enables autocomplete in the New Order form party field'],
          ['Article→Supervisor Map', '/setup/article-master', 'Maps article types to default supervisors', 'Auto-assigns supervisor when an order with that article is created'],
          ['Process & Machine Map', '/setup/process-machine-master', 'Maps articles to their default process routes', 'Pre-fills process route when creating orders for known articles'],
          ['Shade Master', '/setup/shade-master', 'Colour keyword → shade group rules (White / Light / Medium / Dark)', 'Custom rules checked before built-in keywords. Used by Machine Sheets, AI Scheduler, Kanban. Test tool included.'],
          ['Holiday Master', '/setup/holiday-master', 'Factory holidays', 'Date Calculator skips these dates. Dashboard warns if any order\'s planned date falls on a holiday (14-day lookahead).'],
          ['User Management', '/setup/user-management', 'User roles and access', ''],
          ['Colour Chemical Master', '/setup/colour-chemical-master', 'Chemical and colour data', ''],
        ]}
      />

      <H3>Recommended Setup Order (Fresh Install)</H3>
      <div>
        {[
          ['Configure Factory Settings', 'Factory Settings → Set order number prefix and factory name'],
          ['Add Supervisors', 'Supervisor Master → Add all supervisor names'],
          ['Add Machines', 'Machine Master → Add machines with capacity in Kg'],
          ['Configure Processes', 'Process Master → Enable/disable processes, set order, set defaultDays'],
          ['Add Customers', 'Customer Master → Import or manually add parties'],
          ['Map Articles', 'Article→Supervisor Map → Upload Excel or add manually'],
          ['Map Process Routes', 'Process & Machine Map → Upload JSON or add manually'],
          ['Set Holidays', 'Holiday Master → Add factory holidays for the year'],
          ['Configure Shade Rules', 'Shade Master → Add custom colour→shade mappings if needed'],
        ].map(([title, desc], i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < 8 ? '1px solid var(--border-light)' : 'none', alignItems: 'flex-start' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {i + 1}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA & STORAGE
// ─────────────────────────────────────────────────────────────────────────────

function SectionData() {
  return (
    <div>
      <Card accent="#059669">
        <H2>💾 Data & Storage</H2>
        <P>DyeFlow stores all data in your browser's <strong>localStorage</strong> under the key <code style={{ background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}>dyeflow_db</code>. No server, no cloud, no internet required. Data stays on this device.</P>
      </Card>

      <H3>Database Schema</H3>
      <Table
        headers={['Field', 'Type', 'Contains']}
        rows={[
          ['orders[]', 'Array', 'All orders. Each order has: splits[], processRoute[], plannedDates{}, supervisor, machine, status, priority, and all form fields'],
          ['machines[]', 'Array', 'Machine definitions: id, name, type, capacity, status'],
          ['supervisors[]', 'Array', 'Supervisor definitions: id, name, phone, email'],
          ['processList[]', 'Array', 'All process stages with code, name, enabled, order, defaultDays'],
          ['customers[]', 'Array', 'Customer/party master: name, phone, email'],
          ['faultyRecords[]', 'Array', 'Faulty batch records with batchId, type, status, dates, ifOk, reprocess'],
          ['repairingOrders[]', 'Array', 'Reprocess orders created from faulty records (Full or Partial reprocess)'],
          ['shiftLogs[]', 'Array', 'Daily shift assignments with supervisor, machines, handover notes'],
          ['auditLog[]', 'Array', 'Full change history: every status change, assignment, edit, Kg loss'],
          ['greigeEntries[]', 'Array', 'Greige register entries with linkedOrderId for Greige ↔ Batch tracing'],
          ['labRecipes[]', 'Array', 'Lab recipe records with labRequestNo (used for Lab No. autocomplete in Orders)'],
          ['articleSupervisorMap{}', 'Object', 'article → supervisor name mapping'],
          ['articleProcessMap{}', 'Object', 'article → process route array mapping'],
          ['processDurations[]', 'Array', 'Manual override of days per process (Date Calculator)'],
          ['holidays[]', 'Array', 'Factory holiday dates used by Date Calculator and Holiday Warnings'],
          ['shadeRules[]', 'Array', 'Custom colour keyword → shade group rules from Shade Master'],
          ['settings.factory{}', 'Object', 'Factory settings: orderPrefix, factoryName, city, gstNumber, phone'],
        ]}
      />

      <H3>Key Fields on Each Batch (order.splits[])</H3>
      <Table
        headers={['Field', 'Set by', 'Used by']}
        rows={[
          ['batch.fmsDispatch{}', 'First Process Batch dispatch', 'FMS pages, Anomaly Detection'],
          ['batch.fmsActualDates{}', 'FMS Mark Done', 'Anomaly Detection, Batch Trace, Daily Summary, Reports'],
          ['batch.fmsCurrentProcess', 'Auto-set by FMS', 'Production Kanban, Mobile FMS, AI Scheduler, FMS Nav Badges'],
          ['batch.fmsEnterAt{}', 'Auto-set when batch enters FMS stage', 'Batch Trace (time spent per stage)'],
          ['batch.fmsFaulty{}', 'Faulty module', 'Red ⚠ FAULTY flag in all batch views'],
          ['batch.fmsDone', 'Auto-set when all stages complete', 'Batch status, Reports'],
          ['batch.kgAtProcess{}', 'FMS Mark Done (Kg prompt)', 'Kg loss tracking: {in, out, loss} per process'],
        ]}
      />

      <H3>Backup & Restore</H3>
      <P>Go to <strong>Setup Overview (/setup)</strong> to:</P>
      <div style={{ marginLeft: 16 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>📤 <strong>Export</strong> — downloads the entire database as a JSON file. Do this regularly as a backup.</div>
        <div style={{ fontSize: 13, marginBottom: 6 }}>📥 <strong>Import</strong> — restores a previously exported JSON file. Replaces all current data.</div>
        <div style={{ fontSize: 13 }}>🗑 <strong>Clear</strong> — wipes the entire database. Use with caution.</div>
      </div>

      <H3>Audit Trail</H3>
      <P>Every status change, supervisor assignment, AI action, order edit, and Kg loss is logged to <code style={{ background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}>db.auditLog</code>. View at <strong>/audit-log</strong>. Filterable by date, entity type, and action type.</P>

      <H3>Data Flow</H3>
      <Card>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <strong>New Order</strong> → supervisor assigned → <strong>Split</strong> → send to <strong>First Process Batch</strong> (requires planned dates from <strong>Date Calculator</strong>) → batches enter <strong>FMS</strong> → marked Done at each stage (records <code>fmsActualDates</code> + Kg loss) → final stage → order complete
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-tertiary)' }}>
          ↳ All timestamps feed: Anomaly Detection, Batch Trace, Daily Summary, Reports, AI tools
        </div>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UX FEATURES
// ─────────────────────────────────────────────────────────────────────────────

function SectionUX() {
  return (
    <div>
      <H3 icon="🟥">Production Heatmap (Dashboard)</H3>
      <Card accent="#185FA5">
        <P>A bar chart on the Dashboard showing the last 35 days of batch completions. Each bar represents one day — height and colour intensity are proportional to how many batches were completed. Today's bar has an accent-coloured border. Hover shows date, count, and Kg. Colour scale: light blue → dark blue (0 to max). "Daily Report →" link at the bottom right.</P>
      </Card>

      <H3 icon="📅">Holiday Conflict Warnings (Dashboard)</H3>
      <Card accent="#D97706">
        <P>An amber warning banner that appears on the Dashboard only when needed. Scans all active orders' plannedDates and checks if any fall on a date in db.holidays[] within the next 14 days. Shows: date, order #, party, process stage, holiday name. "Fix in Date Calculator →" link. Hidden when all clear.</P>
      </Card>

      <H3 icon="🌙">Dark Mode</H3>
      <Card accent="#3C3489">
        <P>Toggle with the <strong>🌙 / ☀ button</strong> in the navigation bar. Your preference is saved and applied instantly on every page load — no flash. Uses a separate set of CSS variables for dark backgrounds, light text, and adjusted accent colours. Preference stored in localStorage as <code style={{ background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}>dyeflow_theme</code> = 'dark' or 'light'.</P>
      </Card>

      <H3 icon="🔔">Notification Center</H3>
      <Card accent="#D97706">
        <P>The 🔔 bell icon in the nav bar shows a live badge. Red = urgent issues. Blue = non-urgent. No badge = all clear. Auto-refreshes every 30 seconds.</P>
        <Table
          headers={['Type', 'Trigger', 'Links to']}
          rows={[
            ['⏰ Overdue', 'Any order past its planned dispatch date', '/orders'],
            ['⚙ Capacity', 'Any machine at ≥80% of its Kg capacity', '/machines'],
            ['⚠️ Faulty', 'Any faulty record with status = open', '/faulty'],
            ['📬 Inbox overflow', 'Any supervisor with ≥5 assigned orders waiting', '/supervisor/[name]'],
            ['⏸ On Hold', 'Any orders with status = hold', '/orders'],
            ['🔧 Repairing', 'Any repairing orders with status Pending or In Repair', '/repairing-order'],
          ]}
        />
      </Card>

      <H3 icon="📊">Dashboard Data Freshness</H3>
      <Card>
        <P>The Dashboard stat cards show a data freshness indicator below them: a green dot + "Updated 14:32 · auto-refreshes every 2 min" + a ↻ Refresh button. Data auto-refreshes every 2 minutes and also instantly when any database write occurs (dyeflow-db-updated event).</P>
      </Card>

      <H3 icon="↕">Order Priority Drag-Drop</H3>
      <Card accent="#7C3AED">
        <P>On the Orders page, click <strong>↕ Set Priority</strong> to enter Priority Mode. Drag rows up or down to change priority. Priority badges (#1, #2…) appear in the Actions column. Priority numbers propagate to: Orders page sorting, Production Kanban, AI Production Scheduler.</P>
      </Card>

      <H3 icon="🏭">Party CRM</H3>
      <Card>
        <P>Click any party name in the Orders table to open <strong>/party/[name]</strong> — a dedicated party history page. Two tabs:</P>
        <div style={{ marginLeft: 16, marginTop: 6 }}>
          <div style={{ fontSize: 13, marginBottom: 5 }}><strong>Overview:</strong> Total orders, Total Kg, Completion %, Pending orders, Average delay vs planned dispatch, Faulty rate, Status breakdown, Supervisor list (clickable links)</div>
          <div style={{ fontSize: 13 }}><strong>All Orders:</strong> Full searchable table of every order from this party with status and planned dispatch date (red if overdue)</div>
        </div>
      </Card>

      <H3 icon="⚙">FMS Navigation Badges</H3>
      <Card>
        <P>The FMS dropdown in the navigation bar shows active batch counts next to each process: <strong>"D - Dyeing (12)"</strong> when there are 12 active batches in Dyeing. Updates live whenever the database changes. Empty processes show no count.</P>
      </Card>

      <H3 icon="🔍">Global Search</H3>
      <Card>
        <P>The search bar in the navigation bar (or press <Kbd>S</Kbd> to focus it). Searches across all orders, batches, and parties in real time. Click any result to navigate directly to that order.</P>
      </Card>

      <H3 icon="📤">Data Import</H3>
      <Card>
        <P>Import orders from Excel at <strong>/import</strong>. Handles bulk entry of historical data. Article→Supervisor Map and Process→Machine Map both support Excel/CSV import from their respective Setup pages.</P>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CHANGELOG
// ─────────────────────────────────────────────────────────────────────────────

function SectionChangelog() {
  const releases = [
    {
      version: 'v3.0 — Polish Release',
      date: 'May 2026',
      color: '#185FA5',
      items: [
        'FMS batch autocomplete — datalist on search input with batch ID + party + colour suggestions',
        'FMS Navigation Badges — active batch count per process in nav dropdown (e.g. "D - Dyeing (12)")',
        'Dashboard data freshness — green dot + timestamp + ↻ Refresh button below stat cards, auto-refresh every 2 min',
        'Faulty page Excel export — ⬇ Export (.xlsx) button exports all 30 columns of all faulty records',
        'Supervisor cards show active Kg in pipeline as 4th mini-stat alongside Inbox / Active / Done',
        'Process route visualiser in Order detail modal — done=green ✓, active=blue ●, pending=gray pipeline',
        'Configurable order number prefix — /setup/factory-settings; reads db.settings.factory.orderPrefix',
        'Shade Rule Master — /setup/shade-master; custom colour keyword → shade group rules, test tool, built-in reference',
      ],
    },
    {
      version: 'v2.5 — Connections Release',
      date: 'May 2026',
      color: '#7C3AED',
      items: [
        'Daily Production Summary (/reports/daily) — auto-generated from FMS activity, WhatsApp share button',
        'Batch Trace (/batches/[batchId]) — full FMS journey, faulty events, repairing orders, progress bar',
        'FMS Search Bar — filter by batch, order, party, color, article, supervisor on every FMS page',
        'Party CRM (/party/[name]) — order history, Kg, completion rate, avg delay, faulty rate, supervisor links',
        'Bulk Order Actions — row checkboxes, Assign Supervisor, Change Status, Put on Hold, Release Hold, green toast',
        'Production Heatmap — 35-day bar chart on Dashboard, hover tooltips, Daily Report link',
        'Kg Loss Tracking — prompt on FMS mark-done, stores kgAtProcess{in, out, loss}, updates batch.kg',
        'Holiday Conflict Warnings — amber banner on Dashboard, 14-day lookahead, link to Date Calculator',
        'Greige ↔ Batch link — Link to Order field in Greige Entry, auto-fills party/article/blend, Linked Order column in Register',
        'Lab Recipe ↔ Orders — Lab No. autocomplete from db.labRecipes, 🔬 View Recipe link in Orders table and New Order form',
        'Repairing Orders in Notifications — 6th notification type (🔧 repair, purple), urgent when priority is High/Critical',
      ],
    },
    {
      version: 'v2.0 — AI & UX Release',
      date: 'April 2026',
      color: '#059669',
      items: [
        'Dark Mode — full CSS variable theming, no-flash script, DarkModeToggle in nav',
        'Notification Center — 5 alert types, live badge, 30-second auto-refresh',
        'Keyboard Shortcuts — 14 shortcuts + ? overlay, G+letter navigation',
        'Order Priority Drag-Drop — ↕ Set Priority mode, drag handles, priority saved to db',
        'AI Anomaly Detection — AnomalyPanel on Dashboard, checks every 5 min, 3 severity tiers',
        'AI Order Acceptance Advisor — inside New Order modal, ACCEPT/NEGOTIATE/DELAY verdict',
        'Production Heatmap (first version) — GitHub-style daily batch completion chart',
        'Party CRM links — clickable party names in Orders table',
        '10 AI Tools in /ai-assistant — Chat, Briefing, Assignment, Faulty Analyzer, Delay Predictor, Actions Agent, Weekly Report, Customer Reply, Scheduler, Cost Estimator',
      ],
    },
    {
      version: 'v1.0 — Core Release',
      date: 'March 2026',
      color: '#D97706',
      items: [
        'Orders — full CRUD with status flow, Excel import, column filters',
        'FMS (Factory Management System) — per-process pages with mark done, faulty flag, delete',
        'Date Calculator — capacity-aware, holiday-aware date planning with Save to Orders',
        'Production Kanban Board — visual per-process columns with batch cards',
        'Order Timeline (Gantt view) — horizontal bar chart with TODAY line and process markers',
        'Shift Management — three shifts, handover notes, history',
        'Reports — 5-tab analytics with Excel export (8 sheets)',
        'Mobile App — FMS, batches, orders, supervisor view optimised for phone',
        'Setup Masters — process, machine, supervisor, customer, article, holiday',
        'Batch Tracking and Faulty Management with IF OK / Reprocess (Full & Partial)',
        'Audit Log — full change history',
        'First Process Batch page — planned-date-required dispatch flow',
      ],
    },
  ]

  return (
    <div>
      <Card accent="var(--accent)">
        <H2>📝 Changelog</H2>
        <P>Version history of DyeFlow ERP. Latest release is shown first.</P>
      </Card>
      {releases.map((release, ri) => (
        <div key={ri} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: release.color }}>{release.version}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 10 }}>{release.date}</div>
          </div>
          <div style={{ borderLeft: `3px solid ${release.color}30`, paddingLeft: 14 }}>
            {release.items.map((item, ii) => (
              <div key={ii} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                <span style={{ color: release.color, flexShrink: 0, marginTop: 1 }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function InformationPage() {
  const [active, setActive] = useState<Section>('Overview')

  const content: Record<Section, React.ReactNode> = {
    'Overview':           <SectionOverview />,
    'Core Modules':       <SectionCoreModules />,
    'AI Features':        <SectionAI />,
    'Keyboard Shortcuts': <SectionKeyboardShortcuts />,
    'Mobile App':         <SectionMobile />,
    'Setup & Masters':    <SectionSetup />,
    'Data & Storage':     <SectionData />,
    'UX Features':        <SectionUX />,
    'Changelog':          <SectionChangelog />,
  }

  const ICONS: Record<Section, string> = {
    'Overview':           '🏭',
    'Core Modules':       '📦',
    'AI Features':        '🤖',
    'Keyboard Shortcuts': '⌨',
    'Mobile App':         '📱',
    'Setup & Masters':    '⚙',
    'Data & Storage':     '💾',
    'UX Features':        '✨',
    'Changelog':          '📝',
  }

  return (
    <div className="content" style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
          📖 DyeFlow ERP — System Information
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          Complete reference for every feature, AI tool, keyboard shortcut, and how the system works. 9 sections.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Sidebar */}
        <div style={{ width: 200, flexShrink: 0, position: 'sticky', top: 60 }}>
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 10, overflow: 'hidden' }}>
            {SECTIONS.map(section => (
              <button
                key={section}
                onClick={() => setActive(section)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', textAlign: 'left',
                  padding: '10px 14px', fontSize: 13,
                  fontWeight: active === section ? 700 : 400,
                  background: active === section ? 'var(--accent-light)' : 'transparent',
                  color: active === section ? 'var(--accent-dark)' : 'var(--text-primary)',
                  border: 'none',
                  borderLeft: active === section ? '3px solid var(--accent)' : '3px solid transparent',
                  cursor: 'pointer',
                  borderRadius: 0,
                  borderBottom: '1px solid var(--border-light)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{ICONS[section]}</span>
                {section}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
            Press <Kbd>?</Kbd> anywhere for shortcuts overlay.
          </div>

          <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Stack:</strong> Next.js 16.2.4 · React 19 · TypeScript · Tailwind 4
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {content[active]}
        </div>
      </div>
    </div>
  )
}
