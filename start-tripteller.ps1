# --- TripTeller indító script (Windows PowerShell) ---
# Feltételezés: a repo szerkezete:
# C:\Projects\tripteller\
#   apps\
#     cms\   -> Strapi
#     app\   -> Vite (frontend)
# PNPM telepítve, a projekthez már futott a pnpm install.

$ErrorActionPreference = "Stop"

# --- Beállítások ---
$ROOT = "C:\Projects\tripteller"
$CMS  = Join-Path $ROOT "apps\cms"
$APP  = Join-Path $ROOT "apps\app"

$STRAPI_PORT = 1337
$VITE_PORT   = 5174

function Test-PortInUse([int]$Port) {
  try {
    $inUse = (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop) -ne $null
    return $inUse
  } catch {
    return $false
  }
}

function Start-IfNotRunning {
  param(
    [string]$Name,
    [int]$Port,
    [string]$WorkingDir,
    [string]$CommandLine
  )

  if (Test-PortInUse $Port) {
    Write-Host "✅ $Name már fut a $Port porton — nem indítom újra." -ForegroundColor Green
  } else {
    Write-Host "▶️  $Name indítása ($WorkingDir)... " -ForegroundColor Cyan
    # Külön PowerShell ablak NoExit-tel, hogy lásd a logokat
    Start-Process powershell `
      -ArgumentList "-NoExit", "-Command", "Set-Location `"$WorkingDir`"; $CommandLine" `
      -WindowStyle Normal
  }
}

# --- Indítások ---
# Strapi (pnpm run develop)
Start-IfNotRunning -Name "Strapi" -Port $STRAPI_PORT -WorkingDir $CMS -CommandLine "pnpm run develop"

# TripTeller/Vite (pnpm run dev -- --port 5174)
Start-IfNotRunning -Name "TripTeller (Vite)" -Port $VITE_PORT -WorkingDir $APP -CommandLine "pnpm run dev -- --port $VITE_PORT"

Write-Host ""
Write-Host "Nyisd meg a böngészőben:" -ForegroundColor Yellow
Write-Host "  • Strapi admin  → http://localhost:$STRAPI_PORT/admin"
Write-Host "  • API (POI-k)   → http://localhost:$STRAPI_PORT/api/pois"
Write-Host "  • TripTeller    → http://localhost:$VITE_PORT" -ForegroundColor Yellow
