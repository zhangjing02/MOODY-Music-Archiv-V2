package main

import (
	"database/sql"
	"fmt"
	"log"
	_ "modernc.org/sqlite"
)

func main() {
	db, err := sql.Open("sqlite", `e:\Html-work\storage\db\moody.db`)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT title, cover_url FROM albums LIMIT 10")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	fmt.Println("Database Content Preview (Albums):")
	for rows.Next() {
		var title, coverUrl string
		if err := rows.Scan(&title, &coverUrl); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Title: %s | Cover: %s\n", title, coverUrl)
	}
}
