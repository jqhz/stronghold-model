$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$baseUrl = "https://raw.githubusercontent.com/dev-boyenn/zero-tracker/main/tools/stronghold_cracker/lib"
$jars = @(
    "FeatureUtils-1.0.0.jar",
    "MathUtils-5531c4a87b0f1bb85d1dab2bdd18ce375400626a.jar",
    "SeedUtils-b6a383113ce5d8d09a59e91b28ff064fb97c0709.jar",
    "biomeutils-1.0.0.jar",
    "mcutils-1.0.0.jar",
    "noiseutils-1.0.0.jar",
    "terrainutils-1.0.0.jar"
)

New-Item -ItemType Directory -Force -Path "lib" | Out-Null

foreach ($jar in $jars) {
    $dest = Join-Path "lib" $jar
    if (Test-Path $dest) {
        Write-Host "[SKIP] $jar"
        continue
    }
    Write-Host "[GET]  $jar"
    Invoke-WebRequest -Uri "$baseUrl/$jar" -OutFile $dest
}

Write-Host "[OK] Lib jars ready in tools/stronghold_generator/lib"
