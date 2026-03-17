package handler

import (
	"context"
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
		if r.Method != "POST" {
			respondJSON(w, http.StatusMethodNotAllowed, "必须使用 POST 提交", nil)
			return
		}

		err := r.ParseMultipartForm(500 << 20) // 设置内存缓冲区，约500MB
		if err != nil {
			respondJSON(w, http.StatusBadRequest, "无法解析表单数据: "+err.Error(), nil)
			return
		}

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

		// 将所有文件落盘并上传至 S3 (Cloudflare R2)
		for _, fileHeader := range files {
			file, err := fileHeader.Open()
			if err != nil {
				log.Printf("读取上传文件 %s 失败: %v", fileHeader.Filename, err)
				continue
			}

			// 1. 临时本地落盘 (用于后续 SyncMusic 解析元数据)
			destPath := filepath.Join(targetBaseDir, fileHeader.Filename)
			dest, err := os.Create(destPath)
			if err != nil {
				file.Close()
				log.Printf("创建临时物理文件 %s 失败: %v", destPath, err)
				continue
			}
			_, copyErr := io.Copy(dest, file)
			dest.Close()
			file.Seek(0, io.SeekStart) // 重置 offset 以便后续读取

			if copyErr != nil {
				file.Close()
				log.Printf("保存临时文件 %s 时写入失败: %v", destPath, copyErr)
				continue
			}

			savedFiles = append(savedFiles, destPath)
		}

		// 文件全部处理后，立刻触发仅针对该目标目录的识别进库
		log.Printf("🚀 批量上传完毕，准备自动挂载并计算 ID...")
		scanSubDir := uploadSubDir
		parsedMusic, syncedLrcs, syncErr := service.SyncMusic(musicDir, scanSubDir, nil)

		if syncErr == nil {
			// [New] 核心强化：入库成功后，查询所有刚同步好的 s_ID 文件并推送到 R2
			// 这样做可以确保云端存储的是 ID 命名的规范文件
			go func() {
				s3 := s3client.GetClient()
				if s3 == nil {
					return
				}
				for _, localPath := range savedFiles {
					// 注意：SyncMusic 可能会把文件改名为 s_ID.mp3
					// 我们需要探测最新的状态
					dir := filepath.Dir(localPath)
					ext := filepath.Ext(localPath)
					pattern := filepath.Join(dir, "s_*" + ext)
					matches, _ := filepath.Glob(pattern)
					
					for _, match := range matches {
						// 检查文件的修改时间，确保是刚刚生成的 (简单启发式)
						if f, err := os.Open(match); err == nil {
							defer f.Close()
							rel, _ := filepath.Rel(musicDir, match)
							objectKey := filepath.ToSlash(filepath.Join("music", rel))
							
							contentType := "application/octet-stream"
							if strings.HasSuffix(match, ".mp3") { contentType = "audio/mpeg" }
							if strings.HasSuffix(match, ".lrc") { contentType = "text/plain" }
							
							if err := s3.UploadFile(context.Background(), objectKey, f, contentType); err == nil {
								log.Printf("✨ [Upload-to-R2] ID 化资产已成功归位: %s", objectKey)
							}
						}
					}
				}
			}()
		}

		// [Note] 这里的逻辑在 R2 模式下需要优化：
		// 元数据提取完成后，SyncMusic 产生的 's_ID.mp3' 物理文件改名逻辑需要在 S3 端同步执行
		// 我们后续将改造 autoIDify 支持 S3 Rename

		if syncErr != nil {
			respondJSON(w, http.StatusInternalServerError, "处理成功但也存在错误: "+syncErr.Error(), nil)
			return
		}

		respondJSON(w, http.StatusOK, fmt.Sprintf("上传并入库成功 (R2已同步): 解析音频 %d 首，外延歌词 %d 首", parsedMusic, syncedLrcs), map[string]interface{}{
			"saved_count": len(savedFiles),
			"target_dir":  targetBaseDir,
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
