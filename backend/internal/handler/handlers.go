package handler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"moody-backend/internal/database"
	"moody-backend/internal/model"
	"moody-backend/internal/service"
	"moody-backend/pkg/s3client"
)

// StatusHandler 处理服务健康检查请求
func StatusHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(model.ApiResponse{
		Code:    200,
		Message: "MOODY 专业版后端已就绪！",
		Data: map[string]string{
			"status": "running",
		},
	})
}

// ReportErrorHandler 接收客户端报错并持久化
func ReportErrorHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			sendError(w, http.StatusMethodNotAllowed, "仅支持 POST 请求")
			return
		}

		var req model.ReportErrorRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			sendError(w, http.StatusBadRequest, "无效的请求体")
			return
		}

		// 落库记录
		query := `
			INSERT INTO client_errors (error_type, song_id, message)
			VALUES (?, ?, ?)
			ON CONFLICT(error_type, song_id, message)
			DO UPDATE SET
				occurrence_count = occurrence_count + 1,
				last_reported_at = CURRENT_TIMESTAMP;
		`
		_, err := database.DB.Exec(query, req.Type, req.SongID, req.Message)
		if err != nil {
			log.Printf("⚠️ 保存错误遥测失败: %v", err)
			sendError(w, http.StatusInternalServerError, "保存失败")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(model.ApiResponse{Code: 200, Message: "Reported successfully"})
	}
}

// SyncHandler 处理单次增量同步 (强制 POST)
func SyncHandler(musicDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			sendError(w, http.StatusMethodNotAllowed, "仅支持 POST 请求")
			return
		}

		var req model.GovernanceRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		subPath := req.Path

		var count, lyricsCount int
		var err error

		if req.Source == "r2" {
			count, lyricsCount, err = service.SyncMusicFromR2("primary", subPath)
		} else {
			count, lyricsCount, err = service.SyncMusic(musicDir, subPath, req.Targets)
		}

		if err != nil {
			log.Printf("同步失败: %v", err)
			sendError(w, http.StatusInternalServerError, fmt.Sprintf("同步失败: %v", err))
			return
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    200,
			Message: fmt.Sprintf("同步完成，新增/更新了 %d 首音频，主动入库了 %d 首歌词", count, lyricsCount),
			Data: map[string]interface{}{
				"new_songs":  count,
				"new_lyrics": lyricsCount,
				"path":       subPath,
			},
		})
	}
}

