import requests
import sys

url = "https://ddjokbqwfbce.ap-southeast-1.clawcloudrun.com/api/admin/db/upload"
file_path = r"e:\Html-work\storage\db\moody.db"

print(f"Uploading {file_path} to {url}...")
try:
    with open(file_path, "rb") as f:
        files = {"database": f}
        response = requests.post(url, files=files)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
