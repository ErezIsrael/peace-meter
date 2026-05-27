@echo off
REM auto-deploy.bat — Hourly: run AI analysis + deploy to Cloudflare Pages
REM
REM Usage: auto-deploy.bat
REM   Runs --fast mode, then deploys to Cloudflare via wrangler.
REM
REM For Windows Task Scheduler:
REM   1. Open Task Scheduler -> Create Task
REM   2. Trigger: "Repetition interval: 1 hour" (start at 00:00)
REM   3. Action: Start a program
REM        Program: %SystemRoot%\System32\cmd.exe
REM        Arguments: /c "C:\Users\Erez\.pi\agent\projects\peace-meter\peace-paths\auto-deploy.bat"
REM        Start in: C:\Users\Erez\.pi\agent\projects\peace-meter\peace-paths
REM
REM   Or use the provided schedule.xml to import the task directly:
REM       schtasks /create /xml schedule.xml /tn "PeaceRoom-AutoDeploy"

REM Change to script directory
cd /d "%~dp0"

REM Log file in peace-paths directory
set LOGFILE="%~dp0deploy-log.txt"

echo [%date% %time%] === Peace Room Auto-Deploy (fast) === >> %LOGFILE%

REM Run analysis + deploy
python ai-analyze-prod.py --fast --deploy >> %LOGFILE% 2>&1

set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% EQU 0 (
    echo [%date% %time%] SUCCESS >> %LOGFILE%
) else (
    echo [%date% %time%] FAILED (exit code: %EXIT_CODE%) >> %LOGFILE%
)

echo [%date% %time%] === Done === >> %LOGFILE%
echo. >> %LOGFILE%

exit /b %EXIT_CODE%
