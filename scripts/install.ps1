param([switch]$BuildOnly, [switch]$Rebuild)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$installerPath = Join-Path $projectRoot 'release\WeatherGlass-Setup.exe'

try {
    if ($Rebuild -or -not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
        $portable = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools') -Directory -Filter 'node-*-win-x64' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($portable) { $env:PATH = "$($portable.FullName);$env:PATH" }
        $cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
        if (Test-Path -LiteralPath (Join-Path $cargoBin 'cargo.exe')) { $env:PATH = "$cargoBin;$env:PATH" }
        if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
            throw 'Node.js est requis pour compiler. Utiliser le fichier WeatherGlass-Setup.exe deja fourni, ou installer Node.js 24 LTS.'
        }
        if (-not (Get-Command cargo.exe -ErrorAction SilentlyContinue)) {
            throw 'Rust est requis pour compiler. Utiliser le fichier WeatherGlass-Setup.exe deja fourni, ou installer Rust stable MSVC et les outils C++ Visual Studio.'
        }

        Write-Host 'Installation des dependances du projet...'
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Echec de npm ci.' }

        Write-Host 'Compilation de WeatherGlass et creation de l''installateur. La premiere compilation peut prendre plusieurs minutes...'
        & npm.cmd run tauri build -- --bundles nsis
        if ($LASTEXITCODE -ne 0) { throw 'Echec de la compilation. Verifier les erreurs ci-dessus et les prerequis du README.' }

        $bundleDir = Join-Path $projectRoot 'src-tauri\target\release\bundle\nsis'
        $bundle = Get-ChildItem -LiteralPath $bundleDir -Filter '*-setup.exe' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $bundle) { throw 'La compilation ne contient aucun installateur NSIS.' }
        New-Item -ItemType Directory -Path (Split-Path -Parent $installerPath) -Force | Out-Null
        Copy-Item -LiteralPath $bundle.FullName -Destination $installerPath -Force
    }

    Write-Host "Installateur disponible : $installerPath"
    if (-not $BuildOnly) {
        $installation = Start-Process -FilePath $installerPath -PassThru -Wait
        if ($installation.ExitCode -ne 0) { throw "L'assistant d'installation s'est termine avec le code $($installation.ExitCode)." }
    }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
