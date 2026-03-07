package handler

import (
	"encoding/json"
	"net/http"

	"moody-backend/internal/model"
)

// GetMockDataHandler 返回完整的Mock数据（用于开发和演示）
func GetMockDataHandler(w http.ResponseWriter, r *http.Request) {
	// 直接返回Mock数据数组
	mockData := getMockMusicLibrary()
	
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	encoder.Encode(mockData)
}

// getMockMusicLibrary 返回完整的Mock音乐库数据
func getMockMusicLibrary() []model.LibraryArtist {
	return []model.LibraryArtist{
		{
			ID:       "j1",
			Name:     "周杰伦",
			Group:    "J",
			Category: "华语",
			Avatar:   "src/assets/images/avatars/default.png",
			Albums: []model.LibraryAlbum{
				{
					Title: "Jay",
					Year:  "2000-11",
					Cover: "src/assets/images/jay_j1.jpg",
					Songs: []model.LibrarySong{
						{Title: "可爱女人"},
						{Title: "完美主义"},
						{Title: "星晴"},
						{Title: "娘子"},
						{Title: "斗牛"},
						{Title: "黑色幽默"},
						{Title: "伊斯坦堡"},
						{Title: "印第安老斑鸠"},
						{Title: "龙卷风"},
						{Title: "反方向的钟"},
					},
				},
				{
					Title: "范特西",
					Year:  "2001-09",
					Cover: "src/assets/images/jay_j2_fantasy.jpg",
					Songs: []model.LibrarySong{
						{Title: "爱在西元前"},
						{Title: "爸我回来了"},
						{Title: "简单爱"},
						{Title: "忍者"},
						{Title: "开不了口"},
						{Title: "上海一九四三"},
						{Title: "对不起"},
						{Title: "威廉古堡"},
						{Title: "双截棍"},
						{Title: "安静"},
					},
				},
			},
		},
		{
			ID:       "w1",
			Name:     "王菲",
			Group:    "W",
			Category: "华语",
			Avatar:   "src/assets/images/avatars/default.png",
			Albums: []model.LibraryAlbum{
				{
					Title: "天空",
					Year:  "1994-11",
					Cover: "src/assets/images/wangfei_sky.jpg",
					Songs: []model.LibrarySong{
						{Title: "天空"},
						{Title: "棋子"},
						{Title: "誓言"},
						{Title: "梦中人"},
					},
				},
			},
		},
		{
			ID:       "l1",
			Name:     "林俊杰",
			Group:    "L",
			Category: "华语",
			Avatar:   "src/assets/images/avatars/default.png",
			Albums: []model.LibraryAlbum{
				{
					Title: "江南",
					Year:  "2004-06",
					Cover: "src/assets/images/linjunjie_jiangnan.jpg",
					Songs: []model.LibrarySong{
						{Title: "江南"},
						{Title: "美人鱼"},
						{Title: "子弹列车"},
					},
				},
			},
		},
	}
}
