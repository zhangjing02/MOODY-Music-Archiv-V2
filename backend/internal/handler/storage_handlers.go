package handler

import (
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"moody-backend/internal/database"
	"moody-backend/pkg/s3client"
)

// StorageProxyHandler 实现流媒体资源代理，支持 R2 与本地兜底
func StorageProxyHandler(storageDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		objectKey := r.URL.Path // 此时 objectKey 是 "music/..." 或 "lyrics/..."

		// 1. 动态路由：根据 objectKey 反查数据库，确定该资源所在的桶
		ctx := r.Context()
		storageID := "primary" // 默认主仓库

		// 尝试从数据库获取该路径对应的 storage_id
		dbPath := objectKey
		if strings.HasPrefix(objectKey, "music/") {
			dbPath = strings.TrimPrefix(objectKey, "music/")
			var foundID string
			err := database.DB.QueryRowContext(ctx, "SELECT storage_id FROM songs WHERE file_path = ?", dbPath).Scan(&foundID)
			if err == nil && foundID != "" {
				storageID = foundID
			}
		} else if strings.HasPrefix(objectKey, "lyrics/") {
			dbPath = strings.TrimPrefix(objectKey, "lyrics/")
			var foundID string
			err := database.DB.QueryRowContext(ctx, "SELECT storage_id FROM songs WHERE lrc_path = ?", dbPath).Scan(&foundID)
			if err == nil && foundID != "" {
				storageID = foundID
			}
		} else if strings.HasPrefix(objectKey, "covers/") {
			dbPath = strings.TrimPrefix(objectKey, "covers/")
			// 封面路径在数据库中存储为 /storage/covers/xxx.jpg
			fullDbPath := "/storage/covers/" + dbPath
			var foundID string
			// 假设为 albums 也预留了 storage_id (如果库里没有，会 fallback 到 primary)
			err := database.DB.QueryRowContext(ctx, "SELECT storage_id FROM albums WHERE cover_url = ?", fullDbPath).Scan(&foundID)
			if err == nil && foundID != "" {
				storageID = foundID
			}
		}

		// 获取对应的 S3 客户端
		s3 := s3client.GetClientByName(storageID)
		if s3 != nil {
			exists, err := s3.Exists(ctx, objectKey)
			if err == nil && exists {
				// [Fix] 前端使用 fetch(url, {method: 'HEAD'}) 预检，服务端遇到 HEAD 时仅下发头信息
				if r.Method == http.MethodHead {
					w.Header().Set("Cache-Control", "public, max-age=31536000")
					// 不执行实际读取
					w.WriteHeader(http.StatusOK)
					return
				}

				body, contentType, err := s3.DownloadFile(ctx, objectKey)
				if err == nil {
					defer body.Close()
					w.Header().Set("Content-Type", contentType)
					// 设置缓存头
					w.Header().Set("Cache-Control", "public, max-age=31536000")

					// [Note] 简单代理不支持 Range 请求，音频拖动可能会受限。
					// 后续可引入更复杂的 Range 代理逻辑
					_, _ = io.Copy(w, body)
					return
				}
				log.Printf("⚠️ S3 下载对象失败 [%s] (StorageID: %s): %v", objectKey, storageID, err)
			}
		}

		// 2. 兜底回退：尝试从本地物理存储获取
		fullLocalPath := filepath.Join(storageDir, filepath.FromSlash(objectKey))
		if _, err := os.Stat(fullLocalPath); err == nil {
			http.ServeFile(w, r, fullLocalPath)
			return
		}

		// 3. 彻底不存在
		http.NotFound(w, r)
	}
}
