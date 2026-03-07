package main

import (
	"context"
	"crypto/md5"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"moody-backend/internal/database"
	"moody-backend/pkg/s3client"
)

// R2MigrationTool 负责将本地存储同步至 Cloudflare R2
// 逻辑：扫描指定目录 -> 检查 S3 是否存在 -> 下载本地文件 -> 上传至 S3 -> 校验 (可选) -> 更新 DB 
func main() {
	// 1. 加载配置 (与 main.go 保持一致)
	r2AccountId := os.Getenv("R2_ACCOUNT_ID")
	r2AccessKeyId := os.Getenv("R2_ACCESS_KEY_ID")
	r2SecretAccessKey := os.Getenv("R2_SECRET_ACCESS_KEY")
	r2BucketName := os.Getenv("R2_BUCKET_NAME")
	dbPath := os.Getenv("MOODY_DB_PATH")
	storageDir := os.Getenv("MOODY_STORAGE_PATH")

	if r2AccountId == "" || r2AccessKeyId == "" || r2SecretAccessKey == "" || r2BucketName == "" {
		log.Fatal("❌ 错误: 必须设置 R2 (ACCOUNT_ID, ACCESS_KEY, SECRET_KEY, BUCKET_NAME) 环境变量")
	}

	if storageDir == "" {
		cwd, _ := os.Getwd()
		storageDir = filepath.Join(cwd, "storage")
		log.Printf("ℹ️ 未设置 MOODY_STORAGE_PATH，使用默认: %s", storageDir)
	}

	if dbPath == "" {
		dbPath = filepath.Join(storageDir, "db", "moody.db")
		log.Printf("ℹ️ 未设置 MOODY_DB_PATH，使用默认: %s", dbPath)
	}

	// 2. 初始化资源
	database.InitDB(dbPath)
	if err := s3client.InitS3(r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2BucketName); err != nil {
		log.Fatalf("❌ S3 客户端初始化失败: %v", err)
	}

	client := s3client.GetClient()
	ctx := context.Background()

	// 3. 执行同步任务
	log.Println("🚀 开始执行 R2 全量资产搬家任务...")
	
	musicDir := filepath.Join(storageDir, "music")
	lyricsDir := filepath.Join(storageDir, "lyrics")

	syncCount := 0
	skipCount := 0
	errCount := 0

	// 同步函数
	syncWorker := func(baseDir string, prefix string) error {
		return filepath.Walk(baseDir, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}

			// 排除干扰文件
			if info.Name() == "_contents.txt" || info.Name() == ".DS_Store" {
				return nil
			}

			relPath, _ := filepath.Rel(baseDir, path)
			objectKey := filepath.ToSlash(filepath.Join(prefix, relPath))

			// A. 检查 R2 是否已存在
			exists, _ := client.Exists(ctx, objectKey)
			if exists {
				log.Printf("⏭️ [Skip] %s 已存在于 R2", objectKey)
				skipCount++
				return nil
			}

			// B. 执行上传
			log.Printf("📤 [Uploading] %s -> R2:%s", info.Name(), objectKey)
			f, err := os.Open(path)
			if err != nil {
				log.Printf("❌ 无法打开本地文件 %s: %v", path, err)
				errCount++
				return nil
			}
			defer f.Close()

			contentType := "application/octet-stream"
			ext := strings.ToLower(filepath.Ext(path))
			switch ext {
			case ".mp3": contentType = "audio/mpeg"
			case ".flac": contentType = "audio/flac"
			case ".lrc": contentType = "text/plain"
			case ".jpg", ".jpeg": contentType = "image/jpeg"
			case ".png": contentType = "image/png"
			}

			start := time.Now()
			err = client.UploadFile(ctx, objectKey, f, contentType)
			if err != nil {
				log.Printf("❌ 上传失败 %s: %v", objectKey, err)
				errCount++
				return nil
			}
			
			duration := time.Since(start)
			throughput := float64(info.Size()) / duration.Seconds() / 1024 / 1024
			log.Printf("✅ [Success] %s (%d bytes) 已上传, 速度: %.2f MB/s", objectKey, info.Size(), throughput)
			syncCount++
			return nil
		})
	}

	// 执行音乐目录同步
	if _, err := os.Stat(musicDir); err == nil {
		log.Println("--- 同步音频资产 ---")
		syncWorker(musicDir, "music")
	}

	// 执行歌词目录同步
	if _, err := os.Stat(lyricsDir); err == nil {
		log.Println("--- 同步歌词资产 ---")
		syncWorker(lyricsDir, "lyrics")
	}

	log.Printf("\n🏁 搬家任务结束!")
	log.Printf("📦 总计同步: %d | ⏭️ 跳过: %d | ❌ 错误: %d", syncCount, skipCount, errCount)
}

func calculateMD5(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := md5.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return fmt.Sprintf("%x", h.Sum(nil)), nil
}
