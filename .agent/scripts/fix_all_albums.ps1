# fix_all_albums_v2.ps1
$rootDir = "e:\Html-work\storage\music"
$dataFile = "e:\Html-work\frontend\src\js\data.js"

Write-Host "Wiping storage..."
if (Test-Path $rootDir) {
    Remove-Item (Join-Path $rootDir "*") -Recurse -Force
}

Write-Host "Reading data source..."
$content = Get-Content $dataFile -Raw -Encoding utf8

# Flexible split: Look for 'id:' regardless of position relative to '{'
$artists = [regex]::Split($content, "(?=id:\s*'[a-z][0-9]+(_[0-9]+)?')")

foreach ($art in $artists) {
    if ($art -match "name:\s*'(.*?)'") {
        $name = $matches[1].Trim()
        
        # Protective mapping for names with special characters like '阿妹 (张惠妹)'
        # Remove parentheses for safer directory names? 
        # Actually user wants "名录一致", so keep it if possible, but Windows allows it.
        
        $artPath = Join-Path $rootDir $name
        if (-not (Test-Path $artPath)) {
            New-Item -ItemType Directory -Path $artPath -Force | Out-Null
        }
        
        # Extract ALL album titles in this block
        $albumMatches = [regex]::Matches($art, "title:\s*'(.*?)'")
        $albCount = 0
        foreach ($m in $albumMatches) {
            $albName = $m.Groups[1].Value.Trim()
            $albPath = Join-Path $artPath $albName
            if (-not (Test-Path $albPath)) {
                New-Item -ItemType Directory -Path $albPath -Force | Out-Null
                $albCount++
            }
        }
        if ($albCount -gt 0) {
            Write-Host "Processed: [$name] with $albCount albums."
        }
    }
}

Write-Host "Full directory initialization finished."
