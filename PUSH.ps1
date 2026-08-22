Set-Location "C:\dyeflow-react"
git add -A
git commit -m "feat: RAG AI assistant (Ollama), learned predictions (machine/route/faulty-risk/FOB-risk with real reasons), historical data import (40k+ batches), fix all 10 AI Assistant tabs to use real Supabase data and writes, fix orders page syntax errors"
git push origin main
Write-Host "DONE! Wait 60-90s for Vercel to build." -ForegroundColor Green
