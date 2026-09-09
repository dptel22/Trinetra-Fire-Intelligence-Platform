param(
    [ValidateSet('demo', 'live')]
    [string]$Mode = 'demo',
    [switch]$SkipInstall,
    [switch]$RunIngestion
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo

function Require-Command($Name, $Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing '$Name'. $Hint"
    }
}

Require-Command python 'Install Python 3.12 and put it on PATH.'
Require-Command node 'Install Node.js 18+ and put it on PATH.'
Require-Command npm 'Install Node.js/npm and put it on PATH.'

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Host 'Created .env from .env.example. Add secrets before live ingestion.'
}

if (-not $SkipInstall) {
    if (-not (Test-Path '.venv')) { python -m venv .venv }
    & '.\.venv\Scripts\python.exe' -m pip install -r requirements.txt
    Push-Location frontend
    npm ci
    Pop-Location
}

$bundle = 'models/PS26162_catboost_final/inference_bundle'
foreach ($file in @('catboost_hotspot_classifier.cbm','calibrators.joblib','feature_schema.json','review_thresholds.json','runtime_versions.json')) {
    if (-not (Test-Path (Join-Path $bundle $file))) { throw "Missing model artifact: $(Join-Path $bundle $file)" }
}

$daily = 'data/processed/sih2026_h3_daily_features_firms.parquet'
$static = 'data/processed/sih2026_h3_daily_features_with_osm_wri.parquet'
if (-not (Test-Path $daily) -or -not (Test-Path $static)) {
    if ($Mode -eq 'demo') {
        Write-Warning 'Serving parquets are missing. UI mock mode is available, but real backend predictions require both files.'
    } else {
        if (-not (Get-ChildItem 'data/raw' -Filter '*.osm.pbf' -File -ErrorAction SilentlyContinue)) { throw 'Live mode requires an India .osm.pbf under data/raw/.' }
        if (-not (Test-Path 'data/raw/globalpowerplantdatabasev130/global_power_plant_database.csv')) { throw 'Live mode requires the WRI CSV under data/raw/globalpowerplantdatabasev130/.' }
        foreach ($ext in @('shp','shx','dbf','prj')) {
            if (-not (Test-Path "data/raw/india_state_boundary/India_State_Boundary.$ext")) { throw "Live mode requires India_State_Boundary.$ext under data/raw/india_state_boundary/." }
        }
        $key = $env:FIRMS_MAP_KEY
        if (-not $key -and (Test-Path '.env')) {
            $key = ((Get-Content '.env' | Where-Object { $_ -match '^FIRMS_MAP_KEY=' }) -replace '^FIRMS_MAP_KEY=', '')
        }
        if (-not $key) { throw 'Live mode requires FIRMS_MAP_KEY in the environment or .env.' }
        if (-not $RunIngestion) { throw 'Live artifacts are missing. Place OSM/WRI/boundary inputs under data/raw and rerun with -RunIngestion.' }
        $env:FIRMS_MAP_KEY = $key
        & '.\.venv\Scripts\python.exe' -m ingestion.run_ingestion
    }
}

Write-Host "Setup checks completed for $Mode mode. Run .\scripts\verify.ps1, then start services as documented in docs/PROJECT_SETUP.md."
