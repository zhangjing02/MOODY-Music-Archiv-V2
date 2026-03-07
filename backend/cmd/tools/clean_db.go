package main

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	"moody-backend/internal/database"
)

// NormalizeTitle 用于对名称去除空格和变小写，与 music.go 的逻辑一致
func NormalizeTitle(t string) string {
	return strings.ToLower(strings.ReplaceAll(t, " ", ""))
}

func main() {
	// 1. 获取绝对路径以防 SQLite 找不到文件导致 14 错误
	wd, err := os.Getwd()
	if err != nil {
		log.Fatalf("无法获取当前工作目录: %v", err)
	}

	projectRoot := wd
	for i := 0; i < 4; i++ {
		if _, err := os.Stat(filepath.Join(projectRoot, "frontend")); err == nil {
			break
		}
		parent := filepath.Dir(projectRoot)
		if parent == projectRoot {
			break
		}
		projectRoot = parent
	}

	dbPath := filepath.Join(projectRoot, "storage", "db", "moody.db")
	log.Printf("📂 加载数据库路径: %s\n", dbPath)

	database.InitDB(dbPath)
	defer database.DB.Close()

	if err := database.DB.Ping(); err != nil {
		log.Fatalf("无法连接数据库: %v", err)
	}
	log.Println("🔪 [DB Cleaner] 初始化完成，准备开始第一刀...")

	cleanCorruptedLrcPaths()
	cleanEmptyEntities()
	deduplicateArtists()
	deduplicateAlbums()

	// 清理完毕再次清扫孤儿实体
	cleanEmptyEntities()

	log.Println("🧹 [DB Cleaner] 正在压缩数据库回收空间 (VACUUM)...")
	_, err = database.DB.Exec("VACUUM")
	if err != nil {
		log.Printf("❌ VACUUM 失败: %v\n", err)
	}

	log.Println("🎉 [DB Cleaner] 数据库全盘清理与收缩完成！")
}

// 0. 清理被音频文件路径污染的 lrc_path
func cleanCorruptedLrcPaths() {
	log.Println("-------------------------------------------")
	log.Println("0️⃣ 开始排查并清理被污染的 lrc_path (清除错误挂载的 mp3/flac)...")
	res, err := database.DB.Exec(`
		UPDATE songs 
		SET lrc_path = NULL 
		WHERE lrc_path LIKE '%.mp3' OR lrc_path LIKE '%.flac' OR lrc_path LIKE '%.wav'
	`)
	if err == nil {
		affected, _ := res.RowsAffected()
		if affected > 0 {
			log.Printf("🗑️  清理了 %d 条被错误指派为音频文件的 [污染 lrc_path]", affected)
		}
	}
}

// 1. 清理孤儿名录：没有任何相关联 songs 的 albums，以及没有任何 albums 的 artists
func cleanEmptyEntities() {
	log.Println("-------------------------------------------")
	log.Println("1️⃣ 开始排查并清理极度空虚的孤儿实体...")

	// a. 删除没有歌曲的空壳专辑
	res, err := database.DB.Exec(`
		DELETE FROM albums 
		WHERE id NOT IN (SELECT DISTINCT album_id FROM songs)
	`)
	if err == nil {
		affected, _ := res.RowsAffected()
		if affected > 0 {
			log.Printf("🗑️  删除了 %d 张名下一首歌曲骨架都没有的 [孤儿空壳专辑]", affected)
		}
	}

	// b. 删除没有专辑的空壳歌手
	res, err = database.DB.Exec(`
		DELETE FROM artists 
		WHERE id NOT IN (SELECT DISTINCT artist_id FROM albums)
	`)
	if err == nil {
		affected, _ := res.RowsAffected()
		if affected > 0 {
			log.Printf("🗑️  删除了 %d 个名下一张专辑骨架都没有的 [孤单空壳歌手]", affected)
		}
	}
}

