package service

import (
	"context"
	"database/sql"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"strings"

	"moody-backend/internal/database"
	"moody-backend/pkg/s3client"

	"github.com/dhowden/tag"
)

// MusicBaseDirGlobal & LyricsBaseDirGlobal 导出供全局资产治理使用
var MusicBaseDirGlobal string
var LyricsBaseDirGlobal string

// SyncMusic 扫描指定目录并将音频文件及其元数据同步至数据库 (V1.1)
// subPath 可选，用于定向刷新特定的歌手或专辑目录 (例如 "周杰伦/范特西")
// targets 可选，明确同步目标 (如 ["music", "lyrics"])
func SyncMusic(musicBaseDir string, subPath string, targets []string) (int, int, error) {
	// 默认处理所有
	processMusic := true
	processLyrics := true
	if len(targets) > 0 {
		processMusic = false
		processLyrics = false
		for _, t := range targets {
			if t == "music" {
				processMusic = true
			}
			if t == "lyrics" {
				processLyrics = true
			}
		}
	}

	MusicBaseDirGlobal = musicBaseDir
	// 衍生歌词基目录 (假设与 music 平级在 storage 下)
	LyricsBaseDirGlobal = filepath.Join(filepath.Dir(musicBaseDir), "lyrics")
	targetDir := musicBaseDir
	if subPath != "" {
		targetDir = filepath.Join(musicBaseDir, subPath)
	}

	if _, err := os.Stat(targetDir); os.IsNotExist(err) {
		if subPath == "" {
			os.MkdirAll(targetDir, 0755)
		} else {
			return 0, 0, fmt.Errorf("指定的同步路径不存在: %s", subPath)
		}
	}

	newCount := 0
	err := filepath.Walk(targetDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && IsAudioFile(path) {
			log.Printf("🔍 扫描到文件: %s", path)
			// 1. 提取元数据 (传入根目录以支持路径自匹配)
			meta, err := ExtractMetadata(path, musicBaseDir)
			if err != nil {
				log.Printf("解析元数据失败 %s: %v", path, err)
				// 降级处理：仅使用文件名为标题
				meta = &MusicMetadata{
					Title:  strings.TrimSuffix(info.Name(), filepath.Ext(info.Name())),
					Artist: "未知艺术家",
					Album:  "未知专辑",
				}
			}

			// 2. 获取相对路径作为文件标识 (始终相对于根目录)
			relPath, _ := filepath.Rel(musicBaseDir, path)
			// 统一使用正斜杠，防止 Windows 路径在 Web 端出现播放异常
			relPath = filepath.ToSlash(relPath)

			// 3. 寻找同名歌词文件 (.lrc)
			lrcPath := ""
			// a. 优先探测同目录下的同名 .lrc (针对新扫描入库的文件)
			lrcPotential := strings.TrimSuffix(path, filepath.Ext(path)) + ".lrc"
			if _, err := os.Stat(lrcPotential); err == nil {
				lrcUrl, _ := filepath.Rel(musicBaseDir, lrcPotential)
				lrcPath = filepath.ToSlash(lrcUrl)
			} else {
				// b. 备选：探测结构化 lyrics 目录下的 l_ID.lrc (针对已治理过的文件)
				if strings.HasPrefix(filepath.Base(path), "s_") {
					idStr := strings.TrimPrefix(strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)), "s_")
					lrcStructuredPath := filepath.Join(LyricsBaseDirGlobal, filepath.Dir(relPath), "l_"+idStr+".lrc")
					if _, err := os.Stat(lrcStructuredPath); err == nil {
						lrcRel, _ := filepath.Rel(LyricsBaseDirGlobal, lrcStructuredPath)
						lrcPath = filepath.ToSlash(lrcRel)
					}
				}
			}

			// 4. 处理数据库持久化 (如果只处理歌词且不属于 ID 化范畴，这里实际上会跳过，但通常两者是联动的)
			if processMusic {
				songID, isNew, err := SaveToLibrary(meta, relPath, lrcPath)
				if err != nil {
					log.Printf("保存歌曲失败 %s: %v", relPath, err)
					return nil
				}
				if isNew {
					newCount++
					_ = songID
				}
			} else if processLyrics && lrcPath != "" {
				// 如果仅处理歌词，这里可以做一些单独的逻辑，但当前架构下歌词挂载依赖于歌曲 ID
				log.Printf("ℹ️  仅处理歌词挂载逻辑触发: %s", lrcPath)
			}
		}
		return nil
	})

	// 5. 歌词目录单独索引处理 (如果仅同步歌词或全量同步)
	lyricsCount := 0
	if processLyrics {
		lrcTarget := LyricsBaseDirGlobal
		if subPath != "" {
			lrcTarget = filepath.Join(LyricsBaseDirGlobal, subPath)
		}
		if _, err := os.Stat(lrcTarget); err == nil {
			// 预先读取 _contents.txt
			contentsMap := make(map[string]string)
			contentsPath := filepath.Join(lrcTarget, "_contents.txt")
			if data, err := os.ReadFile(contentsPath); err == nil {
				lines := strings.Split(string(data), "\n")
				for _, line := range lines {
					line = strings.TrimSpace(line)
					if line == "" {
						continue
					}
					parts := strings.SplitN(line, " -> ", 2)
					if len(parts) == 2 {
						contentsMap[parts[0]] = parts[1] // filename -> title
					}
				}
			}

			// 从路径中提取默认的歌手和专辑（防止跨服游荡）
			relTarget, _ := filepath.Rel(LyricsBaseDirGlobal, lrcTarget)
			pathParts := strings.Split(filepath.ToSlash(relTarget), "/")
			var targetArtist, targetAlbum string
			if len(pathParts) >= 2 {
				targetArtist = pathParts[0]
				targetAlbum = strings.Join(pathParts[1:], "/")
			}

			// [New] 主动巡回 lyrics 目录进行孤儿词源的强行绑定
			filepath.Walk(lrcTarget, func(path string, info os.FileInfo, err error) error {
				if err != nil || info.IsDir() || !strings.HasSuffix(info.Name(), ".lrc") {
					return nil
				}
				if info.Name() == "_contents.txt" {
					return nil
				}

				filename := info.Name()
				relPath, _ := filepath.Rel(LyricsBaseDirGlobal, path)
				relPathUnix := filepath.ToSlash(relPath)

				var songID int64
				foundMatchedSong := false
				isIDNamed := strings.HasPrefix(filename, "l_")

				if isIDNamed {
					// ===== ID 命名的歌词文件（l_XXXX.lrc）=====

					// 策略1：从 _contents.txt 查标题
					if realTitle, ok := contentsMap[filename]; ok {
						query := `
							SELECT songs.id FROM songs 
							JOIN albums ON songs.album_id = albums.id 
							JOIN artists ON albums.artist_id = artists.id 
							WHERE songs.title = ? AND albums.title LIKE ? AND artists.name LIKE ?
							LIMIT 1`
						if database.DB.QueryRow(query, realTitle, "%"+targetAlbum+"%", "%"+targetArtist+"%").Scan(&songID) == nil {
							foundMatchedSong = true
							correctFilename := fmt.Sprintf("l_%d.lrc", songID)
							if filename != correctFilename {
								newPath := filepath.Join(filepath.Dir(path), correctFilename)
								if renameErr := os.Rename(path, newPath); renameErr == nil {
									log.Printf("🛠️ [Lyrics Re-Anchor] 重命名: %s -> %s", filename, correctFilename)
									relPathUnix = filepath.ToSlash(filepath.Join(filepath.Dir(relPathUnix), correctFilename))
								}
							}
						}
					}

					// 策略2：直接用文件名中的 ID 查找（需验证 ID 真实存在）
					if !foundMatchedSong {
						idStr := filename[2 : len(filename)-4]
						if _, scanErr := fmt.Sscanf(idStr, "%d", &songID); scanErr == nil {
							var exists int
							if database.DB.QueryRow("SELECT COUNT(1) FROM songs WHERE id = ?", songID).Scan(&exists) == nil && exists > 0 {
								foundMatchedSong = true
							}
						}
					}

					// 策略3：解析 .lrc 文件内容中的 [ti:xxx] 元数据标签
					if !foundMatchedSong && targetArtist != "" {
						if lrcData, readErr := os.ReadFile(path); readErr == nil {
							lrcLines := strings.Split(string(lrcData), "\n")
							for _, ll := range lrcLines {
								ll = strings.TrimSpace(ll)
								if strings.HasPrefix(ll, "[ti:") && strings.HasSuffix(ll, "]") {
									tiValue := strings.TrimSpace(ll[4 : len(ll)-1])
									if tiValue != "" {
										query := `
											SELECT songs.id FROM songs 
											JOIN albums ON songs.album_id = albums.id 
											JOIN artists ON albums.artist_id = artists.id 
											WHERE songs.title LIKE ? AND artists.name LIKE ?
											LIMIT 1`
										if database.DB.QueryRow(query, "%"+tiValue+"%", "%"+targetArtist+"%").Scan(&songID) == nil {
											foundMatchedSong = true
											log.Printf("🎯 [Strategy 3] [ti:%s] -> ID:%d", tiValue, songID)
											correctFilename := fmt.Sprintf("l_%d.lrc", songID)
											if filename != correctFilename {
												newPath := filepath.Join(filepath.Dir(path), correctFilename)
												if os.Rename(path, newPath) == nil {
													relPathUnix = filepath.ToSlash(filepath.Join(filepath.Dir(relPathUnix), correctFilename))
												}
											}
										}
									}
									break
								}
								if strings.HasPrefix(ll, "[") && len(ll) > 1 && ll[1] >= '0' && ll[1] <= '9' {
									break
								}
							}
						}
					}

				} else {
					// ===== 非 ID 命名的歌词文件（任意文件名，如 01.lrc / track1.lrc 等）=====
					// 统一通过读取文件内容的 [ti:xxx] 标签来匹配歌曲，零编码风险
					if targetArtist != "" {
						if lrcData, readErr := os.ReadFile(path); readErr == nil {
							lrcLines := strings.Split(string(lrcData), "\n")
							for _, ll := range lrcLines {
								ll = strings.TrimSpace(ll)
								if strings.HasPrefix(ll, "[ti:") && strings.HasSuffix(ll, "]") {
									tiValue := strings.TrimSpace(ll[4 : len(ll)-1])
									if tiValue != "" {
										query := `
											SELECT songs.id FROM songs 
											JOIN albums ON songs.album_id = albums.id 
											JOIN artists ON albums.artist_id = artists.id 
											WHERE songs.title LIKE ? AND artists.name LIKE ?
											LIMIT 1`
										if database.DB.QueryRow(query, "%"+tiValue+"%", "%"+targetArtist+"%").Scan(&songID) == nil {
											foundMatchedSong = true
											log.Printf("🎯 [Content Match] 从 [ti:%s] 匹配到歌曲 ID:%d (原文件: %s)", tiValue, songID, filename)
											// 自动重命名为标准 l_ID.lrc 格式
											correctFilename := fmt.Sprintf("l_%d.lrc", songID)
											newPath := filepath.Join(filepath.Dir(path), correctFilename)
											if os.Rename(path, newPath) == nil {
												log.Printf("📝 [Rename] %s -> %s", filename, correctFilename)
												relPathUnix = filepath.ToSlash(filepath.Join(filepath.Dir(relPathUnix), correctFilename))
											}
										} else {
											log.Printf("⚠️ [Content Match] [ti:%s] 未命中 (歌手: %s)", tiValue, targetArtist)
										}
									}
									break
								}
								if strings.HasPrefix(ll, "[") && len(ll) > 1 && ll[1] >= '0' && ll[1] <= '9' {
									break
								}
							}
						}
					}
				}

				// 命中后更新数据库
				if foundMatchedSong {
					var currentLrcNull sql.NullString
					err = database.DB.QueryRow("SELECT lrc_path FROM songs WHERE id = ?", songID).Scan(&currentLrcNull)
					if err == nil {
						currentLrc := currentLrcNull.String
						if currentLrc != relPathUnix {
							log.Printf("🔗 [Lyrics Sync] 绑定歌词至歌曲 [%d]: %s", songID, relPathUnix)
							_, err = database.DB.Exec("UPDATE songs SET lrc_path = ? WHERE id = ?", relPathUnix, songID)
							if err == nil {
								lyricsCount++
							}
						}
					}
				}
				return nil
			})

			generateContentsTxt(lrcTarget, true)
		}
	}

	return newCount, lyricsCount, err
}

