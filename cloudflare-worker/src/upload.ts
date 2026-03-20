/**
 * Worker Upload Handler - V2 (智能匹配版本)
 * 核心原则：
 * 1. 名录（D1）是唯一显示依据
 * 2. 磁盘文件只是"点亮"作用
 * 3. 不创建新的艺人/专辑/歌曲记录
 * 4. 使用智能匹配逻辑匹配歌名
 */

import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

/**
 * NormalizeTitle 归一化标题（从 Go 代码移植）
 * 移除标点符号及空格，统一小写，简繁体统一，用于模糊匹配
 */
function normalizeTitle(s: string): string {
  s = s.toLowerCase().trim();

  // 统一各种标点符号（包括中文标点）
  s = s.replace(/[ \t\n\r\-_—·、，,。．；;：:！!？?（）\(\)\[\]【】《》〈〉]/g, '');

  // 简繁体映射（扩展版）
  const t2sMap: Record<string, string> = {
    // 常用繁体字
    '愛': '爱', '來': '来', '後': '后', '為': '为',
    '與': '与', '時': '时', '開': '开', '無': '无',
    '國': '国', '語': '语', '產': '产', '學': '学',
    '長': '长', '點': '点', '變': '变', '電': '电',
    '動': '动', '聽': '听', '這': '这', '過': '过',
    '寫': '写', '會': '会', '經': '经', '關': '关',
    '們': '们', '傳': '传', '錄': '录', '機': '机',
    '觀': '观', '場': '场', '實': '实', '驗': '验',
    '斷': '断', '種': '种', '類': '类',
    '難': '难', '優': '优', '態': '态', '響': '响',
    '應': '应', '繫': '续', '調': '调', '轉': '转',
    '遙': '遥', '麵': '面', '彎': '弯', '單': '单',
    '願': '愿', '義': '义', '務': '务', '標': '标',
    // 补充常用繁体字
    '遠': '远', '選': '选', '邊': '边', '處': '处',
    '風': '风', '頭': '头', '門': '门', '間': '间',
    '題': '题', '導': '导', '讓': '让', '識': '识',
    '設': '设', '屬': '属', '據': '据', '築': '筑',
    '緊': '紧', '陳': '陈', '蓋': '盖', '舉': '举',
    '壓': '压', '質': '质', '儘': '尽', '護': '护',
    '戲': '戏', '臺': '台', '鄉': '乡', '現': '现',
    '規': '规', '視': '视', '藝': '艺', '價': '价',
    '證': '证', '獨': '独', '劇': '剧',
    '歲': '岁', '備': '备', '敵': '敌'
  };

  let result = '';
  for (const char of s) {
    const code = char.charCodeAt(0);
    // 只保留中文、英文字母和数字
    const isCJK = (code >= 0x4e00 && code <= 0x9fa5);
    const isEnglish = (code >= 0x0061 && code <= 0x007a); // a-z
    const isDigit = (code >= 0x0030 && code <= 0x0039);   // 0-9

    if (isCJK || isEnglish || isDigit) {
      result += t2sMap[char] || char;
    }
  }
  return result;
}

/**
 * 从文件名提取歌名
 * 支持格式：
 * - 歌曲名-歌手-专辑.mp3
 * - 歌曲名.mp3
 * - 01. 歌曲名-歌手-专辑.mp3
 */
function extractSongTitle(filename: string): string {
  let name = filename.replace(/\.(mp3|MP3)$/, '');

  // 移除序号
  name = name.replace(/^\d+[\.\s]*/, '');

  // 移除后缀（歌手-专辑）
  const parts = name.split('-');
  if (parts.length >= 3) {
    // 格式：歌曲名-歌手-专辑
    return parts[0].trim();
  } else if (parts.length === 2) {
    // 可能是：歌曲名-歌手 或 歌曲名-专辑
    return parts[0].trim();
  }

  return name.trim();
}

/**
 * 智能匹配歌曲记录（使用 NormalizeTitle）
 */
