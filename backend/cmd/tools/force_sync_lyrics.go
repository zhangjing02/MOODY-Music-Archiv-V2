package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"moody-backend/internal/database"
)

func main() {
	// Paths based on the root directory
	projectRoot := `d:\PersonalProject\MoodyMusic`
	dbPath := filepath.Join(projectRoot, "storage", "db", "moody.db.bak")
	lyricsDir := filepath.Join(projectRoot, "storage", "lyrics")

	fmt.Printf("Connecting to database: %s\n", dbPath)
	database.InitDB(dbPath)
	defer database.DB.Close()

	updatedCount := 0

	err := filepath.Walk(lyricsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && strings.HasPrefix(info.Name(), "l_") && strings.HasSuffix(info.Name(), ".lrc") {
			filename := info.Name()
			idStr := filename[2 : len(filename)-4]
			var songID int64
			if _, err := fmt.Sscanf(idStr, "%d", &songID); err == nil {
				relPath, _ := filepath.Rel(lyricsDir, path)
				relPathUnix := filepath.ToSlash(relPath)

				var title, currentLrc string
				var currentLrcNull sql.NullString
				err = database.DB.QueryRow("SELECT title, lrc_path FROM songs WHERE id = ?", songID).Scan(&title, &currentLrcNull)
				if err == nil {
					currentLrc = currentLrcNull.String
					if currentLrc != relPathUnix {
						fmt.Printf("Updating song [%d] - %s: %s -> %s\n", songID, title, currentLrc, relPathUnix)
						_, err = database.DB.Exec("UPDATE songs SET lrc_path = ? WHERE id = ?", relPathUnix, songID)
						if err != nil {
							fmt.Printf("Failed to update song [%d]: %v\n", songID, err)
						} else {
							updatedCount++
						}
					}
				}
			}
		}
		return nil
	})

	if err != nil {
		log.Fatalf("Error walking lyrics directory: %v", err)
	}

	fmt.Printf("Successfully updated %d lyrics mappings in the database.\n", updatedCount)
}
