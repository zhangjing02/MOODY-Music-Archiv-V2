package service

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"sync"

	"moody-backend/internal/database"
	"moody-backend/internal/model"
)

var (
	skeletonData *model.LibraryData
	skeletonLock sync.RWMutex
)

// InitSkeletonService 初始化骨架服务
// V12.52+: 彻底转向数据库模式，不再从 embedded JSON 迁移数据。
func InitSkeletonService(basePath string) error {
	// 1. 确保表结构存在
	if err := createSkeletonTables(); err != nil {
		return fmt.Errorf("create tables failed: %v", err)
	}

	// 2. 直接从数据库加载到内存 (构建 cache)
	return LoadSkeleton()
}

// createSkeletonTables 创建骨架相关的数据库表
func createSkeletonTables() error {
	sqls := []string{
		`CREATE TABLE IF NOT EXISTS library_artists (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			alias TEXT, -- JSON array
			"group" TEXT,
			category TEXT,
			avatar TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS library_albums (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			artist_id TEXT,
			title TEXT NOT NULL,
			year TEXT,
			cover TEXT,
			FOREIGN KEY(artist_id) REFERENCES library_artists(id)
		);`,
		`CREATE TABLE IF NOT EXISTS library_songs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			album_id INTEGER,
			title TEXT NOT NULL,
			path TEXT, -- 预留
			lrc_path TEXT, -- 预留
			FOREIGN KEY(album_id) REFERENCES library_albums(id)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_lib_albums_artist ON library_albums(artist_id);`,
		`CREATE INDEX IF NOT EXISTS idx_lib_songs_album ON library_songs(album_id);`,
	}

	for _, s := range sqls {
		if _, err := database.DB.Exec(s); err != nil {
			return err
		}
	}
	return nil
}

