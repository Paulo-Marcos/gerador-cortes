# CortadorLive - Script de Verificacao de Ambiente
# Execute: .\check-env.ps1

Write-Host ""
Write-Host "=== CortadorLive - Verificacao de Ambiente ===" -ForegroundColor Cyan
Write-Host ""

$ok = $true

# Docker
try {
    $dockerVersion = (docker --version 2>&1)
    Write-Host "[OK] Docker: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERRO] Docker nao encontrado - instale o Docker Desktop" -ForegroundColor Red
    $ok = $false
}

# n8n
try {
    $null = Invoke-WebRequest -Uri "http://localhost:5678/healthz" -TimeoutSec 3 -ErrorAction Stop -UseBasicParsing
    Write-Host "[OK] n8n rodando em http://localhost:5678" -ForegroundColor Green
} catch {
    Write-Host "[AVISO] n8n nao responde - rode: docker compose up -d" -ForegroundColor Yellow
    $ok = $false
}

# Backend
try {
    $null = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -TimeoutSec 3 -ErrorAction Stop -UseBasicParsing
    Write-Host "[OK] Backend rodando em http://localhost:8000" -ForegroundColor Green
} catch {
    Write-Host "[AVISO] Backend nao responde - verifique: docker compose logs backend" -ForegroundColor Yellow
    $ok = $false
}

# Frontend
try {
    $null = Invoke-WebRequest -Uri "http://localhost:4200" -TimeoutSec 3 -ErrorAction Stop -UseBasicParsing
    Write-Host "[OK] Frontend rodando em http://localhost:4200" -ForegroundColor Green
} catch {
    Write-Host "[AVISO] Frontend nao responde - rode: cd frontend && npm start" -ForegroundColor Yellow
}

# .env
$envPath = Join-Path $PSScriptRoot "backend\.env"
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    if ($envContent -match "GEMINI_API_KEY=\S+") {
        Write-Host "[OK] .env: GEMINI_API_KEY configurada" -ForegroundColor Green
    } else {
        Write-Host "[AVISO] .env: GEMINI_API_KEY vazia - thumbnails nao funcionarao" -ForegroundColor Yellow
    }
} else {
    Write-Host "[ERRO] .env nao encontrado em backend/.env" -ForegroundColor Red
    $ok = $false
}

# yt-dlp (opcional - pode estar so dentro do Docker)
try {
    $ytdlpVer = (yt-dlp --version 2>&1)
    Write-Host "[OK] yt-dlp: v$ytdlpVer" -ForegroundColor Green
} catch {
    Write-Host "[INFO] yt-dlp nao esta no PATH local - sera usado dentro do container Docker" -ForegroundColor Gray
}

Write-Host ""
if ($ok) {
    Write-Host ">> AMBIENTE OK! Acesse http://localhost:4200 para comecar." -ForegroundColor Green
} else {
    Write-Host ">> Alguns servicos precisam ser iniciados. Siga o README.md." -ForegroundColor Yellow
}
Write-Host ""
