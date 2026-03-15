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

	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM artists").Scan(&count)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Artist Count: %d\n", count)
}