async function findSongMatch(
  db: D1Database,
  artistName: string,
  albumTitle: string,
  songTitle: string
): Promise<{ song_id: number; title: string; file_path: string } | null> {
  // 1. 查找艺人
  const artistResult = await db
    .prepare('SELECT id FROM artists WHERE name = ?')
    .bind(artistName)
    .first<{ id: number }>();

  if (!artistResult) {
    return null; // 艺人不存在
  }

  const artistId = artistResult.id;

  // 2. 查找专辑（支持繁简体模糊匹配）
  const albumTitleNorm = normalizeTitle(albumTitle);

  // 2.1 首先尝试精确匹配
  let albumResult = await db
    .prepare('SELECT id FROM albums WHERE artist_id = ? AND title = ?')
    .bind(artistId, albumTitle)
    .first<{ id: number }>();

  // 2.2 如果精确匹配失败，使用繁简体模糊匹配
  if (!albumResult) {
    const albums = await db
      .prepare('SELECT id, title FROM albums WHERE artist_id = ?')
      .bind(artistId)
      .all<{ id: number; title: string }>();

    for (const album of albums.results) {
      const dbTitleNorm = normalizeTitle(album.title);

      // 完全相等或包含关系
      if (dbTitleNorm === albumTitleNorm ||
          dbTitleNorm.includes(albumTitleNorm) ||
          albumTitleNorm.includes(dbTitleNorm)) {
        albumResult = album;
        break;
      }
    }
  }

  if (!albumResult) {
    return null; // 专辑不存在
  }

  const albumId = albumResult.id;

  // 3. 智能匹配歌曲
  const songTitleNorm = normalizeTitle(songTitle);

  // 3.1 首先尝试精确匹配
  const exactMatch = await db
    .prepare('SELECT id, title, file_path FROM songs WHERE album_id = ? AND title = ?')
    .bind(albumId, songTitle)
    .first<{ id: number; title: string; file_path: string }>();

  if (exactMatch) {
    return { song_id: exactMatch.id, title: exactMatch.title, file_path: exactMatch.file_path };
  }

  // 3.2 模糊匹配：遍历专辑下所有歌曲，使用 NormalizeTitle 匹配
  const songs = await db
    .prepare('SELECT id, title, file_path FROM songs WHERE album_id = ?')
    .bind(albumId)
    .all<{ id: number; title: string; file_path: string }>();

  for (const song of songs.results) {
    const dbTitleNorm = normalizeTitle(song.title);

    // 匹配规则：
    // 1. 完全相等
    if (dbTitleNorm === songTitleNorm) {
      return { song_id: song.id, title: song.title, file_path: song.file_path };
    }

    // 2. 包含关系（文件名包含名录歌名，或名录歌名包含文件名）
    if (songTitleNorm.includes(dbTitleNorm) || dbTitleNorm.includes(songTitleNorm)) {
      // 避免太短的匹配
      if (dbTitleNorm.length >= 2 && songTitleNorm.length >= 2) {
        return { song_id: song.id, title: song.title, file_path: song.file_path };
      }
    }
  }

  return null; // 未找到匹配
}

/**
 * 主上传处理函数
 */
