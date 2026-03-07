import os
import sys

# Define base storage path relative to this script
# Assuming script is run from project root or checks relative path
# Define base storage paths
MUSIC_DIR = os.path.join("storage", "music")
LYRICS_DIR = os.path.join("storage", "lyrics")

# Data Structure: Artist Name -> List of Album Names
# ... (keeping MUSIC_CATALOG unchanged)
MUSIC_CATALOG = {
    # 🇭🇰 港乐巅峰
    "张学友": [
        "1985_Smile", "1986_遥远的她AMOUR", "1989_只愿一生爱一人", "1991_一颗不变心",
        "1992_真情流露", "1993_吻别", "1993_祝福", "1994_饿狼传说",
        "1995_真爱新曲+精选", "1996_忘记你我做不到", "1997_想和你去吹吹风", "2014_醒着做梦"
    ],
    "刘德华": [
        "1990_如果你是我的传说", "1991_一起走过的日子", "1994_忘情水", "1994_天意",
        "1995_真永远", "1997_爱在刻骨铭心时", "1998_笨小孩", "2002_美丽的一天"
    ],
    "Beyond": [
        "1986_再见理想", "1988_秘密警察", "1989_BeyondIV", "1991_犹豫",
        "1992_继续革命", "1993_乐与怒"
    ],

    # 💃 天后宫
    "王菲": [
        "1989_王靖雯", "1993_执迷不悔", "1994_迷", "1994_天空", "1996_浮躁",
        "1997_王菲1997", "1998_唱游", "1999_只爱陌生人", "2000_寓言",
        "2001_王菲2001", "2003_将爱"
    ],
    "林忆莲": [
        "1987_灰色", "1990_FacesPlaces", "1991_野花", "1995_LoveSandy",
        "1996_夜太黑", "1999_铿锵玫瑰", "2000_林忆莲s", "2012_盖亚"
    ],
    "张惠妹": [
        "1996_姐妹", "1997_BadBoy", "1997_听海", "1999_我可以抱你吗",
        "2001_真实", "2004_也许明天", "2009_阿密特", "2011_你在看我吗", "2014_偏执面"
    ],

    # 👑 统治级天王
    "周杰伦": [
        "2000_Jay", "2001_范特西", "2002_八度空间", "2003_叶惠美",
        "2004_七里香", "2005_十一月的萧邦", "2006_依然范特西", "2007_我很忙",
        "2008_魔杰座", "2010_跨时代", "2011_惊叹号", "2012_十二新作",
        "2014_哎呦不错哦", "2016_周杰伦的床边故事", "2022_最伟大的作品"
    ],
    "王力宏": [
        "1998_公转自转", "2000_永远的第一天", "2001_唯一", "2003_不可思议",
        "2004_心中的日月", "2005_盖世英雄", "2007_改变自己", "2008_心跳", "2010_十八般武艺"
    ],
    "陶喆": [
        "1997_DavidTao", "1999_ImOK", "2002_黑色柳丁", "2005_太平盛世",
        "2006_太美丽", "2009_69乐章"
    ],
    "陈奕迅": [
        "1996_陈奕迅", "2000_K歌之王", "2002_SpecialThanksTo", "2003_黑白灰",
        "2005_U87", "2006_WhatsGoingOn", "2007_认了吧", "2009_H3M",
        "2011_QuestionMark", "2014_RiceAndShine"
    ],

    # 🎀 流行天后
    "孙燕姿": [
        "2000_孙燕姿同名专辑", "2000_我要的幸福", "2001_风筝", "2002_Start自选集",
        "2002_Leave", "2003_TheMoment", "2004_Stefanie", "2005_完美的一天",
        "2007_逆光", "2011_是时候", "2014_克卜勒"
    ],
    "蔡依林": [
        "1999_1019", "2003_看我72变", "2004_城堡", "2005_野蛮游戏",
        "2006_舞娘", "2007_特务J", "2009_花蝴蝶", "2010_Myself",
        "2012_MUSE", "2014_呸", "2018_UglyBeauty"
    ],
    "梁静茹": [
        "1999_一夜长大", "2000_勇气", "2001_闪亮的星", "2002_Generic",
        "2003_美丽人生", "2004_燕尾蝶", "2005_丝路", "2006_亲亲",
        "2007_崇拜", "2009_静茹情歌"
    ],

    # 🎸 摇滚/乐队
    "五月天": [
        "1999_第一张创作专辑", "2000_爱情万岁", "2001_人生海海", "2003_时光机",
        "2004_神的孩子都在跳舞", "2006_为爱而生", "2008_后青春期的诗",
        "2011_第二人生", "2016_自传"
    ],
    "伍佰": [
        "1994_浪人情歌", "1996_爱情的尽头", "1998_树枝孤鸟", "1999_白鸽"
    ],
    "许巍": [
        "1997_在别处", "2000_那一年", "2002_时光漫步", "2004_每一刻都是崭新的", "2008_爱如少年"
    ],
    "朴树": [
        "1999_我去2000年", "2003_生如夏花", "2017_猎户星座"
    ],
    "SHE": [
        "2001_女生宿舍", "2002_青春株式会社", "2002_美丽新世界", "2003_SuperStar",
        "2004_奇幻旅程", "2004_Encore", "2005_不想长大", "2007_Play",
        "2010_SHERO", "2012_花又开好了"
    ]
}

def create_structure():
    print(f"🚀 Starting Music & Lyrics Library Automation...")
    print(f"📂 Audio Base: {os.path.abspath(MUSIC_DIR)}")
    print(f"📂 Lyrics Base: {os.path.abspath(LYRICS_DIR)}")

    for base in [MUSIC_DIR, LYRICS_DIR]:
        if not os.path.exists(base):
            print(f"Creating base directory: {base}")
            os.makedirs(base, exist_ok=True)

    success_count = 0
    
    for artist, albums in MUSIC_CATALOG.items():
        # Create directories for both music and lyrics
        for base in [MUSIC_DIR, LYRICS_DIR]:
            artist_dir = os.path.join(base, artist)
            if not os.path.exists(artist_dir):
                os.makedirs(artist_dir)
                print(f"  + Created Artist: {artist} in {os.path.basename(base)}")
            
            for album in albums:
                album_dir = os.path.join(artist_dir, album)
                if not os.path.exists(album_dir):
                    os.makedirs(album_dir)
                    success_count += 1
                    print(f"    - Created Album: {album} in {artist}")
    
    print(f"\n✅ Automation Complete! Created/Verified all folders.")

if __name__ == "__main__":
    create_structure()
