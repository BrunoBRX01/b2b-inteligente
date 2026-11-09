@echo off
setlocal
cd /d "%~dp0"
title B2B Inteligente - Testes
if exist "%~dp0runtime\node.exe" (
  set "NODE_CMD=%~dp0runtime\node.exe"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo ERRO: Node.js 22.16 ou superior e necessario.
    goto :fim
  )
  set "NODE_CMD=node"
)
"%NODE_CMD%" --test
:fim
echo.
pause
