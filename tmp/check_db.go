package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

func main() {
	db, err := sql.Open("sqlite", "e:/Html-work/storage/db/moody.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// 1. 查找音频和歌词路径
	rows, err := db.Query("SELECT title, file_path, lrc_path, storage_id FROM songs WHERE file_path != '' LIMIT 10")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	fmt.Println("Songs with files:")
	for rows.Next() {
		var title, filePath, lrcPath, storageID sql.NullString
		if err := rows.Scan(&title, &filePath, &lrcPath, &storageID); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Title: %s, FilePath: %s, LrcPath: %s, StorageID: %s\n", title.String, filePath.String, lrcPath.String, storageID.String)
	}

	// 2. 查找描述和封面
	albumRows, err := db.Query("SELECT title, cover_url, storage_id FROM albums WHERE cover_url != '' LIMIT 10")
	if err != nil {
		log.Fatal(err)
	}
	defer albumRows.Close()

	fmt.Println("\nAlbums with covers:")
	for albumRows.Next() {
		var title, coverUrl, storageID sql.NullString
		if err := albumRows.Scan(&title, &coverUrl, &storageID); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Title: %s, CoverUrl: %s, StorageID: %s\n", title.String, coverUrl.String, storageID.String)
	}
}
