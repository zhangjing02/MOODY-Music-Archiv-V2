package main

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	"moody-backend/internal/database"
	"moody-backend/internal/service"
)

func main() {
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

	database.InitDB(dbPath)
	defer database.DB.Close()

	if err := database.DB.Ping(); err != nil {
		log.Fatalf("无法连接数据库: %v", err)
	}

	artistName := "陈小春"
	log.Printf("⏳ 开始从 iTunes 递归拉取 [%s] 的全量数据...", artistName)
	artistData, err := service.FetchArtistMetadata(artistName)
	if err != nil {
		log.Fatalf("拉取元数据失败: %v", err)
	}

	tx, err := database.DB.Begin()
	if err != nil {
		log.Fatalf("开启事务失败: %v", err)
	}
	defer tx.Rollback()

	// 1. 查找或插入歌手
	var artistID int64
	err = tx.QueryRow("SELECT id FROM artists WHERE name = ?", artistName).Scan(&artistID)
	if err == sql.ErrNoRows {
		res, _ := tx.Exec("INSERT INTO artists (name, region) VALUES (?, ?)", artistName, artistData.Category)
		artistID, _ = res.LastInsertId()
		log.Printf("🎸 已创建歌手资料录位, ID: %d", artistID)
	} else {
		log.Printf("🎸 歌手 %s 原本已存在于名录中 (ID: %d)", artistName, artistID)
	}

	// 2. 插入专辑
	addedAlbums := 0
	addedSongs := 0

	for _, album := range artistData.Albums {
		if len(album.Songs) == 0 {
			continue
		}
		var albumID int64
		err = tx.QueryRow("SELECT id FROM albums WHERE artist_id = ? AND title = ?", artistID, album.Title).Scan(&albumID)
		if err == sql.ErrNoRows {
			res, _ := tx.Exec("INSERT INTO albums (artist_id, title, release_date, genre, cover_url) VALUES (?, ?, ?, ?, ?)",
				artistID, album.Title, album.Year, artistData.Category, album.Cover)
			albumID, _ = res.LastInsertId()
			addedAlbums++
			log.Printf("💿 创建专辑: %s", album.Title)
		}

		// 3. 插入歌曲
		for i, song := range album.Songs {
			var songID int64
			err = tx.QueryRow("SELECT id FROM songs WHERE album_id = ? AND title = ?", albumID, song.Title).Scan(&songID)
			if err == sql.ErrNoRows {
				_, errInsert := tx.Exec("INSERT INTO songs (artist_id, album_id, title, track_index) VALUES (?, ?, ?, ?)",
					artistID, albumID, song.Title, i+1)
				if errInsert != nil {
					log.Printf("⚠️ 歌曲插入失败: %s - %v", song.Title, errInsert)
				} else {
					addedSongs++
				}
			}
		}
	}

	if err := tx.Commit(); err != nil {
		log.Fatalf("提交事务失败: %v", err)
	}

	log.Printf("✅ 同步完成！共新增 %d 张专辑，%d 首曲目骨架。", addedAlbums, addedSongs)
}