// GovernanceHandler 统一运维接口 (强制 POST)
// 支持 targets: sync-music, sync-lyrics, clean, clean-lyrics, clean-duplicates, clean-orphans
// 支持 path: 限定操作范围 (如 "周杰伦/Jay")
func GovernanceHandler(musicDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			sendError(w, http.StatusMethodNotAllowed, "仅支持 POST 请求")
			return
		}

		var req model.GovernanceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && r.ContentLength > 0 {
			log.Printf("⚠️  治理请求解析告警: %v", err)
		}

		log.Printf("🛠️ [Admin] 触发统一运维: path=%q targets=%v", req.Path, req.Targets)

		// 构建 target 查找集合
		targetSet := make(map[string]bool)
		for _, t := range req.Targets {
			targetSet[t] = true
		}

		// 如果 targets 为空，默认行为 = sync-music + sync-lyrics（向后兼容）
		if len(targetSet) == 0 {
			targetSet["sync-music"] = true
			targetSet["sync-lyrics"] = true
		}

		result := map[string]interface{}{
			"scope":   req.Path,
			"targets": req.Targets,
			"status":  "done",
		}
		messages := []string{}

		// ───── 清理类操作（先于同步执行，保证同步前数据干净） ─────

		if targetSet["clean"] {
			// 全套大扫除
			log.Println("🧹 [Governance] 执行全套数据库大扫除...")
			cleaned := service.CleanCorruptedLrcPaths(req.Path)
			mergedArtists := service.DeduplicateArtists()
			mergedAlbums := service.DeduplicateAlbums()
			orphanAlbums, orphanArtists := service.CleanOrphans()
			service.VacuumDB()

			result["cleaned_lrc_paths"] = cleaned
			result["merged_artists"] = mergedArtists
			result["merged_albums"] = mergedAlbums
			result["orphan_albums_deleted"] = orphanAlbums
			result["orphan_artists_deleted"] = orphanArtists

			messages = append(messages, fmt.Sprintf("大扫除完成: 清理%d条污染路径, 合并%d艺人/%d专辑, 删除%d孤儿专辑/%d孤儿歌手",
				cleaned, mergedArtists, mergedAlbums, orphanAlbums, orphanArtists))
		} else {
			// 单项清理
			if targetSet["clean-lyrics"] {
				cleaned := service.CleanCorruptedLrcPaths(req.Path)
				result["cleaned_lrc_paths"] = cleaned
				messages = append(messages, fmt.Sprintf("清理了 %d 条污染歌词路径", cleaned))
			}
			if targetSet["clean-duplicates"] {
				mergedArtists := service.DeduplicateArtists()
				mergedAlbums := service.DeduplicateAlbums()
				result["merged_artists"] = mergedArtists
				result["merged_albums"] = mergedAlbums
				messages = append(messages, fmt.Sprintf("合并了 %d 个重复艺人, %d 张重复专辑", mergedArtists, mergedAlbums))
			}
			if targetSet["clean-orphans"] {
				orphanAlbums, orphanArtists := service.CleanOrphans()
				result["orphan_albums_deleted"] = orphanAlbums
				result["orphan_artists_deleted"] = orphanArtists
				messages = append(messages, fmt.Sprintf("删除了 %d 张孤儿专辑, %d 个孤儿歌手", orphanAlbums, orphanArtists))
			}
		}

		// ───── 同步类操作 ─────

		// 构建 SyncMusic 所需的 syncTargets
		var syncTargets []string
		if targetSet["sync-music"] || targetSet["music"] {
			syncTargets = append(syncTargets, "music")
		}
		if targetSet["sync-lyrics"] || targetSet["lyrics"] {
			syncTargets = append(syncTargets, "lyrics")
		}

		if len(syncTargets) > 0 {
			var count, lyricsCount int
			var err error

			if req.Source == "r2" {
				count, lyricsCount, err = service.SyncMusicFromR2("primary", req.Path)
			} else {
				count, lyricsCount, err = service.SyncMusic(musicDir, req.Path, syncTargets)
			}

			if err != nil {
				log.Printf("同步失败: %v", err)
				sendError(w, http.StatusInternalServerError, fmt.Sprintf("同步失败: %v", err))
				return
			}
			result["synced_music"] = count
			result["synced_lyrics"] = lyricsCount
			messages = append(messages, fmt.Sprintf("同步完成: %d首音频, %d首歌词 (源: %s)", count, lyricsCount, req.Source))
		}

		// ───── 收尾：重载骨架 ─────

		if err := service.LoadSkeleton(); err != nil {
			log.Printf("⚠️ 治理后重载骨架失败: %v", err)
		} else {
			log.Printf("✅ 治理完成，已成功热重载服务器骨架")
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    200,
			Message: fmt.Sprintf("运维指令已执行。%s", joinMessages(messages)),
			Data:    result,
		})
	}
}

