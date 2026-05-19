# DyeFlow — One-click setup for shared database
# Open PowerShell in C:\dyeflow-react and run: .\setup-shared-db.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "DyeFlow Shared Database Setup" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan

# 1. Create directories
New-Item -ItemType Directory -Force -Path "app\api\db"   | Out-Null
New-Item -ItemType Directory -Force -Path "app\migrate"  | Out-Null
New-Item -ItemType Directory -Force -Path "data"         | Out-Null
Write-Host "[1/3] Directories created" -ForegroundColor Green

# 2. Write /api/db/route.ts
@'
import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data")
const DB_FILE  = path.join(DATA_DIR, "dyeflow_db.json")

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readDb(): any {
  try {
    ensureDir()
    if (!fs.existsSync(DB_FILE)) return {}
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"))
  } catch {
    return {}
  }
}

function writeDb(data: any): void {
  ensureDir()
  const tmp = DB_FILE + ".tmp"
  fs.writeFileSync(tmp, JSON.stringify(data), "utf-8")
  fs.renameSync(tmp, DB_FILE)
}

export async function GET() {
  try {
    return NextResponse.json({ ok: true, data: readDb() })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 })
    }
    writeDb(body)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
'@ | Set-Content "app\api\db\route.ts" -Encoding UTF8
Write-Host "[2/3] Created app\api\db\route.ts" -ForegroundColor Green

# 3. Write /migrate/page.tsx
@'
"use client"
import { useState } from "react"

export default function MigratePage() {
  const [status, setStatus] = useState<"idle"|"running"|"done"|"error">("idle")
  const [message, setMessage] = useState("")
  const [stats, setStats] = useState<any>(null)

  const migrate = async () => {
    setStatus("running")
    setMessage("Reading local data...")
    try {
      const raw = localStorage.getItem("dyeflow_db")
      if (!raw) { setStatus("error"); setMessage("No local data found."); return }
      const d = JSON.parse(raw)
      const orders  = d.orders?.length || 0
      const batches = (d.orders||[]).reduce((s:number,o:any)=>s+(o.splits?.length||0),0)
      const fob     = d.fobRecords?.length || 0
      const faulty  = d.faultyRecords?.length || 0
      setMessage(`Found ${orders} orders, ${batches} batches. Uploading...`)
      const res = await fetch("/api/db", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: raw
      })
      if (!res.ok) throw new Error("Server error " + res.status)
      setStats({ orders, batches, fob, faulty })
      setStatus("done")
      setMessage("All data migrated to server!")
    } catch(e:any) {
      setStatus("error")
      setMessage("Failed: " + e.message)
    }
  }

  const verify = async () => {
    try {
      const res = await fetch("/api/db?_t="+Date.now())
      const j = await res.json()
      const d = j.data || {}
      setMessage(`Server has: ${d.orders?.length||0} orders | ${d.fobRecords?.length||0} FOB | ${d.faultyRecords?.length||0} faulty`)
    } catch(e:any) { setMessage("Verify failed: " + e.message) }
  }

  const bgCol  = status==="done"?"#D1FAE5":status==="error"?"#FEE2E2":"#EFF6FF"
  const txtCol = status==="done"?"#065F46":status==="error"?"#991B1B":"#1E40AF"

  return (
    <div className="content">
      <div className="card" style={{maxWidth:620,margin:"40px auto"}}>
        <div className="card-header">
          <span className="card-title">🔄 Migrate Data to Server</span>
        </div>
        <p style={{fontSize:14,color:"var(--text-secondary)",lineHeight:1.8,marginBottom:16}}>
          This copies all factory data from <strong>this browser</strong> to the server so{" "}
          <strong>every device shares the same data</strong>.<br/>
          Run this <strong>once</strong> from the PC that has all your existing data.
        </p>
        {message && (
          <div style={{padding:"12px 16px",borderRadius:8,marginBottom:16,fontSize:13,
            background:bgCol,color:txtCol,border:`1px solid ${status==="done"?"#6EE7B7":status==="error"?"#FCA5A5":"#BFDBFE"}`}}>
            {status==="running"&&"⏳ "}{status==="done"&&"✅ "}{status==="error"&&"❌ "}
            {message}
          </div>
        )}
        {stats && status==="done" && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
            {[["Orders",stats.orders],["Batches",stats.batches],["FOB",stats.fob],["Faulty",stats.faulty]].map(([l,v])=>(
              <div key={String(l)} style={{background:"var(--bg-secondary)",borderRadius:8,padding:12,textAlign:"center"}}>
                <div style={{fontSize:26,fontWeight:700,color:"var(--accent)"}}>{v}</div>
                <div style={{fontSize:11,color:"var(--text-tertiary)",marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <button onClick={migrate} disabled={status==="running"} className="primary"
            style={{padding:"10px 24px",fontSize:14,fontWeight:700}}>
            {status==="running"?"⏳ Migrating...":"🚀 Migrate to Server"}
          </button>
          <button onClick={verify} style={{padding:"10px 20px",fontSize:13}}>
            🔍 Verify Server Data
          </button>
        </div>
        {status==="done" && (
          <div style={{marginTop:20,padding:"14px 16px",background:"var(--bg-secondary)",
            borderRadius:8,fontSize:13,color:"var(--text-secondary)",lineHeight:1.8}}>
            <strong>✓ Migration complete!</strong><br/>
            • All devices now share the same data<br/>
            • Changes sync automatically every 5 seconds<br/>
            • Data stored in: <code>data/dyeflow_db.json</code>
          </div>
        )}
      </div>
    </div>
  )
}
'@ | Set-Content "app\migrate\page.tsx" -Encoding UTF8
Write-Host "[3/3] Created app\migrate\page.tsx" -ForegroundColor Green

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host " ALL DONE! Now do these 3 steps:" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "STEP 1 - Restart server (Ctrl+C, then):" -ForegroundColor Yellow
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "STEP 2 - Migrate existing data (run once from main PC):" -ForegroundColor Yellow
Write-Host "  http://localhost:6060/migrate" -ForegroundColor White
Write-Host "  Click 'Migrate to Server'" -ForegroundColor White
Write-Host ""
Write-Host "STEP 3 - Access from other devices on WiFi:" -ForegroundColor Yellow
Write-Host "  http://192.168.12.95:6060" -ForegroundColor White
Write-Host "  (your current IP - all devices share same data)" -ForegroundColor White
Write-Host ""
