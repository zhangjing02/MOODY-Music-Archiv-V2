package service

import (
	"log"

	"moody-backend/internal/database"
)

// CleanAll 执行全套数据库大扫除（污染清理 + 去重 + 孤儿删除 + 压缩）
func CleanAll() {
	CleanCorruptedLrcPaths("")
	DeduplicateArtists()
	DeduplicateAlbums()
	CleanOrphans()
	VacuumDB()
}

// CleanCorruptedLrcPaths 清理被 .mp3/.flac/.wav 路径污染的 lrc_path 字段
// scope 为可选的歌手名过滤（空字符串表示全局）
func CleanCorruptedLrcPaths(scope string) int64 {
	log.Println("🧹 [Clean] 排查并清理被污染的 lrc_path...")

	var res interface{ RowsAffected() (int64, error) }
	var err error

	if scope != "" {
		// 按歌手/专辑路径过滤：lrc_path 中包含 scope 的才清理
		res, err = database.DB.Exec(`
			UPDATE songs SET lrc_path = NULL
			WHERE (lrc_path LIKE '%.mp3' OR lrc_path LIKE '%.flac' OR lrc_path LIKE '%.wav')
			  AND id IN (
				SELECT s.id FROM songs s
				JOIN albums a ON s.album_id = a.id
				JOIN artists ar ON a.artist_id = ar.id
				WHERE ar.name LIKE ? OR a.title LIKE ?
			  )
		`, "%"+scope+"%", "%"+scope+"%")
	} else {
		res, err = database.DB.Exec(`
			UPDATE songs SET lrc_path = NULL
			WHERE lrc_path LIKE '%.mp3' OR lrc_path LIKE '%.flac' OR lrc_path LIKE '%.wav'
		`)
	}

	if err != nil {
		log.Printf("❌ 清理污染 lrc_path 失败: %v", err)
		return 0
	}
	affected, _ := res.RowsAffected()
	if affected > 0 {
		log.Printf("🗑️  清理了 %d 条被错误指派为音频文件的 [污染 lrc_path]", affected)
	}
	return affected
}

// DeduplicateArtists 合并同名艺人（归一化匹配）
func DeduplicateArtists() int {
	log.Println("🔄 [Clean] 开始同名艺人合并检测...")

	rows, err := database.DB.Query("SELECT id, name FROM artists")
	if err != nil {
		log.Printf("查询艺人表失败: %v", err)
		return 0
	}
	defer rows.Close()

	artistMap := make(map[string][]int64)
	for rows.Next() {
		var id int64
		var name string
		rows.Scan(&id, &name)
		norm := NormalizeTitle(name)
		artistMap[norm] = append(artistMap[norm], id)
	}

	merged := 0
	for norm, ids := range artistMap {
		if len(ids) > 1 {
			log.Printf("🔍 发现 %d 个同名艺人记录 (归一化: %s)", len(ids), norm)

			var masterID int64
			var maxSongs int
			for _, id := range ids {
				var count int
				database.DB.QueryRow(`
					SELECT COUNT(songs.id) FROM songs
					JOIN albums ON songs.album_id = albums.id
					WHERE albums.artist_id = ?`, id).Scan(&count)
				if masterID == 0 || count >= maxSongs {
					masterID = id
					maxSongs = count
				}
			}

			for _, id := range ids {
				if id != masterID {
					res, _ := database.DB.Exec("UPDATE albums SET artist_id = ? WHERE artist_id = ?", masterID, id)
					transferred, _ := res.RowsAffected()
					database.DB.Exec("DELETE FROM artists WHERE id = ?", id)
					log.Printf("🔄 合并: 替身[ID:%d] → 正主[ID:%d]，转移 %d 张专辑", id, masterID, transferred)
					merged++
				}
			}
		}
	}
	return merged
}

// DeduplicateAlbums 合并同一歌手下的同名专辑（归一化匹配）
func DeduplicateAlbums() int {
	log.Println("🔄 [Clean] 开始同名专辑合并检测...")

	rows, err := database.DB.Query("SELECT id, artist_id, title FROM albums")
	if err != nil {
		log.Printf("查询专辑表失败: %v", err)
		return 0
	}
	defer rows.Close()

	albumMap := make(map[int64]map[string][]int64)
	for rows.Next() {
		var id, artistID int64
		var title string
		rows.Scan(&id, &artistID, &title)
		norm := NormalizeTitle(title)
		if albumMap[artistID] == nil {
			albumMap[artistID] = make(map[string][]int64)
		}
		albumMap[artistID][norm] = append(albumMap[artistID][norm], id)
	}

	merged := 0
	for artistID, titles := range albumMap {
		for normTitle, albumIDs := range titles {
			if len(albumIDs) > 1 {
				var artistName string
				database.DB.QueryRow("SELECT name FROM artists WHERE id = ?", artistID).Scan(&artistName)
				log.Printf("🔍 歌手 [%s] 下发现 %d 张重名专辑 (%s)", artistName, len(albumIDs), normTitle)

				var masterID int64
				var maxPhysical int
				for _, aid := range albumIDs {
					var count int
					database.DB.QueryRow("SELECT COUNT(*) FROM songs WHERE album_id = ? AND file_path IS NOT NULL AND file_path != ''", aid).Scan(&count)
					if masterID == 0 || count >= maxPhysical {
						masterID = aid
						maxPhysical = count
					}
				}

				for _, aid := range albumIDs {
					if aid != masterID {
						res, _ := database.DB.Exec("UPDATE songs SET album_id = ? WHERE album_id = ?", masterID, aid)
						transferred, _ := res.RowsAffected()
						database.DB.Exec("DELETE FROM albums WHERE id = ?", aid)
						log.Printf("🔄 合并: 替身专辑[ID:%d] → 正主[ID:%d]，转移 %d 首歌", aid, masterID, transferred)
						merged++
					}
				}
			}
		}
	}
	return merged
}

// CleanOrphans 清理没有歌曲的空壳专辑和没有专辑的空壳歌手
func CleanOrphans() (int64, int64) {
	log.Println("🧹 [Clean] 清理孤儿实体...")

	res, err := database.DB.Exec(`DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM songs)`)
	var albumsDel int64
	if err == nil {
		albumsDel, _ = res.RowsAffected()
		if albumsDel > 0 {
			log.Printf("🗑️  删除了 %d 张空壳专辑", albumsDel)
		}
	}

	res, err = database.DB.Exec(`DELETE FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM albums)`)
	var artistsDel int64
	if err == nil {
		artistsDel, _ = res.RowsAffected()
		if artistsDel > 0 {
			log.Printf("🗑️  删除了 %d 个空壳歌手", artistsDel)
		}
	}

	return albumsDel, artistsDel
}

// VacuumDB 压缩数据库回收碎片空间
func VacuumDB() {
	log.Println("🧹 [Clean] 压缩数据库 (VACUUM)...")
	if _, err := database.DB.Exec("VACUUM"); err != nil {
		log.Printf("❌ VACUUM 失败: %v", err)
	}
}
