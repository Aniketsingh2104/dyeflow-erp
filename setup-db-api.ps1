# Run this once to create the db API directory and data folder
# Open PowerShell in C:\dyeflow-react and run: .\setup-db-api.ps1

$ErrorActionPreference = "Stop"

# 1. Create the API route directory
New-Item -ItemType Directory -Force -Path "app\api\db" | Out-Null

# 2. Create the data directory (where db.json will be stored)
New-Item -ItemType Directory -Force -Path "data" | Out-Null

# 3. Write the db API route
$routeContent = @'
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
    const data = readDb()
    return NextResponse.json({ ok: true, data })
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
'@

Set-Content -Path "app\api\db\route.ts" -Value $routeContent -Encoding UTF8

Write-Host ""
Write-Host "SUCCESS! Created:" -ForegroundColor Green
Write-Host "  app\api\db\route.ts  (server-side database API)" -ForegroundColor Cyan
Write-Host "  data\                (where dyeflow_db.json will be stored)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Now restart the server: npm run dev" -ForegroundColor Yellow
