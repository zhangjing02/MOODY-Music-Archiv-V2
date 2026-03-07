package handler

import (
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"moody-backend/pkg/s3client"
)

		// 1. 动态路由：根据 objectKey 反查数据库，确定该资源所在的桶
		ctx := r.Context()
		storageID := "primary" // 默认主仓库

		// 尝试从数据库获取该路径对应的 storage_id
		// 注意：objectKey 目前是 "music/歌手/专辑/s_ID.mp3" 或 "lyrics/..."
		// 数据库中存储的 file_path 是 "歌手/专辑/s_ID.mp3"
		dbPath := objectKey
		if strings.HasPrefix(objectKey, "music/") {
			dbPath = strings.TrimPrefix(objectKey, "music/")
		}

		var foundID string
		err := database.DB.QueryRowContext(ctx, "SELECT storage_id FROM songs WHERE file_path = ? OR lrc_path = ?", dbPath, dbPath).Scan(&foundID)
		if err == nil && foundID != "" {
			storageID = foundID
		}

		// 获取对应的 S3 客户端
		s3 := s3client.GetClientByName(storageID)

		exists, err := s3.Exists(ctx, objectKey)
		if err == nil && exists {
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
