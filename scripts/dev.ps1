param([switch]$Desktop)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$portable = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools') -Directory -Filter 'node-*-win-x64' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($portable) { $env:PATH = "$($portable.FullName);$env:PATH" }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Installer Node.js 24 LTS : https://nodejs.org/' }
if ($Desktop) { npm.cmd run tauri dev } else { npm.cmd run dev }
