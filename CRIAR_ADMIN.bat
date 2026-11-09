@echo off
setlocal
cd /d "%~dp0"
title B2B Inteligente - Primeiro Administrador
call :localizar_node
if errorlevel 1 goto :fim
echo.
echo Crie o primeiro administrador antes de acessar /login.
echo A senha deve ter pelo menos 14 caracteres.
echo Nao existe senha padrao neste projeto.
echo.
"%NODE_CMD%" --env-file=.env scripts\create-admin.mjs
if errorlevel 1 echo Nao foi possivel criar o administrador.
goto :fim

:localizar_node
if exist "%~dp0runtime\node.exe" (
  set "NODE_CMD=%~dp0runtime\node.exe"
  exit /b 0
)
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado. Instale Node.js 22.16 ou superior.
  exit /b 1
)
set "NODE_CMD=node"
exit /b 0

:fim
echo.
pause
