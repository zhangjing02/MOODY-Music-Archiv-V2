package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"path/filepath"
	"strings"
)

type LibrarySong struct {
	Title string `json:"title"`
}

type LibraryAlbum struct {
	Title string        `json:"title"`
	Year  string        `json:"year"`
	Songs []LibrarySong `json:"songs"`
}

type LibraryArtist struct {
	ID     string         `json:"id"`
	Name   string         `json:"name"`
	Alias  []string       `json:"alias"`
	Albums []LibraryAlbum `json:"albums"`
}

type LibraryData struct {
	Artists []LibraryArtist `json:"artists"`
}

func getCoreName(name string) string {
	name = strings.Split(name, "(")[0]
	name = strings.Split(name, "（")[0]
	// 简单的简繁对齐（手动处理反馈的典型案例）
	name = strings.ReplaceAll(name, "陳奕迅", "陈奕迅")
	name = strings.ReplaceAll(name, "張惠妹", "张惠妹")
	name = strings.ReplaceAll(name, "鄧紫棋", "邓紫棋")
	name = strings.ReplaceAll(name, "范曉萱", "范晓萱")
	return strings.ToLower(strings.TrimSpace(name))
}

func main() {
	path := filepath.Join("..", "storage", "metadata", "skeleton.json")
	data, err := ioutil.ReadFile(path)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	var lib LibraryData
	if err := json.Unmarshal(data, &lib); err != nil {
		fmt.Printf("JSON Error: %v\n", err)
		return
	}

	coreMap := make(map[string][]string) // CoreName -> []OriginalNames
	artistByCore := make(map[string][]LibraryArtist)

	for _, artist := range lib.Artists {
		core := getCoreName(artist.Name)
		coreMap[core] = append(coreMap[core], artist.Name)
		artistByCore[core] = append(artistByCore[core], artist)
	}

	fmt.Println("=== 深度审计结果: 重复条目报告 ===")
	foundDups := false
	for core, names := range coreMap {
		if len(names) > 1 {
			foundDups = true
			fmt.Printf("\n[重复] 核心名: %s\n", core)
			for i, artist := range artistByCore[core] {
				fmt.Printf("  条目 %d: %s (ID: %s) -> %d 张专辑\n", i+1, artist.Name, artist.ID, len(artist.Albums))
			}
		}
	}

	if !foundDups {
		fmt.Println("恭喜！未在 skeleton.json 中发现核心名冲突。")
	}
}
