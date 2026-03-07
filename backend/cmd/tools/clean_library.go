package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"path/filepath"
	"strings"
)

// LibrarySong 定义歌曲结构
type LibrarySong struct {
	Title string `json:"title"`
	Path  string `json:"path"`
}

// LibraryAlbum 定义专辑结构
type LibraryAlbum struct {
	Title string        `json:"title"`
	Year  string        `json:"year"`
	Cover string        `json:"cover"`
	Songs []LibrarySong `json:"songs"`
}

// LibraryArtist 定义艺人结构
type LibraryArtist struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Category string         `json:"category"`
	Albums   []LibraryAlbum `json:"albums"`
}

// LibraryData 定义总骨架结构
type LibraryData struct {
	Artists []LibraryArtist `json:"artists"`
}

func main() {
	path := filepath.Join("storage", "metadata", "skeleton.json")
	data, err := ioutil.ReadFile(path)
	if err != nil {
		fmt.Printf("无法读取文件: %v\n", err)
		return
	}

	var lib LibraryData
	if err := json.Unmarshal(data, &lib); err != nil {
		fmt.Printf("JSON 解析失败: %v\n", err)
		return
	}

	fmt.Printf("清洗前艺人总数: %d\n", len(lib.Artists))

	cleanArtists := []LibraryArtist{}
	droppedAlbums := 0
	droppedArtists := 0

	for _, artist := range lib.Artists {
		// 1. 物理移除 "未知艺术家"
		if strings.Contains(artist.Name, "未知艺术家") || strings.Contains(artist.Name, "Unknown Artist") {
			fmt.Printf("🔴 移除艺人: %s\n", artist.Name)
			droppedArtists++
			continue
		}

		cleanAlbums := []LibraryAlbum{}
		for _, album := range artist.Albums {
			// 策略 B: 严格清洗
			// 条件 1: 歌曲数 < 6
			if len(album.Songs) < 6 {
				// 白名单例外 (如 Eason 的某些经典 EP? 暂不加，严格执行)
				droppedAlbums++
				// fmt.Printf("  - 移除短专辑/单曲: %s (%d 首)\n", album.Title, len(album.Songs))
				continue
			}

			titleLower := strings.ToLower(album.Title)
			exclusionKeywords := []string{
				"single", " - ep", "(live)", "concert",
				"精选", "greatest hits", "best of", "collection",
				"原声", "原聲", "soundtrack", "ost",
				"电影", "电视剧", "剧", "movie", "tv",
				"综艺", "节目", "期", "season", "episode",
				"remix", "demo", "instrumental", "伴奏",
				"cover", "tribute", "compilation",
			}

			// 白名单: 某些经典专辑虽然带有 exclusion 关键词 (极少见但可能误伤)
			// 暂时保持严格，如有误伤后续单独加 AllowList

			shouldDrop := false
			for _, kw := range exclusionKeywords {
				if strings.Contains(titleLower, kw) {
					shouldDrop = true
					fmt.Printf("  - 移除特殊专辑 (Keyword: %s): %s\n", kw, album.Title)
					break
				}
			}

			if shouldDrop {
				droppedAlbums++
				continue
			}

			if len(album.Songs) < 6 {
				// 二次确认：如果没有排除关键词但曲数少，依然作为EP排除
				droppedAlbums++
				// fmt.Printf("  - 移除短专辑: %s (%d 首)\n", album.Title, len(album.Songs))
				continue
			}

			cleanAlbums = append(cleanAlbums, album)
		}

		artist.Albums = cleanAlbums
		// 只有当艺人还有专辑时才保留 (或者如果是手动添加的艺人)
		if len(artist.Albums) > 0 || !strings.HasPrefix(artist.ID, "cloud_") {
			cleanArtists = append(cleanArtists, artist)
		} else {
			fmt.Printf("🔴 移除空相册艺人: %s\n", artist.Name)
			droppedArtists++
		}
	}

	lib.Artists = cleanArtists
	newData, _ := json.MarshalIndent(lib, "", "  ")
	if err := ioutil.WriteFile(path, newData, 0644); err != nil {
		fmt.Printf("保存失败: %v\n", err)
		return
	}

	fmt.Printf("\n=== 清洗完成 ===\n")
	fmt.Printf("移除艺人: %d\n", droppedArtists)
	fmt.Printf("移除专辑: %d\n", droppedAlbums)
	fmt.Printf("剩余艺人: %d\n", len(lib.Artists))
}
