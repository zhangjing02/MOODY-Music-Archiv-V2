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

	// 1. 修复 .jpgjpg 错误
	res1, err := db.Exec("UPDATE albums SET cover_url = REPLACE(cover_url, '.jpgjpg', '.jpg') WHERE cover_url LIKE '%.jpgjpg%'")
	if err != nil {
		log.Fatal(err)
	}
	n1, _ := res1.RowsAffected()
	fmt.Printf("Fixed %d records with '.jpgjpg' typo.\n", n1)

	// 2. 统一路径前缀：确保所有非 http 开头的 cover_url 都以 /storage/ 开头
	// 先处理已经有 storage 但没斜杠的情况（虽然不太可能有，但为了稳健）
	// 主要处理：covers/xxx -> /storage/covers/xxx
	res2, err := db.Exec(`
		UPDATE albums 
		SET cover_url = '/storage/' || cover_url 
		WHERE cover_url NOT LIKE 'http%' 
		  AND cover_url NOT LIKE '/storage/%'
		  AND cover_url != ''
	`)
	if err != nil {
		log.Fatal(err)
	}
	n2, _ := res2.RowsAffected()
	fmt.Printf("Updated %d records to have '/storage/' prefix.\n", n2)
}