// 2. 艺人合并 (Artist Deduplication)
func deduplicateArtists() {
	log.Println("-------------------------------------------")
	log.Println("2️⃣ 开始执行 [同名艺人] 合并检测...")

	// 获取所有艺人
	rows, err := database.DB.Query("SELECT id, name FROM artists")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	// 按照 NormalizeTitle 映射 ID 集合
	artistMap := make(map[string][]int64)
	for rows.Next() {
		var id int64
		var name string
		rows.Scan(&id, &name)
		norm := NormalizeTitle(name)
		artistMap[norm] = append(artistMap[norm], id)
	}

	for norm, ids := range artistMap {
		if len(ids) > 1 {
			log.Printf("🔍 发现 %d 个同名艺人记录 (归一化名字: %s)", len(ids), norm)

			// 找出哪个 ID 拥有的歌曲(包含所有 albums 底下的歌曲)最多，尊其为 Master
			var masterID int64
			var maxSongs int

			for _, id := range ids {
				var count int
				database.DB.QueryRow(`
					SELECT COUNT(songs.id) 
					FROM songs 
					JOIN albums ON songs.album_id = albums.id 
					WHERE albums.artist_id = ?`, id).Scan(&count)

				if masterID == 0 || count >= maxSongs {
					masterID = id
					maxSongs = count
				}
			}

			// 将其余的艺人拥有的 Albums, 变卦跟随正统 MasterID，最后毁灭替身
			for _, id := range ids {
				if id != masterID {
					res, _ := database.DB.Exec("UPDATE albums SET artist_id = ? WHERE artist_id = ?", masterID, id)
					transferred, _ := res.RowsAffected()
					database.DB.Exec("DELETE FROM artists WHERE id = ?", id)
					log.Printf("🔄 合并艺人: 将替身[ID:%d] 名下的 %d 张专辑转移至 正宗主家[ID:%d]，并已销毁替身。", id, transferred, masterID)
				}
			}
		}
	}
}

// 3. 专辑合并 (Album Deduplication)
func deduplicateAlbums() {
	log.Println("-------------------------------------------")
	log.Println("3️⃣ 开始执行 [同名专辑] 合并检测 (针对同一歌手)...")

	// 获取所有歌手的所有专辑
	rows, err := database.DB.Query("SELECT id, artist_id, title FROM albums")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	// [ArtistID][NormalizedAlbumTitle] -> []AlbumIDs
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

	for artistID, normalizedTitles := range albumMap {
		for normTitle, albumIDs := range normalizedTitles {
			if len(albumIDs) > 1 {
				var masterArtistName string
				database.DB.QueryRow("SELECT name FROM artists WHERE id = ?", artistID).Scan(&masterArtistName)
				log.Printf("🔍 在歌手 [%s] 发现了 %d 张重名专辑 (同名: %s)", masterArtistName, len(albumIDs), normTitle)

				// 找最强壮的那张专辑（拥有实体 file_path 歌曲最多的专辑）当正主
				var masterAlbumID int64
				var maxPhysicalSongs int

				for _, aid := range albumIDs {
					var count int
					database.DB.QueryRow("SELECT COUNT(*) FROM songs WHERE album_id = ? AND file_path IS NOT NULL AND file_path != ''", aid).Scan(&count)
					if masterAlbumID == 0 || count >= maxPhysicalSongs {
						masterAlbumID = aid
						maxPhysicalSongs = count
					}
				}

				// 将其他替身同名专辑下的音乐，挂靠到主专辑身上，然后摧毁替身
				for _, aid := range albumIDs {
					if aid != masterAlbumID {
						res, _ := database.DB.Exec("UPDATE songs SET album_id = ? WHERE album_id = ?", masterAlbumID, aid)
						transferred, _ := res.RowsAffected()
						database.DB.Exec("DELETE FROM albums WHERE id = ?", aid)
						log.Printf("🔄 倒库转移: 将替身专辑[ID:%d] 的 %d 首歌过户至 正统专辑[ID:%d]，随后拆除替身。", aid, transferred, masterAlbumID)
					}
				}
			}
		}
	}
}
