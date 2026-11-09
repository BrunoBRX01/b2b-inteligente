@echo off
setlocal
cd /d "%~dp0"
title B2B Inteligente - Redefinir senha
call :localizar_node
if errorlevel 1 goto :fim
echo.
echo Redefine a senha de uma conta que ja existe no banco.
echo A senha nao aparece na tela enquanto voce digita.
echo.
"%NODE_CMD%" --env-file=.env scripts\redefinir-senha.mjs
if errorlevel 1 echo Nao foi possivel redefinir a senha.
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
