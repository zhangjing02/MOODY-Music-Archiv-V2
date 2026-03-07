#!/usr/bin/env python3
"""
MOODY 资源对齐审计工具 (V12.49)
用途：检查磁盘上的音乐文件与 skeleton.json 数据的匹配度。
运行：python audit_alignment.py [--rename]
  --rename  [推荐] 以前端骨架为准，自动将磁盘上的孤儿文件重命名并移动到标准目录项
  --fix     将匹配到的磁盘路径写回 skeleton.json (不推荐，建议使用 --rename)
"""
import json, os, sys, re, argparse, shutil
from pathlib import Path

# 自动探测路径
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent  # backend/cmd/tools -> project root
SKELETON_PATH = PROJECT_ROOT / "storage" / "metadata" / "skeleton.json"
MUSIC_DIR = PROJECT_ROOT / "storage" / "music"

# 也支持直接从 storage 目录运行
if not SKELETON_PATH.exists():
    SKELETON_PATH = Path("storage/metadata/skeleton.json")
    MUSIC_DIR = Path("storage/music")

sys.stdout.reconfigure(encoding='utf-8')

def normalize(s):
    """标准化字符串用于模糊匹配：去标点、空格、转小写"""
    s = str(s).strip().lower()
    s = re.sub(r'[\s\.\-_,，。！!？?\'\"（）\(\)\[\]【】]', '', s)
    s = re.sub(r'^\d+\.\s*', '', s)  # 去掉文件名前的编号 "01. "
    return s

def scan_disk_files(music_dir):
    """全量扫描磁盘上的真实音乐文件（包括深度嵌套或零散文件）"""
    all_files = [] # 列表形式，存储所有找到的音乐文件及其当前信息
    audio_exts = {'.mp3', '.flac', '.m4a', '.wav', '.aac', '.ogg'}
    
    if not music_dir.exists():
        print(f"⚠️ 音乐目录不存在: {music_dir}")
        return all_files
    
    for root, dirs, files in os.walk(music_dir):
        for f in files:
            p = Path(root) / f
            if p.suffix.lower() in audio_exts:
                if p.stat().st_size > 10:  # 排除占位符
                    all_files.append({
                        'path': p,
                        'filename': p.stem,
                        'suffix': p.suffix,
                        'rel_path': str(p.relative_to(music_dir)).replace('\\', '/')
                    })
    return all_files

