const fs = require('fs');
const path = 'e:/Html-work/backend/internal/handler/handlers.go';
let content = fs.readFileSync(path, 'utf8');
const search = 'count, lyricsCount, err = service.SyncMusicFromR2("primary", req.Path)';
const replace = `if (targetSet["sync-db"] || targetSet["db"]) {
					err = service.DownloadDBFromR2("primary")
				} else {
					count, lyricsCount, err = service.SyncMusicFromR2("primary", req.Path)
				}`;

if (content.includes(search)) {
    content = content.replace(search, replace);
    // 同时注入 db 目标识别
    const targetSearch = 'if targetSet["sync-lyrics"] || targetSet["lyrics"] {';
    const targetReplace = `if targetSet["sync-lyrics"] || targetSet["lyrics"] {
			syncTargets = append(syncTargets, "lyrics")
		}
		if targetSet["sync-db"] || targetSet["db"] {
			syncTargets = append(syncTargets, "db")
		}`;
    // 获取下一行并替换整个块
    content = content.replace(targetSearch + '\r\n\t\t\tsyncTargets = append(syncTargets, "lyrics")\r\n\t\t}', targetReplace);
    // 如果没有 \r\n 尝试 \n
    if (!content.includes('syncTargets = append(syncTargets, "db")')) {
        content = content.replace(targetSearch + '\n\t\t\tsyncTargets = append(syncTargets, "lyrics")\n\t\t}', targetReplace);
    }
    
    fs.writeFileSync(path, content);
    console.log('Successfully patched handlers.go');
} else {
    console.log('Search string not found');
}
