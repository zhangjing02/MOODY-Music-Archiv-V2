package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func main() {
	lyricsDir := filepath.Join("storage", "lyrics")

	filepath.Walk(lyricsDir, func(dirPath string, info os.FileInfo, err error) error {
		if err != nil || !info.IsDir() || dirPath == lyricsDir {
			return nil
		}
		// 只处理叶子目录（专辑目录）
		rel, _ := filepath.Rel(lyricsDir, dirPath)
		parts := strings.Split(filepath.ToSlash(rel), "/")
		if len(parts) < 2 {
			return nil
		}

		files, _ := os.ReadDir(dirPath)
		var lrcFiles []string
		for _, f := range files {
			if !f.IsDir() && strings.HasSuffix(f.Name(), ".lrc") && !strings.HasPrefix(f.Name(), "l_") {
				lrcFiles = append(lrcFiles, f.Name())
			}
		}
		sort.Strings(lrcFiles)

		for i, name := range lrcFiles {
			newName := fmt.Sprintf("%02d.lrc", i+1)
			oldPath := filepath.Join(dirPath, name)
			newPath := filepath.Join(dirPath, newName)
			if err := os.Rename(oldPath, newPath); err == nil {
				fmt.Printf("OK %s/%s -> %s\n", rel, name, newName)
			}
		}
		return filepath.SkipDir
	})
}