def audit(skeleton_path, music_dir, fix_mode=False, rename_mode=False):
    with open(skeleton_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    disk_files = scan_disk_files(music_dir)
    # 建立模糊索引: {normalized_filename: list_of_file_info}
    disk_index = {}
    for df in disk_files:
        key = normalize(df['filename'])
        if key not in disk_index: disk_index[key] = []
        disk_index[key].append(df)
    
    total_skeleton_songs = 0
    already_aligned = 0
    fixed_count = 0
    renamed_count = 0
    unmatched_songs = []
    processed_paths = set() # 记录已经被占用的磁盘路径

    print("=" * 60)
    print("MOODY 资源自动规范化工具 (V12.49)")
    print("=" * 60)
    
    # 1. 遍历骨架，尝试寻找匹配
    for artist in data['artists']:
        artist_name = artist['name']
        for album in artist.get('albums', []):
            album_title = album['title']
            for song in album.get('songs', []):
                total_skeleton_songs += 1
                song_title = song.get('title', '')
                
                # 预定义标准路径：storage/music/歌手/专辑/歌曲.mp3
                # 注意：这里我们只定义一个相对路径，用于检查或移动
                std_rel_dir = Path(artist_name) / album_title
                
                # 检查是否已经对齐
                found_perfect = False
                for df in disk_files:
                    # 如果文件名完全匹配标准且在正确目录下
                    if df['filename'] == song_title and df['path'].parent.name == album_title:
                        already_aligned += 1
                        found_perfect = True
                        processed_paths.add(str(df['path']))
                        break
                
                if found_perfect: continue

                # 1. 尝试模糊索引匹配
                norm_song = normalize(song_title)
                best_match = None
                
                # 预先筛选所有可能的候选者
                candidates = []
                # 从模糊索引中找
                if norm_song in disk_index:
                    candidates.extend(disk_index[norm_song])
                
                # 从解析匹配中找 ('歌名-歌手-专辑.mp3')
                if not candidates:
                    for df in disk_files:
                        if str(df['path']) in processed_paths: continue
                        parts = [normalize(p) for p in df['filename'].split('-')]
                        if norm_song in parts:
                            candidates.append(df)

                # 宽松包含匹配
                if not candidates:
                    for key, matches in disk_index.items():
                        if (norm_song in key or key in norm_song) and len(norm_song) >= 2:
                            candidates.extend(matches)
                
                # 对候选者进行打分/排序，优先选择路径中包含歌手或专辑名的文件
                if candidates:
                    scored_candidates = []
                    for c in candidates:
                        if str(c['path']) in processed_paths: continue
                        score = 0
                        path_str = str(c['path'])
                        if artist_name in path_str: score += 10
                        if album_title in path_str: score += 5
                        # 如果已经在正确的父目录下，权重最高
                        if c['path'].parent.name == album_title: score += 20
                        scored_candidates.append((score, c))
                    
                    if scored_candidates:
                        # 按分数降序排列
                        scored_candidates.sort(key=lambda x: x[0], reverse=True)
                        best_match = scored_candidates[0][1]
                
                if best_match:
                    # 匹配成功！
                    processed_paths.add(str(best_match['path']))
                    std_name = f"{song_title}{best_match['suffix']}"
                    full_std_dir = music_dir / std_rel_dir
                    full_std_path = full_std_dir / std_name
                    
                    if rename_mode:
                        try:
                            os.makedirs(full_std_dir, exist_ok=True)
                            # 如果目标已存在且不是当前文件，则执行覆盖或跳过逻辑
                            resolved_std = full_std_path.resolve() if full_std_path.exists() else None
                            resolved_match = best_match['path'].resolve()
                            
                            if resolved_std and resolved_std != resolved_match:
                                # 如果已经是标准格式且内容存在，为了安全我们先跳过或者替换
                                # 这里我们选择替换，但增加日志
                                print(f"  🔄 目标已存在，正在替换: {std_name}")
                                os.remove(full_std_path)
                            
                            if not full_std_path.exists() or full_std_path.resolve() != best_match['path'].resolve():
                                shutil.move(str(best_match['path']), str(full_std_path))
                                renamed_count += 1
                                # 同时清空 JSON 中的 path 字段，让它依赖物理扫描
                                song['path'] = "" 
                        except Exception as e:
                            print(f"  ❌ 操作失败 {song_title}: {e}")
                    elif fix_mode:
                        song['path'] = best_match['rel_path']
                        fixed_count += 1
                else:
                    unmatched_songs.append(f"  {artist_name} / {album_title} / {song_title}")

    # 3. 输出汇总
    print(f"\n📊 骨架歌曲总量: {total_skeleton_songs}")
    print(f"✅ 初始已对齐:   {already_aligned}")
    
    if rename_mode:
        print(f"🪄 本次规范化更名: {renamed_count} 首")
    
    if fix_mode:
        print(f"🔧 本次 JSON 修复: {fixed_count} 首")
        
    print(f"❌ 依然缺失歌项: {len(unmatched_songs)}")
    
    if rename_mode or fix_mode:
        with open(skeleton_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\n✅ 数据已持久化到 {skeleton_path.name}")
        print("💡 请记得在管理后台或通过 API 执行 '全量同步' 以刷新索引数据。")

    print("=" * 60)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='MOODY 资源自动规范化工具')
    parser.add_argument('--rename', action='store_true', help='[推荐] 按骨架逻辑重命名磁盘文件')
    parser.add_argument('--fix', action='store_true', help='仅修改 skeleton.json 记录路径')
    args = parser.parse_args()
    
    if not SKELETON_PATH.exists():
        print(f"❌ skeleton.json 未找到: {SKELETON_PATH}")
        sys.exit(1)
    
    if not args.rename and not args.fix:
        print("ℹ️ 当前为审计模式。使用 --rename 进行物理更名，使用 --fix 进行 JSON 路径回填。")
    
    audit(SKELETON_PATH, MUSIC_DIR, fix_mode=args.fix, rename_mode=args.rename)
