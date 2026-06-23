# Novel Writer V3 Startup Launcher

Write-Host "==================================================" -ForegroundColor Green
Write-Host "      NOVEL WRITER V3 - LAUNCHER SERVICE" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""

# Start Backend FastAPI Server
Write-Host "[1/2] Starting Python FastAPI Backend on Port 8000..." -ForegroundColor Cyan
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "cd backend && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

# Start Frontend Next.js Dev Server
Write-Host "[2/2] Starting Next.js Dev Server on Port 3000..." -ForegroundColor Cyan
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "cd frontend && npm run dev"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  Launch Sequence Complete! Services are booting:" -ForegroundColor Green
Write-Host "  -> Backend API Portal: http://localhost:8000" -ForegroundColor Green
Write-Host "  -> Backend Swagger API docs: http://localhost:8000/docs" -ForegroundColor Green
Write-Host "  -> Frontend workspace UI: http://localhost:3000" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Keep the spawned window terminals open to maintain servers." -ForegroundColor Yellow
