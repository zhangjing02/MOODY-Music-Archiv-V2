package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"moody-backend/internal/database"
)

// The Netease API Structs
type searchResponse struct {
	Code   int `json:"code"`
	Result struct {
		Songs []struct {
			Id int `json:"id"`
		} `json:"songs"`
	} `json:"result"`
}

type lyricResponse struct {
	Code int `json:"code"`
	Lrc  struct {
		Lyric string `json:"lyric"`
	} `json:"lrc"`
}

func searchSongID(keyword string) int {
	apiURL := fmt.Sprintf("http://music.163.com/api/search/get/web?csrf_token=hlpretag=&hlposttag=&s=%s&type=1&offset=0&total=true&limit=1", url.QueryEscape(keyword))

	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Referer", "https://music.163.com/")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		return 0
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var data searchResponse
	json.Unmarshal(body, &data)

	if data.Code == 200 && len(data.Result.Songs) > 0 {
		return data.Result.Songs[0].Id
	}
	return 0
}

func fetchLyric(songID int) string {
	apiURL := fmt.Sprintf("https://music.163.com/api/song/lyric?os=pc&id=%d&lv=-1&kv=-1&tv=-1", songID)

	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Referer", "https://music.163.com/")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		return ""
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var data lyricResponse
	json.Unmarshal(body, &data)

	if data.Code == 200 {
		return data.Lrc.Lyric
	}
	return ""
}

func main() {
	fmt.Println("🚀 Starting Auto LRC Downloader (Go Implementation)...")

	wd, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}

	projectRoot := wd
	for i := 0; i < 4; i++ {
		if _, err := os.Stat(filepath.Join(projectRoot, "storage")); err == nil {
			break
		}
		parent := filepath.Dir(projectRoot)
		if parent == projectRoot {
			break
		}
		projectRoot = parent
	}

	storageDir := filepath.Join(projectRoot, "storage")
	dbPath := filepath.Join(storageDir, "db", "moody.db.bak")
	lyricsMapDir := filepath.Join(storageDir, "lyrics")

	fmt.Printf("📂 DB Path: %s\n", dbPath)
	if _, err := os.Stat(dbPath); err != nil {
		fmt.Println("❌ Database not found!")
		os.Exit(1)
	}

	database.InitDB(dbPath)
	defer database.DB.Close()

	query := `
		SELECT s.id, s.title, s.file_path, s.lrc_path, a.name as artist
		FROM songs s
		LEFT JOIN artists a ON s.artist_id = a.id
		WHERE s.file_path IS NOT NULL AND s.file_path != ''
		ORDER BY a.name, s.id
	`

	rows, err := database.DB.Query(query)
	if err != nil {
		log.Fatalf("Query failed: %v", err)
	}
	defer rows.Close()

	type Song struct {
		ID       int
		Title    string
		FilePath string
		LrcPath  string
		Artist   string
	}

	var songs []Song
	for rows.Next() {
		var s Song

		var lrc sqlNullString
		var a sqlNullString
		rows.Scan(&s.ID, &s.Title, &s.FilePath, &lrc, &a)
		if lrc.valid {
			s.LrcPath = lrc.value
		}
		if a.valid {
			s.Artist = a.value
		}
		songs = append(songs, s)
	}

	successCount := 0
	skipCount := 0

	rePrefix := regexp.MustCompile(`^\d+\s*[-.]*\s*`)

	for i, s := range songs {
		relDir := filepath.Dir(s.FilePath)
		lrcNewName := fmt.Sprintf("l_%d.lrc", s.ID)
		lrcTargetDir := filepath.Join(lyricsMapDir, relDir)
		lrcTargetPath := filepath.Join(lrcTargetDir, lrcNewName)
		lrcRelPath := filepath.ToSlash(filepath.Join(relDir, lrcNewName))

		if info, err := os.Stat(lrcTargetPath); err == nil && info.Size() > 10 {
			if s.LrcPath != lrcRelPath {
				database.DB.Exec("UPDATE songs SET lrc_path = ? WHERE id = ?", lrcRelPath, s.ID)
			}
			fmt.Printf("[%d/%d] ⏭️  [SKIP] %s - %s (LRC exists)\n", i+1, len(songs), s.Artist, s.Title)
			skipCount++
			continue
		}

		fmt.Printf("[%d/%d] ⏳ [DOWNLOAD] %s - %s...\n", i+1, len(songs), s.Artist, s.Title)

		cleanTitle := rePrefix.ReplaceAllString(s.Title, "")
		keyword := fmt.Sprintf("%s %s", s.Artist, cleanTitle)

		netID := searchSongID(keyword)
		if netID == 0 {
			fmt.Println("    ❌ [FAIL] Cannot find song on Netease")
			continue
		}

		lyricsText := fetchLyric(netID)
		if strings.TrimSpace(lyricsText) != "" {
			os.MkdirAll(lrcTargetDir, 0755)

			if !strings.Contains(lyricsText, "[ti:") {
				lyricsText = fmt.Sprintf("[ti:%s]\n%s", s.Title, lyricsText)
			}

			err = os.WriteFile(lrcTargetPath, []byte(lyricsText), 0644)
			if err != nil {
				fmt.Printf("    ❌ [FAIL] Could not write file: %v\n", err)
				continue
			}

			database.DB.Exec("UPDATE songs SET lrc_path = ? WHERE id = ?", lrcRelPath, s.ID)

			contentsTxtPath := filepath.Join(lrcTargetDir, "_contents.txt")
			contentsLine := fmt.Sprintf("l_%d.lrc -> %s\n", s.ID, s.Title)

			var contents string
			contentsBytes, err := os.ReadFile(contentsTxtPath)
			if err == nil {
				contents = string(contentsBytes)
				if !strings.Contains(contents, strings.TrimSpace(contentsLine)) {
					f, _ := os.OpenFile(contentsTxtPath, os.O_APPEND|os.O_WRONLY, 0644)
					f.WriteString(contentsLine)
					f.Close()
				}
			} else {
				header := "MOODY 歌词物理 ID 映射表\n==========================\n"
				footer := "* 说明：请勿手动重命名 l_ID.lrc 文件，否则会导致数据库索引失效。\n"
				os.WriteFile(contentsTxtPath, []byte(header+contentsLine+footer), 0644)
			}

			fmt.Printf("    ✅ [SAVED] %s\n", lrcTargetPath)
			successCount++
		} else {
			fmt.Println("    ❌ [FAIL] No lyrics returned from API")
		}

		time.Sleep(time.Second) // Rate limit
	}

	fmt.Println(strings.Repeat("=", 50))
	fmt.Println("🎉 Process completed!")
	fmt.Printf("Total Songs: %d | Downloaded: %d | Skipped: %d\n", len(songs), successCount, skipCount)
	fmt.Println(strings.Repeat("=", 50))
}

type sqlNullString struct {
	value string
	valid bool
}

func (n *sqlNullString) Scan(value interface{}) error {
	if value == nil {
		n.value, n.valid = "", false
		return nil
	}
	n.valid = true
	switch v := value.(type) {
	case string:
		n.value = v
	case []byte:
		n.value = string(v)
	default:
		n.value = fmt.Sprintf("%v", value)
	}
	return nil
}