// LoadSkeleton 从原生 artists/albums 表加载数据构建 LibraryData (Heavy Operation)
// V12.56: 修正分类兜底逻辑。确保没有 region 的歌手也能在“华语”中显示。
func LoadSkeleton() error {
	skeletonLock.Lock()
	defer skeletonLock.Unlock()

	// 1. Load Artists (原生表) - 增加统计信息以支持侧边栏角标
	rows, err := database.DB.Query(`
		SELECT a.id, a.name, a.region, a.photo_url,
		       (SELECT COUNT(*) FROM albums WHERE artist_id = a.id) as album_count,
		       (SELECT COUNT(*) FROM songs WHERE artist_id = a.id AND file_path IS NOT NULL) as local_count
		FROM artists a 
		ORDER BY a.name ASC`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var artists []model.LibraryArtist
	artIdMap := make(map[int]int)

	for rows.Next() {
		var a model.LibraryArtist
		var dbID int
		var region, photo sql.NullString
		if err := rows.Scan(&dbID, &a.Name, &region, &photo, &a.AlbumCount, &a.LocalCount); err != nil {
			return err
		}
		// 关键修复：保持 ID 原始格式（或与前端预期的 ID 一致）
		// 如果前端使用 ID 进行比较/去重，不要随便加前缀
		a.ID = fmt.Sprintf("%d", dbID)

		// 拼音识别：由后端提供首字符（如"周"），前端 getAutoLetter 负责转化为 A-Z
		a.Group = getFirstChar(a.Name)

		// 分类兜底：如果 region 为空，强制归类为“华语”以便在现有分类页签显示
		a.Category = "华语"
		if region.Valid && strings.TrimSpace(region.String) != "" {
			a.Category = strings.TrimSpace(region.String)
		}

		a.Avatar = "src/assets/images/avatars/default.png"
		if photo.Valid && photo.String != "" {
			a.Avatar = photo.String
		}
		a.Albums = make([]model.LibraryAlbum, 0)
		artists = append(artists, a)
		artIdMap[dbID] = len(artists) - 1
	}

	// 2. Load Albums & Songs (原生表关联加载)
	rowsAlb, err := database.DB.Query(`
		SELECT id, artist_id, title, release_date, cover_url 
		FROM albums 
		ORDER BY release_date ASC`)
	if err != nil {
		return err
	}
	defer rowsAlb.Close()

	for rowsAlb.Next() {
		var albID int
		var artId int
		var al model.LibraryAlbum
		var release, cover sql.NullString
		if err := rowsAlb.Scan(&albID, &artId, &al.Title, &release, &cover); err != nil {
			return err
		}
		al.Year = "未知"
		if release.Valid && release.String != "" {
			al.Year = release.String
		}
		al.Cover = "src/assets/images/vinyl_default.png"
		if cover.Valid && cover.String != "" {
			al.Cover = cover.String
		}
		al.Songs = make([]model.LibrarySong, 0)

		// 3. 核心修复：加载该专辑下的所有歌曲路径
		songRows, err := database.DB.Query(`
			SELECT title, file_path, lrc_path, track_index 
			FROM songs 
			WHERE album_id = ? 
			ORDER BY track_index ASC`, albID)
		if err == nil {
			for songRows.Next() {
				var s model.LibrarySong
				var p, lp sql.NullString
				if err := songRows.Scan(&s.Title, &p, &lp, &s.TrackIndex); err == nil {
					s.Path = p.String
					s.LrcPath = lp.String
					al.Songs = append(al.Songs, s)
				}
			}
			songRows.Close()
		}

		if idx, ok := artIdMap[artId]; ok {
			artists[idx].Albums = append(artists[idx].Albums, al)
		}
	}

	skeletonData = &model.LibraryData{Artists: artists}
	log.Printf("✅ [Skeleton] Validated %d artists from Primary DB", len(artists))
	return nil
}

// 辅助函数：获取首字母 (如果 skeleton_service 需要独立使用)
func getFirstChar(s string) string {
	if s == "" {
		return "#"
	}
	r := []rune(s)
	return strings.ToUpper(string(r[0]))
}

// GetSkeletonBody 返回全量或轻量化骨架 (API 用)
func GetSkeletonBody(light bool) *model.LibraryData {
	skeletonLock.RLock()
	defer skeletonLock.RUnlock()

	if skeletonData == nil {
		return &model.LibraryData{Artists: []model.LibraryArtist{}}
	}

	if !light {
		return skeletonData
	}

	// 轻量化：复制一份不含 Albums 的 Artists 列表
	lightArtists := make([]model.LibraryArtist, len(skeletonData.Artists))
	for i, a := range skeletonData.Artists {
		lightArtists[i] = a
		lightArtists[i].Albums = nil // 真空处理
	}
	return &model.LibraryData{Artists: lightArtists}
}

// UpdateArtistInSkeleton 更新或插入艺人名录 (支持 API/Scan 调用)
// V12.54: 真实落库逻辑。将名录数据 Upsert 到原生 artists/albums/songs 表中。
func UpdateArtistInSkeleton(newArtist *model.LibraryArtist) error {
	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. 确保艺术家存在 (V16.8: 增加简繁体/空格/符号归一化匹配，防止双 ID)
	var artistID int64
	err = tx.QueryRow("SELECT id FROM artists WHERE name = ?", newArtist.Name).Scan(&artistID)
	if err == sql.ErrNoRows {
		// 模糊匹配兜底
		targetNorm := NormalizeTitle(newArtist.Name)
		rows, _ := tx.Query("SELECT id, name FROM artists")
		if rows != nil {
			for rows.Next() {
				var aid int64
				var aName string
				rows.Scan(&aid, &aName)
				if NormalizeTitle(aName) == targetNorm {
					artistID = aid
					err = nil
					break
				}
			}
			rows.Close()
		}
	}

	if artistID == 0 {
		res, err := tx.Exec("INSERT INTO artists (name, region, photo_url) VALUES (?, ?, ?)",
			newArtist.Name, newArtist.Category, newArtist.Avatar)
		if err != nil {
			return err
		}
		artistID, _ = res.LastInsertId()
	} else if err != nil {
		return err
	}

	// 2. 处理专辑与歌曲
	for _, alb := range newArtist.Albums {
		var albumID int64
		err = tx.QueryRow("SELECT id FROM albums WHERE artist_id = ? AND title = ?", artistID, alb.Title).Scan(&albumID)
		if err == sql.ErrNoRows {
			// 专辑同样引入模糊匹配
			albNorm := NormalizeTitle(alb.Title)
			rows, _ := tx.Query("SELECT id, title FROM albums WHERE artist_id = ?", artistID)
			if rows != nil {
				for rows.Next() {
					var alid int64
					var alTitle string
					rows.Scan(&alid, &alTitle)
					if NormalizeTitle(alTitle) == albNorm {
						albumID = alid
						err = nil
						break
					}
				}
				rows.Close()
			}
		}

		if albumID == 0 {
			res, err := tx.Exec("INSERT INTO albums (artist_id, title, release_date, cover_url) VALUES (?, ?, ?, ?)",
				artistID, alb.Title, alb.Year, alb.Cover)
			if err != nil {
				return err
			}
			albumID, _ = res.LastInsertId()
		} else if err != nil {
			return err
		}

		// 3. 处理名录中的歌曲
		for _, s := range alb.Songs {
			// 检查歌曲是否已存在 (通过标题和专辑ID，因为名录歌曲可能没路径)
			var existingID int64
			err = tx.QueryRow("SELECT id FROM songs WHERE album_id = ? AND title = ?", albumID, s.Title).Scan(&existingID)
			if err == sql.ErrNoRows {
				// 如果不存在，作为名录占位符插入
				var p interface{}
				if s.Path != "" {
					p = s.Path
				} else {
					p = nil // 插入 NULL 以规避 UNIQUE 冲突
				}
				_, err = tx.Exec("INSERT INTO songs (artist_id, album_id, title, file_path, lrc_path, track_index) VALUES (?, ?, ?, ?, ?, ?)",
					artistID, albumID, s.Title, p, "", s.TrackIndex)
				if err != nil {
					return fmt.Errorf("insert song [%s] failed: %v", s.Title, err)
				}
			} else if err != nil {
				return err
			}
			// 如果已存在，则跳过，保留原有的物理路径等信息
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	// 异步触发全量缓存重刷，确保 GetSkeletonBody 返回最新内容
	go LoadSkeleton()

	return nil
}

// SaveSkeleton 废弃 (DB Mode 不需要保存回 JSON)
func SaveSkeleton() error {
	log.Println("⚠️ [Skeleton] SaveSkeleton called but ignored in DB mode")
	return nil
}
