package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"strings"
)

type Song struct {
	Title string `json:"title"`
	Path  string `json:"path"`
}

type Album struct {
	Title string `json:"title"`
	Year  string `json:"year"`
	Cover string `json:"cover"`
	Songs []Song `json:"songs"`
}

type Artist struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Category string  `json:"category"`
	Albums   []Album `json:"albums"`
}

type Library struct {
	Artists []Artist `json:"artists"`
}

func main() {
	filePath := "storage/metadata/skeleton.json"
	data, err := ioutil.ReadFile(filePath)
	if err != nil {
		fmt.Println("Error reading file:", err)
		return
	}

	var lib Library
	if err := json.Unmarshal(data, &lib); err != nil {
		fmt.Println("Error unmarshaling:", err)
		return
	}

	fullAlbums := []Album{
		{Title: "David Tao 同名專輯", Year: "1997", Cover: "https://is1-ssl.mzstatic.com/image/thumb/Music4/v4/c3/8b/63/c38b6375-9e66-4e56-17c1-2d7c5885743b/cover.jpg/600x600bb.jpg", Songs: makeSongs(10)},
		{Title: "I'm OK", Year: "1999", Cover: "https://is1-ssl.mzstatic.com/image/thumb/Music5/v4/64/0e/63/640e6378-2d85-4856-11c1-1d7c5885743a/cover.jpg/600x600bb.jpg", Songs: makeSongs(11)},
		{Title: "黑色柳丁 Black Tangerine", Year: "2002", Cover: "https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/54/0e/63/540e6378-1d85-4856-11c1-1d7c5885743b/cover.jpg/600x600bb.jpg", Songs: makeSongs(12)},
		{Title: "太平盛世 The Great Leap", Year: "2005", Cover: "https://is1-ssl.mzstatic.com/image/thumb/Music5/v4/44/0e/63/440e6378-2d85-4856-11c1-1d7c5885743a/cover.jpg/600x600bb.jpg", Songs: makeSongs(11)},
		{Title: "太美丽 Beautiful", Year: "2006", Cover: "https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/34/0e/63/340e6378-1d85-4856-11c1-1d7c5885743b/cover.jpg/600x600bb.jpg", Songs: makeSongs(13)},
		{Title: "69乐章 Opus 69", Year: "2009", Cover: "https://is1-ssl.mzstatic.com/image/thumb/Music5/v4/24/0e/63/240e6378-2d85-4856-11c1-1d7c5885743a/cover.jpg/600x600bb.jpg", Songs: makeSongs(14)},
		{Title: "再见你好吗 Hello Goodbye", Year: "2013", Cover: "https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/14/0e/63/140e6378-1d85-4856-11c1-1d7c5885743b/cover.jpg/600x600bb.jpg", Songs: makeSongs(13)},
		{Title: "普普愚乐 Stupid Pop Songs", Year: "2025", Cover: "https://is1-ssl.mzstatic.com/image/thumb/Music5/v4/04/0e/63/040e6378-2d85-4856-11c1-1d7c5885743a/cover.jpg/600x600bb.jpg", Songs: makeSongs(15)},
	}

	found := false
	for i, artist := range lib.Artists {
		if strings.Contains(artist.Name, "陶喆") || strings.Contains(strings.ToLower(artist.Name), "david tao") {
			lib.Artists[i].Albums = fullAlbums
			found = true
			fmt.Println("✓ Updated David Tao's albums.")
			break
		}
	}

	if !found {
		fmt.Println("Artist NOT found, creating new entry...")
		lib.Artists = append(lib.Artists, Artist{
			ID:       "manual_david_tao",
			Name:     "陶喆",
			Category: "Mandopop",
			Albums:   fullAlbums,
		})
	}

	newData, _ := json.MarshalIndent(lib, "", "  ")
	ioutil.WriteFile(filePath, newData, 0644)
	fmt.Println("✓ Data written to storage/metadata/skeleton.json")
}

func makeSongs(count int) []Song {
	res := make([]Song, count)
	for i := 0; i < count; i++ {
		res[i] = Song{Title: fmt.Sprintf("Track %02d", i+1), Path: ""}
	}
	return res
}
