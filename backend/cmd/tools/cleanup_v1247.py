#!/usr/bin/env python3
"""V12.47 全量数据治理脚本
1. 补全周杰伦 14 张专辑完整歌曲列表
2. Beyond 去重
3. 简繁名称统一为简体
"""
import json
import sys
import shutil
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

SKELETON_PATH = r'E:\Html-work\storage\metadata\skeleton.json'

# ============================================================
# 1. 周杰伦 14 张专辑完整歌曲列表 (手工交叉验证)
# ============================================================
JAY_ALBUMS = {
    "Jay": [
        "可爱女人", "完美主义", "星晴", "娘子", "斗牛",
        "黑色幽默", "伊斯坦堡", "印第安老斑鸠", "龙卷风", "反方向的钟"
    ],
    "范特西": [
        "爱在西元前", "爸我回来了", "简单爱", "忍者", "开不了口",
        "上海一九四三", "对不起", "威廉古堡", "双截棍", "安静"
    ],
    "八度空间": [
        "半兽人", "半岛铁盒", "暗号", "龙拳", "火车叨位去",
        "分裂", "爷爷泡的茶", "回到过去", "米兰的小铁匠", "最后的战役"
    ],
    "叶惠美": [
        "以父之名", "懦夫", "晴天", "三年二班", "东风破",
        "你听得到", "同一种调调", "她的睫毛", "爱情悬崖", "梯田", "双刀"
    ],
    "七里香": [
        "我的地盘", "七里香", "借口", "外婆", "将军",
        "搁浅", "乱舞春秋", "困兽之斗", "园游会", "止战之殇"
    ],
    "十一月的萧邦": [
        "夜曲", "蓝色风暴", "发如雪", "黑色毛衣", "四面楚歌",
        "枫", "浪漫手机", "逆鳞", "麦芽糖", "珊瑚海", "飘移", "一路向北"
    ],
    "依然范特西": [
        "夜的第七章", "听妈妈的话", "千里之外", "本草纲目", "退后",
        "红模仿", "心雨", "白色风车", "迷迭香", "菊花台"
    ],
    "我很忙": [
        "牛仔很忙", "彩虹", "青花瓷", "阳光宅男", "蒲公英的约定",
        "无双", "我不配", "扯", "甜甜的", "最长的电影"
    ],
    "魔杰座": [
        "龙战骑士", "给我一首歌的时间", "蛇舞", "花海", "魔术先生",
        "说好的幸福呢", "兰亭序", "流浪诗人", "时光机", "乔克叔叔", "稻香"
    ],
    "跨时代": [
        "跨时代", "说了再见", "烟花易冷", "免费教学录影带", "好久不见",
        "雨下一整晚", "嘻哈空姐", "我落泪情绪零碎", "爱的飞行日记", "自导自演", "超人不会飞"
    ],
    "惊叹号": [
        "惊叹号", "迷魂曲", "Mine Mine", "公主病", "你好吗",
        "疗伤烧肉粽", "琴伤", "水手怕水", "世界未末日", "超跑女神", "皮影戏"
    ],
    "十二新作": [
        "四季列车", "手语", "公公偏头痛", "明明就", "傻笑",
        "比较大的大提琴", "爱你没差", "红尘客栈", "梦想启动", "大笨钟", "哪里都是你", "乌克丽丽"
    ],
    "哎呦，不错哦": [
        "阳明山", "窃爱", "天涯过客", "怎么了", "一口气全念对",
        "我要夏天", "手写的从前", "鞋子特大号", "听爸爸的话", "美人鱼", "算什么男人", "天作之合"
    ],
    "周杰伦的床边故事": [
        "床边故事", "说走就走", "一点点", "前世情人", "英雄",
        "不该", "告白气球", "爱情废柴", "Now You See Me", "土耳其冰淇淋"
    ]
}