export async function handleUpload(
  request: Request,
  env: Bindings
): Promise<Response> {
  try {
    // 1. 解析表单数据
    const formData = await request.formData();
    const allFiles = formData.getAll('files') as unknown[];
    const files = allFiles.filter((f): f is File => f instanceof File);
    const artistOverride = formData.get('artistOverride') as string;
    const albumOverride = formData.get('albumOverride') as string;

    if (!files || files.length === 0) {
      return Response.json({
        code: 400,
        message: '未检测到上传的文件',
      });
    }

    const validFiles = files.filter((f) => f.size > 0);
    if (validFiles.length === 0) {
      return Response.json({
        code: 400,
        message: '没有有效的文件',
      });
    }

    const artistName = artistOverride?.trim() || 'Unknown Artist';
    const albumTitle = albumOverride?.trim() || 'Unknown Album';

    console.log(`📤 开始智能匹配上传: 艺人="${artistName}", 专辑="${albumTitle}", 文件数=${validFiles.length}`);

    const results: Array<{
      filename: string;
      song_title: string;
      match: boolean;
      song_id?: number;
      file_path?: string;
      message: string;
    }> = [];

    let matchedCount = 0;
    let unmatchedCount = 0;

    // 2. 逐个处理文件
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const filename = file.name;

      // 提取歌名
      const songTitle = extractSongTitle(filename);
      console.log(`  [${i + 1}/${validFiles.length}] 处理: ${filename} -> 歌名="${songTitle}"`);

      // 智能匹配歌曲记录
      const match = await findSongMatch(env.DB, artistName, albumTitle, songTitle);

      if (!match) {
        // 调试：输出归一化后的结果
        const normalizedTitle = normalizeTitle(songTitle);
        console.log(`    ❌ 匹配失败，归一化结果: "${normalizedTitle}"`);
        console.log(`    提示: 检查专辑名="${albumTitle}" 和歌名="${songTitle}" 是否与数据库匹配`);
      }

      if (match) {
        // 找到匹配：上传文件并点亮
        const r2Key = `music/${artistName}/${albumTitle}/s_${match.song_id}.mp3`;

        try {
          await env.BUCKET.put(r2Key, file.stream(), {
            httpMetadata: {
              contentType: 'audio/mpeg',
            },
          });

          // 更新 D1 的 file_path（点亮歌曲）
          await env.DB.prepare(
            'UPDATE songs SET file_path = ? WHERE id = ?'
          ).bind(r2Key, match.song_id).run();

          matchedCount++;
          results.push({
            filename: filename,
            song_title: match.title,
            match: true,
            song_id: match.song_id,
            file_path: r2Key,
            message: `✅ 点亮成功: ${match.title} (ID: ${match.song_id})`,
          });

          console.log(`    ✅ 匹配成功: ${match.title} -> ${r2Key}`);
        } catch (error: any) {
          results.push({
            filename: filename,
            song_title: songTitle,
            match: false,
            message: `❌ 上传失败: ${error.message}`,
          });
          console.error(`    ❌ 上传失败:`, error);
        }
      } else {
        // 未找到匹配：仍然上传文件，但不会在页面显示
        const r2Key = `music/${artistName}/${albumTitle}/${filename}`;

        try {
          await env.BUCKET.put(r2Key, file.stream(), {
            httpMetadata: {
              contentType: 'audio/mpeg',
            },
          });

          unmatchedCount++;
          results.push({
            filename: filename,
            song_title: songTitle,
            match: false,
            file_path: r2Key,
            message: `⚠️ 未找到匹配（已上传但不会显示）`,
          });

          console.log(`    ⚠️ 未匹配: ${songTitle} -> 已上传但不显示`);
        } catch (error: any) {
          results.push({
            filename: filename,
            song_title: songTitle,
            match: false,
            message: `❌ 上传失败: ${error.message}`,
          });
          console.error(`    ❌ 上传失败:`, error);
        }
      }
    }

    // 3. 返回结果
    return Response.json({
      code: 200,
      message: `上传完成: 匹配 ${matchedCount} 首，未匹配 ${unmatchedCount} 首`,
      data: {
        total: validFiles.length,
        matched: matchedCount,
        unmatched: unmatchedCount,
        results,
      },
    });
  } catch (error: any) {
    console.error('❌ 上传处理失败:', error);
    return Response.json({
      code: 500,
      message: `上传失败: ${error.message}`,
    });
  }
}

/**
 * 注册上传路由
 */
export function registerUploadRoutes(app: Hono<{ Bindings: Bindings }>) {
  // 文件上传 API (V2 - 智能匹配版本)
  app.post('/api/admin/upload', async (c) => {
    const response = await handleUpload(c.req.raw, c.env);
    return response;
  });

  // 检查上传状态
  app.get('/api/admin/upload/status', async (c) => {
    try {
      const { results } = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM songs WHERE file_path IS NOT NULL AND file_path != ""'
      ).all();

      return c.json({
        code: 200,
        message: 'success',
        data: {
          total_songs: (results[0] as any)?.count || 0,
        },
      });
    } catch (error: any) {
      return c.json({ code: 500, message: error.message }, 500);
    }
  });
}
