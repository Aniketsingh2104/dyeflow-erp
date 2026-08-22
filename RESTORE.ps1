Set-Location "C:\dyeflow-react"

Write-Host "Restoring date-calculator page from commit 056351d..." -ForegroundColor Cyan
git checkout 056351d -- app/date-calculator/page.tsx
git checkout 056351d -- app/api/date-plans/route.ts

Write-Host "Verifying restored files..." -ForegroundColor Cyan
$linesDC = (Get-Content "app/date-calculator/page.tsx" | Measure-Object -Line).Lines
$linesAPI = (Get-Content "app/api/date-plans/route.ts" | Measure-Object -Line).Lines
Write-Host "date-calculator/page.tsx: $linesDC lines" -ForegroundColor Green
Write-Host "api/date-plans/route.ts: $linesAPI lines" -ForegroundColor Green

git add app/date-calculator/page.tsx
git add app/api/date-plans/route.ts
git commit -m "restore: date-calculator page and date-plans API restored from backup commit 056351d (before dynamic columns change)"
git push origin main

Write-Host ""
Write-Host "DONE! Wait 90s then refresh Date Calculator." -ForegroundColor Green
Write-Host "Files restored to pre-dynamic-columns state." -ForegroundColor Green
Read-Host "Press Enter to exit"
