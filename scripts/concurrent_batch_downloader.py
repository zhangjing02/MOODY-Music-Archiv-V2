import os
import sys
import json
import time
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.append(os.path.dirname(__file__))
import download_music as dm

REPORTS_DIR = os.path.join(os.path.dirname(__file__), "..", "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)
SKIPPED_LOG_JSON = os.path.join(REPORTS_DIR, "skipped_albums_log.json")
SKIPPED_LOG_MD = os.path.join(REPORTS_DIR, "skipped_albums_log.md")

# 待下载的专辑全量有序队列
ALBUM_PIPELINE = [
    # --- 林俊杰剩余正式录音室大碟 ---
    {"artist": "林俊杰", "album": "她说", "year": "2010", "tracks": ['她说', '爱笑的眼睛', '只对你有感觉', '当你', '一眼万年', '保护色', '握不住的他', '心墙', '我很想爱他', '一生的爱', '记得', '完美新世界', 'I Am']},
    {"artist": "林俊杰", "album": "学不会", "year": "2011", "tracks": ['独奏', '学不会', '故事细腻', '那些你很冒险的梦', '白羊梦', '灵魂的共鸣', 'We Together', 'Cinderella', '白兰花', '陌生老朋友', '不存在的情人', 'Love U U']},
    {"artist": "林俊杰", "album": "因你而在", "year": "2013", "tracks": ['因你而在', '零度的亲吻', '黑暗骑士', '修炼爱情', '飞机', '巴洛克先生', 'One Shot', '裂缝中的阳光', '友人说', '十秒的冲动', '以后要做的事']},
    {"artist": "林俊杰", "album": "新地球", "year": "2014", "tracks": ['回', '新地球', '水仙', '浪漫血液', '黑键', '手心的蔷薇', '可惜没如果', 'I Am Alive', '爱的鼓励', '茉莉雨', '生生']},
    {"artist": "林俊杰", "album": "和自己对话", "year": "2015", "tracks": ['调音', '不为谁而作的歌', '中场休息', '关键词', '只要有你的地方', '弹唱', '有梦不难', 'Welcome to the Livehouse', 'Too Bad', '有没有过', '12年前', '现在的我和她', 'Lier And Accuser', '独舞']},
    {"artist": "林俊杰", "album": "伟大的渺小", "year": "2017", "tracks": ['圣所', '伟大的渺小', '穿越', '四点四十四', '我继续', '剪云者', '黑夜问白天', '丹宁执着', '身为风帆', '小瓶子', 'Until The Day']},
    {"artist": "林俊杰", "album": "幸存者 • 如你", "year": "2020", "tracks": ['最向往的地方', '交换余生', '幸存者', '离开的那一些', '最好是', '暂时的记号', 'While I Can', 'Bedroom', 'Not Tonight', 'All Time Favorite', 'We Are']},
    {"artist": "林俊杰", "album": "重拾·快乐", "year": "2023", "tracks": ['愿与愁', '逆光白', '孤独娱乐', '梦不凌乱', '自画像', '谢幕', '如果我还剩一件事情可以做', '黑色泡沫', '你都在', '一时的选择', 'Castle In The Air', '7千3百多天']},
    
    # --- 陈奕迅核心录音室大碟 ---
    {"artist": "陈奕迅", "album": "Special Thanks To...", "year": "2002", "tracks": ['Special Thanks To 1', '你的背包', '谢谢侬', '男人的错', '你会不会', '故事', '想哭', 'Special Thanks To 2', '人造卫星', '没有手机的日子', '跳蚤市场', '狂人日记', 'Special Thanks To 3']},
    {"artist": "陈奕迅", "album": "黑白灰", "year": "2003", "tracks": ['阿怪', '我们都寂寞', '兄妹', '十年', '要你的', '世界', '谢谢', '像一句广告', '寂寞奏鸣曲', 'Last Order']},
    {"artist": "陈奕迅", "album": "U87", "year": "2005", "tracks": ['烂', '阿牛', '夕阳无限好', '16月6日晴', '浮夸', '葡萄成熟时', '三个人的探戈', '不良嗜好', '怕死', '大个女', '新美人主义', '遇见了你']},
    {"artist": "陈奕迅", "album": "认了吧", "year": "2007", "tracks": ['烟味', '淘汰', '快乐男生', '红玫瑰', '月黑风高', '爱情转移', '好久不见', '爱是一本书', '第一个雅皮士', '白色球鞋']},
    {"artist": "陈奕迅", "album": "不想放手", "year": "2008", "tracks": ['27 Month', '且聽下回分解', '不要說話', '漂亮小姐', '臭美', '路...一直都在', '然後怎樣', '瑪利奧派對', '那一夜有沒有雪', '倒帶人生', '期待你']},
    {"artist": "陈奕迅", "album": "H³M", "year": "2009", "tracks": ['Allegro Opus 3.3am', '还有什么可以送给你', '于心有愧', '今天只做一件事', '一个旅人', '七百年后', 'Life Goes On', '太阳照常升起', '不来也不去', '沙龙']},
    {"artist": "陈奕迅", "album": "上五樓的快活", "year": "2009", "tracks": ['在你身边', '这样的一个麻烦', '多少', '谋情害命', '我什么都没有', '床头灯', '给你', '心的距离', '从何说起', '大家各有难处', '寻找咬苹果的人']},
    {"artist": "陈奕迅", "album": "...3mm", "year": "2012", "tracks": ['重口味', '非禮', 'Class', '碌卡', '笑死朕', '蚊', 'Let It Out', '習慣說', '信任', '完']},
    {"artist": "陈奕迅", "album": "Rice & Shine", "year": "2014", "tracks": ['娱乐天空', '四季圈', '愚人快乐', '不如承诺来的简单', '对面', '你给我听好', '在这儿', '可以了', '睡前故事']},
    {"artist": "陈奕迅", "album": "Getting Ready", "year": "2015", "tracks": ['老細我撇先', '無條件', '人生馬拉松', '黑洞', '心燒', '喜歡一個人', '萬俗之王', '異夢', '一個靈魂的獨白', '夢的可能']},
    {"artist": "陈奕迅", "album": "CHIN UP!", "year": "2023", "tracks": ['尘大师', '人啊人', '焦急听众', '渐渐', '盲婚哑嫁', '社交恐惧癌', '暗里着迷', '也罢']}
]

def log_skipped_album(artist: str, album: str, reason: str, details: dict = None):
    """记录跳过的异常专辑信息"""
    record = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "artist": artist,
        "album": album,
        "reason": reason,
        "details": details or {}
    }
    
    # 写入 JSON
    logs = []
    if os.path.exists(SKIPPED_LOG_JSON):
        try:
            with open(SKIPPED_LOG_JSON, 'r', encoding='utf-8') as f:
                logs = json.load(f)
        except Exception:
            logs = []
    logs.append(record)
    with open(SKIPPED_LOG_JSON, 'w', encoding='utf-8') as f:
        json.dump(logs, f, ensure_ascii=False, indent=2)
        
    # 写入 Markdown
    md_entry = f"### ⚠️ 跳过待确认专辑: 《{album}》 - {artist}\n"
    md_entry += f"- **记录时间**: {record['timestamp']}\n"
    md_entry += f"- **跳过原因**: {reason}\n"
    if details:
        md_entry += f"- **异常详情**: `{details}`\n"
    md_entry += "\n---\n"
    with open(SKIPPED_LOG_MD, 'a', encoding='utf-8') as f:
        f.write(md_entry)
        
    print(f"\n🚨 [已记录并跳过] 《{album}》 - {artist} | 原因: {reason}\n")