// DBUploadHandler 处理数据库文件的上传与热重载 (强制安全校验)
func DBUploadHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			sendError(w, http.StatusMethodNotAllowed, "仅支持 POST 请求")
			return
		}

		// 1. 安全校验 (简单 Secret 模式)
		secret := r.Header.Get("X-Admin-Secret")
		envSecret := os.Getenv("ADMIN_SECRET")
		if envSecret != "" && secret != envSecret {
			log.Printf("⚠️  非法的 DB 上传请求: IP=%s", r.RemoteAddr)
			sendError(w, http.StatusForbidden, "鉴权失败")
			return
		}

		// 2. 解析文件
		file, _, err := r.FormFile("database")
		if err != nil {
			sendError(w, http.StatusBadRequest, "无效的文件字段 'database'")
			return
		}
		defer file.Close()

		// 3. 暂存
		tmpPath := database.DBPath + ".tmp"
		out, err := os.Create(tmpPath)
		if err != nil {
			sendError(w, http.StatusInternalServerError, "创建暂存文件失败")
			return
		}
		defer out.Close()
		defer os.Remove(tmpPath) // 无论结果如何，清理 tmp

		_, err = io.Copy(out, file)
		if err != nil {
			sendError(w, http.StatusInternalServerError, "写入文件失败")
			return
		}
		out.Close() // 显式关闭以准备重命名

		// 4. 原子级热替换
		log.Printf("🔄 [Database] 接收到新的数据库文件，正在执行原子替换...")
		// 注意：在 Windows/Docker 环境下需先显式关闭旧连接，否则无法覆盖文件
		if err := database.ReinitDB(); err != nil {
			log.Printf("❌ [Database] 预关闭失败: %v", err)
		}

		// 执行覆盖
		if err := os.Rename(tmpPath, database.DBPath); err != nil {
			log.Printf("❌ [Database] 文件覆盖失败: %v", err)
			sendError(w, http.StatusInternalServerError, "文件系统操作失败")
			return
		}

		// 5. 重新拉起连接与名录
		if err := database.ReinitDB(); err != nil {
			log.Printf("❌ [Database] 重连失败: %v", err)
			sendError(w, http.StatusInternalServerError, "数据库重连失败")
			return
		}
		_ = service.LoadSkeleton()

		log.Printf("✅ [Database] 数据库已成功热同步并刷新骨架缓存！")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    200,
			Message: "数据库已成功热同步并刷新缓存",
		})
	}
}

