@echo off
setlocal
cd /d "%~dp0.."
set "SRC=%CD%\plugins\pepega-stashui"
if not exist "%SRC%\pepega-stashui.yml" (
  echo Source not found: %SRC%
  exit /b 1
)
rem NAS Docker (Synology): Y:\stash\config  —  local-only copy: E:\Stash
if "%STASH_DIR%"=="" set "STASH_DIR=Y:\stash\config"
set "DST=%STASH_DIR%\plugins\pepega-stashui"
echo Copy Pepega Stash UI to: %DST%
echo Run this on the PC where Stash is running ^(not necessarily your dev PC^).
robocopy "%SRC%" "%DST%" /MIR /NFL /NDL /NJH /NJS /nc /ns /np
if errorlevel 8 exit /b 1
echo Done. Restart Stash or run reloadPlugins, then Ctrl+F5 in the browser.
exit /b 0
