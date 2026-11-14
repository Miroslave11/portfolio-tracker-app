@echo off
rem Spusti Portfolio Tracker ve vyvojovem rezimu (okno aplikace se otevre samo).
rem Pri prvnim spusteni (nebo kdyz chybi slozka node_modules) nejdriv nainstaluje zavislosti.
chcp 65001 >nul
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js / npm nebyl nalezen. Nainstalujte Node.js z https://nodejs.org a zkuste to znovu.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instaluji zavislosti, chvili to potrva...
  call npm install
  if errorlevel 1 (
    echo Instalace zavislosti selhala.
    pause
    exit /b 1
  )
)

echo Spoustim Portfolio Tracker...
call npm run dev
if errorlevel 1 (
  echo.
  echo Aplikace skoncila chybou.
  pause
)
