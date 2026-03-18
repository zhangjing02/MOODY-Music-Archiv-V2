package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"moody-backend/internal/database"
	"moody-backend/internal/model"
	"moody-backend/internal/service"
	"moody-backend/pkg/s3client"
)

// SongMetadata 用于同步到 Worker D1 的歌曲元数据结构
type SongMetadata struct {
	Title      string `json:"title"`
	ArtistName string `json:"artist_name"`
	AlbumTitle string `json:"album_title"`
	FilePath   string `json:"file_path"`
	LrcPath    string `json:"lrc_path,omitempty"`
	TrackIndex *int   `json:"track_index,omitempty"`
}

// syncToWorkerD1 将上传的歌曲元数据同步到 Cloudflare Worker D1
func syncToWorkerD1(songs []SongMetadata) error {
	workerEndpoint := os.Getenv("WORKER_ENDPOINT")
	if workerEndpoint == "" {
		workerEndpoint = "https://moody-worker.changgepd.workers.dev"
	}

	url := fmt.Sprintf("%s/api/admin/songs/create-full", workerEndpoint)

	payload := map[string][]SongMetadata{
		"songs": songs,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("JSON 序列化失败: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("请求 Worker API 失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Worker API 返回错误 %d: %s", resp.StatusCode, string(body))
	}

	log.Printf("✅ [D1-Sync] 成功同步 %d 首歌曲到 Worker D1", len(songs))
	return nil
}

// respondJSON 封装统一响应
func respondJSON(w http.ResponseWriter, statusCode int, message string, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	response := map[string]interface{}{
		"code":    statusCode,
		"message": message,
	}
	if data != nil {
		response["data"] = data
	}
	json.NewEncoder(w).Encode(response)
}

// AdminStatsHandler 负责提供大盘数据概览
func AdminStatsHandler(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("🔥 [Panic] AdminStatsHandler: %v", r)
			respondJSON(w, http.StatusInternalServerError, "服务器内部发生严重错误 (Panic)", nil)
		}
	}()

	if r.Method != "GET" {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var totalArtists, totalAlbums, totalTracks int
	database.DB.QueryRow("SELECT COUNT(*) FROM artists").Scan(&totalArtists)
	database.DB.QueryRow("SELECT COUNT(*) FROM albums").Scan(&totalAlbums)
	database.DB.QueryRow("SELECT COUNT(*) FROM songs").Scan(&totalTracks)

	respondJSON(w, http.StatusOK, "大盘数据获取成功", map[string]int{
		"artists": totalArtists,
		"albums":  totalAlbums,
		"tracks":  totalTracks,
	})
}

