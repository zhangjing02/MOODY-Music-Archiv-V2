package main

import (
	"database/sql"
	"fmt"
	"log"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

func getCoreName(name string) string {
	name = strings.Split(name, "(")[0]
	name = strings.Split(name, "（")[0]
	// 简单的简繁对齐
	name = strings.ReplaceAll(name, "陳奕迅", "陈奕迅")
	name = strings.ReplaceAll(name, "張惠妹", "张惠妹")
	name = strings.ReplaceAll(name, "鄧紫棋", "邓紫棋")
	name = strings.ReplaceAll(name, "范曉萱", "范晓萱")
	return strings.ToLower(strings.TrimSpace(name))
}

func main() {
	// 修正路径：从 backend 目录出发，回退一级进入根，再进入 storage
	dbPath := filepath.Join("..", "storage", "db", "moody.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT id, name FROM artists")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	coreMap := make(map[string][]string)
	idMap := make(map[string][]int)
	for rows.Next() {
		var name string
		var id int
		if err := rows.Scan(&id, &name); err != nil {
			log.Fatal(err)
		}
		core := strings.ToLower(strings.TrimSpace(name))
		coreMap[core] = append(coreMap[core], name)
		idMap[core] = append(idMap[core], id)
	}

	fmt.Println("=== 数据库深度审计报告 (含 ID) ===")
	found := false
	for core, ids := range idMap {
		if len(ids) > 1 {
			found = true
			fmt.Printf("[重复] 核心名: %s -> IDs: %v\n", core, ids)
		}
	}

	if !found {
		fmt.Println("数据库艺人名称无重复。")
	}
}
