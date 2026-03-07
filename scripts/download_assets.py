import os
import requests
import urllib.parse

# Base directories
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(BASE_DIR, "frontend", "src", "assets", "images")
AVATAR_DIR = os.path.join(ASSETS_DIR, "avatars")
COVER_DIR = os.path.join(ASSETS_DIR, "covers")

os.makedirs(AVATAR_DIR, exist_ok=True)
os.makedirs(COVER_DIR, exist_ok=True)

# Extended Mapping for 100+ Artists (Real URLs where available, else placeholder)
ARTISTS = {
    "a1": {"name": "A-Do", "url": "https://upload.wikimedia.org/wikipedia/zh/3/3b/A-Do_2013.jpg"},
    "a2": {"name": "A-Sun", "url": ""},
    "a3": {"name": "Ah Niu", "url": ""},
    "b1": {"name": "Beyond", "url": "https://upload.wikimedia.org/wikipedia/zh/1/1e/Beyond_band.jpg"},
    "b2": {"name": "Ann", "url": ""},
    "c1": {"name": "Eason Chan", "url": "https://upload.wikimedia.org/wikipedia/commons/3/36/Eason_Chan_2016.jpg"},
    "c2": {"name": "Jolin Tsai", "url": "https://upload.wikimedia.org/wikipedia/commons/0/05/Jolin_Tsai_2015.jpg"},
    "c3": {"name": "Cheer Chen", "url": "https://upload.wikimedia.org/wikipedia/commons/1/12/Cheer_Chen_2016.jpg"},
    "c4": {"name": "Tanya Chua", "url": "https://upload.wikimedia.org/wikipedia/commons/3/3c/Tanya_Chua_2016.jpg"},
    "c5": {"name": "Cui Jian", "url": "https://upload.wikimedia.org/wikipedia/commons/c/c6/Cui_Jian_2010.jpg"},
    "c6": {"name": "Chen Li", "url": ""},
    "c7": {"name": "Gary Chaw", "url": ""},
    "c8": {"name": "Jackie Chan", "url": ""},
    "d1": {"name": "G.E.M.", "url": "https://upload.wikimedia.org/wikipedia/commons/8/8e/G.E.M._2015.jpg"},
    "d2": {"name": "Teresa Teng", "url": "https://upload.wikimedia.org/wikipedia/en/5/52/Teresa_Teng.jpg"},
    "d3": {"name": "Dou Wei", "url": ""},
    "d4": {"name": "Penny Tai", "url": ""},
    "d5": {"name": "Power Station", "url": ""},
    "d6": {"name": "Dao Lang", "url": ""},
    "f1": {"name": "Fei Yu-ching", "url": "https://upload.wikimedia.org/wikipedia/commons/4/4b/Fei_Yu-ching_2010.jpg"},
    "f2": {"name": "Mavis Fan", "url": ""},
    "f3": {"name": "Khalil Fong", "url": ""},
    "f4": {"name": "Phoenix Legend", "url": ""},
    "f5": {"name": "My Little Airport", "url": ""},
    "f6": {"name": "Christine Fan", "url": ""},
    "g1": {"name": "Aaron Kwok", "url": ""},
    "g2": {"name": "Leo Ku", "url": ""},
    "g3": {"name": "Kao Szu-mei", "url": ""},
    "g4": {"name": "Ge Dongqi", "url": ""},
    "h1": {"name": "Hua Chenyu", "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Hua_Chenyu.jpg/600px-Hua_Chenyu.jpg"},
    "h2": {"name": "Wong Ka Kui", "url": ""},
    "h3": {"name": "Han Hong", "url": ""},
    "h4": {"name": "Tiger Huang", "url": ""},
    "h5": {"name": "Anson Hu", "url": ""},
    "h6": {"name": "Isabelle Huang", "url": ""},
    "h7": {"name": "Huo Zun", "url": ""},
    "j1": {"name": "Jay Chou", "url": "https://upload.wikimedia.org/wikipedia/commons/c/c2/Jay_Chou_2017.jpg"},
    "j2": {"name": "Johnny Jiang", "url": ""},
    "j3": {"name": "Jin Zhiwen", "url": ""},
    "j4": {"name": "Jike Junyi", "url": ""},
    "l1": {"name": "JJ Lin", "url": "https://upload.wikimedia.org/wikipedia/commons/7/7f/JJ_Lin_2015.jpg"},
    "l2": {"name": "Jonathan Lee", "url": ""},
    "l3": {"name": "Lo Ta-yu", "url": ""},
    "l4": {"name": "Andy Lau", "url": ""},
    "l5": {"name": "Leon Lai", "url": ""},
    "l6": {"name": "Fish Leong", "url": ""},
    "l7": {"name": "Coco Lee", "url": ""},
    "l8": {"name": "Li Ronghao", "url": ""},
    "l9": {"name": "Li Jian", "url": ""},
    "l10": {"name": "Lu Han", "url": ""},
    "l11": {"name": "Yoga Lin", "url": ""},
    "l12": {"name": "Crowd Lu", "url": ""},
    "m1": {"name": "Anita Mui", "url": ""},
    "m2": {"name": "Karen Mok", "url": ""},
    "m3": {"name": "Mao Buyi", "url": ""},
    "m4": {"name": "Ma Di", "url": ""},
    "m5": {"name": "Meng Tingwei", "url": ""},
    "n1": {"name": "Na Ying", "url": ""},
    "n2": {"name": "Nineone", "url": ""},
    "p1": {"name": "Pu Shu", "url": ""},
    "p2": {"name": "Will Pan", "url": ""},
    "p3": {"name": "Cass Phang", "url": ""},
    "p4": {"name": "Victor Wong", "url": ""},
    "q1": {"name": "Chyi Chin", "url": ""},
    "q2": {"name": "Chyi Yu", "url": ""},
    "q3": {"name": "Wanting Qu", "url": ""},
    "r1": {"name": "Richie Jen", "url": ""},
    "r2": {"name": "Joey Yung", "url": ""},
    "s1": {"name": "Stefanie Sun", "url": "https://upload.wikimedia.org/wikipedia/commons/d/d7/Stefanie_Sun_2014.jpg"},
    "s2": {"name": "Sodagreen", "url": ""},
    "s3": {"name": "Laure Shang", "url": ""},
    "s4": {"name": "Sa Dingding", "url": ""},
    "s5": {"name": "Shunza", "url": ""},
    "t1": {"name": "David Tao", "url": ""},
    "t2": {"name": "Hebe Tien", "url": ""},
    "t3": {"name": "Alan Tam", "url": ""},
    "t4": {"name": "Tengger", "url": ""},
    "t5": {"name": "Miserable Faith", "url": ""},
    "w1": {"name": "Faye Wong", "url": ""},
    "w2": {"name": "Wang Leehom", "url": ""},
    "w3": {"name": "Mayday", "url": ""},
    "w4": {"name": "Wu Bai", "url": ""},
    "w5": {"name": "Wang Feng", "url": ""},
    "w6": {"name": "Waa Wei", "url": ""},
    "w7": {"name": "William Wei", "url": ""},
    "w8": {"name": "Wan Xiaoli", "url": ""},
    "x1": {"name": "Xu Wei", "url": ""},
    "x2": {"name": "Joker Xue", "url": ""},
    "x3": {"name": "Jam Hsiao", "url": ""},
    "x4": {"name": "Vae Xu", "url": ""},
    "x5": {"name": "Lala Hsu", "url": ""},
    "x6": {"name": "Shin Band", "url": ""},
    "x7": {"name": "Elva Hsiao", "url": ""},
    "x8": {"name": "Andy Hui", "url": ""},
    "y1": {"name": "Sally Yeh", "url": ""},
    "y2": {"name": "Rainie Yang", "url": ""},
    "y3": {"name": "Miriam Yeung", "url": ""},
    "y4": {"name": "Yisa Yu", "url": ""},
    "y5": {"name": "Yu Quan", "url": ""},
    "y6": {"name": "Tia Ray", "url": ""},
    "y7": {"name": "Oaeen", "url": ""},
    "z1": {"name": "Jacky Cheung", "url": ""},
    "z2": {"name": "Leslie Cheung", "url": ""},
    "z3": {"name": "A-Mei", "url": ""},
    "z4": {"name": "Jeff Chang", "url": ""},
    "z5": {"name": "Chang Chen-yue", "url": ""},
    "z6": {"name": "Wakin Chau", "url": ""},
    "z7": {"name": "Zhao Lei", "url": ""},
    "z8": {"name": "Jane Zhang", "url": ""},
    "z9": {"name": "Jason Zhang", "url": ""},
    "z10": {"name": "Tom Chang", "url": ""},
    "z11": {"name": "Charlie Zhou", "url": ""}
}

