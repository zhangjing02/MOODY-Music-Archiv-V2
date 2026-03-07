# thorough_cleanup_v3.ps1
# Use pure ASCII for the script logic to avoid PowerShell encoding interpretation issues

$rootDir = "e:\Html-work\storage\music"
$dataFile = "e:\Html-work\frontend\src\js\data.js"

# 1. Load valid artist names dynamically (using explicit UTF8)
Write-Host "Loading valid artist list from data.js..."
$content = Get-Content $dataFile -Raw -Encoding utf8
$artistMatches = [regex]::Matches($content, "{\s*id:.*?, name: '(.*?)'.*?albums:")
$validArtists = New-Object System.Collections.Generic.HashSet[string]
foreach ($match in $artistMatches) {
    $validArtists.Add($match.Groups[1].Value.Trim()) | Out-Null
}

# Add standard exceptions
$validArtists.Add("Beyond") | Out-Null
$validArtists.Add("Beyond 精选") | Out-Null
$validArtists.Add("SHE") | Out-Null
$validArtists.Add("S.H.E") | Out-Null

Write-Host "Starting thorough cleanup of invalid directories..."

$dirs = Get-ChildItem $rootDir -Directory
foreach ($dir in $dirs) {
    $name = $dir.Name
    # If directory name NOT in valid list
    if (-not $validArtists.Contains($name)) {
        # Check if the name looks like Mojibake (contains non-ASCII characters)
        if ($name -match '[^\x00-\x7F]') {
            Write-Host "Removing garbled directory: $name"
            Remove-Item -Path $dir.FullName -Recurse -Force
        }
    }
}

Write-Host "Cleanup finished."
