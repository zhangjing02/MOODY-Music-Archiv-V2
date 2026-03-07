# fix_and_cleanup_dirs.ps1
# 1. 修复编码读取并重新创建目录
# 2. 清理乱码目录

$rootDir = "e:\Html-work\storage\music"
$dataFile = "e:\Html-work\frontend\src\js\data.js"

# --- 第一步：显式使用 UTF8 重新创建 ---
$content = Get-Content $dataFile -Raw -Encoding utf8
$artistMatches = [regex]::Matches($content, "{\s*id:.*?, name: '(.*?)'.*?albums: \[(.*?)\]\s*}", [System.Text.RegularExpressions.RegexOptions]::Singleline)

$createdArtists = New-Object System.Collections.Generic.HashSet[string]

Write-Host "正在以 UTF-8 编码重新初始化目录..." -ForegroundColor Cyan

foreach ($match in $artistMatches) {
    $artistName = $match.Groups[1].Value.Trim()
    $albumsPart = $match.Groups[2].Value
    $albumTitles = [regex]::Matches($albumsPart, "title: '(.*?)'") | ForEach-Object { $_.Groups[1].Value.Trim() }
    
    $artistPath = Join-Path $rootDir $artistName
    if (-not (Test-Path $artistPath)) {
        New-Item -ItemType Directory -Path $artistPath -Force | Out-Null
        Write-Host "新建/修正歌手目录: $artistName" -ForegroundColor Green
    }
    $createdArtists.Add($artistName) | Out-Null

    foreach ($title in $albumTitles) {
        $albumPath = Join-Path $artistPath $title
        if (-not (Test-Path $albumPath)) {
            New-Item -ItemType Directory -Path $albumPath -Force | Out-Null
        }
    }
}

# --- 第二步：清理乱码目录 ---
# 乱码通常包含大量的 'å', 'æ', 'ç' 等字符
Write-Host "`n正在检查并清理乱码文件夹..." -ForegroundColor Yellow
$dirs = Get-ChildItem $rootDir -Directory

foreach ($dir in $dirs) {
    # 如果文件夹名字不在我们的合法艺人名单中，且包含典型的 UTF-8 到 ANSI 的乱码特征字符
    if (-not $createdArtists.Contains($dir.Name)) {
        # 简单启发式：检查是否包含 'å' 'æ' 'ç' 'ë' 等常见乱码字符
        if ($dir.Name -match '[åæçëìòûýþ]') {
            Write-Host "发现乱码目录，正在移除: $($dir.Name)" -ForegroundColor Red
            Remove-Item -Path $dir.FullName -Recurse -Force
        }
    }
}

Write-Host "`n修复与清理完成！" -ForegroundColor Cyan
