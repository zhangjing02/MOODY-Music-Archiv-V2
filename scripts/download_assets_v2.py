import os
import requests
import urllib.parse
import time

# ==========================================
# ENHANCED ASSET DOWNLOADER (v3.2)
# Optimized for Visual Quality and Reliability
# ==========================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(BASE_DIR, "frontend", "src", "assets", "images")
AVATAR_DIR = os.path.join(ASSETS_DIR, "avatars")
COVER_DIR = os.path.join(ASSETS_DIR, "covers")

os.makedirs(AVATAR_DIR, exist_ok=True)
os.makedirs(COVER_DIR, exist_ok=True)

# Headers to avoid being blocked by Wikipedia/Wikimedia
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

# Full Artist Mapping with Real Wiki/Wikimedia URLs where possible
ARTISTS = {
    "a1": {"name": "阿杜 (A-Do)", "url": "https://upload.wikimedia.org/wikipedia/zh/3/3b/A-Do_2013.jpg"},
    "a2": {"name": "阿桑 (A-Sun)", "url": "https://upload.wikimedia.org/wikipedia/zh/0/07/A-Sun.jpg"},
    "a3": {"name": "阿牛 (Ah Niu)", "url": "https://upload.wikimedia.org/wikipedia/commons/e/e4/Tan_Kheng_Seong_2016.jpg"},
    "b1": {"name": "Beyond", "url": "https://upload.wikimedia.org/wikipedia/zh/1/1e/Beyond_band.jpg"},
    "b2": {"name": "白安 (Ann Bai)", "url": "https://upload.wikimedia.org/wikipedia/commons/e/eb/Ann_Bai_2015.jpg"},
    "c1": {"name": "陈奕迅 (Eason Chan)", "url": "https://upload.wikimedia.org/wikipedia/commons/3/36/Eason_Chan_2016.jpg"},
    "c2": {"name": "蔡依林 (Jolin Tsai)", "url": "https://upload.wikimedia.org/wikipedia/commons/0/05/Jolin_Tsai_2015.jpg"},
    "c3": {"name": "陈绮贞 (Cheer Chen)", "url": "https://upload.wikimedia.org/wikipedia/commons/1/12/Cheer_Chen_2016.jpg"},
    "c4": {"name": "蔡健雅 (Tanya Chua)", "url": "https://upload.wikimedia.org/wikipedia/commons/3/3c/Tanya_Chua_2016.jpg"},
    "c5": {"name": "崔健 (Cui Jian)", "url": "https://upload.wikimedia.org/wikipedia/commons/c/c6/Cui_Jian_2010.jpg"},
    "c6": {"name": "陈粒 (Chen Li)", "url": "https://upload.wikimedia.org/wikipedia/commons/5/5e/Chen_Li_2016.jpg"},
    "c7": {"name": "曹格 (Gary Chaw)", "url": "https://upload.wikimedia.org/wikipedia/commons/0/09/Gary_Chaw_2015.jpg"},
    "c8": {"name": "成龙 (Jackie Chan)", "url": "https://upload.wikimedia.org/wikipedia/commons/8/8b/Jackie_Chan_July_2016.jpg"},
    "d1": {"name": "邓紫棋 (G.E.M.)", "url": "https://upload.wikimedia.org/wikipedia/commons/8/8e/G.E.M._2015.jpg"},
    "d2": {"name": "邓丽君 (Teresa Teng)", "url": "https://upload.wikimedia.org/wikipedia/en/5/52/Teresa_Teng.jpg"},
    "d3": {"name": "窦唯 (Dou Wei)", "url": "https://upload.wikimedia.org/wikipedia/zh/a/a2/Dou_Wei.jpg"},
    "d4": {"name": "戴佩妮 (Penny Tai)", "url": "https://upload.wikimedia.org/wikipedia/commons/5/5a/Penny_Tai_2015.jpg"},
    "d5": {"name": "动力火车 (Power Station)", "url": "https://upload.wikimedia.org/wikipedia/zh/3/35/Power_Station_band.jpg"},
    "d6": {"name": "刀郎 (Dao Lang)", "url": "https://upload.wikimedia.org/wikipedia/zh/a/aa/Dao_Lang.jpg"},
    "f1": {"name": "费玉清 (Fei Yu-ching)", "url": "https://upload.wikimedia.org/wikipedia/commons/4/4b/Fei_Yu-ching_2010.jpg"},
    "f2": {"name": "范晓萱 (Mavis Fan)", "url": "https://upload.wikimedia.org/wikipedia/commons/0/0f/Mavis_Fan_2013.jpg"},
    "f3": {"name": "方大同 (Khalil Fong)", "url": "https://upload.wikimedia.org/wikipedia/commons/2/2e/Khalil_Fong_2015.jpg"},
    "f4": {"name": "凤凰传奇 (Phoenix Legend)", "url": "https://upload.wikimedia.org/wikipedia/zh/2/20/Phoenix_Legend.jpg"},
    "f5": {"name": "房东的猫", "url": "https://upload.wikimedia.org/wikipedia/zh/9/91/Fangdongdemao.jpg"},
    "f6": {"name": "范玮琪 (Christine Fan)", "url": "https://upload.wikimedia.org/wikipedia/commons/e/e0/Christine_Fan_2013.jpg"},
    "g1": {"name": "郭富城 (Aaron Kwok)", "url": "https://upload.wikimedia.org/wikipedia/commons/8/87/Aaron_Kwok_2016.jpg"},
    "g2": {"name": "古巨基 (Leo Ku)", "url": "https://upload.wikimedia.org/wikipedia/commons/5/5b/Leo_Ku_2015.jpg"},
    "g3": {"name": "高胜美", "url": "https://upload.wikimedia.org/wikipedia/zh/a/a6/Gao_Shengmei.jpg"},
    "g4": {"name": "葛东琪", "url": ""},
    "h1": {"name": "华晨宇 (Hua Chenyu)", "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Hua_Chenyu.jpg/600px-Hua_Chenyu.jpg"},
    "h2": {"name": "黄家驹 (Wong Ka Kui)", "url": "https://upload.wikimedia.org/wikipedia/zh/0/0e/Wong_Ka_Kui.jpg"},
    "h3": {"name": "韩红 (Han Hong)", "url": "https://upload.wikimedia.org/wikipedia/commons/5/52/Han_Hong_2013.jpg"},
    "h4": {"name": "黄小琥 (Tiger Huang)", "url": "https://upload.wikimedia.org/wikipedia/commons/a/a5/Tiger_Huang_2015.jpg"},
    "h5": {"name": "胡彦斌 (Anson Hu)", "url": "https://upload.wikimedia.org/wikipedia/commons/6/6f/Anson_Hu_2013.jpg"},
    "h6": {"name": "黄龄 (Isabelle Huang)", "url": "https://upload.wikimedia.org/wikipedia/commons/4/41/Isabelle_Huang_2015.jpg"},
    "h7": {"name": "霍尊 (Huo Zun)", "url": "https://upload.wikimedia.org/wikipedia/commons/c/c3/Huo_Zun_2015.jpg"},
    "j2": {"name": "姜育恒 (Johnny Jiang)", "url": "https://upload.wikimedia.org/wikipedia/zh/1/15/Johnny_Jiang.jpg"},
    "j3": {"name": "金志文", "url": "https://upload.wikimedia.org/wikipedia/zh/3/30/Jin_Zhiwen.jpg"},
    "j4": {"name": "吉克隽逸 (Summer)", "url": "https://upload.wikimedia.org/wikipedia/commons/e/ec/Summer_Jike_Junyi_2015.jpg"},
    "l1": {"name": "林俊杰 (JJ Lin)", "url": "https://upload.wikimedia.org/wikipedia/commons/7/7f/JJ_Lin_2015.jpg"},
    "l2": {"name": "李宗盛 (Jonathan Lee)", "url": "https://upload.wikimedia.org/wikipedia/commons/9/91/Jonathan_Lee_2014.jpg"},
    "l3": {"name": "罗大佑 (Lo Ta-yu)", "url": "https://upload.wikimedia.org/wikipedia/commons/d/de/Lo_Ta-yu_2014.jpg"},
    "l4": {"name": "刘德华 (Andy Lau)", "url": "https://upload.wikimedia.org/wikipedia/commons/b/b3/Andy_Lau_2016.jpg"},
    "l5": {"name": "黎明 (Leon Lai)", "url": "https://upload.wikimedia.org/wikipedia/commons/a/a1/Leon_Lai_2016.jpg"},
    "l6": {"name": "梁静茹 (Fish Leong)", "url": "https://upload.wikimedia.org/wikipedia/commons/3/3a/Fish_Leong_2015.jpg"},
    "l7": {"name": "李玟 (CoCo Lee)", "url": "https://upload.wikimedia.org/wikipedia/commons/1/1d/CoCo_Lee_2016.jpg"},
    "l8": {"name": "李荣浩 (Li Ronghao)", "url": "https://upload.wikimedia.org/wikipedia/commons/c/c5/Li_Ronghao_2015.jpg"},
    "l9": {"name": "李健 (Li Jian)", "url": "https://upload.wikimedia.org/wikipedia/commons/8/87/Li_Jian_2015.jpg"},
    "l10": {"name": "鹿晗 (Lu Han)", "url": "https://upload.wikimedia.org/wikipedia/commons/d/da/Lu_Han_2016.jpg"},
    "l11": {"name": "林宥嘉 (Yoga Lin)", "url": "https://upload.wikimedia.org/wikipedia/commons/1/17/Yoga_Lin_2015.jpg"},
    "l12": {"name": "卢广仲 (Crowd Lu)", "url": "https://upload.wikimedia.org/wikipedia/commons/6/60/Crowd_Lu_2015.jpg"},
    "m1": {"name": "梅艳芳 (Anita Mui)", "url": "https://upload.wikimedia.org/wikipedia/zh/2/2b/Anita_Mui.jpg"},
    "m2": {"name": "莫文蔚 (Karen Mok)", "url": "https://upload.wikimedia.org/wikipedia/commons/5/52/Karen_Mok_2015.jpg"},
    "m3": {"name": "毛不易", "url": "https://upload.wikimedia.org/wikipedia/zh/f/f3/Maobuyi.jpg"},
    "m4": {"name": "马頔 (Ma Di)", "url": "https://upload.wikimedia.org/wikipedia/zh/0/0d/Ma_Di.jpg"},
    "m5": {"name": "孟庭苇", "url": "https://upload.wikimedia.org/wikipedia/zh/b/bc/Meng_Tingwei.jpg"},
    "n1": {"name": "那英 (Na Ying)", "url": "https://upload.wikimedia.org/wikipedia/commons/c/c1/Na_Ying_2013.jpg"},
    "n2": {"name": "乃万 (NINEONE)", "url": "https://upload.wikimedia.org/wikipedia/zh/e/e0/Nineone.jpg"},
    "p1": {"name": "朴树 (Pu Shu)", "url": "https://upload.wikimedia.org/wikipedia/zh/8/87/Pu_Shu.jpg"},
    "p2": {"name": "潘玮柏 (Will Pan)", "url": "https://upload.wikimedia.org/wikipedia/commons/c/c1/Will_Pan_2015.jpg"},
    "p3": {"name": "彭羚 (Cass Phang)", "url": "https://upload.wikimedia.org/wikipedia/zh/1/1b/Cass_Phang.jpg"},
    "p4": {"name": "品冠 (Victor Wong)", "url": "https://upload.wikimedia.org/wikipedia/commons/8/8d/Victor_Wong_2015.jpg"},
    "q1": {"name": "齐秦 (Chyi Chin)", "url": "https://upload.wikimedia.org/wikipedia/zh/b/b3/Chyi_Chin.jpg"},
    "q2": {"name": "齐豫 (Chyi Yu)", "url": "https://upload.wikimedia.org/wikipedia/commons/a/ae/Chyi_Yu_2014.jpg"},
    "q3": {"name": "曲婉婷 (Wanting Qu)", "url": "https://upload.wikimedia.org/wikipedia/commons/3/3b/Wanting_Qu_2012.jpg"},
    "r1": {"name": "任贤齐 (Richie Jen)", "url": "https://upload.wikimedia.org/wikipedia/commons/2/25/Richie_Jen_2015.jpg"},
    "r2": {"name": "容祖儿 (Joey Yung)", "url": "https://upload.wikimedia.org/wikipedia/commons/b/b1/Joey_Yung_2016.jpg"},
    "s1": {"name": "孙燕姿 (Stefanie Sun)", "url": "https://upload.wikimedia.org/wikipedia/commons/d/d7/Stefanie_Sun_2014.jpg"},
    "s2": {"name": "苏打绿 (Sodagreen)", "url": "https://upload.wikimedia.org/wikipedia/zh/2/2e/Sodagreen_band.jpg"},
    "s3": {"name": "尚雯婕 (Laure Shang)", "url": "https://upload.wikimedia.org/wikipedia/commons/a/a2/Laure_Shang_2013.jpg"},
    "s4": {"name": "萨顶顶 (Sa Dingding)", "url": "https://upload.wikimedia.org/wikipedia/commons/d/d0/Sa_Dingding_2013.jpg"},
    "s5": {"name": "顺子 (Shunza)", "url": "https://upload.wikimedia.org/wikipedia/zh/f/fd/Shunza.jpg"},
    "t1": {"name": "陶喆 (David Tao)", "url": "https://upload.wikimedia.org/wikipedia/commons/b/bc/David_Tao_2015.jpg"},
    "t2": {"name": "田馥甄 (Hebe Tien)", "url": "https://upload.wikimedia.org/wikipedia/commons/4/4b/Hebe_Tien_2015.jpg"},
    "t3": {"name": "谭咏麟 (Alan Tam)", "url": "https://upload.wikimedia.org/wikipedia/commons/b/be/Alan_Tam_2015.jpg"},
    "t4": {"name": "腾格尔 (Tengger)", "url": "https://upload.wikimedia.org/wikipedia/zh/3/3c/Tengger.jpg"},
    "t5": {"name": "痛仰乐队 (Miserable Faith)", "url": "https://upload.wikimedia.org/wikipedia/zh/3/3d/Miserable_Faith.jpg"},
    "w1": {"name": "王菲 (Faye Wong)", "url": "https://upload.wikimedia.org/wikipedia/commons/0/01/Faye_Wong_2011.jpg"},
    "w2": {"name": "王力宏 (Wang Leehom)", "url": "https://upload.wikimedia.org/wikipedia/commons/d/dc/Wang_Leehom_2015.jpg"},
    "w3": {"name": "五月天 (Mayday)", "url": "https://upload.wikimedia.org/wikipedia/zh/a/a7/Mayday_band.jpg"},
    "w4": {"name": "伍佰 (Wu Bai)", "url": "https://upload.wikimedia.org/wikipedia/commons/8/8a/Wu_Bai_2015.jpg"},
    "w5": {"name": "汪峰 (Wang Feng)", "url": "https://upload.wikimedia.org/wikipedia/commons/5/5e/Wang_Feng_2013.jpg"},
    "w6": {"name": "魏如萱 (Waa Wei)", "url": "https://upload.wikimedia.org/wikipedia/commons/b/bd/Waa_Wei_2015.jpg"},
    "w7": {"name": "韦礼安 (William Wei)", "url": "https://upload.wikimedia.org/wikipedia/commons/6/67/William_Wei_2015.jpg"},
    "w8": {"name": "万晓利", "url": "https://upload.wikimedia.org/wikipedia/zh/4/4c/Wan_Xiaoli.jpg"},
    "x1": {"name": "许巍 (Xu Wei)", "url": "https://upload.wikimedia.org/wikipedia/zh/6/6f/Xu_Wei.jpg"},
    "x2": {"name": "薛之谦 (Joker Xue)", "url": "https://upload.wikimedia.org/wikipedia/commons/6/6d/Joker_Xue_2016.jpg"},
    "x3": {"name": "萧敬腾 (Jam Hsiao)", "url": "https://upload.wikimedia.org/wikipedia/commons/1/12/Jam_Hsiao_2015.jpg"},
    "x4": {"name": "许嵩 (Vae Xu)", "url": "https://upload.wikimedia.org/wikipedia/zh/8/8b/Xu_Song.jpg"},
    "x5": {"name": "徐佳莹 (Lala Hsu)", "url": "https://upload.wikimedia.org/wikipedia/commons/f/ff/Lala_Hsu_2015.jpg"},
    "x6": {"name": "信乐团 (Shin Band)", "url": "https://upload.wikimedia.org/wikipedia/zh/8/87/Shin_Band.jpg"},
    "x7": {"name": "萧亚轩 (Elva Hsiao)", "url": "https://upload.wikimedia.org/wikipedia/commons/5/52/Elva_Hsiao_2015.jpg"},
    "x8": {"name": "许志安 (Andy Hui)", "url": "https://upload.wikimedia.org/wikipedia/commons/8/83/Andy_Hui_2016.jpg"},
    "y1": {"name": "叶倩文 (Sally Yeh)", "url": "https://upload.wikimedia.org/wikipedia/commons/2/2a/Sally_Yeh_2015.jpg"},
    "y2": {"name": "杨丞琳 (Rainie Yang)", "url": "https://upload.wikimedia.org/wikipedia/commons/1/1a/Rainie_Yang_2015.jpg"},
    "y3": {"name": "杨千嬅 (Miriam Yeung)", "url": "https://upload.wikimedia.org/wikipedia/commons/8/8b/Miriam_Yeung_2016.jpg"},
    "y4": {"name": "郁可唯 (Yisa Yu)", "url": "https://upload.wikimedia.org/wikipedia/commons/a/a2/Yisa_Yu_2015.jpg"},
    "y5": {"name": "羽泉 (Yu Quan)", "url": "https://upload.wikimedia.org/wikipedia/zh/8/85/Yu_Quan.jpg"},
    "y6": {"name": "袁娅维 (Tia Ray)", "url": "https://upload.wikimedia.org/wikipedia/commons/e/ec/Tia_Ray_2015.jpg"},
    "y7": {"name": "鱼丁糸 (Oaeen)", "url": "https://upload.wikimedia.org/wikipedia/zh/3/36/Oaeen_band.jpg"},
    "z1": {"name": "张学友 (Jacky Cheung)", "url": "https://upload.wikimedia.org/wikipedia/commons/2/21/Jacky_Cheung_2016.jpg"},
    "z2": {"name": "张国荣 (Leslie Cheung)", "url": "https://upload.wikimedia.org/wikipedia/zh/f/f6/Leslie_Cheung.jpg"},
    "z3": {"name": "张惠妹 (A-Mei)", "url": "https://upload.wikimedia.org/wikipedia/commons/e/e4/A-Mei_2015.jpg"},
    "z4": {"name": "张信哲 (Jeff Chang)", "url": "https://upload.wikimedia.org/wikipedia/commons/9/91/Jeff_Chang_2015.jpg"},
    "z5": {"name": "张震岳 (Chang Chen-yue)", "url": "https://upload.wikimedia.org/wikipedia/commons/6/60/Chang_Chen-yue_2014.jpg"},
    "z6": {"name": "周华健 (Wakin Chau)", "url": "https://upload.wikimedia.org/wikipedia/commons/c/c1/Wakin_Chau_2015.jpg"},
    "z7": {"name": "赵雷 (Zhao Lei)", "url": "https://upload.wikimedia.org/wikipedia/zh/5/5a/Zhao_Lei.jpg"},
    "z8": {"name": "张靓颖 (Jane Zhang)", "url": "https://upload.wikimedia.org/wikipedia/commons/2/2b/Jane_Zhang_2015.jpg"},
    "z9": {"name": "张杰 (Jason Zhang)", "url": "https://upload.wikimedia.org/wikipedia/commons/e/ec/Jason_Zhang_2015.jpg"},
    "z10": {"name": "张雨生 (Tom Chang)", "url": "https://upload.wikimedia.org/wikipedia/zh/1/17/Tom_Chang.jpg"},
    "z11": {"name": "周深 (Charlie Zhou)", "url": "https://upload.wikimedia.org/wikipedia/commons/e/e0/Charlie_Zhou_2016.jpg"}
}

