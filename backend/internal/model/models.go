package model

// User 代表系统用户模型
type User struct {
	ID         int    `json:"id"`
	Username   string `json:"username"`
	Password   string `json:"-"` // 密码在 JSON 中隐藏
	Level      int    `json:"level"`
	Role       string `json:"role"`
	AvatarURL  string `json:"avatar_url"`
	CreatedAt  string `json:"created_at"`
}

// Tag 代表系统的通用标签模型
type Tag struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	Category  string `json:"category"` // 例如: "Genre", "Mood", "Rank"
	CreatedAt string `json:"created_at"`
}

type Artist struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Region   string `json:"region"`
	Bio      string `json:"bio"`
	PhotoURL string `json:"photo_url"`
	Tags     []Tag  `json:"tags,omitempty"` // 关联的标签
}

// Album 代表音乐专辑模型
type Album struct {
	ID          int    `json:"id"`
	ArtistID    int    `json:"artist_id"`
	Title       string `json:"title"`
	ReleaseDate string `json:"release_date"`
	Genre       string `json:"genre"`
	CoverURL    string `json:"cover_url"`
	Tags        []Tag  `json:"tags,omitempty"` // 关联的标签
}

// Song 代表增强后的音乐档案模型
type Song struct {
	ID        int     `json:"id"`
	ArtistID  int     `json:"artist_id"`
	Album_ID  int     `json:"album_id"`
	Title     string  `json:"title"`
	Duration  int     `json:"duration"`
	FilePath  string  `json:"file_path"`
	LrcPath   string  `json:"lrc_path"`
	Format    string  `json:"format"`
	BitRate   int     `json:"bit_rate"`
	BPM       float64 `json:"bpm"`
	Mood      string  `json:"mood"`
	PlayCount int     `json:"play_count"`
	CreatedAt string  `json:"created_at"`
	Tags      []Tag   `json:"tags,omitempty"` // 关联的标签
}