// GetSongsHandler 获取结构化音乐库数据 (支持过滤和分页)
func GetSongsHandler(w http.ResponseWriter, r *http.Request) {
	// [V16.9+ 究极修复] 如果数据库刚热换过，主服务可能需要重刷一下缓存
	// 我们在这里简单判断：如果内存里的艺人数为 0，尝试 LoadSkeleton 一次
	if service.GetSkeletonBody(true).Artists == nil || len(service.GetSkeletonBody(true).Artists) == 0 {
		log.Printf("🔄 [GetSongs] 内存名录为空，尝试执行热重载同步...")
		_ = service.LoadSkeleton()
	}

	queryArtist := r.URL.Query().Get("artist")
	queryArtistId := r.URL.Query().Get("artistId")
	queryAlbum := r.URL.Query().Get("album")

	// 1. 获取所有艺术家 (增加查询过滤)
	sqlStr := "SELECT id, name, region, photo_url FROM artists"
	var args []interface{}

	if queryArtistId != "" {
		// [Fix] 前端传递的是标识化的 ID (如 db_123)，入库查询需剥离前缀
		cleanId := strings.TrimPrefix(queryArtistId, "db_")
		sqlStr += " WHERE id = ?"
		args = append(args, cleanId)
	} else if queryArtist != "" {
		sqlStr += " WHERE name LIKE ?"
		args = append(args, "%"+queryArtist+"%")
	}
	sqlStr += " ORDER BY name ASC"

	rows, err := database.DB.Query(sqlStr, args...)
	if err != nil {
		log.Printf("查询艺术家失败: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	library := []model.LibraryArtist{}
	for rows.Next() {
		var a model.LibraryArtist
		var artistDBID int
		var region, photoUrl sql.NullString
		if err := rows.Scan(&artistDBID, &a.Name, &region, &photoUrl); err != nil {
			log.Printf("扫描艺术家失败: %v", err)
			continue
		}
		a.ID = fmt.Sprintf("db_%d", artistDBID)
		a.Group = getFirstChar(a.Name)

		// 映射分类
		a.Category = "华语" // 默认
		if region.Valid {
			a.Category = region.String
		}

		a.Avatar = "/src/assets/images/avatars/default.png"
		if photoUrl.Valid && photoUrl.String != "" {
			a.Avatar = photoUrl.String
		}

		a.Albums = []model.LibraryAlbum{}

		// 2. 获取该艺术家的专辑 (增加查询过滤)
		albumSql := "SELECT id, title, release_date, cover_url FROM albums WHERE artist_id = ?"
		albumArgs := []interface{}{artistDBID}
		if queryAlbum != "" {
			albumSql += " AND title LIKE ?"
			albumArgs = append(albumArgs, "%"+queryAlbum+"%")
		}
		albumSql += " ORDER BY release_date ASC"

		albumRows, err := database.DB.Query(albumSql, albumArgs...)
		if err == nil {
			for albumRows.Next() {
				var alb model.LibraryAlbum
				var albumDBID int
				var releaseDate, coverUrl sql.NullString
				if err := albumRows.Scan(&albumDBID, &alb.Title, &releaseDate, &coverUrl); err != nil {
					continue
				}

				alb.Year = "未知"
				if releaseDate.Valid {
					alb.Year = releaseDate.String
				}

				alb.Cover = "/src/assets/images/vinyl_default.png"
				if coverUrl.Valid && coverUrl.String != "" {
					alb.Cover = coverUrl.String
				}

				alb.Songs = []model.LibrarySong{}

				// 3. 获取该专辑的歌曲 (严格遵循 track_index 原始曲序)
				songRows, err := database.DB.Query(`
					SELECT title, file_path, lrc_path, track_index 
					FROM songs 
					WHERE album_id = ? 
					ORDER BY track_index ASC`, albumDBID)
				if err == nil {
					for songRows.Next() {
						var s model.LibrarySong
						var p, lp sql.NullString
						if err := songRows.Scan(&s.Title, &p, &lp, &s.TrackIndex); err == nil {
							s.Path = p.String
							s.LrcPath = lp.String
							alb.Songs = append(alb.Songs, s)
						}
					}
					songRows.Close()
				}
				a.Albums = append(a.Albums, alb)
			}
			albumRows.Close()
		}

		// 如果指定了专辑过滤但没找到，则不添加该艺术家
		if queryAlbum != "" && len(a.Albums) == 0 {
			continue
		}
		library = append(library, a)
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(model.ApiResponse{
		Code:    200,
		Message: "success",
		Data:    library,
	})
}

// GetSkeletonHandler 获取离线骨架 (支持按首字母分组)
func GetSkeletonHandler(w http.ResponseWriter, r *http.Request) {
	group := r.URL.Query().Get("group")
	light := r.URL.Query().Get("light") != "false" // 默认为 true (轻量版)
	body := service.GetSkeletonBody(light)

	if group != "" && body != nil {
		filteredArtists := []model.LibraryArtist{}
		for _, a := range body.Artists {
			if strings.EqualFold(a.Group, group) {
				filteredArtists = append(filteredArtists, a)
			}
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    200,
			Message: "success",
			Data:    model.LibraryData{Artists: filteredArtists},
		})
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(model.ApiResponse{
		Code:    200,
		Message: "success",
		Data:    body,
	})
}

// GetSearchHandler 实现全局模糊搜索
func GetSearchHandler(w http.ResponseWriter, r *http.Request) {
	queryP := r.URL.Query().Get("q")
	if queryP == "" {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    400,
			Message: "missing query parameter 'q'",
		})
		return
	}

	likeQuery := "%" + queryP + "%"
	results := struct {
		Artists []model.Artist `json:"artists"`
		Albums  []model.Album  `json:"albums"`
		Songs   []model.Song   `json:"songs"`
	}{
		Artists: []model.Artist{},
		Albums:  []model.Album{},
		Songs:   []model.Song{},
	}

	// 1. 搜索歌手
	rows, _ := database.DB.Query("SELECT id, name, region FROM artists WHERE name LIKE ?", likeQuery)
	for rows != nil && rows.Next() {
		var a model.Artist
		rows.Scan(&a.ID, &a.Name, &a.Region)
		results.Artists = append(results.Artists, a)
	}
	if rows != nil {
		rows.Close()
	}

	// 2. 搜索专辑
	rows, _ = database.DB.Query("SELECT id, title, artist_id, cover_url FROM albums WHERE title LIKE ?", likeQuery)
	for rows != nil && rows.Next() {
		var alb model.Album
		rows.Scan(&alb.ID, &alb.Title, &alb.ArtistID, &alb.CoverURL)
		results.Albums = append(results.Albums, alb)
	}
	if rows != nil {
		rows.Close()
	}

	// 3. 搜索歌曲
	rows, _ = database.DB.Query("SELECT id, title, artist_id, album_id, file_path FROM songs WHERE title LIKE ?", likeQuery)
	for rows != nil && rows.Next() {
		var s model.Song
		rows.Scan(&s.ID, &s.Title, &s.ArtistID, &s.Album_ID, &s.FilePath)
		results.Songs = append(results.Songs, s)
	}
	if rows != nil {
		rows.Close()
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(model.ApiResponse{
		Code:    200,
		Message: fmt.Sprintf("找到 %d 条相关结果", len(results.Artists)+len(results.Albums)+len(results.Songs)),
		Data:    results,
	})
}

// SyncMetadataHandler 处理特定艺人的云端名录对齐
func SyncMetadataHandler(w http.ResponseWriter, r *http.Request) {
	artistName := r.URL.Query().Get("artist")
	if artistName == "" {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    400,
			Message: "missing artist parameter",
		})
		return
	}

	// [V15.5] 增加 region 和 country 参数支持
	targetRegion := r.URL.Query().Get("region")   // 手动指定的分类
	itunesCountry := r.URL.Query().Get("country") // iTunes 搜索区域

	log.Printf("🔍 正在为艺人 [%s] 执行云端对齐 (Region: %s, iTunes: %s)...", artistName, targetRegion, itunesCountry)

	// 1. 获取云端元数据
	artist, err := service.FetchArtistMetadata(artistName, targetRegion, itunesCountry)
	if err != nil {
		log.Printf("❌ 云端抓取失败: %v", err)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    500,
			Message: fmt.Sprintf("云端抓取失败: %v", err),
		})
		return
	}

	// 2. 合并并固化到本地 (数据库 Upsert)
	if err := service.UpdateArtistInSkeleton(artist); err != nil {
		log.Printf("❌ 固化同步失败: %v", err)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    500,
			Message: fmt.Sprintf("固化同步失败: %v", err),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(model.ApiResponse{
		Code:    200,
		Message: fmt.Sprintf("[%s] 名录对齐并固化完成，共识别出 %d 张专辑", artistName, len(artist.Albums)),
		Data:    artist,
	})
}

