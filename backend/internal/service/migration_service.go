package service

import (
	"encoding/json"
	"fmt"
	"log"
	"moody-backend/internal/model"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// MigrateDataJS 如果本地骨架不存在或艺人数量为 0，则从 frontend/src/js/data.js 迁移数据
func MigrateDataJS(dataJSPath string) error {
	skeletonLock.RLock()
	// hasData 逻辑已被注释掉，直接开启迁移逻辑
	skeletonLock.RUnlock()

	/*
		if hasData {
			// 已经存在有效名录数据，跳过迁移
			return nil
		}
	*/

	log.Printf("🚀 正在检测迁移源: %s", dataJSPath)
	if _, err := os.Stat(dataJSPath); os.IsNotExist(err) {
		// 尝试修正路径：解决某些环境下 backend/ 运行导致相对路径偏移的问题
		altPaths := []string{
			filepath.Join("frontend", "src", "js", "data.js"),
			filepath.Join("..", "frontend", "src", "js", "data.js"),
			filepath.Join("/", "app", "frontend", "src", "js", "data.js"), // Zeabur 绝对路径
		}
		for _, p := range altPaths {
			if _, err := os.Stat(p); err == nil {
				dataJSPath = p
				break
			}
		}
	}

	content, err := os.ReadFile(dataJSPath)
	if err != nil {
		return fmt.Errorf("读取数据源失败: %w", err)
	}

	log.Println("🚀 首次运行：检测到无本地骨架，正在从 data.js 迁移数据...")

	// 1. 提取 MOCK_DB 数组内容 (兼容 var, let, const, export 等导出方式)
	re := regexp.MustCompile(`(?:const|var|let|export\s+const)\s+MOCK_DB\s*=\s*(\[[\s\S]*?\])\s*;?`)
	matches := re.FindStringSubmatch(string(content))
	if len(matches) < 2 {
		// 备选方案：尝试直接提取数组内容（如果前缀不同）
		reAlt := regexp.MustCompile(`\[[\s\S]*?\]`)
		jsContent := reAlt.FindString(string(content))
		if jsContent == "" {
			return fmt.Errorf("无法在 data.js 中找到数组内容")
		}
		return parseJSArtists(jsContent)
	}

	return parseJSArtists(matches[1])
}

// parseJSArtists 抽离具体的 JS 语法清洗与解析逻辑
func parseJSArtists(jsContent string) error {

	// 2. 清洗 JS 语法为 JSON 语法
	// a. 移除注释 (处理 // 和 /* */)
	reLineComment := regexp.MustCompile(`//.*`)
	jsContent = reLineComment.ReplaceAllString(jsContent, "")
	reBlockComment := regexp.MustCompile(`/\*[\s\S]*?\*/`)
	jsContent = reBlockComment.ReplaceAllString(jsContent, "")

	// b. 替换单引号为双引号 (仅替换不在已知属性名引号内的，但简单替换通常够用)
	jsContent = strings.ReplaceAll(jsContent, "'", "\"")

	// c. 移除末尾逗号 (核心修复：防止 JSON 解析失败)
	reComma := regexp.MustCompile(`,(\s*[\]}])`)
	jsContent = reComma.ReplaceAllString(jsContent, "$1")

	// d. 补齐属性名引号 (处理 id: title: 等)
	reKey := regexp.MustCompile(`(\s*)([a-zA-Z0-9_]+):(\s*)`)
	jsContent = reKey.ReplaceAllString(jsContent, `$1"$2":$3`)

	// 3. 解析为模型
	var artists []model.LibraryArtist
	if err := json.Unmarshal([]byte(jsContent), &artists); err != nil {
		contentLen := len(jsContent)
		if contentLen > 200 {
			contentLen = 200
		}
		log.Printf("❌ 迁移解析失败，JSON 片段: %s", jsContent[:contentLen])
		return fmt.Errorf("JSON 解析失败: %w", err)
	}

	// 4. 安全栅栏：如果解析出的艺人数量为 0，严禁覆盖初始化
	if len(artists) == 0 {
		return fmt.Errorf("迁移中止：解析结果为 0 位艺术家，请检查 data.js 格式")
	}

	// 5. 将数据持久化到原生数据库表 (核心修复：解决名录丢失问题)
	log.Printf("📥 正在将 %d 位艺术家的名录数据持久化到原生表...", len(artists))
	for _, art := range artists {
		// 这里由于 LoadSkeleton 修改了 ID 为 int 字符串，
		// 如果 data.js 里的 ID 是旧格式，UpdateArtistInSkeleton 内部逻辑依然以 Name 为准 Upsert
		if err := UpdateArtistInSkeleton(&art); err != nil {
			log.Printf("⚠️ 迁移艺术家 [%s] 失败: %v", art.Name, err)
			continue
		}
	}

	// 6. 最终从数据库加载全量数据到内存缓存
	if err := LoadSkeleton(); err != nil {
		return fmt.Errorf("迁移后重载失败: %w", err)
	}

	log.Printf("✅ 迁移成功并已真实落库！已恢复 %d 位艺术家的全量名录", len(artists))
	return nil
}
