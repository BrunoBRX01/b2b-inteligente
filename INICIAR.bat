@echo off
setlocal
cd /d "%~dp0"
title B2B Inteligente - Servidor Local
call :localizar_node
if errorlevel 1 goto :fim

echo.
echo =============================================
echo   B2B INTELIGENTE - VERSAO LOCAL
 echo =============================================
echo.
echo Site: http://127.0.0.1:3000/
echo Login: http://127.0.0.1:3000/login
echo.
echo Deixe esta janela aberta enquanto usar o site.
echo Para encerrar, pressione Ctrl+C.
echo.
"%NODE_CMD%" --env-file=.env src\server.mjs
if errorlevel 1 echo ERRO: o servidor nao conseguiu iniciar.
goto :fim

:localizar_node
if exist "%~dp0runtime\node.exe" (
  set "NODE_CMD=%~dp0runtime\node.exe"
  exit /b 0
)
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado neste computador.
  echo Instale Node.js 22.16 ou superior, ou coloque node.exe em runtime\.
  exit /b 1
)
set "NODE_CMD=node"
exit /b 0

:fim
echo.
pause
