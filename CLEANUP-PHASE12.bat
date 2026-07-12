@echo off
cd C:\dyeflow-react
echo ============================================
echo  DyeFlow ERP — Phase 12 Cleanup
echo ============================================

:: ── 1. Entire .trash folder ──────────────────
echo Removing .trash folder...
rmdir /S /Q .trash

:: ── 2. Stray root-level files (process names used as filenames) ──
echo Removing stray root files...
del /Q "D"
del /Q "S"
del /Q "new"
del /Q "User"
del /Q "Wash"
del /Q "_holidayset_fix.txt"
del /Q "FORCE_REBUILD.txt" 2>nul

:: ── 3. Old PUSH-*.bat scripts (replaced by PUSH-PHASE12.bat) ────
echo Removing old PUSH batch files...
del /Q PUSH-AUTH-FIX.bat
del /Q PUSH-CAPACITY-FINAL.bat
del /Q PUSH-CAPACITY.bat
del /Q PUSH-DATE-ANCHOR.bat
del /Q PUSH-DATE-CALC-COLMAP.bat
del /Q PUSH-DATE-CALC-EXCEL.bat
del /Q PUSH-DATE-CALC-FIX.bat
del /Q PUSH-DATE-FINAL.bat
del /Q PUSH-DATE-FIX.bat
del /Q PUSH-DATE-FULLSCREEN.bat
del /Q PUSH-DATE-INPUT-FIX.bat
del /Q PUSH-DATE-LABEL-FIX.bat
del /Q PUSH-DATE-MACHINE-FIX.bat
del /Q PUSH-DATE-REWRITE.bat
del /Q PUSH-DATE-XLSX-FIX.bat
del /Q PUSH-FIX.bat
del /Q PUSH-FIXES.bat
del /Q PUSH-KEEPALIVE.bat
del /Q PUSH-LOGIN-FIX.bat
del /Q PUSH-LOGIN-GATE.bat
del /Q PUSH-LOGIN.bat
del /Q PUSH-LOGOUT.bat
del /Q PUSH-MIDDLEWARE.bat
del /Q PUSH-MULTI-DATE.bat
del /Q PUSH-NOW.bat
del /Q PUSH-PERMISSIONS.bat
del /Q PUSH-PHASE4.bat
del /Q PUSH-PHASE4B.bat
del /Q PUSH-PHASE4C.bat
del /Q PUSH-PHASE5.bat
del /Q PUSH-PHASE6.bat
del /Q PUSH-PHASE7.bat
del /Q PUSH-PHASE8.bat
del /Q PUSH-PHASE9.bat
del /Q PUSH-PHASE10.bat
del /Q PUSH-PHASE11.bat
del /Q PUSH-SHADE-UPLOAD.bat
del /Q PUSH-SHEET-ACCESS.bat
del /Q PUSH-SUPABASE-MIGRATION.bat
del /Q PUSH-SYNC-FIX.bat
del /Q PUSH-USERS.bat
del /Q PUSH-XLSX-CDN.bat
del /Q PUSH-XLSX-FINAL.bat

:: ── 4. Other old bat/ps1/md/txt/js scripts ──────────────────────
echo Removing old scripts and docs...
del /Q FIX-MIDDLEWARE.bat
del /Q FIX-NOW.bat
del /Q FIX-VERCEL-ENV.bat
del /Q COPY-DATE-PAGE.bat
del /Q REDEPLOY.bat
del /Q RUN-SET-ENV.bat
del /Q SET-ENV-AND-DEPLOY.bat
del /Q SET-ENV-AND-DEPLOY.ps1
del /Q PUSH-SUPABASE-MIGRATION.ps1
del /Q push-fix.ps1
del /Q push-others-nav.ps1
del /Q deploy.ps1
del /Q cleanup.ps1
del /Q setup-db-api.ps1
del /Q setup-shared-db.ps1
del /Q set-vercel-env.js
del /Q proxy.ts
del /Q VERCEL-ENV-VARS.txt
del /Q VERCEL-FIX-NOW.md
del /Q DEPLOY.md
del /Q DEPLOY-LIVE.md
del /Q DEPLOY-VERCEL.md
del /Q AGENTS.md

:: ── 5. data/ folder (old JSON export, no longer needed) ──────────
echo Removing data/ folder...
rmdir /S /Q data

:: ── 6. Stray files inside app/ subdirectories ───────────────────
echo Removing stray files in app/...
del /Q "app\faulty\page_fix.txt"
del /Q "app\import\pending-approvals-page.tsx"
del /Q "app\import\sheet-page.tsx"
del /Q "app\import\SheetPageContent.tsx"
del /Q "app\orders\page-BACKUP-LS.tsx"
del /Q "app\orders\page-BACKUP.tsx"
del /Q "app\sheet\SheetPageContent_OLD_BUGGY.tsx"

:: ── 7. Empty directories left behind ────────────────────────────
echo Removing empty directories...
rmdir /Q "app\dispatch"
rmdir /Q "app\maintenance"

:: ── 8. Old api/claude and api/db (legacy localStorage API routes) ─
echo Removing legacy API routes...
del /Q "app\api\claude\db-route.ts"
del /Q "app\api\claude\route.ts"
rmdir /Q "app\api\claude"
del /Q "app\api\db\route.ts"
rmdir /Q "app\api\db"
del /Q "app\api\keep-alive\route.ts"
rmdir /Q "app\api\keep-alive"
del /Q "app\api\masters\route.ts"
rmdir /Q "app\api\masters"

:: ── 9. lib/db.ts (old localStorage db helper, replaced by supabase.ts) ──
echo Removing lib/db.ts...
del /Q "lib\db.ts"

:: ── 10. fms/d (hardcoded process page, replaced by fms/[process]) ──
echo Removing fms/d hardcoded page...
del /Q "app\fms\d\page.tsx"
rmdir /Q "app\fms\d"

:: ── 11. setup/article-supervisor-map (duplicate of article-master) ──
echo Removing duplicate setup pages...
del /Q "app\setup\article-supervisor-map\page.tsx"
rmdir /Q "app\setup\article-supervisor-map"

:: ── 12. Commit the cleanup ───────────────────────────────────────
echo.
echo Committing cleanup to git...
git add -A
git commit -m "chore: Phase 12 cleanup - remove .trash, old PUSH scripts, stray files, legacy API routes (api/claude api/db api/keep-alive api/masters), lib/db.ts, old backups, empty dirs, data/ folder"
git push origin main

echo.
echo ============================================
echo  Cleanup complete!
echo  Live in ~60s at https://dyeflow-erp-gzeh.vercel.app
echo ============================================
pause
