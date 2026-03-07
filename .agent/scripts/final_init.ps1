# final_init.ps1
$rootDir = "e:\Html-work\storage\music"
$dataFile = "e:\Html-work\frontend\src\js\data.js"

# 1. Clear everything
Write-Host "Wiping storage/music directory..."
if (Test-Path $rootDir) {
    Get-ChildItem $rootDir | Remove-Item -Recurse -Force
}
else {
    New-Item -ItemType Directory -Path $rootDir -Force
}

# 2. Extract and Create
Write-Host "Re-initializing from data.js (UTF8)..."
$content = Get-Content $dataFile -Raw -Encoding utf8

# Extract all artist name/albums blocks
# Each artist block starts with { id: ... and ends with albums: [ ... ] }
$artistMatches = [regex]::Matches($content, "{\s*id:[^}]+?name:\s*'(.*?)'[^}]+?albums:\s*\[(.*?)\s*\](?=\s*(},|$))", [System.Text.RegularExpressions.RegexOptions]::Singleline)

foreach ($match in $artistMatches) {
    $artistName = $match.Groups[1].Value.Trim()
    $albumsPart = $match.Groups[2].Value
    
    $artistPath = Join-Path $rootDir $artistName
    if (-not (Test-Path $artistPath)) {
        New-Item -ItemType Directory -Path $artistPath -Force | Out-Null
        Write-Host "Created Artist: $artistName"
    }
    
    # Extract albums within this artist
    $albumMatches = [regex]::Matches($albumsPart, "title:\s*'(.*?)'")
    foreach ($aMatch in $albumMatches) {
        $albumName = $aMatch.Groups[1].Value.Trim()
        $albumPath = Join-Path $artistPath $albumName
        if (-not (Test-Path $albumPath)) {
            New-Item -ItemType Directory -Path $albumPath -Force | Out-Null
        }
    }
}

Write-Host "All directories initialized correctly."