// getFirstChar 获取字符串首位有效字符并转大写 (支持 UTF-8)
func getFirstChar(s string) string {
	r := []rune(s)
	if len(r) == 0 {
		return "#"
	}
	return strings.ToUpper(string(r[0]))
}

// SkeletonReloadHandler 从数据库重新加载缓存 (强制 POST)
func SkeletonReloadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "仅支持 POST 请求")
		return
	}

	log.Println("🔄 [API] Refreshing skeleton cache from database...")
	if err := service.LoadSkeleton(); err != nil {
		log.Printf("❌ [API] Skeleton refresh failed: %v", err)
		sendError(w, http.StatusInternalServerError, fmt.Sprintf("重载失败: %v", err))
		return
	}

	body := service.GetSkeletonBody(false)
	artistCount := 0
	if body != nil {
		artistCount = len(body.Artists)
	}
	log.Printf("✅ [API] Skeleton reloaded: %d artists", artistCount)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(model.ApiResponse{
		Code:    200,
		Message: fmt.Sprintf("骨架热重载完成，共 %d 位歌手", artistCount),
		Data: map[string]interface{}{
			"artists": artistCount,
		},
	})
}

// FullSyncHandler 全量同步 (强制 POST)
func FullSyncHandler(musicDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			sendError(w, http.StatusMethodNotAllowed, "仅支持 POST 请求")
			return
		}

		log.Println("🔄 [API] Full sync triggered...")
		resultData := map[string]interface{}{}

		// 1. 重载骨架
		if err := service.LoadSkeleton(); err != nil {
			log.Printf("⚠️ [API] Skeleton reload failed: %v", err)
			resultData["skeleton_error"] = err.Error()
		} else {
			body := service.GetSkeletonBody(false)
			if body != nil {
				resultData["artists"] = len(body.Artists)
			}
		}

		// 2. 重新扫描音乐目录
		count, lyricsCount, err := service.SyncMusic(musicDir, "", nil)
		if err != nil {
			log.Printf("⚠️ [API] Music sync failed: %v", err)
			resultData["music_error"] = err.Error()
		}
		resultData["new_songs"] = count
		resultData["new_lyrics"] = lyricsCount

		log.Printf("✅ [API] Full sync done: %d new songs, %d new lyrics mapped", count, lyricsCount)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    200,
			Message: "全量同步完成",
			Data:    resultData,
		})
	}
}