// AdminUploadHandler 负责处理超级上传中心的表单及文件落盘
func AdminUploadHandler(musicDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		reqID := fmt.Sprintf("UP_%d", time.Now().UnixNano()%10000)
		log.Printf("📥 [%s] 开始处理上传请求: RemoteAddr=%s, ContentLength=%d", reqID, r.RemoteAddr, r.ContentLength)

		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("🔥 [%s] [Panic] AdminUploadHandler: %v", reqID, rec)
				respondJSON(w, http.StatusInternalServerError, "文件处理过程中发生严重错误 (Panic)", nil)
			}
		}()

		if r.Method != "POST" {
			respondJSON(w, http.StatusMethodNotAllowed, "必须使用 POST 提交", nil)
			return
		}

		log.Printf("⏳ [%s] 正在解析 MultipartForm (Limit: 500MB)...", reqID)
		startTime := time.Now()
		err := r.ParseMultipartForm(500 << 20) 
		if err != nil {
			log.Printf("❌ [%s] 解析表单失败 (耗时 %v): %v", reqID, time.Since(startTime), err)
			respondJSON(w, http.StatusBadRequest, "无法解析表单数据: "+err.Error(), nil)
			return
		}
		log.Printf("✅ [%s] 表单解析成功 (耗时 %v)", reqID, time.Since(startTime))

		// 解析强制定向路径参数
		artistOverride := strings.TrimSpace(r.FormValue("artistOverride"))
		albumOverride := strings.TrimSpace(r.FormValue("albumOverride"))

		var uploadSubDir string

		// 根据指定的参数确定物理落盘位置
		// 1. 如果既填了歌手又填了专辑 -> 直接存入对应多级目录
		if artistOverride != "" && albumOverride != "" {
			uploadSubDir = filepath.Join(artistOverride, albumOverride)
		} else if artistOverride != "" {
			// 2. 如果只填了歌手 -> 存入歌手单层，后期再靠自身标签或后续修正分子专
			uploadSubDir = filepath.Join(artistOverride, "Unknown Album")
		} else {
			// 3. 没填 -> 先放入一个临时接收文件夹，等 SyncMusic 自行凭借 ID3Tag 进行大挪移
			uploadSubDir = "Uploaded_Queue"
		}

		// [V2.2 Fix] 统一路径分隔符，确保在 Windows 环境下也能通过目录段识别歌手/专辑
		uploadSubDir = filepath.ToSlash(uploadSubDir)
		targetBaseDir := filepath.Join(musicDir, uploadSubDir)
		if err := os.MkdirAll(targetBaseDir, 0755); err != nil {
			respondJSON(w, http.StatusInternalServerError, "创建落盘目录失败: "+err.Error(), nil)
			return
		}

		files := r.MultipartForm.File["files"]
		if len(files) == 0 {
			respondJSON(w, http.StatusBadRequest, "未检测到上传的文件", nil)
			return
		}

		var savedFiles []string

		log.Printf("💾 [%s] 准备落盘 %d 个文件...", reqID, len(files))
		for i, fileHeader := range files {
			fStart := time.Now()
			file, err := fileHeader.Open()
			if err != nil {
				log.Printf("❌ [%s] [%d] 读取上传文件 %s 失败: %v", reqID, i, fileHeader.Filename, err)
				continue
			}

			destPath := filepath.Join(targetBaseDir, fileHeader.Filename)
			dest, err := os.Create(destPath)
			if err != nil {
				file.Close()
				log.Printf("❌ [%s] [%d] 创建物理文件失败: %s, err: %v", reqID, i, destPath, err)
				continue
			}
			n, copyErr := io.Copy(dest, file)
			dest.Close()
			file.Seek(0, io.SeekStart) 

			if copyErr != nil {
				file.Close()
				log.Printf("❌ [%s] [%d] 写入物理文件失败: %s, err: %v", reqID, i, destPath, copyErr)
				continue
			}
			log.Printf("📄 [%s] [%d] 落盘成功: %s (%d bytes, 耗时 %v)", reqID, i, fileHeader.Filename, n, time.Since(fStart))
			savedFiles = append(savedFiles, destPath)
		}

		if len(savedFiles) == 0 {
			respondJSON(w, http.StatusInternalServerError, "文件落盘全部失败，请检查后端磁盘空间或目录权限", nil)
			return
		}

		// 文件全部处理后，立刻触发仅针对该目标目录的识别进库
		log.Printf("🚀 [%s] 批量上传完毕，准备自动挂载并计算 ID...", reqID)
		scanSubDir := uploadSubDir
		parsedMusic, syncedLrcs, syncErr := service.SyncMusic(musicDir, scanSubDir, nil)

		// [CRITICAL FIX] R2 上传状态跟踪
		r2UploadStatus := "unknown"
		r2UploadCount := 0
		r2UploadErrors := 0

		// [NEW] D1 同步状态跟踪
		d1SyncStatus := "skipped"
		var d1SyncErr error

		if syncErr == nil {
			// [New] 核心强化：入库成功后，查询所有刚同步好的 s_ID 文件并推送到 R2
			// 这样做可以确保云端存储的是 ID 命名的规范文件
			log.Printf("📤 [%s] 开始上传文件到 R2...", reqID)

			s3 := s3client.GetClient()
			if s3 == nil {
				// [CRITICAL] 如果 R2 客户端未初始化，记录严重错误
				log.Printf("❌ [%s] [CRITICAL] R2 客户端未初始化！文件未上传到云端，前端将无法播放。请检查 R2 环境变量配置。", reqID)
				r2UploadStatus = "failed"
			} else {
				// 同步上传（不使用 goroutine），确保所有文件都上传完成
				for _, localPath := range savedFiles {
					// 注意：SyncMusic 可能会把文件改名为 s_ID.mp3
					// 我们需要探测最新的状态
					dir := filepath.Dir(localPath)
					ext := filepath.Ext(localPath)
					pattern := filepath.Join(dir, "s_*" + ext)
					matches, _ := filepath.Glob(pattern)

					if len(matches) == 0 {
						// 如果没有找到 s_* 文件，尝试上传原始文件
						matches = []string{localPath}
					}

					for _, match := range matches {
						if f, err := os.Open(match); err == nil {
							defer f.Close()
							rel, _ := filepath.Rel(musicDir, match)
							objectKey := filepath.ToSlash(filepath.Join("music", rel))

							contentType := "application/octet-stream"
							if strings.HasSuffix(match, ".mp3") { contentType = "audio/mpeg" }
							if strings.HasSuffix(match, ".lrc") { contentType = "text/plain" }

							if err := s3.UploadFile(context.Background(), objectKey, f, contentType); err == nil {
								log.Printf("✨ [%s] [Upload-to-R2] 成功: %s", reqID, objectKey)
								r2UploadCount++
							} else {
								log.Printf("❌ [%s] [Upload-to-R2] 失败: %s, 错误: %v", reqID, objectKey, err)
								r2UploadErrors++
							}
						}
					}
				}

				if r2UploadErrors == 0 {
					r2UploadStatus = "success"
				} else {
					r2UploadStatus = "partial"
				}

				// [NEW] R2 上传成功后，同步元数据到 Cloudflare D1
				if r2UploadStatus == "success" {
					log.Printf("🌐 [%s] 开始同步元数据到 Cloudflare Worker D1...", reqID)
					d1SyncStatus = "attempting"

					// 提取所有 MP3 文件的元数据
					var songsToSync []SongMetadata
					for _, localPath := range savedFiles {
						if filepath.Ext(localPath) == ".mp3" {
							// 读取 MP3 元数据
							if meta, err := service.ExtractMetadata(localPath, musicDir); err == nil {
								rel, _ := filepath.Rel(musicDir, localPath)
								rel = filepath.ToSlash(rel)

								// 检查是否被重命名为 s_ID.mp3
								dir := filepath.Dir(localPath)
								ext := filepath.Ext(localPath)
								pattern := filepath.Join(dir, "s_*" + ext)
								if matches, _ := filepath.Glob(pattern); len(matches) > 0 {
									// 使用重命名后的文件
									relNew, _ := filepath.Rel(musicDir, matches[0])
									rel = filepath.ToSlash(relNew)
								}

								songsToSync = append(songsToSync, SongMetadata{
									Title:      meta.Title,
									ArtistName: meta.Artist,
									AlbumTitle: meta.Album,
									FilePath:   rel,
									LrcPath:    "",
									TrackIndex: &meta.TrackIndex,
								})
							}
						}
					}

					if len(songsToSync) > 0 {
						d1SyncErr = syncToWorkerD1(songsToSync)
						if d1SyncErr != nil {
							d1SyncStatus = "failed"
							log.Printf("❌ [%s] [D1-Sync] 失败: %v", reqID, d1SyncErr)
						} else {
							d1SyncStatus = "success"
						}
					} else {
						d1SyncStatus = "no_data"
						log.Printf("⚠️ [%s] [D1-Sync] 没有找到需要同步的歌曲元数据", reqID)
					}
				}
			}
		} else {
			r2UploadStatus = "skipped"
			log.Printf("⚠️ [%s] SyncMusic 失败，跳过 R2 上传和 D1 同步: %v", reqID, syncErr)
		}

		// [Note] 这里的逻辑在 R2 模式下需要优化：
		// 元数据提取完成后，SyncMusic 产生的 's_ID.mp3' 物理文件改名逻辑需要在 S3 端同步执行
		// 我们后续将改造 autoIDify 支持 S3 Rename

		if syncErr != nil {
			respondJSON(w, http.StatusInternalServerError, "处理成功但也存在错误: "+syncErr.Error(), nil)
			return
		}

		// [FIX] 在响应中包含 R2 上传和 D1 同步状态
		responseMsg := fmt.Sprintf("上传并入库成功 (解析音频 %d 首，外延歌词 %d 首)", parsedMusic, syncedLrcs)

		// R2 状态
		if r2UploadStatus == "success" {
			responseMsg += fmt.Sprintf(", R2 上传成功 %d 个文件", r2UploadCount)
		} else if r2UploadStatus == "failed" {
			responseMsg += ", ❌ R2 上传失败（前端将无法播放）"
		} else if r2UploadStatus == "partial" {
			responseMsg += fmt.Sprintf(", ⚠️ R2 部分上传失败（成功: %d, 失败: %d）", r2UploadCount, r2UploadErrors)
		}

		// D1 同步状态
		if d1SyncStatus == "success" {
			responseMsg += ", ✅ D1 数据同步成功（前端可立即查看）"
		} else if d1SyncStatus == "failed" {
			responseMsg += fmt.Sprintf(", ⚠️ D1 同步失败: %v（前端可能无法查看）", d1SyncErr)
		} else if d1SyncStatus == "skipped" {
			responseMsg += ", ⚠️ D1 同步已跳过（R2 上传未成功）"
		}

		respondJSON(w, http.StatusOK, responseMsg, map[string]interface{}{
			"saved_count":    len(savedFiles),
			"target_dir":     targetBaseDir,
			"r2_status":      r2UploadStatus,
			"r2_uploaded":    r2UploadCount,
			"r2_errors":      r2UploadErrors,
			"d1_status":      d1SyncStatus,
		})
	}
}

