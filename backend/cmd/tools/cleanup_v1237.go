package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

type LibrarySong struct {
	Title string `json:"title"`
}

type LibraryAlbum struct {
	Title string        `json:"title"`
	Year  string        `json:"year"`
	Cover string        `json:"cover"`
	Songs []LibrarySong `json:"songs"`
}

type LibraryArtist struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Alias    []string       `json:"alias"`
	Category string         `json:"category"`
	Albums   []LibraryAlbum `json:"albums"`
}

type LibraryData struct {
	Artists []LibraryArtist `json:"artists"`
}

func getCoreName(name string) string {
	name = strings.Split(name, "(")[0]
	name = strings.Split(name, "（")[0]
	// 简繁映射表 (覆盖审计出的重点及常用艺人)
	mapping := map[string]string{
		"陳奕迅":  "陈奕迅",
		"張惠妹":  "张惠妹",
		"鄧紫棋":  "邓紫棋",
		"范曉萱":  "范晓萱",
		"林俊傑":  "林俊杰",
		"動力火車": "动力火车",
		"張靚穎":  "张靓颖",
		"飛兒乐团": "飞儿乐团",
		"飛兒樂團": "飞儿乐团",
		"费玉清":  "费_玉清",
		"費玉清":  "费_玉清",
	}
	res := strings.TrimSpace(name)
	if val, ok := mapping[res]; ok {
		res = val
	}
	// 移除所有标点符号
	res = strings.ReplaceAll(res, ".", "")
	res = strings.ReplaceAll(res, "-", "")
	res = strings.ReplaceAll(res, " ", "")

	return strings.ToLower(res)
}

func main() {
	fmt.Println("=== MOODY V12.37 物理层自动巡检与去重程序 ===")

	// 1. 数据库物理去重
	// 修正路径：从 backend 目录出发，回退一级进入根，再进入 storage
	dbPath := filepath.Join("..", "storage", "db", "moody.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("无法连接数据库: %v", err)
	}
	defer db.Close()

	// 查找重复的艺人名 (核心名匹配)
	rows, err := db.Query("SELECT id, name FROM artists")
	if err != nil {
		log.Fatal(err)
	}

	artistMap := make(map[string]int) // coreName -> id (keep first)
	var toDelete []int

	for rows.Next() {
		var name string
		var id int
		rows.Scan(&id, &name)
		core := getCoreName(name)
		if firstId, exists := artistMap[core]; exists {
			fmt.Printf("[DB] 发现重复: %s (当前ID: %d, 保留ID: %d)\n", name, id, firstId)
			toDelete = append(toDelete, id)
		} else {
			artistMap[core] = id
		}
	}
	rows.Close()

	if len(toDelete) > 0 {
		for _, id := range toDelete {
			db.Exec("DELETE FROM artists WHERE id = ?", id)
			db.Exec("DELETE FROM items WHERE artist_id = ?", id) //级联清理(假设模型)
			fmt.Printf("[DB] 已物理清理 ID: %d\n", id)
		}
	}

	// 2. skeleton.json 物理去重
	skeletonPath := filepath.Join("..", "storage", "metadata", "skeleton.json")
	data, err := ioutil.ReadFile(skeletonPath)
	if err == nil {
		var lib LibraryData
		json.Unmarshal(data, &lib)

		newArtists := []LibraryArtist{}
		seenCores := make(map[string]bool)

		for _, artist := range lib.Artists {
			core := getCoreName(artist.Name)
			if !seenCores[core] {
				seenCores[core] = true
				newArtists = append(newArtists, artist)
			} else {
				fmt.Printf("[JSON] 物理过滤重复项: %s\n", artist.Name)
			}
		}

		lib.Artists = newArtists
		newData, _ := json.MarshalIndent(lib, "", "  ")
		ioutil.WriteFile(skeletonPath, newData, 0644)
		fmt.Println("[JSON] 物理清洗完成。")
	}

	fmt.Println("=== V12.37 物理治理结束 ===")
}
