#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MOODY 安全文件对齐工具 (V12.50)

以 skeleton.json 嵌入式数据为唯一真相来源，绝不修改数据库。
仅对磁盘上命名不规范的歌曲文件执行原地重命名（rename），使其与
skeleton 中的歌曲标题一致，以便数据库能正确读取。

用法：
  python safe_align.py              # dry-run 预览模式（默认）
  python safe_align.py --apply      # 实际执行重命名
  python safe_align.py --artist 周杰伦  # 仅处理指定歌手

安全特性：
  - 默认 dry-run，不做任何更改
  - 使用 os.rename() 原地重命名，不删除、不移动
  - 目标文件已存在时自动跳过
  - skeleton.json 永远不会被修改
"""
import json
import os
import sys
import re
import argparse
from pathlib import Path

# 编码由环境变量 PYTHONIOENCODING=utf-8 控制

# ============================================================
# 路径配置
# ============================================================
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent.parent  # tools->cmd->backend->Html-work
SKELETON_PATH = PROJECT_ROOT / "storage" / "metadata" / "skeleton.json"
MUSIC_DIR = PROJECT_ROOT / "storage" / "music"

if not SKELETON_PATH.exists():
    SKELETON_PATH = Path(r"E:\Html-work\storage\metadata\skeleton.json")
    MUSIC_DIR = Path(r"E:\Html-work\storage\music")

AUDIO_EXTS = {'.mp3', '.flac', '.m4a', '.wav', '.aac', '.ogg'}


def normalize(s: str) -> str:
    """标准化字符串：去空格、标点、转小写，用于模糊比较"""
    s = s.strip().lower()
    s = re.sub(r'[\s.\-_,]+', '', s)
    return s


def match_score(filename_stem: str, song_title: str) -> int:
    """计算文件名与歌曲标题的匹配分数，返回 0 表示不匹配。

    匹配策略（按优先级 / 分数高低）：
      100 - 精确匹配（文件名 == 歌曲标题）
       80 - 文件名以歌曲标题开头 + 分隔符（如 "可爱女人-周杰伦-Jay"）
       60 - 按 "-" 分割后第一段精确等于歌曲标题
       40 - normalize 后精确匹配
       30 - normalize 后以歌曲标题开头且标题长度 >= 2
       20 - normalize 后按 "-" 分割第一段匹配
    """
    if filename_stem == song_title:
        return 100

    if filename_stem.startswith(song_title + '-') or filename_stem.startswith(song_title + ' '):
        return 80

    parts = filename_stem.split('-')
    if parts and parts[0].strip() == song_title:
        return 60

    # normalize 后的匹配
    n_file = normalize(filename_stem)
    n_song = normalize(song_title)

    if not n_song:
        return 0

    if n_file == n_song:
        return 40

    if n_file.startswith(n_song) and len(n_song) >= 2:
        return 30

    n_parts = [normalize(p) for p in parts]
    if n_parts and n_parts[0] == n_song:
        return 20

    return 0


def safe_align(skeleton_path: Path, music_dir: Path, apply: bool = False,
               filter_artist: str = None):
    """主逻辑：扫描并对齐文件名"""

    with open(skeleton_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    total_expected = 0
    already_ok = 0
    rename_actions = []
    missing_songs = []
    skipped_conflict = []

    for artist in data['artists']:
        artist_name = artist['name']

        if filter_artist and artist_name != filter_artist:
            continue

        for album in artist.get('albums', []):
            album_title = album['title']
            album_dir = music_dir / artist_name / album_title

            if not album_dir.exists():
                for song in album.get('songs', []):
                    total_expected += 1
                continue

            # 收集该目录下所有真实音频文件
            disk_files = {}
            for f in album_dir.iterdir():
                if f.is_file() and f.suffix.lower() in AUDIO_EXTS and f.stat().st_size > 100:
                    disk_files[f.stem] = f

            # 第一轮：标记已经对齐的文件
            aligned_titles = set()
            for song in album.get('songs', []):
                total_expected += 1
                song_title = song.get('title', '')
                if song_title in disk_files:
                    already_ok += 1
                    aligned_titles.add(song_title)

            # 第二轮：对缺失的歌曲，在多余文件中寻找匹配
            orphan_files = {stem: path for stem, path in disk_files.items()
                           if stem not in aligned_titles}

            for song in album.get('songs', []):
                song_title = song.get('title', '')
                if song_title in aligned_titles:
                    continue

                best_stem = None
                best_score = 0

                for orphan_stem in orphan_files:
                    score = match_score(orphan_stem, song_title)
                    if score > best_score:
                        best_score = score
                        best_stem = orphan_stem

                if best_stem and best_score > 0:
                    src = orphan_files[best_stem]
                    dst = album_dir / (song_title + src.suffix.lower())

                    if dst.exists():
                        skipped_conflict.append(
                            "  [SKIP] %s/%s: target %s already exists, skip %s" %
                            (artist_name, album_title, dst.name, src.name)
                        )
                    else:
                        rename_actions.append((src, dst, artist_name, album_title,
                                               song_title, best_score))
                        del orphan_files[best_stem]
                else:
                    missing_songs.append(
                        "  [MISS] %s / %s / %s" % (artist_name, album_title, song_title)
                    )

    # ============================================================
    # 输出报告 (纯 ASCII 安全字符)
    # ============================================================
    print("=" * 60)
    print("MOODY Safe Align Tool (V12.50)")
    mode_str = "[APPLY] Execute Mode" if apply else "[DRY-RUN] Preview Mode"
    print("Mode: %s" % mode_str)
    print("=" * 60)

    print("")
    print("[STATS] Skeleton songs total : %d" % total_expected)
    print("[OK]    Already aligned       : %d" % already_ok)
    print("[RENAME] Pending rename       : %d" % len(rename_actions))
    print("[MISS]  Completely missing    : %d" % len(missing_songs))

    if rename_actions:
        print("")
        print("-" * 50)
        print("Rename Actions:")
        print("-" * 50)
        executed = 0
        for src, dst, artist, album, title, score in rename_actions:
            status = ""
            if apply:
                try:
                    os.rename(str(src), str(dst))
                    status = " [DONE]"
                    executed += 1
                except Exception as e:
                    status = " [FAIL: %s]" % str(e)
            print("  [%s/%s]" % (artist, album))
            print("    %s" % src.name)
            print("    -> %s (confidence: %d)%s" % (dst.name, score, status))
            print("")

        if apply:
            print("[OK] Executed %d/%d rename operations" % (executed, len(rename_actions)))
        else:
            print("[TIP] Add --apply to execute the rename operations")

    if skipped_conflict:
        print("")
        print("[WARN] Skipped conflicts (%d):" % len(skipped_conflict))
        for s in skipped_conflict:
            print(s)

    if missing_songs and len(missing_songs) <= 50:
        print("")
        print("[MISS] Missing songs (first %d):" % min(50, len(missing_songs)))
        for s in missing_songs[:50]:
            print(s)
        if len(missing_songs) > 50:
            print("  ... and %d more" % (len(missing_songs) - 50))

    print("")
    print("=" * 60)
    print("[SAFE] This tool NEVER modifies skeleton.json.")
    print("[SAFE] Only renames disk files in-place using os.rename().")
    print("=" * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='MOODY Safe Align Tool')
    parser.add_argument('--apply', action='store_true',
                        help='Execute renames (default: dry-run preview)')
    parser.add_argument('--artist', type=str, default=None,
                        help='Filter by artist name (e.g. Jay Chou)')
    args = parser.parse_args()

    if not SKELETON_PATH.exists():
        print("[ERROR] skeleton.json not found: %s" % SKELETON_PATH)
        sys.exit(1)

    if not MUSIC_DIR.exists():
        print("[ERROR] Music directory not found: %s" % MUSIC_DIR)
        sys.exit(1)

    safe_align(SKELETON_PATH, MUSIC_DIR, apply=args.apply,
               filter_artist=args.artist)
