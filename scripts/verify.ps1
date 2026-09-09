param([string]$BackendUrl = 'http://localhost:8000')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo

function Check($Label, [scriptblock]$Action) {
    try { & $Action; Write-Host "PASS $Label" -ForegroundColor Green }
    catch { Write-Error "FAIL ${Label}: $($_.Exception.Message)" }
}

Check 'model bundle' {
    foreach ($f in @('catboost_hotspot_classifier.cbm','calibrators.joblib','feature_schema.json','review_thresholds.json','runtime_versions.json')) {
        if (-not (Test-Path "models/PS26162_catboost_final/inference_bundle/$f")) { throw "missing $f" }
    }
}
Check 'serving parquets' {
    foreach ($f in @('data/processed/sih2026_h3_daily_features_firms.parquet','data/processed/sih2026_h3_daily_features_with_osm_wri.parquet')) {
        if (-not (Test-Path $f)) { throw "missing $f" }
    }
}
Check 'backend health' {
    $health = Invoke-RestMethod "$BackendUrl/api/v1/health"
    if (-not $health.model_loaded) { throw 'model_loaded is false' }
    $health | ConvertTo-Json -Depth 5
}
Check 'latest-date prediction smoke' {
    $health = Invoke-RestMethod "$BackendUrl/api/v1/health"
    if (-not $health.latest_acq_date) { throw 'latest_acq_date is null' }
    $uri = "$BackendUrl/api/v1/predictions?min_lat=6.75&max_lat=37.1&min_lon=68.03&max_lon=97.42&acq_date=$($health.latest_acq_date)&zoom=5"
    $result = Invoke-RestMethod $uri
    if ($null -eq $result.predictions) { throw 'predictions field missing' }
    "date=$($health.latest_acq_date) total=$($result.total_predictions)"
}
Write-Host 'Verification completed.' -ForegroundColor Cyan
