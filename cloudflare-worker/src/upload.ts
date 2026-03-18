/**
 * Worker Upload Handler
 * 处理文件上传到 R2 和数据写入 D1
 *
 * 完整流程：
 * 1. 检查 D1 数据库（艺人/专辑）
 * 2. 检查 R2 目录结构
 * 3. 上传文件到 R2
 * 4. 写入元数据到 D1
 */

import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

interface UploadResponse {
  code: number;
  message: string;
  data?: {
    uploaded: number;
    failed: number;
    songs?: Array<{
      title: string;
      file_path: string;
      song_id: number;
    }>;
    details?: string[];
  };
}

/**
 * 提取 MP3 元数据（简化版）
 * TODO: 可以使用 mp3tag 等库提取完整元数据
 */
async function extractMP3Metadata(file: File): Promise<{
  title: string;
  artist: string;
  album: string;
  duration?: number;
}> {
  // 简化版：从文件名提取
  const filename = file.name;
  const title = filename.replace(/\.(mp3|MP3)$/, '');

  // 如果文件名包含格式如 "01. 歌曲名"，提取歌曲名
  const match = title.match(/^\d+\.\s*(.+)$/);
  const finalTitle = match ? match[1] : title;

  return {
    title: finalTitle,
    artist: '',
    album: '',
  };
}

/**
 * 确保 D1 中存在艺人记录
 */
async function ensureArtist(
  db: D1Database,
  artistName: string
): Promise<number> {
  // 查找艺人
  const { results } = await db
    .prepare('SELECT id FROM artists WHERE name = ?')
    .bind(artistName)
    .all();

  if (results.length > 0) {
    return (results[0] as any).id;
  }

  // 创建新艺人
  const result = await db
    .prepare('INSERT INTO artists (name, region) VALUES (?, ?)')
    .bind(artistName, '华语')
    .run();

  return result.meta.last_row_id;
}

/**
 * 确保 D1 中存在专辑记录
 */
async function ensureAlbum(
  db: D1Database,
  artistId: number,
  albumTitle: string
): Promise<number> {
  // 查找专辑
  const { results } = await db
    .prepare('SELECT id FROM albums WHERE artist_id = ? AND title = ?')
    .bind(artistId, albumTitle)
    .all();

  if (results.length > 0) {
    return (results[0] as any).id;
  }

  // 创建新专辑
  const result = await db
    .prepare('INSERT INTO albums (artist_id, title) VALUES (?, ?)')
    .bind(artistId, albumTitle)
    .run();

  return result.meta.last_row_id;
}

/**
 * 生成唯一歌曲 ID
 */
async function generateSongId(db: D1Database): Promise<number> {
  // 获取当前最大 ID
  const { results } = await db
    .prepare('SELECT MAX(id) as max_id FROM songs')
    .all();

  const maxId = (results[0] as any)?.max_id || 0;
  return maxId + 1;
}

/**
 * 主上传处理函数
 */
export async function handleUpload(
  request: Request,
  env: Bindings
): Promise<UploadResponse> {
  try {
    // 1. 解析表单数据
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const artistOverride = formData.get('artistOverride') as string;
    const albumOverride = formData.get('albumOverride') as string;

    if (!files || files.length === 0) {
      return {
        code: 400,
        message: '未检测到上传的文件',
      };
    }

    // 过滤掉非文件对象
    const validFiles = files.filter((f) => f instanceof File && f.size > 0);
    if (validFiles.length === 0) {
      return {
        code: 400,
        message: '没有有效的文件',
      };
    }

    // 2. 确定艺人和专辑
    const artistName = artistOverride?.trim() || 'Unknown Artist';
    const albumTitle = albumOverride?.trim() || 'Unknown Album';

    console.log(`📤 开始上传: 艺人="${artistName}", 专辑="${albumTitle}", 文件数=${validFiles.length}`);

    // 3. 确保 D1 中存在艺人和专辑
    const artistId = await ensureArtist(env.DB, artistName);
    const albumId = await ensureAlbum(env.DB, artistId, albumTitle);

    console.log(`✅ D1 准备完成: 艺人ID=${artistId}, 专辑ID=${albumId}`);

    // 4. 构建 R2 目录路径
    const r2Prefix = `music/${artistName}/${albumTitle}/`;
    console.log(`📁 R2 目标路径: ${r2Prefix}`);

    // 5. 逐个处理文件
    const uploadedSongs: Array<{
      title: string;
      file_path: string;
      song_id: number;
    }> = [];
    const details: string[] = [];
    let uploadedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const songId = await generateSongId(env.DB);

      // 提取元数据
      const metadata = await extractMP3Metadata(file);

      // 如果用户指定了艺人和专辑，使用指定的值
      const finalArtist = artistOverride || metadata.artist || artistName;
      const finalAlbum = albumOverride || metadata.album || albumTitle;
      const finalTitle = metadata.title || file.name;

      // 生成文件名
      const fileName = `s_${songId}.mp3`;
      const r2Key = r2Prefix + fileName;

      try {
        // 上传到 R2
        console.log(`  [${i + 1}/${validFiles.length}] 上传: ${file.name} -> ${r2Key}`);
        await env.BUCKET.put(r2Key, file.stream(), {
          httpMetadata: {
            contentType: 'audio/mpeg',
          },
        });

        // 写入 D1
        await env.DB.prepare(
          'INSERT INTO songs (title, album_id, file_path, track_index) VALUES (?, ?, ?, ?)'
        ).bind(finalTitle, albumId, r2Key, i + 1).run();

        uploadedSongs.push({
          title: finalTitle,
          file_path: r2Key,
          song_id: songId,
        });

        details.push(`✅ [${i + 1}] ${finalTitle} (ID: ${songId})`);
        uploadedCount++;

        console.log(`  ✅ 成功: ${finalTitle} -> ${r2Key}`);
      } catch (error: any) {
        failedCount++;
        details.push(`❌ [${i + 1}] ${file.name} 失败: ${error.message}`);
        console.error(`  ❌ 失败: ${file.name}`, error);
      }
    }

    // 6. 返回结果
    const response: UploadResponse = {
      code: 200,
      message: `上传完成: 成功 ${uploadedCount} 首，失败 ${failedCount} 首`,
      data: {
        uploaded: uploadedCount,
        failed: failedCount,
        songs: uploadedSongs,
        details,
      },
    };

    console.log(`🎉 上传完成: 成功=${uploadedCount}, 失败=${failedCount}`);
    return response;
  } catch (error: any) {
    console.error('❌ 上传处理失败:', error);
    return {
      code: 500,
      message: `上传失败: ${error.message}`,
    };
  }
}

/**
 * 注册上传路由
 */
export function registerUploadRoutes(app: Hono<{ Bindings: Bindings }>) {
  // 文件上传 API
  app.post('/api/admin/upload', async (c) => {
    const response = await handleUpload(c.req.raw, c.env);
    return c.json(response);
  });

  // 检查上传状态
  app.get('/api/admin/upload/status', async (c) => {
    try {
      const { results } = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM songs WHERE file_path LIKE "music/%"'
      ).all();

      return c.json({
        code: 200,
        message: 'success',
        data: {
          total_songs_in_r2: (results[0] as any)?.count || 0,
        },
      });
    } catch (error: any) {
      return c.json({ code: 500, message: error.message }, 500);
    }
  });
}