def generate_placeholder(save_path, text):
    color_code = abs(hash(text)) % 0xFFFFFF
    bg_color = f"{color_code:06x}"
    safe_text = urllib.parse.quote(text)
    # FORCE PNG format to ensure visual compatibility in browsers
    url = f"https://placehold.co/600x600/{bg_color}/FFF.png?text={safe_text}"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            with open(save_path, 'wb') as f:
                f.write(r.content)
            return True
    except Exception as e:
        print(f"  [ERR] Placeholder fail: {e}")
    return False

def main():
    print(f"🔄 Starting asset recovery for {len(ARTISTS)} artists...")
    for aid, data in ARTISTS.items():
        if aid == "j1": continue # Skip Jay Chou (already premium)
        
        avatar_path = os.path.join(AVATAR_DIR, f"{aid}.jpg")
        
        # Check if we need to fix it (if it's an SVG mislabeled as JPG or missing)
        needs_fix = True
        if os.path.exists(avatar_path):
            with open(avatar_path, 'rb') as f:
                header = f.read(20)
                if b"<svg" not in header and b"<?xml" not in header:
                    if os.path.getsize(avatar_path) > 1000: # If it's a real image, don't re-download
                        needs_fix = False
        
        if needs_fix:
            print(f"  Fetching {data['name']}...")
            success = False
            if data.get("url"):
                try:
                    r = requests.get(data["url"], headers=HEADERS, timeout=15)
                    if r.status_code == 200:
                        with open(avatar_path, 'wb') as f: f.write(r.content)
                        print(f"    [OK] Real Image")
                        success = True
                    else:
                        print(f"    [WARN] HTTP {r.status_code}")
                except Exception as e:
                    print(f"    [ERR] {e}")
            
            if not success:
                if generate_placeholder(avatar_path, data["name"]):
                    print(f"    [!] Placeholder (PNG)")
        
        # Album covers
        for i in range(3):
            cover_path = os.path.join(COVER_DIR, f"{aid}_{i}.jpg")
            # Clear invalid covers too
            needs_cover_fix = not os.path.exists(cover_path) or os.path.getsize(cover_path) < 1000
            if not needs_cover_fix:
                with open(cover_path, 'rb') as f:
                    if b"<svg" in f.read(20): needs_cover_fix = True

            if needs_cover_fix:
                generate_placeholder(cover_path, f"{data['name']}\nAlbum {i}")

    print("\n✅ Execution Finished.")

if __name__ == "__main__":
    main()