type MusicMetadata struct {
	Title      string
	Artist     string
	Album      string
	Year       int
	TrackIndex int // [New] 曲序索引
	Duration   int // 秒
	Format     string
}

// ExtractMetadata 从路径和文件元数据中提取信息，优先信任目录结构
func ExtractMetadata(path string, musicBaseDir string) (*MusicMetadata, error) {
	relPath, _ := filepath.Rel(musicBaseDir, path)
	parts := strings.Split(relPath, string(os.PathSeparator))
	fileName := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))

	// 1. 尝试从文件内部提取标签 (作为补充)
	var title, artist, album string
	var trackIdx int
	f, err := os.Open(path)
	if err == nil {
		m, err := tag.ReadFrom(f)
		if err == nil {
			title = m.Title()
			artist = m.Artist()
			album = m.Album()
			tIdx, _ := m.Track()
			trackIdx = tIdx
		}
		f.Close()
	}

	// 2. 核心修正：目录优先 (Directory over Metadata)
	// 预期结构: [Artist] / [Album] / [Song].mp3
	if len(parts) >= 3 {
		dirArtist := parts[len(parts)-3]
		dirAlbum := parts[len(parts)-2]

		// 强制采用目录信息，因为我们的存储结构是规范的
		artist = dirArtist
		album = dirAlbum

		// 标题处理：无论来源（ID3标签或文件名），统一走后缀剥离管线
		if title == "" {
			title = fileName
		} else {
			log.Printf("🏷️  [Metadata] 发现标签标题: [%s] (来自 %s)", title, fileName)
		}

		// a. 后缀剥离管线：同时清理文件名和标签标题
		artistStr := strings.TrimSpace(artist)
		albumStr := strings.TrimSpace(album)

		suffixTargets := []string{
			" - " + artistStr, "-" + artistStr,
			" - " + albumStr, "-" + albumStr,
			" (" + albumStr + ")", "(" + albumStr + ")",
			" (" + artistStr + ")", "(" + artistStr + ")",
		}

		// stripSuffixes 对任意字符串执行循环后缀剥离
		stripSuffixes := func(raw string) string {
			for {
				matched := false
				for _, s := range suffixTargets {
					if s == "" || len(s) < 2 {
						continue
					}
					lowerRaw := strings.ToLower(raw)
					lowerTarget := strings.ToLower(s)
					if idx := strings.LastIndex(lowerRaw, lowerTarget); idx != -1 {
						if idx+len(s) >= len(raw)-3 {
							raw = raw[:idx]
							matched = true
						}
					}
				}
				if !matched {
					break
				}
			}
			return strings.TrimSpace(raw)
		}

		// 对文件名和标签标题都执行剥离
		cleanFileName := stripSuffixes(fileName)
		cleanTagTitle := stripSuffixes(title)

		// 优先使用剥离后的文件名（最可靠），标签标题作为备选
		if cleanFileName != "" {
			title = cleanFileName
		} else if cleanTagTitle != "" {
			title = cleanTagTitle
		}

		// b. 曲序提取逻辑 (如 01.标题)
		if dotIdx := strings.Index(title, "."); dotIdx > 0 && dotIdx < 5 {
			prefix := title[:dotIdx]
			var num int
			if _, err := fmt.Sscanf(prefix, "%d", &num); err == nil {
				trackIdx = num - 1
				title = strings.TrimSpace(title[dotIdx+1:])
			}
		}
	}

	metadata := &MusicMetadata{
		Title:      title,
		Artist:     artist,
		Album:      album,
		TrackIndex: trackIdx,
	}

	if strings.HasPrefix(fileName, "s_") {
		idStr := fileName[2:]
		var potentialID int64
		// 检查是否有后缀，如有则切除
		if dotIdx := strings.Index(idStr, "."); dotIdx > 0 {
			idStr = idStr[:dotIdx]
		}
		if _, err := fmt.Sscanf(idStr, "%d", &potentialID); err == nil {
			metadata.Duration = int(potentialID) // 临时借用 Duration 字段传递 ID 种子
		}
	}

	// 兜底逻辑
	if strings.TrimSpace(metadata.Title) == "" {
		metadata.Title = fileName
	}
	if metadata.Artist == "" {
		metadata.Artist = "未知艺术家"
	}
	if metadata.Album == "" {
		metadata.Album = "未知专辑"
	}

	return metadata, nil
}