// AdminScrubHandler 一键清理曲库脏数据 (强制 POST)
func AdminScrubHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			sendError(w, http.StatusMethodNotAllowed, "仅支持 POST 请求")
			return
		}

		log.Println("🧹 [Admin] Scrubbing dirty ID-titles and redundant files...")

		// 1. 恢复：不再自动删除路径为空的条目，因为它们是用户补全的名录占位符
		// 仅清理标题明显异常的记录 (如 s_ 前缀但未对齐的)
		res, err := database.DB.Exec("DELETE FROM songs WHERE title LIKE 's_%' AND file_path IS NULL")
		scrubbed := int64(0)
		if err == nil {
			scrubbed, _ = res.RowsAffected()
		}

		// 3. [V12.97] 物理磁盘净化：剔除不在数据库中的冗余 s_ID 文件
		rows, err := database.DB.Query("SELECT file_path FROM songs WHERE file_path IS NOT NULL AND file_path != ''")
		validPaths := make(map[string]bool)
		if err == nil {
			for rows.Next() {
				var p string
				if err := rows.Scan(&p); err == nil {
					validPaths[filepath.ToSlash(p)] = true
				}
			}
			rows.Close()
		}

		purgedFiles := 0
		if service.MusicBaseDirGlobal != "" {
			err = filepath.Walk(service.MusicBaseDirGlobal, func(path string, info os.FileInfo, err error) error {
				if err != nil || info.IsDir() {
					return nil
				}
				fileName := info.Name()
				if strings.HasPrefix(fileName, "s_") && strings.HasSuffix(fileName, ".mp3") {
					rel, _ := filepath.Rel(service.MusicBaseDirGlobal, path)
					relSlash := filepath.ToSlash(rel)
					if !validPaths[relSlash] {
						log.Printf("🗑️  物理净化: 剔除冗余副本 %s", relSlash)
						_ = os.Remove(path)
						purgedFiles++
					}
				}
				return nil
			})
		}

		_ = service.LoadSkeleton()

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    200,
			Message: fmt.Sprintf("清理完成：剔除 %d 条记录，净化 %d 个物理文件。请全量同步。", scrubbed, purgedFiles),
			Data: map[string]interface{}{
				"database_scrubbed": scrubbed,
				"physical_purged":   purgedFiles,
			},
		})
	}
}

// GetWelcomeImagesHandler 获取欢迎页背景图列表 (从 storage/welcome_covers 读取)
func GetWelcomeImagesHandler(storageDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		imagesDir := filepath.Join(storageDir, "welcome_covers")

		// 确保目录存在
		if _, err := os.Stat(imagesDir); os.IsNotExist(err) {
			os.MkdirAll(imagesDir, 0755)
		}

		entries, err := os.ReadDir(imagesDir)
		if err != nil {
			sendError(w, http.StatusInternalServerError, "无法读取预览背景目录")
			return
		}

		var images []string
		for _, entry := range entries {
			if !entry.IsDir() {
				// 仅支持常见图片格式
				name := strings.ToLower(entry.Name())
				if strings.HasSuffix(name, ".png") || strings.HasSuffix(name, ".jpg") ||
					strings.HasSuffix(name, ".jpeg") || strings.HasSuffix(name, ".webp") ||
					strings.HasSuffix(name, ".gif") {
					images = append(images, entry.Name())
				}
			}
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    200,
			Message: "success",
			Data:    images,
		})
	}
}

