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

	// 组合后缀剔除
	name = strings.Split(name, " & China Blue")[0]
	name = strings.Split(name, " feat.")[0]

	// [V12.40] 全量映射表
	mapping := map[string]string{
		"陳奕迅":             "陈奕迅",
		"張惠妹":             "张惠妹",
		"鄧紫棋":             "邓紫棋",
		"范曉萱":             "范晓萱",
		"林俊傑":             "林俊杰",
		"動力火車":            "动力火车",
		"張靚穎":             "张靓颖",
		"飛兒乐团":            "飞儿乐团",
		"飛兒樂團":            "飞儿乐团",
		"费玉清":             "费玉清",
		"費玉清":             "费玉清",
		"顺子":              "顺子",
		"順子":              "顺子",
		"孙燕姿":             "孙燕姿",
		"孫燕姿":             "孙燕姿",
		"伍佰":              "伍佰",
		"五百":              "伍佰",
		"许嵩":              "许嵩",
		"許嵩":              "许嵩",
		"姜育恒":             "姜育恒",
		"姜育恆":             "姜育恒",
		"李圣杰":             "李圣杰",
		"李聖傑":             "李圣杰",
		"梁静茹":             "梁静茹",
		"梁靜茹":             "梁静茹",
		"罗大佑":             "罗大佑",
		"羅大佑":             "罗大佑",
		"南拳妈妈":            "南拳妈妈",
		"南拳媽媽":            "南拳妈妈",
		"黃品源":             "黄品源",
		"齊秦":              "齐秦",
		"齊豫":              "齐豫",
		"羽·泉":             "羽泉",
		"羽泉":              "羽泉",
		"伍佰 & China Blue": "伍佰",
		"伍佰&China Blue":   "伍佰",
	}
	res := strings.TrimSpace(name)
	if val, ok := mapping[res]; ok {
		res = val
	}
	// 移除所有标点符号及不可见字符 (含 · 和 \u00A0)
	symbols := []string{".", "-", "·", ",", "/", "!", "#", "$", "%", "^", "&", "*", ";", ":", "{", "}", "=", "_", "`", "~", "(", ")", "？", "。", "，", "、", "！", "—", " ", "\u200B", "\u200C", "\u200D", "\uFEFF", "\u00A0"}
	for _, s := range symbols {
		res = strings.ReplaceAll(res, s, "")
	}

	return strings.ToLower(res)
}

func main() {
	fmt.Println("=== MOODY V12.40 核弹级物理去重程序 (Deep Repair) ===")

	// 1. 数据库物理去重
	dbPath := filepath.Join("..", "storage", "db", "moody.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("无法连接数据库: %v", err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT id, name FROM artists")
	if err != nil {
		log.Fatal(err)
	}

	artistMap := make(map[string]int) // coreName -> id (keep first)
	var toDelete []int

	for rows.Next() {
		var name string
		var id int
		if err := rows.Scan(&id, &name); err != nil {
			continue
		}
		core := getCoreName(name)
		if firstId, exists := artistMap[core]; exists {
			fmt.Printf("[DB] 物理坍缩重复项: %s (当前ID: %d, 保留ID: %d)\n", name, id, firstId)
			toDelete = append(toDelete, id)
		} else {
			artistMap[core] = id
		}
	}
	rows.Close()

	if len(toDelete) > 0 {
		for _, id := range toDelete {
			db.Exec("DELETE FROM artists WHERE id = ?", id)
			db.Exec("DELETE FROM items WHERE artist_id = ?", id)
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
				fmt.Printf("[JSON] 物理过滤重复真身: %s\n", artist.Name)
			}
		}

		lib.Artists = newArtists
		newData, _ := json.MarshalIndent(lib, "", "  ")
		ioutil.WriteFile(skeletonPath, newData, 0644)
		fmt.Println("[JSON] 物理清洗完成。")
	}

	fmt.Println("=== V12.40 物理治理结束 ===")
}