// AdminUpdateAlbumHandler 处理专辑与曲目的深度修正 (迁移并增强自 handlers.go)
func AdminUpdateAlbumHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			respondJSON(w, http.StatusMethodNotAllowed, "Only POST supported", nil)
			return
		}

		var req model.UpdateAlbumRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondJSON(w, http.StatusBadRequest, "无法解析请求数据: "+err.Error(), nil)
			return
		}

		if req.ArtistName == "" || req.OldAlbumTitle == "" {
			respondJSON(w, http.StatusBadRequest, "artist_name 与 old_album_title 为必填项", nil)
			return
		}

		// [New] 特殊路径：如果指定了 ADMIN_OVERRIDE，跳过专辑查找，仅处理 SpecificTracks
		if req.ArtistName == "ADMIN_OVERRIDE" {
			tx, err := database.DB.Begin()
			if err != nil {
				respondJSON(w, http.StatusInternalServerError, "DB Transaction Error", nil)
				return
			}
			defer tx.Rollback()

			if len(req.SpecificTracks) > 0 {
				for _, st := range req.SpecificTracks {
					if st.ID > 0 && st.Title != "" {
						_, err := tx.Exec("UPDATE songs SET title = ? WHERE id = ?", st.Title, st.ID)
						if err != nil {
							log.Printf("更新歌曲 ID %d 失败: %v", st.ID, err)
						}
					}
				}
			}
			tx.Commit()
			service.LoadSkeleton()
			respondJSON(w, http.StatusOK, "曲目名已通过强力模式覆盖", nil)
			return
		}

		log.Printf("🛠️ [Admin] 收到清洗请求：歌手 <%s> 专辑 <%s>...", req.ArtistName, req.OldAlbumTitle)

		tx, err := database.DB.Begin()
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, "DB Transaction Error", nil)
			return
		}
		defer tx.Rollback()

		// 1. 获取歌手 ID
		var artistID int64
		_ = tx.QueryRow("SELECT id FROM artists WHERE name = ?", req.ArtistName).Scan(&artistID)
		if artistID == 0 {
			respondJSON(w, http.StatusNotFound, "未找到该歌手", nil)
			return
		}

		// 2. 获取目标专辑 ID
		var albumID int64
		_ = tx.QueryRow("SELECT id FROM albums WHERE artist_id = ? AND title = ? LIMIT 1", artistID, req.OldAlbumTitle).Scan(&albumID)
		if albumID == 0 {
			respondJSON(w, http.StatusNotFound, "在该歌手下未找到指定专辑", nil)
			return
		}

		// 3. 更新专辑名称
		if req.NewAlbumTitle != "" && req.NewAlbumTitle != req.OldAlbumTitle {
			_, err = tx.Exec("UPDATE albums SET title = ? WHERE id = ?", req.NewAlbumTitle, albumID)
			if err != nil {
				respondJSON(w, http.StatusInternalServerError, "更新专辑名失败: "+err.Error(), nil)
				return
			}
		}

		// 4. 处理曲目更新
		if len(req.Tracks) > 0 {
			for idxStr, newTitle := range req.Tracks {
				var trackIdx int
				fmt.Sscanf(idxStr, "%d", &trackIdx)
				_, err := tx.Exec("UPDATE songs SET title = ? WHERE album_id = ? AND track_index = ?", newTitle, albumID, trackIdx)
				if err != nil {
					log.Printf("更新音轨 %d 失败: %v", trackIdx, err)
				}
			}
		}

		// 5. 处理曲目直接更新 (通过 song_id)
		if len(req.SpecificTracks) > 0 {
			for _, st := range req.SpecificTracks {
				if st.ID > 0 && st.Title != "" {
					_, err := tx.Exec("UPDATE songs SET title = ? WHERE id = ?", st.Title, st.ID)
					if err != nil {
						log.Printf("更新歌曲 ID %d 失败: %v", st.ID, err)
					}
				}
			}
		}

		tx.Commit()
		service.LoadSkeleton()

		respondJSON(w, http.StatusOK, "数据修正成功", nil)
	}
}

// AdminCleanupDuplicatesHandler 处理重复名录清理
func AdminCleanupDuplicatesHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			respondJSON(w, http.StatusMethodNotAllowed, "Only POST supported", nil)
			return
		}

		mergedArtists := service.DeduplicateArtists()
		mergedAlbums := service.DeduplicateAlbums()
		service.LoadSkeleton()

		respondJSON(w, http.StatusOK, "冗余清理完成", map[string]int{
			"merged_artists": mergedArtists,
			"merged_albums":  mergedAlbums,
		})
	}
}

// RespondJSON 已在 handlers.go 定义，无需重复声明，同包即可调用。但需防重。
// 如果编译因 RespondJSON multiple defined 报错，需检查。此处直接调用即可。
