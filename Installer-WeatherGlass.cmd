@echo off
setlocal
title Installation de WeatherGlass
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" %*
set "installResult=%errorlevel%"
if not "%installResult%"=="0" (
  echo.
  echo L'installation n'a pas pu se terminer. Voir le message ci-dessus.
  pause
)
exit /b %installResult%
