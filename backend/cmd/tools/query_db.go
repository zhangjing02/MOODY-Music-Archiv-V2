package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/mattn/go-sqlite3"
)

func main() {
	db, err := sql.Open("sqlite3", "../../storage/db/moody.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	fmt.Println("=== Artists ===")
	rows, _ := db.Query("SELECT id, name FROM artists WHERE name LIKE '%李宗盛%'")
	for rows.Next() {
		var id int
		var name string
		rows.Scan(&id, &name)
		fmt.Printf("{id: %d, name: %s}\n", id, name)
	}

	fmt.Println("\n=== Albums ===")
	albumIDs := []int{}
	rows2, _ := db.Query("SELECT id, title FROM albums WHERE title LIKE '%生命中的精%'")
	for rows2.Next() {
		var id int
		var title string
		rows2.Scan(&id, &title)
		fmt.Printf("{id: %d, title: %s}\n", id, title)
		albumIDs = append(albumIDs, id)
	}

	fmt.Println("\n=== Songs ===")
	for _, aId := range albumIDs {
		fmt.Printf("Album %d:\n", aId)
		rows3, _ := db.Query("SELECT id, title, file_path, track_index FROM songs WHERE album_id = ?", aId)
		for rows3.Next() {
			var id int
			var title, filePath string
			var trackIndex sql.NullInt64
			rows3.Scan(&id, &title, &filePath, &trackIndex)
			fmt.Printf("{id: %d, title: %s, file_path: %s, track_index: %v}\n", id, title, filePath, trackIndex)
		}
	}
}
