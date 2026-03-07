package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
)

type Song struct {
	Title string `json:"title"`
	Path  string `json:"path"`
}

type Album struct {
	Title string `json:"title"`
	Year  string `json:"year"`
	Cover string `json:"cover"`
	Songs []Song `json:"songs"`
}

type Artist struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Category string  `json:"category"`
	Albums   []Album `json:"albums"`
}

type Library struct {
	Artists []Artist `json:"artists"`
}

func main() {
	musicRoot := "storage/music"
	skeletonPath := "storage/metadata/skeleton.json"

	// 1. 定义核心 20 位歌手及其完整录音室专辑 (简化版，仅列出核心作品)
	topArtists := []Artist{
		{
			Name: "周杰伦", Category: "Mandopop",
			Albums: []Album{
				{Title: "Jay", Year: "2000"}, {Title: "范特西", Year: "2001"}, {Title: "八度空间", Year: "2002"},
				{Title: "叶惠美", Year: "2003"}, {Title: "七里香", Year: "2004"}, {Title: "十一月的萧邦", Year: "2005"},
				{Title: "依然范特西", Year: "2006"}, {Title: "我很忙", Year: "2007"}, {Title: "魔杰座", Year: "2008"},
				{Title: "跨时代", Year: "2010"}, {Title: "惊叹号", Year: "2011"}, {Title: "十二新作", Year: "2012"},
				{Title: "哎呦，不错哦", Year: "2014"}, {Title: "周杰伦的床边故事", Year: "2016"}, {Title: "最伟大的作品", Year: "2022"},
			},
		},
		{
			Name: "陈奕迅", Category: "Mandopop",
			Albums: []Album{
				{Title: "U87", Year: "2005"}, {Title: "黑白灰", Year: "2003"}, {Title: "Special Thanks To...", Year: "2002"},
				{Title: "反正是我", Year: "2001"}, {Title: "怎么样", Year: "2005"}, {Title: "认了吧", Year: "2007"},
				{Title: "不想放手", Year: "2008"}, {Title: "上五楼的快活", Year: "2009"}, {Title: "Rice & Shine", Year: "2014"},
				{Title: "Getting Ready", Year: "2015"}, {Title: "L.O.V.E.", Year: "2018"}, {Title: "Chin Up!", Year: "2023"},
			},
		},
		{
			Name: "陶喆", Category: "Mandopop",
			Albums: []Album{
				{Title: "David Tao 同名專輯", Year: "1997"}, {Title: "I'm OK", Year: "1999"}, {Title: "黑色柳丁 Black Tangerine", Year: "2002"},
				{Title: "太平盛世 The Great Leap", Year: "2005"}, {Title: "太美丽 Beautiful", Year: "2006"}, {Title: "69乐章 Opus 69", Year: "2009"},
				{Title: "再见你好吗 Hello Goodbye", Year: "2013"}, {Title: "普普愚乐 Stupid Pop Songs", Year: "2025"},
			},
		},
		{
			Name: "王菲", Category: "Mandopop",
			Albums: []Album{
				{Title: "寓言", Year: "2000"}, {Title: "只爱陌生人", Year: "1999"}, {Title: "唱游", Year: "1998"},
				{Title: "王菲 2001", Year: "2001"}, {Title: "将爱", Year: "2003"}, {Title: "浮躁", Year: "1996"},
			},
		},
		{
			Name: "张学友", Category: "Mandopop",
			Albums: []Album{
				{Title: "吻别", Year: "1993"}, {Title: "真爱", Year: "1995"}, {Title: "忘记你我做不到", Year: "1996"},
				{Title: "想和你去吹吹风", Year: "1997"}, {Title: "在你身边", Year: "2007"},
			},
		},
		{
			Name: "林俊杰", Category: "Mandopop",
			Albums: []Album{
				{Title: "乐行者", Year: "2003"}, {Title: "第二天堂", Year: "2004"}, {Title: "编号89757", Year: "2005"},
				{Title: "曹操", Year: "2006"}, {Title: "西界", Year: "2007"}, {Title: "JJ陆", Year: "2008"},
				{Title: "她说", Year: "2010"}, {Title: "学不会", Year: "2011"}, {Title: "和自己对话", Year: "2015"},
				{Title: "幸存者", Year: "2020"}, {Title: "重拾_快乐", Year: "2023"},
			},
		},
		{
			Name: "邓紫棋", Category: "Mandopop",
			Albums: []Album{
				{Title: "Xposed", Year: "2012"}, {Title: "新的心跳", Year: "2015"}, {Title: "摩天动物园", Year: "2019"},
				{Title: "启示录", Year: "2022"},
			},
		},
		{
			Name: "李宗盛", Category: "Mandopop",
			Albums: []Album{
				{Title: "生命中的精灵", Year: "1986"}, {Title: "理性与感性作品音乐会", Year: "2007"},
			},
		},
		{
			Name: "罗大佑", Category: "Mandopop",
			Albums: []Album{
				{Title: "之乎者也", Year: "1982"}, {Title: "未来的主人翁", Year: "1983"}, {Title: "家", Year: "1984"},
			},
		},
		{
			Name: "Beyond", Category: "Mandopop",
			Albums: []Album{
				{Title: "秘密警察", Year: "1988"}, {Title: "真的爱你", Year: "1989"}, {Title: "命运派对", Year: "1990"},
				{Title: "犹豫", Year: "1991"}, {Title: "继续革命", Year: "1992"}, {Title: "乐与怒", Year: "1993"},
			},
		},
	}

	// 2. 读取现有 Skeleton
	data, _ := ioutil.ReadFile(skeletonPath)
	var lib Library
	json.Unmarshal(data, &lib)

	// 3. 循环处理
	for _, core := range topArtists {
		fmt.Printf("处理歌手: %s...\n", core.Name)
		artistDir := filepath.Join(musicRoot, core.Name)
		os.MkdirAll(artistDir, 0755)

		// 补全专辑
		for i, alb := range core.Albums {
			albumDir := filepath.Join(artistDir, alb.Title)
			os.MkdirAll(albumDir, 0755)

			// 注入一个空的 mp3 文件作为占位，确保文件夹不被 git 忽略且能被 backend 识别
			placeholder := filepath.Join(albumDir, "01. Placeholder.mp3")
			if _, err := os.Stat(placeholder); os.IsNotExist(err) {
				ioutil.WriteFile(placeholder, []byte{0}, 0644)
			}

			// 为元数据添加 10 首占位歌
			core.Albums[i].Songs = make([]Song, 10)
			for j := 0; j < 10; j++ {
				core.Albums[i].Songs[j] = Song{Title: fmt.Sprintf("Track %02d", j+1), Path: ""}
			}
			core.Albums[i].Cover = "src/assets/images/vinyl_default.png"
		}

		// 更新到 Skeleton (覆盖原有)
		found := false
		for i, existing := range lib.Artists {
			if existing.Name == core.Name {
				lib.Artists[i].Albums = core.Albums
				found = true
				break
			}
		}
		if !found {
			core.ID = fmt.Sprintf("manual_%s", core.Name)
			lib.Artists = append(lib.Artists, core)
		}
	}

	// 4. 保存 Skeleton
	newData, _ := json.MarshalIndent(lib, "", "  ")
	ioutil.WriteFile(skeletonPath, newData, 0644)
	fmt.Println("✓ 物理文件夹补全完成！")
	fmt.Println("✓ skeleton.json 元数据同步完成！")
}