// NormalizeTitle 归一化标题：移除标点符号及空格，统一小写，简繁体统一，用于模糊匹配
func NormalizeTitle(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, "_", "")
	s = strings.ReplaceAll(s, "\u2014", "")
	s = strings.ReplaceAll(s, "\u00b7", "")

	var builder strings.Builder
	for _, r := range s {
		if (r >= 0x4e00 && r <= 0x9fa5) || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			if simplified, ok := t2sMap[r]; ok {
				builder.WriteRune(simplified)
			} else {
				builder.WriteRune(r)
			}
		}
	}
	return builder.String()
}

// t2sMap 音乐领域高频简繁体映射表（覆盖专辑/歌曲标题中 99% 的繁体字）
var t2sMap = map[rune]rune{
	'\u9748': '\u7075', '\u958b': '\u5f00', '\u5834': '\u573a', '\u8acb': '\u8bf7', '\u8aaa': '\u8bf4',
	'\u611b': '\u7231', '\u98a8': '\u98ce', '\u4f86': '\u6765', '\u6b72': '\u5c81', '\u500b': '\u4e2a',
	'\u5011': '\u4eec', '\u5f8c': '\u540e', '\u5f9e': '\u4ece', '\u6703': '\u4f1a', '\u5c0d': '\u5bf9',
	'\u88e1': '\u91cc', '\u904e': '\u8fc7', '\u7576': '\u5f53', '\u6642': '\u65f6', '\u8207': '\u4e0e',
	'\u9019': '\u8fd9', '\u9084': '\u8fd8', '\u9032': '\u8fdb', '\u7121': '\u65e0', '\u96fb': '\u7535',
	'\u52d5': '\u52a8', '\u9ede': '\u70b9', '\u982d': '\u5934', '\u554f': '\u95ee', '\u9593': '\u95f4',
	'\u61c9': '\u5e94', '\u9577': '\u957f', '\u5be6': '\u5b9e', '\u7d93': '\u7ecf', '\u6a5f': '\u673a',
	'\u95dc': '\u5173', '\u96e3': '\u96be', '\u8b8a': '\u53d8', '\u96e2': '\u79bb', '\u6b61': '\u6b22',
	'\u898b': '\u89c1', '\u89aa': '\u4eb2', '\u8b93': '\u8ba9', '\u8a8d': '\u8ba4', '\u7fa9': '\u4e49',
	'\u8a71': '\u8bdd', '\u50b3': '\u4f20', '\u98db': '\u98de', '\u5922': '\u68a6', '\u66f8': '\u4e66',
	'\u8a18': '\u8bb0', '\u6a02': '\u4e50', '\u8072': '\u58f0', '\u83ef': '\u534e', '\u5cf6': '\u5c9b',
	'\u767c': '\u53d1', '\u9580': '\u95e8', '\u99ac': '\u9a6c', '\u6771': '\u4e1c', '\u8eca': '\u8f66',
	'\u9ce5': '\u9e1f', '\u9b5a': '\u9c7c', '\u9ec3': '\u9ec4', '\u85cd': '\u84dd', '\u7d05': '\u7ea2',
	'\u7da0': '\u7eff', '\u9280': '\u94f6', '\u9435': '\u94c1', '\u5712': '\u56ed', '\u967d': '\u9633',
	'\u96f2': '\u4e91', '\u97ff': '\u54cd', '\u865f': '\u53f7', '\u7bc0': '\u8282', '\u7d50': '\u7ed3',
	'\u8f15': '\u8f7b', '\u6eab': '\u6e29', '\u6b77': '\u5386', '\u6200': '\u604b', '\u7368': '\u72ec',
	'\u5bf6': '\u5b9d', '\u6eff': '\u6ee1', '\u5b78': '\u5b66', '\u9ad4': '\u4f53', '\u696d': '\u4e1a',
	'\u5c08': '\u4e13', '\u5340': '\u533a', '\u91ab': '\u533b', '\u96d9': '\u53cc', '\u9060': '\u8fdc',
	'\u904b': '\u8fd0', '\u9054': '\u8fbe', '\u9078': '\u9009', '\u5f35': '\u5f20', '\u9023': '\u8fde',
	'\u8a2d': '\u8bbe', '\u5e2b': '\u5e08', '\u6bba': '\u6740', '\u689d': '\u6761', '\u8fa6': '\u529e',
	'\u5225': '\u522b', '\u8ad6': '\u8bba', '\u8655': '\u5904', '\u7e3d': '\u603b', '\u74b0': '\u73af',
	'\u985e': '\u7c7b', '\u9f4a': '\u9f50', '\u975c': '\u9759', '\u81c9': '\u8138', '\u8f1d': '\u8f89',
	'\u885b': '\u536b', '\u52dd': '\u80dc', '\u5091': '\u6770', '\u806f': '\u8054', '\u8a5e': '\u8bcd',
	'\u8a69': '\u8bd7', '\u8a9e': '\u8bed', '\u8ab0': '\u8c01', '\u908a': '\u8fb9', '\u9670': '\u9634',
	'\u96b1': '\u9690', '\u7063': '\u6e7e', '\u6afb': '\u6a31', '\u98c4': '\u98d8', '\u9f8d': '\u9f99',
	'\u9cf3': '\u51e4', '\u71c8': '\u706f', '\u6b78': '\u5f52', '\u6f54': '\u6d01', '\u64c1': '\u62e5',
	'\u8b77': '\u62a4', '\u78ba': '\u786e', '\u5beb': '\u5199', '\u93e1': '\u955c', '\u7e54': '\u7ec7',
	'\u8e10': '\u8df5', '\u9663': '\u9635', '\u87a2': '\u8424', '\u5dba': '\u5cad', '\u76e4': '\u76d8',
	'\u9f61': '\u9f84', '\u8edf': '\u8f6f', '\u8abf': '\u8c03', '\u5875': '\u5c18',
	// [V15.4] Beyond/乐与怒 匹配修复 + 全库扫描扩充
	'\u61a4': '\u6124', // 憤→愤
	'\u5abd': '\u5988', // 媽→妈
	'\u95ca': '\u9614', // 闊→阔
	'\u838a': '\u5e84', // 莊→庄
	'\u8b02': '\u8c13', // 謂→谓
	'\u9a5a': '\u60ca', // 驚→惊
	'\u5b43': '\u5b9d', // 寳→宝 (异体)
	'\u5fb5': '\u5f81', // 徵→征
	'\u6b98': '\u6b8b', // 殘→残
	'\u5674': '\u55b7', // 噴→喷
	'\u7e23': '\u7f1d', // 縣→县 (also 縫→缝 context)
	'\u7e2e': '\u7f29', // 縮→缩
	'\u7e31': '\u7eb5', // 縱→纵

	'\u8460': '\u8424', // 葠→萤 (variant)
	'\u5f48': '\u5f39', // 彈→弹
	'\u6232': '\u620f', // 戲→戏
	'\u6b0a': '\u6743', // 權→权

	'\u5606': '\u53f9', // 嘆→叹
	'\u58de': '\u574f', // 壞→坏
	'\u5920': '\u591f', // 夠→够
	'\u5c46': '\u5c4a', // 屆→届
	'\u61f6': '\u61d2', // 懶→懒
	'\u6416': '\u6447', // 搖→摇 (note: 搖 U+6416 is a variant)
	'\u7570': '\u5f02', // 異→异
	'\u7562': '\u6bd5', // 畢→毕

	'\u756b': '\u753b', // 畫→画
	'\u79ae': '\u793c', // 禮→礼
	'\u7a2e': '\u79cd', // 種→种
	'\u8173': '\u811a', // 腳→脚
	'\u8209': '\u4e3e', // 舉→举
	'\u8ac7': '\u8c08', // 談→谈
	'\u8b1d': '\u8c22', // 謝→谢
	'\u8c6c': '\u732a', // 豬→猪
	'\u8ce3': '\u5356', // 賣→卖
	'\u8cfc': '\u8d2d', // 購→购
	'\u8f29': '\u8f88', // 輩→辈
	'\u8f2a': '\u8f6e', // 輪→轮
	'\u9041': '\u8fc8', // 遁→迈 (context specific)
	'\u9418': '\u949f', // 鐘→钟
	'\u9810': '\u9884', // 預→预
	'\u994b': '\u9965', // 饋→馈
	'\u9b25': '\u9b13', // 鬥→斗
	'\u9673': '\u9648', // 陳→陈
}