// sendError 辅助函数：统一发送 JSON 错误响应
func sendError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(model.ApiResponse{
		Code:    statusCode,
		Message: message,
	})
}

// UpdateAlbumRequest 定义专辑更新的请求载荷结构
type UpdateAlbumRequest struct {
	ArtistName       string            `json:"artist_name"`     // (必填) 歌手名
	OldAlbumTitle    string            `json:"old_album_title"` // (必填) 原专辑名
	NewAlbumTitle    string            `json:"new_album_title"` // (选填) 新专辑名
	Tracks           map[string]string `json:"tracks"`          // (选填) "track_index": "new_title"
	AddMissingTracks []struct {
		Index int    `json:"index"`
		Title string `json:"title"`
	} `json:"add_missing_tracks"` // (选填) 追加的缺失曲目
}

// UpdateAlbumListHandler 通用接口：根据传参灵活修复或覆写特定专辑数据
func UpdateAlbumListHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			sendError(w, http.StatusMethodNotAllowed, "仅支持 POST 请求")
			return
		}

		var req UpdateAlbumRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			sendError(w, http.StatusBadRequest, "无法解析请求数据: "+err.Error())
			return
		}

		if req.ArtistName == "" || req.OldAlbumTitle == "" {
			sendError(w, http.StatusBadRequest, "artist_name 与 old_album_title 为必填项")
			return
		}

		log.Printf("🛠️ [Admin] 收到清洗请求：歌手 <%s> 专辑 <%s>...", req.ArtistName, req.OldAlbumTitle)

		tx, err := database.DB.Begin()
		if err != nil {
			sendError(w, http.StatusInternalServerError, "DB Transaction Error")
			return
		}
		defer tx.Rollback()

		// 1. 获取歌手 ID 与 目标专辑 ID
		var artistID int64
		_ = tx.QueryRow("SELECT id FROM artists WHERE name = ?", req.ArtistName).Scan(&artistID)
		if artistID == 0 {
			sendError(w, http.StatusNotFound, "未找到该歌手")
			return
		}

		var albumID int64
		_ = tx.QueryRow("SELECT id FROM albums WHERE artist_id = ? AND title = ? LIMIT 1", artistID, req.OldAlbumTitle).Scan(&albumID)
		if albumID == 0 {
			sendError(w, http.StatusNotFound, "在该歌手下未找到指定专辑")
			return
		}

		// 2. 更新专辑名名称 (如果提供)
		if req.NewAlbumTitle != "" && req.NewAlbumTitle != req.OldAlbumTitle {
			_, err = tx.Exec("UPDATE albums SET title = ? WHERE id = ?", req.NewAlbumTitle, albumID)
			if err != nil {
				sendError(w, http.StatusInternalServerError, "更新专辑名失败: "+err.Error())
				return
			}
			log.Printf("=> 专辑名已更新为: %s", req.NewAlbumTitle)
		}

		// 3. 覆盖已有音轨标题 (如果提供)
		if len(req.Tracks) > 0 {
			for idxStr, newTitle := range req.Tracks {
				var trackIdx int
				fmt.Sscanf(idxStr, "%d", &trackIdx)
				_, err := tx.Exec("UPDATE songs SET title = ? WHERE album_id = ? AND track_index = ?", newTitle, albumID, trackIdx)
				if err != nil {
					log.Printf("更新音轨 %d 失败: %v", trackIdx, err)
				}
			}
			log.Printf("=> 已更新 %d 首现有曲目", len(req.Tracks))
		}

		// 4. 追加缺失曲目 (如果提供)
		if len(req.AddMissingTracks) > 0 {
			for _, t := range req.AddMissingTracks {
				// 尝试插入空记录（只有壳没有物理文件）
				pathStr := ""
				lrcStr := ""
				_, err := tx.Exec(`
					INSERT INTO songs (album_id, artist_id, title, file_path, lrc_path, track_index) 
					VALUES (?, ?, ?, ?, ?, ?)
				`, albumID, artistID, t.Title, pathStr, lrcStr, t.Index)
				if err != nil {
					log.Printf("新增曲目 [%d] %s 失败: %v", t.Index, t.Title, err)
				}
			}
			log.Printf("=> 已强行追加 %d 首缺失曲目", len(req.AddMissingTracks))
		}

		tx.Commit()

		// 5. 重载后端缓存树使变更即可对外可见
		service.LoadSkeleton()

		json.NewEncoder(w).Encode(model.ApiResponse{
			Code:    200,
			Message: "强力重塑完成",
		})
	}
}

