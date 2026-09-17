param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$project = Join-Path $projectRoot "src\PunisherWatchlist\PunisherWatchlist.csproj"
$solution = Join-Path $projectRoot "PunisherWatchlist.slnx"
[xml]$projectXml = Get-Content -LiteralPath $project
$version = [string]$projectXml.Project.PropertyGroup.Version
$artifactRoot = Join-Path $projectRoot "artifacts"
$packageFolder = Join-Path $artifactRoot "PunisherWatchlist_$version"
$packageFile = Join-Path $artifactRoot "PunisherWatchlist_$version.zip"
$output = Join-Path $projectRoot "src\PunisherWatchlist\bin\$Configuration\net10.0"

function Assert-ProjectChild([string]$Path) {
    $resolved = [System.IO.Path]::GetFullPath($Path)
    $prefix = $projectRoot.TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe path outside project: $resolved"
    }
}

Assert-ProjectChild $artifactRoot
Assert-ProjectChild $packageFolder
Assert-ProjectChild $packageFile

if (-not $SkipTests) {
    node (Join-Path $projectRoot "scripts\validate-web.js")
    if ($LASTEXITCODE -ne 0) { throw "Web validation failed." }
    dotnet test $solution --configuration $Configuration --disable-build-servers -m:1 --blame-hang-timeout 60s
    if ($LASTEXITCODE -ne 0) { throw "Tests failed." }
}

dotnet build $project --configuration $Configuration --no-restore
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
if (Test-Path -LiteralPath $packageFolder) { Remove-Item -LiteralPath $packageFolder -Recurse -Force }
if (Test-Path -LiteralPath $packageFile) { Remove-Item -LiteralPath $packageFile -Force }
New-Item -ItemType Directory -Path $packageFolder | Out-Null
Copy-Item -LiteralPath (Join-Path $output "Jellyfin.Plugin.PunisherWatchlist.dll") -Destination $packageFolder
Copy-Item -LiteralPath (Join-Path $projectRoot "LICENSE") -Destination $packageFolder
Compress-Archive -Path (Join-Path $packageFolder "*") -DestinationPath $packageFile -CompressionLevel Optimal

$md5 = (Get-FileHash -LiteralPath $packageFile -Algorithm MD5).Hash.ToLowerInvariant()
Write-Host "Package: $packageFile"
Write-Host "MD5:     $md5"
