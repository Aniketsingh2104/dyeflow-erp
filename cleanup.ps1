# DyeFlow root cleanup — moves all build-log files to .trash
# Run this from C:\dyeflow-react with: powershell -ExecutionPolicy Bypass -File cleanup.ps1

$root = "C:\dyeflow-react"
$trash = "C:\dyeflow-react\.trash"

# Files to KEEP (never touch these)
$keep = @(
    "README.md", "CLAUDE.md", "AGENTS.md",
    "package.json", "package-lock.json",
    "next.config.ts", "tsconfig.json",
    "postcss.config.mjs", "eslint.config.mjs",
    "next-env.d.ts", ".gitignore",
    "cleanup.ps1"
)

# Extensions to clean from root level only
$targetExts = @(".md", ".js", ".txt", ".sh", ".ps1", ".tsx")

$moved = 0
$skipped = 0

Get-ChildItem -Path $root -File | ForEach-Object {
    $file = $_
    $name = $file.Name
    $ext  = $file.Extension.ToLower()

    if ($keep -contains $name) {
        $skipped++
        return
    }

    if ($targetExts -contains $ext) {
        $dest = Join-Path $trash $name
        Move-Item -Path $file.FullName -Destination $dest -Force
        Write-Host "  Moved: $name"
        $moved++
    }
}

Write-Host ""
Write-Host "Done. Moved $moved files to .trash. Skipped $skipped protected files."
Write-Host "To permanently delete: Remove-Item '$trash' -Recurse -Force"
Write-Host "To undo: move files back from .trash to root"