// SaveToLibrary 处理艺术家 -> 专辑 -> 歌曲的层级保存逻辑
func SaveToLibrary(m *MusicMetadata, relPath string, lrcPath string) (int64, bool, error) {
	log.Printf("💾 准备保存: [%s] | 艺术家: %s | 专辑: %s", m.Title, m.Artist, m.Album)
	tx, err := database.DB.Begin()
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback()

	// 1. 查找艺术家 (严格匹配 → 归一化 fallback)
	var artistID int64
	err = tx.QueryRow("SELECT id FROM artists WHERE name = ?", m.Artist).Scan(&artistID)
	if err == sql.ErrNoRows {
		// 归一化 fallback：遍历全表做简繁体容错
		targetNorm := NormalizeTitle(m.Artist)
		aRows, _ := tx.Query("SELECT id, name FROM artists")
		if aRows != nil {
			for aRows.Next() {
				var aid int64
				var aName string
				aRows.Scan(&aid, &aName)
				if NormalizeTitle(aName) == targetNorm {
					artistID = aid
					err = nil
					break
				}
			}
			aRows.Close()
		}
		if artistID == 0 {
			// 铁律：名录中不存在此歌手，跳过
			log.Printf("⚠️ [Skip] 名录中不存在歌手 [%s]，跳过入库", m.Artist)
			return 0, false, nil
		}
	} else if err != nil {
		return 0, false, err
	}

	// 2. 查找专辑 (严格匹配 → 归一化 fallback)
	var albumID int64
	err = tx.QueryRow("SELECT id FROM albums WHERE artist_id = ? AND title = ?", artistID, m.Album).Scan(&albumID)
	if err == sql.ErrNoRows {
		// 归一化 fallback：遍历该歌手的全部专辑做简繁体容错
		targetNorm := NormalizeTitle(m.Album)
		albRows, _ := tx.Query("SELECT id, title FROM albums WHERE artist_id = ?", artistID)
		if albRows != nil {
			for albRows.Next() {
				var abid int64
				var abTitle string
				albRows.Scan(&abid, &abTitle)
				if NormalizeTitle(abTitle) == targetNorm {
					albumID = abid
					err = nil
					break
				}
			}
			albRows.Close()
		}
		if albumID == 0 {
			// 铁律：名录中不存在此专辑，跳过
			log.Printf("⚠️ [Skip] 歌手 [%s] 名录中不存在专辑 [%s]，跳过入库", m.Artist, m.Album)
			return 0, false, nil
		}
	} else if err != nil {
		return 0, false, err
	}

	// 3. 强力对齐逻辑：ID 稳定性与名录主位夺回
	var targetID int64
	var finalTitle string

	// a. [V15.2] ID 稳定性优先
	// a. [V15.3] ID 稳定性优先 & 主位夺回 (Master Reclaim)
	if m.Duration > 0 {
		var idTitle string
		err = tx.QueryRow("SELECT id, title FROM songs WHERE id = ?", m.Duration).Scan(&targetID, &idTitle)
		if err == nil {
			log.Printf("🛡️  触发 ID 稳定性自检: [ID:%d] (%s) <- %s", targetID, idTitle, relPath)

			// 核心校准：检查当前记录是否为“污染标题位”
			// 逻辑：如果在同专辑下能找到标题更纯净（包含在污染标题内且更短，且没有文件路径）的名录位，则夺回
			var masterID int64
			var masterTitle string
			idTitleNorm := NormalizeTitle(idTitle)

			// 搜寻名录正主 (放宽限制：即使正主有失效的陈旧 file_path，也予以夺回)
			rows, _ := tx.Query(`SELECT id, title FROM songs 
								  WHERE album_id = ? AND id != ?`, albumID, targetID)
			if rows != nil {
				for rows.Next() {
					var mid int64
					var mTitle string
					rows.Scan(&mid, &mTitle)
					mTitleNorm := NormalizeTitle(mTitle)

					// 匹配准则：名录名存在于文件识别标题中，且两者不完全相等（说明有噪音）
					if mTitleNorm != "" && strings.Contains(idTitleNorm, mTitleNorm) && idTitleNorm != mTitleNorm {
						masterID = mid
						masterTitle = mTitle
						break
					}
				}
				rows.Close()
			}

			if masterID > 0 {
				log.Printf("🔄 [Reclaim] 拨乱反正！发现正统名录位 [ID:%d](%s)，正在将文件从污染位 [ID:%d](%s) 迁移归位",
					masterID, masterTitle, targetID, idTitle)
				// 1. 迁移至正主
				if lrcPath != "" {
					_, _ = tx.Exec("UPDATE songs SET file_path = ?, lrc_path = ?, format = ? WHERE id = ?",
						relPath, lrcPath, m.Format, masterID)
				} else {
					_, _ = tx.Exec("UPDATE songs SET file_path = ?, format = ? WHERE id = ?",
						relPath, m.Format, masterID)
				}
				// 2. 删除多余的噪音条目
				_, _ = tx.Exec("DELETE FROM songs WHERE id = ?", targetID)
				tx.Commit()
				// 3. 再次执行物理 ID 化
				autoIDify(masterID, relPath)
				return masterID, false, nil
			}

			// 无需夺回，常规更新
			if lrcPath != "" {
				_, _ = tx.Exec("UPDATE songs SET file_path = ?, lrc_path = ?, format = ? WHERE id = ?",
					relPath, lrcPath, m.Format, targetID)
			} else {
				_, _ = tx.Exec("UPDATE songs SET file_path = ?, format = ? WHERE id = ?",
					relPath, m.Format, targetID)
			}
			tx.Commit()
			return targetID, false, nil
		}
	}

	// b. 名录点亮逻辑 (三级匹配：严格 -> 归一化 -> 子串)
	// 策略 1：严格标题匹配
	err = tx.QueryRow("SELECT id, title FROM songs WHERE album_id = ? AND title = ? LIMIT 1",
		albumID, m.Title).Scan(&targetID, &finalTitle)

	// 策略 2：归一化模糊匹配
	if err == sql.ErrNoRows {
		rows, qErr := tx.Query("SELECT id, title FROM songs WHERE album_id = ?", albumID)
		if qErr == nil {
			targetNorm := NormalizeTitle(m.Title)
			for rows.Next() {
				var pid int64
				var pTitle string
				rows.Scan(&pid, &pTitle)
				if NormalizeTitle(pTitle) == targetNorm {
					targetID = pid
					finalTitle = pTitle
					err = nil
					break
				}
			}
			rows.Close()
		}
	}

	// 策略 3：子串匹配 (物理文件包含名录标题) - 增加防御检测
	if err == sql.ErrNoRows {
		rows, qErr := tx.Query("SELECT id, title FROM songs WHERE album_id = ?", albumID)
		if qErr == nil {
			targetNorm := NormalizeTitle(m.Title)
			albumNorm := NormalizeTitle(m.Album) // 获取专辑名归一化，用于防御

			for rows.Next() {
				var pid int64
				var pTitle string
				rows.Scan(&pid, &pTitle)
				pTitleNorm := NormalizeTitle(pTitle)

				// 核心漏洞点修复：如果名录条目名就是专辑名（如《七里香》既是专辑也是歌名）
				// 且我们的文件标题还没被彻底清理干净，包含专辑名，则子串匹配会全错
				// 逻辑：如果名录条目名包含在文件标题中
				if strings.Contains(targetNorm, pTitleNorm) {
					// 额外准则：如果这次匹配命中了一个“脆弱名”（即歌曲名=专辑名），
					// 则要求匹配必须更接近完全匹配，不能只是长子串的一部分。
					if pTitleNorm == albumNorm && targetNorm != pTitleNorm {
						log.Printf("🛡️ [Match Shield] 跳过过于贪婪的子串匹配: [%s] 包含专辑曲目名 [%s] 但不完全相等", m.Title, pTitle)
						continue
					}

					targetID = pid
					finalTitle = pTitle
					err = nil
					break
				}
			}
			rows.Close()
		}
	}

	if err == nil {
		log.Printf("📋 [Dry-Run] 即将点亮: [ID:%d] (%s) ← 文件: %s", targetID, finalTitle, relPath)
		if lrcPath != "" {
			_, err = tx.Exec(`UPDATE songs SET file_path = ?, lrc_path = ?, format = ? WHERE id = ?`,
				relPath, lrcPath, m.Format, targetID)
		} else {
			_, err = tx.Exec(`UPDATE songs SET file_path = ?, format = ? WHERE id = ?`,
				relPath, m.Format, targetID)
		}
		if err != nil {
			return 0, false, err
		}
		tx.Commit()

		// 扫尾：如果本专辑内还有包含此名录标题的其他“污染记录”，一并清理
		consolidateDuplicates(albumID, targetID, finalTitle)
		autoIDify(targetID, relPath)
		return targetID, false, nil
	}

	// 铁律：名录中未命中任何歌曲，仅记录日志，绝不插入新记录
	log.Printf("⚠️ [Skip] 未命中任何名录: [%s] (歌手: %s, 专辑: %s)，跳过入库", m.Title, m.Artist, m.Album)
	return 0, false, nil
}