# ============================================================
# 2. 繁体→简体映射表 (仅针对此项目中出现的歌手名)
# ============================================================
TRAD_TO_SIMP = {
    "任賢齊": "任贤齐",
    "信樂團": "信乐团",
    "動力火車": "动力火车",
    "劉德華": "刘德华",
    "南拳媽媽": "南拳妈妈",
    "孟庭葦": "孟庭苇",
    "孫燕姿": "孙燕姿",
    "容祖兒": "容祖儿",
    "張信哲": "张信哲",
    "張國榮": "张国荣",
    "張學友": "张学友",
    "張惠妹": "张惠妹",
    "張雨生": "张雨生",
    "張震嶽": "张震岳",
    "楊丞琳": "杨丞琳",
    "楊千嬅": "杨千嬅",
    "游鴻明": "游鸿明",
    "潘瑋柏": "潘玮柏",
    "盧廣仲": "卢广仲",
    "羅大佑": "罗大佑",
    "范曉萱": "范晓萱",
    "范瑋琪": "范玮琪",
    "萬曉利": "万晓利",
    "萬芳": "万芳",
    "蕭亞軒": "萧亚轩",
    "蕭敬騰": "萧敬腾",
    "薩頂頂": "萨顶顶",
    "蘇慧倫": "苏慧伦",
    "蘇打綠": "苏打绿",
    "許志安": "许志安",
    "譚詠麟": "谭咏麟",
    "費玉清": "费玉清",
    "鄧紫棋": "邓紫棋",
    "鄧麗君": "邓丽君",
    "陳奕迅": "陈奕迅",
    "陳綺貞": "陈绮贞",
    "韋禮安": "韦礼安",
    "順子": "顺子",
    "飛兒樂團": "飞儿乐团",
    "高勝美": "高胜美",
    "黃品源": "黄品源",
    "黃小琥": "黄小琥",
    "黃義達": "黄义达",
    "齊秦": "齐秦",
    "齊豫": "齐豫",
    "李聖傑": "李圣杰",
    "林俊傑": "林俊杰",
    "梁靜茹": "梁静茹",
    "梅艷芳": "梅艳芳",
    "庾澄慶": "庾澄庆",
    "姜育恆": "姜育恒",
    "田馥甄": "田馥甄",
    "羽·泉": "羽·泉",
}


def main():
    # 备份
    backup_path = SKELETON_PATH + f'.bak_{datetime.now().strftime("%Y%m%d_%H%M%S")}'
    shutil.copy2(SKELETON_PATH, backup_path)
    print(f"✅ 备份: {backup_path}")

    with open(SKELETON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    artists = data['artists']
    changes = []

    # ---- Step 1: 补全周杰伦歌曲 ----
    for a in artists:
        if a['name'] == '周杰伦':
            total_songs = 0
            for alb in a.get('albums', []):
                title = alb['title']
                if title in JAY_ALBUMS:
                    # 格式必须匹配 Go 的 LibrarySong 结构体: {title, path, lrcPath}
                    alb['songs'] = [{"title": s, "path": "", "lrcPath": ""} for s in JAY_ALBUMS[title]]
                    total_songs += len(alb['songs'])
                else:
                    print(f"  ⚠️ 未匹配专辑: {title}")
            changes.append(f"周杰伦: 填充 {total_songs} 首歌曲到 {len(a['albums'])} 张专辑")
            break

    # ---- Step 2: Beyond 去重 ----
    beyond_indices = [i for i, a in enumerate(artists) if a['name'] == 'Beyond']
    if len(beyond_indices) > 1:
        # 保留专辑数最多的那个
        best = max(beyond_indices, key=lambda i: len(artists[i].get('albums', [])))
        to_remove = [i for i in beyond_indices if i != best]
        for idx in sorted(to_remove, reverse=True):
            del artists[idx]
        changes.append(f"Beyond: 去除 {len(to_remove)} 条重复 (保留 {len(artists[best if best < len(artists) else 0].get('albums',[]))} 张专辑)")

    # ---- Step 3: 简繁统一 ----
    simp_count = 0
    for a in artists:
        if a['name'] in TRAD_TO_SIMP:
            old_name = a['name']
            new_name = TRAD_TO_SIMP[old_name]
            a['name'] = new_name
            simp_count += 1

    if simp_count > 0:
        changes.append(f"简繁统一: 转换 {simp_count} 个歌手名为简体")

    # ---- 再做一次全局去重检查 ----
    from collections import Counter
    name_count = Counter(a['name'] for a in artists)
    dupes = {k: v for k, v in name_count.items() if v > 1}
    if dupes:
        # 合并重复：保留专辑最多的
        for dup_name, count in dupes.items():
            indices = [i for i, a in enumerate(artists) if a['name'] == dup_name]
            best = max(indices, key=lambda i: len(artists[i].get('albums', [])))
            to_remove = [i for i in indices if i != best]
            for idx in sorted(to_remove, reverse=True):
                del artists[idx]
            changes.append(f"去重 '{dup_name}': 移除 {len(to_remove)} 条冗余")

    # ---- 写入 ----
    data['artists'] = artists
    with open(SKELETON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("\n" + "="*50)
    print(f"✅ V12.47 数据治理完成！变更 {len(changes)} 项:")
    for c in changes:
        print(f"  • {c}")
    print(f"最终歌手数: {len(artists)}")
    print("="*50)


if __name__ == "__main__":
    main()