def generate_placeholder(save_path, text):
    color_code = abs(hash(text)) % 0xFFFFFF
    bg_color = f"{color_code:06x}"
    safe_text = urllib.parse.quote(text)
    url = f"https://placehold.co/600x600/{bg_color}/FFF?text={safe_text}"
    try:
        response = requests.get(url, timeout=10)
        with open(save_path, 'wb') as f:
            f.write(response.content)
    except Exception as e:
        print(f"[ERR] {e}")

def main():
    print(f"Starting expansion for {len(ARTISTS)} artists...")
    for aid, data in ARTISTS.items():
        avatar_path = os.path.join(AVATAR_DIR, f"{aid}.jpg")
        if not os.path.exists(avatar_path):
            if data["url"]:
                try:
                    r = requests.get(data["url"], timeout=10)
                    with open(avatar_path, 'wb') as f: f.write(r.content)
                    print(f"[OK] {data['name']} Avatar")
                except:
                    generate_placeholder(avatar_path, data["name"])
            else:
                generate_placeholder(avatar_path, data["name"])
        
        # Max 3 covers per artist for expansion speed
        for i in range(3):
            cover_path = os.path.join(COVER_DIR, f"{aid}_{i}.jpg")
            if not os.path.exists(cover_path):
                generate_placeholder(cover_path, f"{data['name']}\nAlbum {i}")
    print("Execution Finished.")

if __name__ == "__main__":
    main()
