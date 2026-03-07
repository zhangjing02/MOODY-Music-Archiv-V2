# init_music_dirs.ps1
# 功能：从 data.js 解析歌手和专辑，在 storage/music 下创建对应目录

$rootDir = "e:\Html-work\storage\music"
$dataFile = "e:\Html-work\frontend\src\js\data.js"

if (-not (Test-Path $dataFile)) {
    Write-Error "找不到 data.js 文件：$dataFile"
    exit
}

# 简单正则解析，提取所有的歌手名和其专辑名
# 匹配模式：name: '歌手名' ... albums: [{ title: '专辑1' }, { title: '专辑2' }]
$content = Get-Content $dataFile -Raw

# 提取艺人块
$artistMatches = [regex]::Matches($content, "{\s*id:.*?, name: '(.*?)'.*?albums: \[(.*?)\]\s*}", [System.Text.RegularExpressions.RegexOptions]::Singleline)

Write-Host "开始初始化目录结构..." -ForegroundColor Cyan

foreach ($match in $artistMatches) {
    $artistName = $match.Groups[1].Value.Trim()
    $albumsPart = $match.Groups[2].Value
    
    # 提取该艺人的所有专辑标题
    $albumTitles = [regex]::Matches($albumsPart, "title: '(.*?)'") | ForEach-Object { $_.Groups[1].Value.Trim() }
    
    # 创建歌手目录
    $artistPath = Join-Path $rootDir $artistName
    if (-not (Test-Path $artistPath)) {
        New-Item -ItemType Directory -Path $artistPath -Force | Out-Null
        Write-Host "新建歌手目录: $artistName" -ForegroundColor Green
    }

    foreach ($title in $albumTitles) {
        # 我们发现有的专辑带有年份，如 "2000_Jay"，但这在 data.js 里只有 "Jay"
        # 为了兼容扫描器的惯例 (Music/Artist/Album/Song.mp3)
        # 如果 data.js 里的专辑名和实际想放的有点出入，建议用户手动微调。
        # 这里我们按 data.js 的名子创建。
        $albumPath = Join-Path $artistPath $title
        if (-not (Test-Path $albumPath)) {
            New-Item -ItemType Directory -Path $albumPath -Force | Out-Null
            Write-Host "  └─ 新建专辑目录: $title" -ForegroundColor Gray
        }
    }
}

Write-Host "目录初始化完成！" -ForegroundColor Cyan