def process_album_concurrent(album_info: dict, max_workers: int = 2):
    """单张专辑的多线程抓取与核验"""
    artist = album_info["artist"]
    album = album_info["album"]
    tracks = album_info["tracks"]
    
    print("\n" + "=" * 80)
    print(f"📀 开始处理专辑: 《{album}》({album_info.get('year')}) - {artist} | 共 {len(tracks)} 首")
    print(f"⚙️ 启用并发数: {max_workers} 线程")
    print("=" * 80)
    
    # 将名录注册到全局
    dm.LOCAL_ALBUM_TRACKLISTS[album] = tracks
    
    results = {}
    failed_songs = []
    
    # 使用 ThreadPoolExecutor 执行并发歌曲下载与校验
    def download_worker(song_name):
        try:
            print(f"⏳ 正在抓轨: 《{song_name}》- {artist}...")
            target_path, qa, lrc_info = dm.download_track(song_name, artist, album, dm.DEFAULT_DOWNLOAD_DIR)
            if qa and target_path:
                qa['lyrics_intro'] = lrc_info.get('intro', '') if lrc_info else ''
                return song_name, qa, True, None
            else:
                return song_name, None, False, "未找到可用音源或校验不符"
        except Exception as e:
            return song_name, None, False, str(e)
            
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(download_worker, s): s for s in tracks}
        for future in as_completed(futures):
            song_name = futures[future]
            try:
                s_name, qa, success, err = future.result()
                if success and qa:
                    results[s_name] = qa
                else:
                    failed_songs.append((s_name, err))
            except Exception as exc:
                failed_songs.append((song_name, str(exc)))

    success_rate = len(results) / len(tracks) if tracks else 0
    print(f"\n📊 《{album}》处理完毕: 成功 {len(results)}/{len(tracks)} (成功率 {success_rate*100:.1f}%)")
    
    # 若失败率超过 50% 或曲目结构异常，记录日志跳过
    if success_rate < 0.5:
        log_skipped_album(
            artist, album,
            f"失败率过高 ({len(failed_songs)}/{len(tracks)} 失败)，可能存在曲目名录冲突或版本下架",
            {"failed_songs": failed_songs}
        )
        return False
        
    # 生成报告清单并追加到 walkthrough.md
    report_rows = []
    for idx, s in enumerate(tracks, 1):
        if s in results:
            qa = results[s]
            status = "💾 仅本地下载"
            report_rows.append(f"| {idx:02d} | {s} | {qa.get('bitrate', 'N/A')} | {qa.get('duration', 'N/A')} | {qa.get('lyrics_intro', 'N/A')} | {qa.get('ai_heard', 'N/A')[:60]}... | {status} |")
        else:
            report_rows.append(f"| {idx:02d} | {s} | 失败 | 失败 | N/A | N/A | ❌ 失败 |")
            
    checklist_md = f"\n### 📋 《{album}》交付与 AI 听音歌词双重核验清单 (Checklist)\n\n"
    checklist_md += "| 序号 | 歌名 | 规格码率 | 时长 | 官方歌词节选 | 🤖 AI实测听词 (Groq Whisper) | 入库状态 |\n"
    checklist_md += "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n"
    checklist_md += "\n".join(report_rows) + "\n"
    
    dm.append_to_walkthrough(checklist_md)
    return True

def run_pipeline():
    """按顺序遍历执行流水线"""
    print("=" * 80)
    print(f"🚀 全自动并发曲库下载流水线启动 | 待处理专辑数: {len(ALBUM_PIPELINE)}")
    print(f"策略: 遇到异常自动记录日志至 reports/ 并跳过该专辑，继续执行后续队列")
    print("=" * 80)
    
    for idx, item in enumerate(ALBUM_PIPELINE, 1):
        print(f"\n>>>>> 队列推进 [{idx}/{len(ALBUM_PIPELINE)}]: {item['artist']} - 《{item['album']}》 <<<<<")
        try:
            process_album_concurrent(item, max_workers=2)
        except Exception as e:
            log_skipped_album(item['artist'], item['album'], f"处理异常崩溃: {e}")
            print(f"⚠️ 发生未知异常，已记录并跳至下一张专辑...")
        time.sleep(2)
        
    print("\n" + "=" * 80)
    print("🎉 全量专辑流水线全部执行完毕！")
    print(f"跳过的异常专辑已整理至: {SKIPPED_LOG_MD}")
    print("=" * 80)

if __name__ == "__main__":
    run_pipeline()
