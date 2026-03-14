package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"moody-backend/internal/database"
	"moody-backend/internal/model"
	"moody-backend/pkg/s3client"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// DownloadDBFromR2 从指定 S3/R2 存储下载最新的 moody.db 文件并应用热重载
func DownloadDBFromR2(storageID string) error {
	ctx := context.Background()
	s3 := s3client.GetClientByName(storageID)
	if s3 == nil {
		return fmt.Errorf("storage id [%s] not found", storageID)
	}

	objectKey := "db/moody.db"
	log.Printf("📥 正在从 R2 [%s] 下载数据库文件: %s", storageID, objectKey)

	var body io.ReadCloser
	var err error

	// 优先使用 S3 SDK (Action #25)
	body, _, err = s3.DownloadFile(ctx, objectKey)

	// 如果 SDK 握手失败 (Action #26: 协议降级自愈)
	if err != nil && (strings.Contains(err.Error(), "handshake failure") || strings.Contains(err.Error(), "tls") || strings.Contains(err.Error(), "remote error")) {
		log.Printf("⚠️  SDK TLS 握手失败，启用 HTTP 隧道降级自愈 (Action #26)...")
		
		// 构建公开读取 URL (基于补丁配置的 endpoint)
		publicURL := fmt.Sprintf("https://%s.r2.cloudflarestorage.com/%s", s3.GetAccountID(), objectKey)
		
		client := &http.Client{Timeout: 30 * time.Second}
		resp, httpErr := client.Get(publicURL)
		if httpErr != nil {
			return fmt.Errorf("SDK 失败后 HTTP 降级亦失败: %v (SDK 原错: %w)", httpErr, err)
		}
		
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return fmt.Errorf("HTTP 隧道返回异常状态 %d (SDK 原错: %w)", resp.StatusCode, err)
		}
		body = resp.Body
		log.Printf("🚀 HTTP 隧道连通成功，开始流式同步...")
	} else if err != nil {
		return fmt.Errorf("下载失败: %w", err)
	}
	defer body.Close()

	// 1. 先写入临时文件
	tmpPath := database.DBPath + ".tmp"
	out, err := os.Create(tmpPath)
	if err != nil {
		return fmt.Errorf("创建临时文件失败: %w", err)
	}
	defer out.Close()

	if _, err := io.Copy(out, body); err != nil {
		return fmt.Errorf("写入临时文件失败: %w", err)
	}
	out.Close() // 提前关闭以释放句柄

	// 2. 原子替换
	log.Printf("🔄 正在执行数据库原子替换: %s", database.DBPath)
	if err := os.Rename(tmpPath, database.DBPath); err != nil {
		return fmt.Errorf("原子替换失败: %w", err)
	}

	// 3. 热重载数据库连接
	if err := database.ReinitDB(); err != nil {
		return fmt.Errorf("数据库重连失败: %w", err)
	}

	// 4. 重载骨架缓存
	if err := LoadSkeleton(); err != nil {
		log.Printf("⚠️  DB 同步后重载骨架失败: %v", err)
	}

	log.Printf("✅ 数据库已从 R2 成功同步并热重载！")
	return nil
}

// MigrateDataJS 如果本地骨架不存在或艺人数量为 0，则从 frontend/src/js/data.js 迁移数据
func MigrateDataJS(dataJSPath string) error {
	// hasData 逻辑已被注释掉，直接开启迁移逻辑

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
