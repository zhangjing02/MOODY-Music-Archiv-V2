package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"moody-backend/internal/database"
	"moody-backend/internal/handler"
	"moody-backend/internal/service"
	"moody-backend/pkg/s3client"
)

// main 是 MOODY 后台程序的入口点
func main() {
	// 1. 初始化核心路径：获取绝对路径以防 SQLite 找不到文件导致 14 错误
	wd, err := os.Getwd()
	if err != nil {
		log.Fatalf("无法获取当前工作目录: %v", err)
	}

	// 稳健的核心路径识别逻辑 (环境变量 > 自动探测)
	projectRoot := wd
	storageDir := ""
	dbPath := ""
	frontendDir := ""

	// [Step 1] 获取环境变量
	envStorage := os.Getenv("MOODY_STORAGE_PATH")
	envDB := os.Getenv("MOODY_DB_PATH")
	envFrontend := os.Getenv("MOODY_FRONTEND_PATH")

	// [Step 2] 探测项目根目录 (用于 fallback)
	tempRoot := wd
	for i := 0; i < 4; i++ {
		// 优先查找包含 storage 或 frontend 的目录
		if _, err := os.Stat(filepath.Join(tempRoot, "storage")); err == nil {
			projectRoot = tempRoot
			break
		}
		if _, err := os.Stat(filepath.Join(tempRoot, "frontend")); err == nil {
			projectRoot = tempRoot
			break
		}
		parent := filepath.Dir(tempRoot)
		if parent == tempRoot {
			break
		}
		tempRoot = parent
	}

	// [Step 3] 应用优先级逻辑
	if envStorage != "" {
		storageDir = envStorage
		log.Printf("🚀 [Path] Using MOODY_STORAGE_PATH: %s", storageDir)
	} else if _, err := os.Stat("/storage"); err == nil {
		storageDir = "/storage"
		log.Printf("🚀 [Path] Detected root-level /storage volume")
	} else {
		storageDir = filepath.Join(projectRoot, "storage")
	}

	if envFrontend != "" {
		frontendDir = envFrontend
		log.Printf("🚀 [Path] Using MOODY_FRONTEND_PATH: %s", frontendDir)
	} else {
		frontendDir = filepath.Join(projectRoot, "frontend")
	}

	if envDB != "" {
		dbPath = envDB
		log.Printf("🚀 [Path] Using MOODY_DB_PATH: %s", dbPath)
	} else {
		dbPath = filepath.Join(storageDir, "db", "moody.db")
	}

	musicDir := filepath.Join(storageDir, "music")

	// 输出路径信息
	fmt.Printf("项目根目录: %s\n", projectRoot)
	fmt.Printf("存储目录: %s\n", storageDir)
	fmt.Printf("前端目录: %s\n", frontendDir)
	fmt.Printf("数据库路径: %s\n", dbPath)

	// 确保数据库父目录存在
	os.MkdirAll(filepath.Dir(dbPath), 0755)

	// 2. 初始化数据库连接
	database.InitDB(dbPath)
	defer database.DB.Close()

	// 2.1 初始化骨架服务与迁移
	if err := service.InitSkeletonService(projectRoot); err != nil {
		log.Printf("⚠️ 骨架服务初始化失败: %v", err)
	}

	// [New] 2.2 Setup Cloudflare R2 / S3 Storage (Multi-Storage Support)
	// [CRITICAL FIX] 如果 R2 未配置，必须拒绝启动，否则上传会静默失败
	if err := s3client.InitMultiS3(); err != nil {
		log.Fatalf("❌ [CRITICAL] R2 初始化失败，上传功能将无法工作。请检查环境变量 R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME: %v", err)
	}
	log.Printf("✅ R2 存储客户端初始化成功")

	// 3. 注册 API 路由
	http.HandleFunc("/api/status", handler.StatusHandler)
	http.HandleFunc("/api/sync", handler.SyncHandler(musicDir))
	http.HandleFunc("/api/songs", handler.GetSongsHandler)
	http.HandleFunc("/api/search", handler.GetSearchHandler)
	http.HandleFunc("/api/skeleton", handler.GetSkeletonHandler)
	http.HandleFunc("/api/skeleton/reload", handler.SkeletonReloadHandler)
	http.HandleFunc("/api/metadata/sync", handler.SyncMetadataHandler)
	http.HandleFunc("/api/sync/full", handler.FullSyncHandler(musicDir))
	http.HandleFunc("/api/user/login", handler.UserLoginHandler)
	http.HandleFunc("/api/user/settings", handler.UserSettingsHandler)
	http.HandleFunc("/api/admin/scrub", handler.AdminScrubHandler())
	http.HandleFunc("/api/report-error", handler.ReportErrorHandler())
	http.HandleFunc("/api/admin/governance", handler.GovernanceHandler(musicDir))
	http.HandleFunc("/api/admin/album/update", handler.UpdateAlbumListHandler())
	http.HandleFunc("/api/lyrics/raw", handler.GetRawLyricsHandler)
	http.HandleFunc("/api/lyrics/update", handler.UpdateLyricsHandler)
	http.HandleFunc("/api/welcome-images", handler.GetWelcomeImagesHandler(storageDir))
	// [V2.3 Fix] 将所有 admin 路由也注册到 8080 主端口，解决 Claw Cloud 线上环境下只开放 8080 导致管理后台 API 全部 404 的问题
	http.HandleFunc("/api/admin/stats", handler.AdminStatsHandler)
	http.HandleFunc("/api/admin/upload", handler.AdminUploadHandler(musicDir))
	http.HandleFunc("/api/admin/cleanup-duplicates", handler.AdminCleanupDuplicatesHandler())
	http.HandleFunc("/api/admin/db/upload", handler.DBUploadHandler())
	http.HandleFunc("/api/admin/update-album", handler.AdminUpdateAlbumHandler())

	// 4. 静态资源服务与编码修正
	fileServer := http.FileServer(http.Dir(frontendDir))
	http.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ext := filepath.Ext(r.URL.Path)
		// 如果是 text 或 js/css 文件，设置 charset=utf-8
		if ext == ".html" || ext == ".js" || ext == ".css" || r.URL.Path == "/" {
			if ext == ".js" {
				w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
			} else if ext == ".css" {
				w.Header().Set("Content-Type", "text/css; charset=utf-8")
			} else {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
			}
		}
		fileServer.ServeHTTP(w, r)
	}))

	// [S3 Enabled] 存储代理服务：优先从 S3 获取，不存在则查找本地
	http.Handle("/storage/", http.StripPrefix("/storage/", handler.StorageProxyHandler(storageDir)))

	// 5. 启动自动扫描服务 (仅在启动时运行一次)
	go func() {
		log.Println("🔄 正在执行启动时全量扫描...")
		if count, lyricsCount, err := service.SyncMusic(musicDir, "", nil); err != nil {
			log.Printf("⚠️ 启动扫描失败: %v", err)
		} else {
			log.Printf("✅ 启动扫描完成，库中当前变动: %d 首音频, %d 首歌词", count, lyricsCount)
		}
	}()

	// 6. 配置网络端口并启动服务
	port := os.Getenv("MOODY_PORT")
	if port == "" {
		port = "8080"
	}
	if port[0] != ':' {
		port = ":" + port
	}

	fmt.Printf("🎵 MOODY 后台正在监听 %s\n", port)
	fmt.Printf("数据库路径: %s\n", dbPath)

	// 添加 CORS 中间件支持跨域调用
	corsHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 允许所有 Origin (生产环境可改为指定域名)
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// 处理 OPTIONS 预检请求
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		http.DefaultServeMux.ServeHTTP(w, r)
	})

	// 7. 配置平行独立的超管后台端口并启动 (8082)
	adminPort := os.Getenv("MOODY_ADMIN_PORT")
	if adminPort == "" {
		adminPort = "8082"
	}
	if adminPort[0] != ':' {
		adminPort = ":" + adminPort
	}

	adminMux := http.NewServeMux()

	// 管理后台静态页面专用路由
	adminFrontendDir := filepath.Join(frontendDir, "admin")
	// 如果 frontend/admin 还没建，可以不报错，只是服务静态页面会返回 404
	adminMux.Handle("/", http.FileServer(http.Dir(adminFrontendDir)))

	// 将原有的高权限运维 API 全部克隆注册过来
	adminMux.HandleFunc("/api/status", handler.StatusHandler) // 用于探活
	adminMux.HandleFunc("/api/admin/scrub", handler.AdminScrubHandler())
	adminMux.HandleFunc("/api/admin/governance", handler.GovernanceHandler(musicDir))
	adminMux.HandleFunc("/api/admin/album/update", handler.AdminUpdateAlbumHandler())
	adminMux.HandleFunc("/api/admin/cleanup-duplicates", handler.AdminCleanupDuplicatesHandler())
	adminMux.HandleFunc("/api/sync/full", handler.FullSyncHandler(musicDir))
	adminMux.HandleFunc("/api/admin/db/upload", handler.DBUploadHandler())

	// CMS 独占高级功能 API
	adminMux.HandleFunc("/api/admin/stats", handler.AdminStatsHandler)
	adminMux.HandleFunc("/api/admin/upload", handler.AdminUploadHandler(musicDir))

	adminCorsHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		adminMux.ServeHTTP(w, r)
	})

	go func() {
		fmt.Printf("🛡️ MOODY 管理后台已平行启动，监听 %s\n", adminPort)
		if err := http.ListenAndServe(adminPort, adminCorsHandler); err != nil {
			log.Printf("⚠️ 管理端口监听受限 (请检查端口配置): %v", err)
		}
	}()

	// 8. 启动主对外服务 (8080)
	log.Fatal(http.ListenAndServe(port, corsHandler))
}
