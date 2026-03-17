package model

// LibraryArtist 对应前端 MOCK_DB 中的艺术家对象
type LibraryArtist struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Alias      []string       `json:"alias,omitempty"`
	Group      string         `json:"group"`
	Category   string         `json:"category"`
	Avatar     string         `json:"avatar"`
	LocalCount int            `json:"localCount"` // [New] 本地歌曲计数
	AlbumCount int            `json:"albumCount"` // [New] 专辑总数
	Albums     []LibraryAlbum `json:"albums"`
}

// LibraryAlbum 对应前端 MOCK_DB 中的专辑对象
type LibraryAlbum struct {
	Title string        `json:"title"`
	Year  string        `json:"year"`
	Cover string        `json:"cover"`
	Songs []LibrarySong `json:"songs"`
}

// LibrarySong 歌曲元数据
type LibrarySong struct {
	Title      string `json:"title"`
	Path       string `json:"path"`
	LrcPath    string `json:"lrcPath"`
	TrackIndex int    `json:"trackIndex"` // [New] 曲序索引
}

// LibraryData 系统全量库数据包
type LibraryData struct {
	Artists []LibraryArtist `json:"artists"`
}

// ApiResponse 统一的 API 响应格式 (code, message, data)
type ApiResponse struct {
	Code    int         `json:"code"`    // 业务状态码 (200: 成功, 其他: 错误)
	Message string      `json:"message"` // 提示信息
	Data    interface{} `json:"data"`    // 实际业务数据
}

// GovernanceRequest 资产一键治理请求模型
type GovernanceRequest struct {
	Path    string   `json:"path"`    // 治理路径 (可选, 示例: "周杰伦/八度空间")
	Targets []string `json:"targets"` // 治理目标 (可选, 可包含 "music", "lyrics")
	Source  string   `json:"source"`  // 同步源 (可选, "local" 或 "r2")
}

// ReportErrorRequest 客户端遥测错误上报模型
type ReportErrorRequest struct {
	Type    string `json:"type"`    // 错误类型 (如: "audio", "lyric")
	SongID  int    `json:"songId"`  // 发生错误的歌曲 ID 或标识
	Message string `json:"message"` // 错误详细信息
}
// UpdateAlbumRequest 定义专辑更新的请求载荷结构 (用于管理后台纠偏)
type UpdateAlbumRequest struct {
	ArtistName       string            `json:"artist_name"`     // (必填) 歌手名
	OldAlbumTitle    string            `json:"old_album_title"` // (必填) 原专辑名
	NewAlbumTitle    string            `json:"new_album_title"` // (选填) 新专辑名
	Tracks           map[string]string `json:"tracks"`          // (选填) "track_index": "new_title"
	SpecificTracks   []struct {
		ID    int    `json:"id"`
		Title string `json:"title"`
	} `json:"specific_tracks"` // (选填) 直接基于 ID 的轨道修正
	AddMissingTracks []struct {
		Index int    `json:"index"`
		Title string `json:"title"`
	} `json:"add_missing_tracks"` // (选填) 追加的缺失曲目
}
