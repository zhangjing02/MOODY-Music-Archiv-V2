package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"moody-backend/internal/database"
)

func main() {
	wd, _ := os.Getwd()
	dbPath := filepath.Join(wd, "..", "storage", "db", "moody.db")

	database.InitDB(dbPath)
	defer database.DB.Close()

	rows, err := database.DB.Query("SELECT id, title, lrc_path FROM songs LIMIT 10")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int64
		var title string
		var lrcPath interface{}
		rows.Scan(&id, &title, &lrcPath)
		fmt.Printf("ID: %v | Title: %v | LRC: %v\n", id, title, lrcPath)
	}
}
