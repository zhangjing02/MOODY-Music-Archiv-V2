package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"strings"
)

type Song struct {
	Title string `json:"title"`
}

type Album struct {
	Title string `json:"title"`
	Year  string `json:"year"`
	Songs []Song `json:"songs"`
}

type Artist struct {
	Name   string  `json:"name"`
	Albums []Album `json:"albums"`
}

type Library struct {
	Artists []Artist `json:"artists"`
}

func main() {
	data, err := ioutil.ReadFile("storage/metadata/skeleton.json")
	if err != nil {
		fmt.Println("Error reading file:", err)
		return
	}

	var lib Library
	if err := json.Unmarshal(data, &lib); err != nil {
		fmt.Println("Error unmarshaling:", err)
		return
	}

	target := "陶喆"
	found := false
	for _, artist := range lib.Artists {
		if strings.Contains(artist.Name, target) || strings.Contains(strings.ToLower(artist.Name), "david tao") {
			found = true
			fmt.Printf("=== 艺术家: %s ===\n", artist.Name)
			fmt.Printf("专辑总数: %d\n", len(artist.Albums))
			for i, album := range artist.Albums {
				fmt.Printf("[%02d] %s (%s) - %d tracks\n", i+1, album.Title, album.Year, len(album.Songs))
			}
		}
	}

	if !found {
		fmt.Println("未找到指定艺术家:", target)
	}
}
