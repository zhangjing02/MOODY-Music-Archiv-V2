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

// StorageProxyHandler 代理对 /storage/ 的请求，优先从 S3 (R2) 读取，不存在则回退至本地
func StorageProxyHandler(storageDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 去除路径开头的斜杠
		objectKey := strings.TrimPrefix(r.URL.Path, "/")

		// 1. 尝试从 S3 获取 (R2)
		ctx := r.Context()
		s3 := s3client.GetClient()

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
			log.Printf("⚠️ S3 下载对象失败 [%s]: %v", objectKey, err)
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
