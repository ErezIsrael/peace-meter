@echo off
REM install-scheduler.bat — Create Windows Task Scheduler entry for hourly Peace Room deploy
REM Run this once to install the scheduled task.

cd /d "%~dp0"

echo Installing PeaceRoom-AutoDeploy task...

schtasks /create /xml "%~dp0schedule.xml" /tn "PeaceRoom-AutoDeploy"

if %ERRORLEVEL% EQU 0 (
    echo SUCCESS — Task created. Runs every hour.
    echo To verify: schtasks /query /tn PeaceRoom-AutoDeploy
) else (
    echo FAILED — check error above.
    echo You can also install manually:
    echo   1. Open Task Scheduler (taskschd.msc)
    echo   2. Actions ^> Import Schedule...
    echo   3. Select schedule.xml from this folder
)

pause