// [New] 异步执行物理文件 ID 化 (同时处理音频与歌词) - [S3 兼容版]
func autoIDify(id int64, relPath string) {
	ctx := context.Background()
	s3 := s3client.GetClient()

	// 1. 音频物理重命名 (S3 Rename: Copy + Delete)
	ext := filepath.Ext(relPath)
	newName := fmt.Sprintf("s_%d%s", id, ext)
	if filepath.Base(relPath) != newName {
		sourceKey := filepath.ToSlash(filepath.Join("music", relPath))
		destKey := filepath.ToSlash(filepath.Join("music", filepath.Dir(relPath), newName))

		// 检查 S3 上是否存在文件 (可选)
		exists, _ := s3.Exists(ctx, sourceKey)
		if exists {
			if err := s3.RenameFile(ctx, sourceKey, destKey); err == nil {
				// 更新数据库索引
				newRelPath := filepath.ToSlash(filepath.Join(filepath.Dir(relPath), newName))
				database.DB.Exec("UPDATE songs SET file_path = ? WHERE id = ?", newRelPath, id)
				log.Printf("✨ [S3 Auto-ID] 曲目已成功进化: %s -> %s", filepath.Base(relPath), newName)
				relPath = newRelPath // 更新供歌词处理使用
			}
		}
	}

	// 2. 歌词物理搬迁与 ID 化 (S3 逻辑)
	// 策略：检查是否有同名的 .lrc 存在于音频同级目录 (在 S3 上)
	audioBase := strings.TrimSuffix(relPath, filepath.Ext(relPath))
	lrcOldKey := "music/" + audioBase + ".lrc"

	exists, _ := s3.Exists(ctx, lrcOldKey)
	if exists {
		// 构造结构化目标路径 (Key): lyrics/歌手/专辑/l_ID.lrc
		relDir := filepath.Dir(relPath)
		lrcNewName := fmt.Sprintf("l_%d.lrc", id)
		lrcNewKey := filepath.ToSlash(filepath.Join("lyrics", relDir, lrcNewName))

		if err := s3.RenameFile(ctx, lrcOldKey, lrcNewKey); err == nil {
			// 更新数据库歌词路径
			lrcRelPath := filepath.ToSlash(filepath.Join(relDir, lrcNewName))
			database.DB.Exec("UPDATE songs SET lrc_path = ? WHERE id = ?", lrcRelPath, id)
			log.Printf("📝 [S3 Auto-ID] 歌词已同步进化: %s -> %s", filepath.Base(lrcOldKey), lrcRelPath)

			// [Optional] 注入标题元数据并更新 (S3 需要 Download -> Edit -> Upload)
			var title string
			_ = database.DB.QueryRow("SELECT title FROM songs WHERE id = ?", id).Scan(&title)
			if title != "" {
				body, _, err := s3.DownloadFile(ctx, lrcNewKey)
				if err == nil {
					lrcContent, _ := ioutil.ReadAll(body)
					body.Close()
					lrcStr := string(lrcContent)
					if !strings.Contains(lrcStr, "[ti:") {
						tiTag := fmt.Sprintf("[ti:%s]\n", title)
						newContent := tiTag + lrcStr
						_ = s3.UploadFile(ctx, lrcNewKey, strings.NewReader(newContent), "text/plain")
					}
				}
			}
		}
	}

	// [Note] S3 模式下暂缓 generateContentsTxt 物理文件的更新
}

