import urllib.request
import os

avatars = {
    "c1.jpg": "https://upload.wikimedia.org/wikipedia/commons/2/25/%E9%99%88%E5%A5%95%E8%BF%85_Eason_Chan.jpg",
    "w1.jpg": "https://upload.wikimedia.org/wikipedia/commons/e/e0/Faye_Wong_%28cropped%29.jpg",
    "l4.jpg": "https://upload.wikimedia.org/wikipedia/commons/e/e0/Andy_Lau_%28cropped%29.jpg",
    "l2.jpg": "https://upload.wikimedia.org/wikipedia/commons/6/6f/Jonathan_Lee_2014_Nanking_cr.jpg",
    "l3.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/d4/Lo_Ta-yu_%E7%BE%85%E5%A4%A7%E4%BD%91_2011_%28cropped%29.jpg",
    "z1.jpg": "https://upload.wikimedia.org/wikipedia/commons/b/b3/Jacky_Cheung.jpg",
    "b1.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/d4/%E9%BB%83%E5%AE%B6%E9%A7%92.jpg",
    "s1.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/d3/2014_%E5%AD%AB%E7%87%95%E5%A7%BF.jpg",
    "l1.jpg": "https://upload.wikimedia.org/wikipedia/commons/d/d3/%E6%9E%97%E4%BF%8A%E5%82%91.jpg",
    "z10.jpg": "https://upload.wikimedia.org/wikipedia/commons/7/72/20110820%E5%BC%B5%E6%83%A0%E5%A6%B9.jpg",
    "m2.jpg": "https://upload.wikimedia.org/wikipedia/commons/0/0a/Karen_Mok_2013-05-17.jpg"
}

base_path = r"e:\Html-work\frontend\src\assets\images\avatars"

for filename, url in avatars.items():
    target_path = os.path.join(base_path, filename)
    print(f"Downloading {filename} from {url}...")
    try:
        user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        req = urllib.request.Request(url, headers={'User-Agent': user_agent})
        with urllib.request.urlopen(req) as response, open(target_path, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
        print(f"Successfully saved to {target_path}")
    except Exception as e:
        print(f"Error downloading {filename}: {e}")
