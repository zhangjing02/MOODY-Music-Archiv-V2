
$artistName = "陈小春"
$dbPath = "storage/db/moody.db"

function Write-Log($msg) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $msg"
}

Write-Log "🔍 正在搜索歌手 ID..."
$searchUrl = "https://itunes.apple.com/search?term=陈小春&entity=musicArtist&limit=1&country=cn"
$artistResult = Invoke-RestMethod -Uri $searchUrl
if (-not $artistResult.results) {
    Write-Error "找不到歌手 陈小春"
    exit
}

$artistId = $artistResult.results[0].artistId
$category = $artistResult.results[0].primaryGenreName
Write-Log "✅ 找到歌手: 陈小春 (ID: $artistId, 类别: $category)"

Write-Log "⏳ 正在拉取所有专辑和曲目..."
$lookupUrl = "https://itunes.apple.com/lookup?id=$artistId&entity=album&limit=200&country=cn"
$albumsResult = Invoke-RestMethod -Uri $lookupUrl
$albums = $albumsResult.results | Where-Object { $_.wrapperType -eq "collection" }

Write-Log "💿 找到 $($albums.Count) 张专辑，准备开始生成 SQL..."

$sqlFile = "sync_data.sql"
"BEGIN TRANSACTION;" | Out-File -FilePath $sqlFile -Encoding utf8

# Insert Artist
$sqlArtist = "INSERT OR IGNORE INTO artists (name, region) VALUES ('陈小春', '$category');"
$sqlArtist | Out-File -Append -FilePath $sqlFile -Encoding utf8

foreach ($album in $albums) {
    $albumTitle = $album.collectionName.Replace("'", "''")
    $albumYear = $album.releaseDate.Substring(0, 4)
    $coverUrl = $album.artworkUrl100
    
    $sqlAlbum = "INSERT OR IGNORE INTO albums (artist_id, title, release_date, genre, cover_url) VALUES ((SELECT id FROM artists WHERE name = '陈小春'), '$albumTitle', '$albumYear', '$category', '$coverUrl');"
    $sqlAlbum | Out-File -Append -FilePath $sqlFile -Encoding utf8
    
    # Lookup songs for this album
    $collectionId = $album.collectionId
    $songUrl = "https://itunes.apple.com/lookup?id=$collectionId&entity=song&limit=200&country=cn"
    $songsResult = Invoke-RestMethod -Uri $songUrl
    $songs = $songsResult.results | Where-Object { $_.wrapperType -eq "track" }
    
    foreach ($song in $songs) {
        $songTitle = $song.trackName.Replace("'", "''")
        $trackNum = $song.trackNumber
        $sqlSong = "INSERT OR IGNORE INTO songs (artist_id, album_id, title, track_index) VALUES ((SELECT id FROM artists WHERE name = '陈小春'), (SELECT id FROM albums WHERE artist_id = (SELECT id FROM artists WHERE name = '陈小春') AND title = '$albumTitle'), '$songTitle', $trackNum);"
        $sqlSong | Out-File -Append -FilePath $sqlFile -Encoding utf8
    }
}

"COMMIT;" | Out-File -Append -FilePath $sqlFile -Encoding utf8
Write-Log "🚀 SQL 生成完毕: $sqlFile"

Write-Log "🛠 正在执行 SQL 导入数据库..."
sqlite3 $dbPath ".read $sqlFile"
Write-Log "✨ 同步任务圆满完成！"
