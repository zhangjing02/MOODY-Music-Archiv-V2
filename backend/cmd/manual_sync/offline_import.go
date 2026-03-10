package main

import (
	"log"
	"os"
	"path/filepath"
	"moody-backend/internal/database"
	"moody-backend/internal/service"
	"moody-backend/pkg/s3client"
)

func main() {
	// 1. 初始化路径
	wd, _ := os.Getwd()
	dbPath := filepath.Join(wd, "storage", "db", "moody.db")

	log.Printf("🛠️ 开始脱机落库... DB: %s", dbPath)

	// 2. 初始化数据库
	database.InitDB(dbPath)
	defer database.DB.Close()

	// 3. 初始化 R2
	if err := s3client.InitMultiS3(); err != nil {
		log.Fatalf("S3 初始化失败: %v", err)
	}

	// 4. 执行同步
	log.Println("☁️ 正在执行 R2 全量同步 (source: primary)...")
	count, lrcCount, err := service.SyncMusicFromR2("primary", "")
	if err != nil {
		log.Fatalf("同步失败: %v", err)
	}

	log.Printf("✅ 入库成功！新增音频: %d, 关联歌词: %d", count, lrcCount)
}
