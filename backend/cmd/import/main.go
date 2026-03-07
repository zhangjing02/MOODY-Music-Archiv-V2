package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"moody-backend/internal/database"

	_ "modernc.org/sqlite"
)

func main() {
	// 获取项目根目录（当前目录的父目录）
	currentDir, _ := os.Getwd()
	projectRoot := filepath.Dir(currentDir)
	dbPath := filepath.Join(projectRoot, "storage", "db", "moody.db")

	fmt.Println("数据库路径:", dbPath)

	// 先初始化数据库（创建表）
	database.InitDB(dbPath)
	db := database.DB

	// 清空所有数据
	fmt.Println("清空现有数据...")
	_, err := db.Exec("DELETE FROM songs; DELETE FROM albums; DELETE FROM artists;")
	if err != nil {
		log.Fatal("清空数据失败:", err)
	}

	// 读取SQL文件
	sqlPath := filepath.Join(currentDir, "import_mock_data.sql")
	fmt.Println("SQL文件路径:", sqlPath)

	sqlContent, err := os.ReadFile(sqlPath)
	if err != nil {
		log.Fatal("读取SQL文件失败:", err)
	}

	fmt.Println("开始执行SQL导入...")

	// 执行SQL
	_, err = db.Exec(string(sqlContent))
	if err != nil {
		log.Fatal("执行SQL失败:", err)
	}

	fmt.Println("✓ 导入成功!")

	// 验证导入结果
	var artistCount, albumCount, songCount int
	db.QueryRow("SELECT COUNT(*) FROM artists").Scan(&artistCount)
	db.QueryRow("SELECT COUNT(*) FROM albums").Scan(&albumCount)
	db.QueryRow("SELECT COUNT(*) FROM songs").Scan(&songCount)

	fmt.Printf("  - %d 位艺术家\n", artistCount)
	fmt.Printf("  - %d 张专辑\n", albumCount)
	fmt.Printf("  - %d 首歌曲\n", songCount)
}
