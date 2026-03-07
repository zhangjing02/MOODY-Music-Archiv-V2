# robust_init_v2.ps1
# Pure ASCII script logic to avoid PowerShell environment encoding issues

$rootDir = "e:\Html-work\storage\music"
$dataFile = "e:\Html-work\frontend\src\js\data.js"

# 1. Read data.js with explicit UTF8
Write-Host "Reading data source..."
$content = Get-Content $dataFile -Raw -Encoding utf8

# 2. Extract Artist Blocks
# Using a regex that doesn't stop at the first ']' in Jay Chou's case
# Each artist block is separated by { id: '...'
$artistBlocks = [regex]::Split($content, "(?=\{ id: '[a-z]\d+')")

Write-Host "Initializing directory structure..."

foreach ($block in $artistBlocks) {
    if ($block -match "name:\s*'(.*?)'") {
        $artistName = $matches[1].Trim()
        
        $artistPath = Join-Path $rootDir $artistName
        if (-not (Test-Path $artistPath)) {
            New-Item -ItemType Directory -Path $artistPath -Force | Out-Null
        }
        
        # Look for all album titles within THIS specific artist block
        # Match 'title: 'Some Album Name''
        $albumMatches = [regex]::Matches($block, "title:\s*'(.*?)'")
        
        $newCount = 0
        foreach ($aMatch in $albumMatches) {
            $albumName = $aMatch.Groups[1].Value.Trim()
            $albumPath = Join-Path $artistPath $albumName
            if (-not (Test-Path $albumPath)) {
                New-Item -ItemType Directory -Path $albumPath -Force | Out-Null
                $newCount++
            }
        }
        
        if ($newCount -gt 0) {
            Write-Host "Artist: [$artistName] -> Added $newCount albums."
        }
    }
}

Write-Host "Directory initialization finished."
