import os
import sys
import subprocess
import time

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PYTHON_EXE = sys.executable

PIPELINES = [
    ("邓紫棋 (G.E.M.)", "gem_pipeline.py"),
    ("梁静茹 (Fish Leong)", "fish_leong_pipeline.py"),
    ("李荣浩 (Ronghao Li)", "ronghao_pipeline.py"),
    ("五月天 (Mayday)", "mayday_pipeline.py"),
    ("王力宏 (Leehom Wang)", "leehom_pipeline.py"),
]

def is_david_tao_running():
    try:
        res = subprocess.run(["powershell", "-Command", "Get-Process -Name python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"], capture_output=True, text=True)
        # Check task log activity
        log_path = r"C:\Users\zhangjing\.gemini\antigravity\brain\9b5c1cfb-21b1-4294-a472-50c3b1a821ac\.system_generated\tasks\task-2115.log"
        if os.path.exists(log_path):
            with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                if "🎉 陶喆 (David Tao) 全部大碟抓轨全量收官！" in content:
                    return False
        return True
    except Exception:
        return False

def wait_for_david_tao():
    print("⏳ [Master Orchestrator] 正在监控 陶喆 (David Tao) 抓轨流水线...")
    log_path = r"C:\Users\zhangjing\.gemini\antigravity\brain\9b5c1cfb-21b1-4294-a472-50c3b1a821ac\.system_generated\tasks\task-2115.log"
    downloads_dir = os.path.abspath(os.path.join(SCRIPTS_DIR, "..", "downloads"))
    
    last_mtime = 0
    stable_count = 0
    while True:
        time.sleep(15)
        dt_files = [f for f in os.listdir(downloads_dir) if '陶喆' in f and f.endswith('.mp3')]
        print(f"📊 [陶喆进度] 本地已完成高品质 MP3: {len(dt_files)} 首")
        
        if os.path.exists(log_path):
            with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                c = f.read()
                if "全部大碟抓轨全量收官" in c:
                    print("🎉 [Master Orchestrator] 陶喆流水线全部抓轨完成！")
                    break
            
            cur_mtime = os.path.getmtime(log_path)
            if cur_mtime == last_mtime:
                stable_count += 1
                if stable_count >= 12: # 3 minutes without new log activity
                    print("ℹ️ [Master Orchestrator] 陶喆任务已静默，判定完成，继续下一步！")
                    break
            else:
                last_mtime = cur_mtime
                stable_count = 0
        else:
            break
    print("✅ [Master Orchestrator] 陶喆流水线已完成！准备推进下一位歌手！")

def run_pipeline(artist_name, script_name):
    script_path = os.path.join(SCRIPTS_DIR, script_name)
    print("\n" + "#" * 80)
    print(f"🌟 [Master Orchestrator] 启动全量流水线: {artist_name} -> {script_name}")
    print("#" * 80 + "\n")
    
    cmd = [PYTHON_EXE, "-u", script_path]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace', bufsize=1)
    for line in proc.stdout:
        print(line, end='', flush=True)
    proc.wait()
    print(f"\n✨ [Master Orchestrator] {artist_name} 处理完毕！返回码: {proc.returncode}")

def main():
    print("=" * 80)
    print("🚀 MOODY 全歌手全专辑自动化连续处理流水线启动 (Master Orchestrator)")
    print("=" * 80)
    
    # 1. Wait for David Tao if currently running
    wait_for_david_tao()
    
    # 2. Run remaining artists sequentially
    for name, script in PIPELINES:
        try:
            run_pipeline(name, script)
            time.sleep(5)
        except Exception as e:
            print(f"❌ 处理 {name} 遇到异常: {e}，继续下一个歌手")

    print("\n🎉🎉🎉 [Master Orchestrator] 全部排队歌手与大碟全量抓轨校验完毕！")

if __name__ == "__main__":
    main()
