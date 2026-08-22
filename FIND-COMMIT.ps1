Set-Location "C:\dyeflow-react"

Write-Host "Finding commit hash before dynamic columns change..." -ForegroundColor Cyan
git log --oneline -15