// GetRawLyricsHandler 读取 LRC 原始内容
func GetRawLyricsHandler(w http.ResponseWriter, r *http.Request) {
	relPath := r.URL.Query().Get("path")
	if relPath == "" {
		sendError(w, http.StatusBadRequest, "path is required")
		return
	}

	// 安全检查：防跨目录
	if strings.Contains(relPath, "..") {
		sendError(w, http.StatusForbidden, "invalid path")
		return
	}

	fullPath := filepath.Join(service.LyricsBaseDirGlobal, filepath.FromSlash(relPath))
	log.Printf("📥 [Lyrics] Reading raw (Attempt 1): %s (Full: %s)", relPath, fullPath)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		// 回退方案：尝试从音乐基准目录读取 (针对同级放置的 .lrc)
		log.Printf("⚠️ [Lyrics] Not found in lyrics dir, trying music dir...")
		musicFullPath := filepath.Join(service.MusicBaseDirGlobal, filepath.FromSlash(relPath))
		content, err = os.ReadFile(musicFullPath)
		if err != nil {
			log.Printf("❌ [Lyrics] Read failed from both locations: %v", err)
			sendError(w, http.StatusNotFound, "Lyric file not found")
			return
		}
		fullPath = musicFullPath // 面向日志记录
	}
	log.Printf("✅ [Lyrics] Successfully loaded: %s", fullPath)

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Write(content)
}

// UpdateLyricsHandler 更新 LRC 原始内容
func UpdateLyricsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Only POST supported")
		return
	}

	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Path == "" || strings.Contains(req.Path, "..") {
		sendError(w, http.StatusBadRequest, "invalid or missing path")
		return
	}

	// 探测文件：优先更新现有文件，无论它在 lyrics 还是 music 目录
	fullPath := filepath.Join(service.LyricsBaseDirGlobal, filepath.FromSlash(req.Path))
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		// 如果 lyrics 目录没有，检查 music 目录
		musicPath := filepath.Join(service.MusicBaseDirGlobal, filepath.FromSlash(req.Path))
		if _, errM := os.Stat(musicPath); errM == nil {
			log.Printf("📥 [Lyrics] Found existing file in music dir: %s", musicPath)
			fullPath = musicPath
		}
	}

	log.Printf("✅ [Lyrics] Updated successfully: %s", fullPath)

	// [New] 实时同步至 Cloudflare R2
	go func() {
		ctx := r.Context()
		s3 := s3client.GetClient()
		if s3 != nil {
			objectKey := filepath.ToSlash(filepath.Join("lyrics", filepath.ToSlash(req.Path)))
			// 读取刚刚写入的内容
			if f, err := os.Open(fullPath); err == nil {
				defer f.Close()
				if err := s3.UploadFile(ctx, objectKey, f, "text/plain; charset=utf-8"); err != nil {
					log.Printf("❌ [Lyrics] 同步 R2 失败: %v (key: %s)", err, objectKey)
				} else {
					log.Printf("✨ [Lyrics] 已实时同步至云端 R2: %s", objectKey)
				}
			}
		}
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.ApiResponse{Code: 200, Message: "Updated successfully"})
}
