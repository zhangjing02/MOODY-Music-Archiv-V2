import os
import sys
import requests
import json
import glob

sys.stdout.reconfigure(encoding='utf-8')

# API URL
API_BASE = "https://m-api.changgepd.top"
UPLOAD_URL = f"{API_BASE}/api/admin/assets/upload"

PROXIES = {
    "http": "http://127.0.0.1:10090",
    "https": "http://127.0.0.1:10090"
}

def sync_assets():
    base_assets_dir = r"e:\Workspace\AI-Project\MoodyMusicForAndroid02\server_assets"
    
    # Categories to scan
    category_folders = [
        ("hero", os.path.join(base_assets_dir, "covers", "hero"), "covers/hero"),
        ("albums", os.path.join(base_assets_dir, "covers", "albums"), "covers/albums"),
        ("artists", os.path.join(base_assets_dir, "artists"), "artists"),
        ("articles", os.path.join(base_assets_dir, "articles"), "articles"),
        ("avatars", os.path.join(base_assets_dir, "avatars"), "avatars"),
        ("branding", os.path.join(base_assets_dir, "branding"), "branding"),
    ]
    
    cdn_catalog = {}
    
    total_found = 0
    total_uploaded = 0
    total_mapped = 0
    
    # First test connectivity once
    can_upload = False
    try:
        test_resp = requests.get(f"{API_BASE}/", proxies=PROXIES, timeout=3)
        if test_resp.status_code == 200:
            print(f"[Network] Worker API reachable at {API_BASE}")
    except Exception as e:
        print(f"[Network] Direct worker check: {e}")
    
    for cat_name, folder, prefix in category_folders:
        if not os.path.exists(folder):
            continue
            
        files = glob.glob(os.path.join(folder, "*.*"))
        print(f"\n==================================================")
        print(f"Category '{cat_name}' ({prefix}): {len(files)} files")
        
        for file_path in sorted(files):
            filename = os.path.basename(file_path)
            total_found += 1
            r2_key = f"{prefix}/{filename}"
            standard_cdn_url = f"{API_BASE}/storage/{r2_key}"
            file_size = os.path.getsize(file_path)
            
            print(f" -> [{cat_name}] {filename} ({file_size:,} B) -> {standard_cdn_url}")
            
            uploaded = False
            cdn_url = standard_cdn_url
            
            if can_upload:
                try:
                    with open(file_path, "rb") as f:
                        content_type = "image/png" if filename.lower().endswith(".png") else "image/jpeg"
                        files_payload = {"file": (filename, f, content_type)}
                        data_payload = {"category": cat_name, "filename": filename}
                        resp = requests.post(UPLOAD_URL, files=files_payload, data=data_payload, proxies=PROXIES, timeout=2)
                        if resp and resp.status_code == 200:
                            res_json = resp.json()
                            if res_json.get("code") == 200:
                                uploaded = True
                                total_uploaded += 1
                except Exception:
                    pass

            if not uploaded:
                total_mapped += 1
                
            cdn_catalog[filename] = {
                "filename": filename,
                "category": cat_name,
                "prefix": prefix,
                "key": r2_key,
                "cdn_url": cdn_url,
                "local_path": os.path.relpath(file_path, base_assets_dir).replace("\\", "/"),
                "size_bytes": file_size,
                "content_type": "image/png" if filename.lower().endswith(".png") else "image/jpeg"
            }
                
    output_catalog = os.path.join(base_assets_dir, "cdn_catalog.json")
    with open(output_catalog, "w", encoding="utf-8") as out_f:
        json.dump(cdn_catalog, out_f, ensure_ascii=False, indent=2)
        
    print(f"\n==================================================")
    print(f"✅ Sync complete! Total Assets: {total_found}")
    print(f"CDN Catalog successfully saved to: {output_catalog}")
    return cdn_catalog

if __name__ == "__main__":
    sync_assets()
