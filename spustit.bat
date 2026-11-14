@echo off
rem Spusti Portfolio Tracker ve vyvojovem rezimu (okno aplikace se otevre samo).
rem Pri prvnim spusteni (nebo kdyz chybi slozka node_modules) nejdriv nainstaluje zavislosti.
rem Vyvoj ma VLASTNI data ve slozce vyvoj-data (v .gitignore), takze nesahne na data
rem nainstalovane aplikace v %APPDATA%\portfolio-tracker. Po prvnim spusteni si tam naimportujte
rem ukazkovy export z examples\ukazka-portfolio-performance.json nebo vlastni data.
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

set "PT_DATA_DIR=%~dp0vyvoj-data"
echo Spoustim Portfolio Tracker (vyvojova data: %PT_DATA_DIR%)...
call npm run dev
if errorlevel 1 (
  echo.
  echo Aplikace skoncila chybou.
  pause
)
