package service

import (
	"encoding/json"
	"fmt"
	"log"
	"moody-backend/internal/model"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const iTunesSearchURL = "https://itunes.apple.com/search"
const iTunesLookupURL = "https://itunes.apple.com/lookup"

// iTunesArtistResponse 搜索艺人的响应
type iTunesArtistResponse struct {
	ResultCount int `json:"resultCount"`
	Results     []struct {
		ArtistID         int    `json:"artistId"`
		ArtistName       string `json:"artistName"`
		PrimaryGenreName string `json:"primaryGenreName"`
	} `json:"results"`
}

// iTunesLookupResponse 查找专辑/歌曲的响应
type iTunesLookupResponse struct {
	ResultCount int `json:"resultCount"`
	Results     []struct {
		WrapperType    string `json:"wrapperType"`    // "artist", "collection", "track"
		CollectionType string `json:"collectionType"` // "Album"
		ArtistID       int    `json:"artistId"`
		ArtistName     string `json:"artistName"`
		CollectionID   int    `json:"collectionId"`
		CollectionName string `json:"collectionName"`
		ReleaseDate    string `json:"releaseDate"`
		ArtworkUrl100  string `json:"artworkUrl100"`
		TrackName      string `json:"trackName"`
		TrackNumber    int    `json:"trackNumber"`
		Kind           string `json:"kind"` // "song"
	} `json:"results"`
}

// [V15.5] iTunes 风格到 MOODY 分类映射表
var genreToRegionMap = map[string]string{
	"Cantopop":    "港台",
	"Mandopop":    "华语",
	"Rock":        "摇滚",
	"Pop":         "华语",
	"Traditional": "华语",
	"R&B/Soul":    "R&B",
	"Hip-Hop":     "华语", // 兜底
}

// FetchArtistMetadata 从 iTunes API 拉取完整的艺人名录 (深度穿透模式)
// targetRegion: 强制指定的 MOODY 分类 (如 "港台"), 为空则自动映射
// itunesCountry: iTunes 搜索区域 (如 "cn", "hk", "tw", "us"), 默认为 "cn"
func FetchArtistMetadata(artistName string, targetRegion string, itunesCountry string) (*model.LibraryArtist, error) {
	if itunesCountry == "" {
		itunesCountry = "cn"
	}

	// 1. 搜索艺人 ID
	artistID, officialName, genre, err := searchArtistID(artistName, itunesCountry)
	if err != nil {
		return nil, fmt.Errorf("搜索艺人失败: %w", err)
	}

	// 2. 确定分类
	finalRegion := targetRegion
	if finalRegion == "" {
		if r, ok := genreToRegionMap[genre]; ok {
			finalRegion = r
		} else {
			finalRegion = "华语" // 兜底
		}
	}

	// 2. 获取该艺人的全量专辑列表 (limit=200)
	albumLookupURL := fmt.Sprintf("%s?id=%d&entity=album&limit=200&country=%s&lang=zh_cn", iTunesLookupURL, artistID, itunesCountry)
	albumResp, err := http.Get(albumLookupURL)
	if err != nil {
		return nil, err
	}
	defer albumResp.Body.Close()

	var albumResult struct {
		Results []map[string]interface{} `json:"results"`
	}
	if err := json.NewDecoder(albumResp.Body).Decode(&albumResult); err != nil {
		return nil, err
	}

	artistData := &model.LibraryArtist{
		ID:       fmt.Sprintf("cloud_%d", artistID),
		Name:     officialName,
		Category: finalRegion,
		Albums:   []model.LibraryAlbum{},
	}

	albumMap := make(map[int]*model.LibraryAlbum) // collectionId -> Album
	var albumIDs []string

	// 处理专辑容器
	for _, item := range albumResult.Results {
		wrapper, _ := item["wrapperType"].(string)
		collection, _ := item["collectionType"].(string)
		if wrapper == "collection" && (collection == "Album" || collection == "Compilation") {
			idFloat, _ := item["collectionId"].(float64)
			id := int(idFloat)
			title, _ := item["collectionName"].(string)
			yearStr, _ := item["releaseDate"].(string)
			year := "未知"
			if len(yearStr) >= 4 {
				year = yearStr[:4]
			}
			cover, _ := item["artworkUrl100"].(string)
			if cover != "" {
				cover = strings.ReplaceAll(cover, "100x100bb", "600x600bb")
			}

			alb := &model.LibraryAlbum{
				Title: title,
				Year:  year,
				Cover: cover,
				Songs: []model.LibrarySong{},
			}
			albumMap[id] = alb
			albumIDs = append(albumIDs, fmt.Sprintf("%d", id))
		}
	}

	// 3. 深度穿透：分批获取这些专辑的所有曲目
	batchSize := 20
	for i := 0; i < len(albumIDs); i += batchSize {
		end := i + batchSize
		if end > len(albumIDs) {
			end = len(albumIDs)
		}
		batch := albumIDs[i:end]
		idsStr := strings.Join(batch, ",")

		// 曲目抓取尽量不设限或使用宽泛区域
		// [Fix] 无论哪个区域，都必须显式携带 country 参数，否则 iTunes 默认回退到美国区导致港台专辑查不到曲目
		trackLookupURL := fmt.Sprintf("%s?id=%s&entity=song&country=%s&lang=zh_cn", iTunesLookupURL, idsStr, itunesCountry)

		trackResp, err := http.Get(trackLookupURL)
		if err != nil {
			log.Printf("⚠️  批量获取曲目失败 (batch %d): %v", i, err)
			continue
		}

		var trackResult struct {
			Results []map[string]interface{} `json:"results"`
		}
		if err := json.NewDecoder(trackResp.Body).Decode(&trackResult); err != nil {
			log.Printf("⚠️  解析曲目结果失败: %v", err)
			trackResp.Body.Close()
			continue
		}
		trackResp.Body.Close()

		for _, item := range trackResult.Results {
			wrapper, _ := item["wrapperType"].(string)
			kind, _ := item["kind"].(string)
			if wrapper == "track" && kind == "song" {
				collIDFloat, _ := item["collectionId"].(float64)
				collID := int(collIDFloat)
				songTitle, _ := item["trackName"].(string)
				trackNumFloat, _ := item["trackNumber"].(float64)
				trackNum := int(trackNumFloat)

				if alb, ok := albumMap[collID]; ok {
					alb.Songs = append(alb.Songs, model.LibrarySong{
						Title:      songTitle,
						Path:       "",
						TrackIndex: trackNum,
					})
				}
			}
		}
	}

	// 4. 整合
	for _, alb := range albumMap {
		if len(alb.Songs) > 0 {
			artistData.Albums = append(artistData.Albums, *alb)
		}
	}

	sort.Slice(artistData.Albums, func(i, j int) bool {
		return artistData.Albums[i].Year > artistData.Albums[j].Year
	})

	return artistData, nil
}

func searchArtistID(name string, country string) (int, string, string, error) {
	searchURL := fmt.Sprintf("%s?term=%s&entity=musicArtist&limit=1&country=%s&lang=zh_cn", iTunesSearchURL, url.QueryEscape(name), country)

	client := http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(searchURL)
	if err != nil {
		return 0, "", "", err
	}
	defer resp.Body.Close()

	var searchResult iTunesArtistResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResult); err != nil {
		return 0, "", "", err
	}

	if searchResult.ResultCount == 0 {
		return 0, "", "", fmt.Errorf("未找到艺人: %s (in %s)", name, country)
	}

	return searchResult.Results[0].ArtistID, searchResult.Results[0].ArtistName, searchResult.Results[0].PrimaryGenreName, nil
}