// generateContentsTxt 为目录生成 ID -> 标题的映射索引文件
func generateContentsTxt(dirPath string, isLyrics bool) {
	files, err := os.ReadDir(dirPath)
	if err != nil {
		return
	}

	var mappings []string
	header := "MOODY 曲目物理 ID 映射表"
	comment := "* 说明：请勿手动重命名 s_ID.mp3 文件，否则会导致数据库索引失效。"
	prefix := "s_"
	if isLyrics {
		header = "MOODY 歌词物理 ID 映射表"
		comment = "* 说明：请勿手动重命名 l_ID.lrc 文件，否则会导致数据库索引失效。"
		prefix = "l_"
	}

	for _, f := range files {
		if f.IsDir() || !strings.HasPrefix(f.Name(), prefix) {
			continue
		}

		// 提取 ID
		name := f.Name()
		stem := strings.TrimSuffix(name, filepath.Ext(name))
		idStr := strings.TrimPrefix(stem, prefix)

		var id int64
		if _, err := fmt.Sscanf(idStr, "%d", &id); err == nil {
			var title string
			err := database.DB.QueryRow("SELECT title FROM songs WHERE id = ?", id).Scan(&title)
			if err == nil {
				mappings = append(mappings, fmt.Sprintf("%s -> %s", name, title))
			}
		}
	}

	if len(mappings) == 0 {
		return
	}

	content := fmt.Sprintf("%s\n%s\n\n%s\n\n%s\n",
		header,
		strings.Repeat("=", 26),
		strings.Join(mappings, "\n"),
		comment)

	_ = os.WriteFile(filepath.Join(dirPath, "_contents.txt"), []byte(content), 0644)
}

func IsAudioFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	return ext == ".mp3" || ext == ".wav" || ext == ".flac" || ext == ".m4a"
}

// consolidateDuplicates 合并专辑内的冗余重复项 (后悔药逻辑)
func consolidateDuplicates(albumID int64, masterID int64, cleanTitle string) {
	// 查找当前专辑下，标题包含 cleanTitle 且 ID 不等于 masterID 的记录
	rows, err := database.DB.Query("SELECT id, title FROM songs WHERE album_id = ? AND id != ?", albumID, masterID)
	if err != nil {
		return
	}
	defer rows.Close()

	normClean := NormalizeTitle(cleanTitle)
	for rows.Next() {
		var opaqueID int64
		var opaqueTitle string
		rows.Scan(&opaqueID, &opaqueTitle)

		// 如果冗余条目的标题包含主标题（例如 "分裂-周杰伦" 包含 "分裂"）
		opaqueNorm := NormalizeTitle(opaqueTitle)
		if strings.Contains(opaqueNorm, normClean) {
			// 长度比例防御：避免短标题（如"爱"）误删长标题（"爱情有什么道理"）
			if len(opaqueNorm) > 0 && len(normClean)*100/len(opaqueNorm) < 50 {
				continue
			}
			log.Printf("🧹 [Cleanup] 发现重复项，正在合并: [ID:%d](%s) -> [ID:%d](%s)", opaqueID, opaqueTitle, masterID, cleanTitle)
			_, _ = database.DB.Exec("DELETE FROM songs WHERE id = ?", opaqueID)
			_, _ = database.DB.Exec("UPDATE favorites SET song_id = ? WHERE song_id = ?", masterID, opaqueID)
			_, _ = database.DB.Exec("UPDATE playback_history SET song_id = ? WHERE song_id = ?", masterID, opaqueID)
		}
	}
}
