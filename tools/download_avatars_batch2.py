import urllib.request
import os
import urllib.parse

def download(url, filename):
    base_path = r"e:\Html-work\frontend\src\assets\images\avatars"
    target_path = os.path.join(base_path, filename)
    print(f"Downloading {filename} from {url}...")
    try:
        # Encode URL characters (e.g. Chinese)
        scheme, netloc, path, query, fragment = urllib.parse.urlsplit(url)
        path = urllib.parse.quote(path)
        encoded_url = urllib.parse.urlunsplit((scheme, netloc, path, query, fragment))
        
        user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        req = urllib.request.Request(encoded_url, headers={'User-Agent': user_agent})
        with urllib.request.urlopen(req) as response, open(target_path, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
        print(f"Successfully saved to {target_path}")
    except Exception as e:
        print(f"Error downloading {filename}: {e}")

avatars = [
    ("https://live.staticflickr.com/2877/13267543233_5c07cfd8d8_o.jpg", "y0_2.jpg"), # 庾澄庆
    ("https://upload.wikimedia.org/wikipedia/commons/2/22/一人·一张%EF%BD%9CNO.150_%E7%8E%8B%E5%8A%9B%E5%AE%8F.jpg", "w2.jpg"), # 王力宏
    ("https://upload.wikimedia.org/wikipedia/commons/e/ea/201406%E4%BC%8D%E4%BD%B0.jpg", "w4.jpg"), # 伍佰
    ("https://upload.wikimedia.org/wikipedia/commons/e/e0/%E8%94%A1%E4%BE%9D%E6%9E%97%2816483101995%29_%28cropped%29.jpg", "c2.jpg"), # 蔡依林
    ("https://upload.wikimedia.org/wikipedia/commons/e/e0/G.E.M.%E9%82%93%E7%B4%AB%E6%A3%8B_2017-8-9_6.jpg", "d1.jpg"), # 邓紫棋
    ("https://upload.wikimedia.org/wikipedia/commons/f/f7/Crowd_Lu_2020.jpg", "l12.jpg"), # 卢广仲
    ("https://upload.wikimedia.org/wikipedia/commons/e/e0/S_36814857.jpg", "l13.jpg"), # 李圣杰
]

for url, filename in avatars:
    download(url, filename)
