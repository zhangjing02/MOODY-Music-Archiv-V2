package database

import (
	"database/sql"
	"log"

	_ "modernc.org/sqlite"
)

// DB 是全局数据库连接句柄，供其他包调用
var DB *sql.DB

// InitDB 初始化数据库连接并顺序执行所有建表 Migration
// dbPath: 数据库文件 (.db) 的物理存储路径
func InitDB(dbPath string) {
	var err error
	// 使用 modernc.org/sqlite 驱动打开连接
	DB, err = sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("无法连接数据库: %v", err)
	}

	// 执行所有建表语句
	createTables()
}

// createTables 包含所有专业版所需的表结构定义
func createTables() {
	tables := []string{
		// 1. 用户中心
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password TEXT NOT NULL,
			level INTEGER DEFAULT 1,
			role TEXT DEFAULT 'user',
			avatar_url TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,

		// 2. 用户个性化配置
		`CREATE TABLE IF NOT EXISTS user_settings (
			user_id INTEGER PRIMARY KEY,
			last_volume FLOAT DEFAULT 0.5,
			theme_mode TEXT DEFAULT 'dark',
			auto_play BOOLEAN DEFAULT 1,
			FOREIGN KEY(user_id) REFERENCES users(id)
		);`,

		// 3. 艺术家档案
		`CREATE TABLE IF NOT EXISTS artists (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			region TEXT,
			bio TEXT,
			photo_url TEXT
		);`,

		// 4. 专辑档案
		`CREATE TABLE IF NOT EXISTS albums (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			artist_id INTEGER,
			title TEXT NOT NULL,
			release_date TEXT,
			genre TEXT,
			cover_url TEXT,
			FOREIGN KEY(artist_id) REFERENCES artists(id)
		);`,

		// 5. 音乐档案 (增加元数据支持)
		`CREATE TABLE IF NOT EXISTS songs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			artist_id INTEGER,
			album_id INTEGER,
			title TEXT NOT NULL,
			duration INTEGER,
			file_path TEXT UNIQUE, -- 允许为空，作为“仅名录”标识
			lrc_path TEXT,
			track_index INTEGER DEFAULT 0, -- [New] 曲序索引
			format TEXT,
			bit_rate INTEGER,
			bpm FLOAT,
			mood TEXT,
			play_count INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(artist_id) REFERENCES artists(id),
			FOREIGN KEY(album_id) REFERENCES albums(id)
		);`,

		// 6. 用户收藏 (多对多关系)
		`CREATE TABLE IF NOT EXISTS favorites (
			user_id INTEGER,
			song_id INTEGER,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY(user_id, song_id),
			FOREIGN KEY(user_id) REFERENCES users(id),
			FOREIGN KEY(song_id) REFERENCES songs(id)
		);`,

		// 7. 播放历史
		`CREATE TABLE IF NOT EXISTS playback_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER,
			song_id INTEGER,
			played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id),
			FOREIGN KEY(song_id) REFERENCES songs(id)
		);`,

		// 8. 歌单
		`CREATE TABLE IF NOT EXISTS playlists (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER,
			name TEXT NOT NULL,
			cover_url TEXT,
			is_public BOOLEAN DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id)
		);`,

		// 9. 歌单与歌曲关联表
		`CREATE TABLE IF NOT EXISTS playlist_songs (
			playlist_id INTEGER,
			song_id INTEGER,
			sort_order INTEGER DEFAULT 0,
			PRIMARY KEY(playlist_id, song_id),
			FOREIGN KEY(playlist_id) REFERENCES playlists(id),
			FOREIGN KEY(song_id) REFERENCES songs(id)
		);`,

		// 10. 标签定义表
		`CREATE TABLE IF NOT EXISTS tags (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			category TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,

		// 11. 实体-标签关联表 (多态关联)
		`CREATE TABLE IF NOT EXISTS entity_tags (
			tag_id INTEGER,
			entity_type TEXT CHECK(entity_type IN ('artist', 'album', 'song')),
			entity_id INTEGER,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY(tag_id, entity_type, entity_id),
			FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
		);`,

		// 12. 客户端遥测错误表
		`CREATE TABLE IF NOT EXISTS client_errors (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			error_type TEXT NOT NULL,
			song_id INTEGER,
			message TEXT,
			occurrence_count INTEGER DEFAULT 1,
			last_reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(error_type, song_id, message)
		);`,
	}

	for _, sql := range tables {
		_, err := DB.Exec(sql)
		if err != nil {
			log.Printf("创建表失败: %v\nSQL: %s", err, sql)
		}
	}

	// 创建索引优化查询
	indices := []string{
		"CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);",
		"CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);",
		"CREATE INDEX IF NOT EXISTS idx_entity_tags_lookup ON entity_tags(entity_type, entity_id);", // 优化标签查询
	}

	for _, sql := range indices {
		_, err := DB.Exec(sql)
		if err != nil {
			log.Printf("创建索引失败: %v", err)
		}
	}

	// 自动迁移逻辑
	ensureMigrations()
}

	// 2. 检查 storage_id (多仓储预留)
	var count2 int
	err = DB.QueryRow("SELECT count(*) FROM pragma_table_info('songs') WHERE name='storage_id'").Scan(&count2)
	if err == nil && count2 == 0 {
		log.Println("⚡ 正在执行数据库迁移: 为 songs 表增加 storage_id 列...")
		_, err := DB.Exec("ALTER TABLE songs ADD COLUMN storage_id TEXT DEFAULT 'primary'")
		if err != nil {
			log.Printf("⚠️ 迁移失败: %v", err)
		}
	}
}
