"""
歌词文件重命名工具
将 l_XXXX.lrc 格式的歌词文件，通过读取文件内部的 [ti:xxx] 标签，
重命名为 {歌曲标题}.lrc 格式，方便上传到云端后由 governance 接口自动匹配。
"""
import os
import re

LYRICS_DIR = os.path.join(os.path.dirname(__file__), "..", "storage", "lyrics")

def extract_ti_tag(filepath):
    """从 .lrc 文件中提取 [ti:xxx] 标签值"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                match = re.match(r'^\[ti:(.*?)\]$', line)
                if match:
                    return match.group(1).strip()
                # 遇到时间戳行则停止搜索
                if re.match(r'^\[\d', line):
                    break
    except:
        pass
    return None

def rename_lyrics():
    """遍历所有 l_XXXX.lrc 文件并重命名为 {歌名}.lrc"""
    renamed = 0
    skipped = 0
    
    for root, dirs, files in os.walk(LYRICS_DIR):
        for filename in files:
            if filename.startswith("l_") and filename.endswith(".lrc"):
                full_path = os.path.join(root, filename)
                title = extract_ti_tag(full_path)
                
                if not title:
                    print(f"⚠️  跳过（无 [ti:] 标签）: {filename}")
                    skipped += 1
                    continue
                
                # 清理标题中的非法文件名字符
                safe_title = re.sub(r'[\\/:*?"<>|]', '', title)
                new_filename = f"{safe_title}.lrc"
                new_path = os.path.join(root, new_filename)
                
                if os.path.exists(new_path):
                    print(f"⚠️  跳过（目标已存在）: {filename} -> {new_filename}")
                    skipped += 1
                    continue
                    
                os.rename(full_path, new_path)
                rel_dir = os.path.relpath(root, LYRICS_DIR)
                print(f"✅ {rel_dir}/{filename} -> {new_filename}")
                renamed += 1
    
    print(f"\n{'='*40}")
    print(f"🎉 完成！重命名 {renamed} 个文件，跳过 {skipped} 个文件")

if __name__ == "__main__":
    rename_lyrics()
