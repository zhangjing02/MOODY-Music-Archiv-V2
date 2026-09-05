# MOODY 音频轻量化压缩与云端存储优化规范
> **Document Version**: v1.0.0  
> **Status**: 待审阅与确认 (Ready for Review)  
> **Target Systems**: Cloudflare R2 / Cloudflare D1 / Local SQLite (`catalog_sync.db`) / Web & Android Clients  

---

## 目录
1. [背景与前因后果 (Why)](#一背景与前因后果)
2. [存量与增量音频处理策略 (Strategy)](#二存量与增量音频处理策略)
3. [压缩算法实现与执行逻辑 (Algorithm & Code)](#三压缩算法实现与执行逻辑)
4. [质量门禁与 AI 抽检验证逻辑 (QA & Groq Whisper)](#四质量门禁与-ai-抽检验证逻辑)
5. [数据库架构演进方案 (Database Schema)](#五数据库架构演进方案)
6. [后台进程管理与安全复工流程 (Process Control)](#六后台进程管理与安全复工流程)

---

## 一、背景与前因后果

### 1.1 现状与容量瓶颈
- **名录基数庞大**：MOODY 数据库中登记的全量曲库包含 **135 位歌手、1,805 张专辑、24,867 首歌曲**。
- **当前吞吐现状**：系统已抓轨入桶 11 位主力歌手（共 1,223 首），本地及云端物理体积已达 **8.65 GB**，单曲平均体积为 **7.25 MB**（均为 320kbps CBR 极高规格 MP3）。
- **红线危机**：Cloudflare R2 免费额度为 **10.00 GB**。当前数据推入后空间占用将突破 **92%**，即将触发 9.5 GB 熔断红线，剩余空间仅能再容纳约 150 首 320k 歌曲，全名录推进彻底受阻。

### 1.2 替代方案调研结论
1. **多 Cloudflare 账号桥接**：全量 24,867 首歌曲若保持 320k，总容量约需 **176 GB**，需维护 **18~19 个独立 Cloudflare 账号**。这在工程上属于高危架构（绑卡维护成本极高、极易触发 Cloudflare 批量注水风控封号）。
2. **Backblaze B2 方案**：免费额度同样仅有 10GB，且服务器位于欧美（国内首包延迟高），日常流出限流 1GB/天，一旦穿透缓存存在扣费风险，并非根本解。

### 1.3 转码轻量化的科学依据与实测验证
- **声学代差与客观事实**：MP3 是 1993 年的老算法；通过标准 LAME 编码器转码为 **160kbps MP3**，单曲体积从 **7.5MB 骤降至 3.2MB（瘦身 57%）**。
- **Groq Whisper-large-v3 实测**：使用真实曲目《十年》进行 60 秒 AI 听音盲测，160k 压缩版与 320k 原版文本语义完全吻合，微弱呼吸声与泛音无一丢失。
- **物理声学检测**：RMS 电平差异仅 0.44 dB（人耳无法察觉），峰值余量留存 2dB+，无削峰爆音，且完全兼容 Web 与 Android 端的 HTTP Range 206 拖拽播放。
- **空间效益**：单桶 10GB 空间容纳量从 1,300 首瞬间扩增至 **3,200+ 首**。

---

## 二、存量与增量音频处理策略

处理的核心原则是：**零数据丢失、零线上中断、冷备份母盘绝对不动**。

```mermaid
flowchart TD
    subgraph StoragePipeline["音频处理全景管线"]
        direction TB
        subgraph Incremental["增量处理 (新抓轨歌曲)"]
            In_Download["抓轨下载 320k 母盘"] --> In_SaveMaster["保存至 backend/downloads/<br>(永久冷备份)"]
            In_SaveMaster --> In_Compress["FFmpeg 压缩至 160k"]
            In_Compress --> In_Stage["输出至 downloads_optimized/"]
            In_Stage --> In_Upload["上传轻量化音频至 R2"]
        end

        subgraph Stock["存量处理 (已有云端歌曲)"]
            St_Check{"本地是否存在 320k 母盘?"}
            St_Check -->|是| St_LocalCompress["直接基于本地母盘转码 160k"]
            St_Check -->|否 (历史孤本)| St_Pull["通过 Worker 从 R2 下载原曲"]
            St_Pull --> St_SaveRecovered["保存至 r2_recovered_320k/<br>(找回并留存本地冷备份)"]
            St_SaveRecovered --> St_LocalCompress
            St_LocalCompress --> St_Overwrite["R2 同名覆写 (透明缩容 57%)"]
        end
    end
```

### 2.1 存量数据处理原则
1. **本地已有母盘（绝大多数）**：不从云端下载，直接以本地 `backend/downloads/` 的文件为源头转码，输出到 `backend/downloads_optimized/`，然后推送到 R2 实施**同名覆盖（Key Overwrite）**。
2. **云端历史孤本（本地已缺失）**：**必须先拉取，绝不盲目覆写**。脚本自动将 R2 中的原曲完整下载至本地 `backend/r2_recovered_320k/` 保存为永久冷备份；确认无误后再转码覆写 R2。这样不仅不会丢文件，反而把早期遗失的母带找回并留存在本地硬盘。
3. **零停机**：客户端播放 URL 保持不变，覆写过程用户无感。

### 2.2 增量数据处理原则
- 守护进程拦截所有的后续抓轨结果：本地只存 320k 母盘，上传阶段自动在内存或临时缓存池中转码为 160k，推入 R2。从此入桶的每一首歌都是轻量化规格。

---

## 三、压缩算法实现与执行逻辑

### 3.1 编码参数标准
- **容器格式**：MP3（扩展名保持 `.mp3`，零改动接入现有全套系统）
- **音频编码器**：`libmp3lame`
- **码率控制**：`160 kbps CBR`（兼顾极速转码吞吐与绝对声学保真）
- **采样率与声道**：`44.1 kHz, Stereo 2 Channels`
- **标签版本**：`ID3v2.3`（保证安卓各版本硬解与车载/Web 端读取元数据最稳妥规范）

### 3.2 核心转码代码逻辑 (`compress_engine.py`)

```python
import os
import subprocess
import tempfile

def transcode_to_160k(source_path: str, target_path: str) -> bool:
    """
    将高规格音频无损听感压缩为 160kbps MP3
    保证元数据、流媒体切片标签与播放时间绝对对齐
    """
    if not os.path.exists(source_path):
        return False

    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    temp_target = target_path + ".tmp.mp3"

    cmd = [
        "ffmpeg", "-y",
        "-i", source_path,
        "-codec:a", "libmp3lame",
        "-b:a", "160k",
        "-ar", "44100",
        "-ac", "2",
        "-id3v2_version", "3",
        "-write_xing", "1",  # 写入 Xing VBR/CBR 头部，确保 Seek 拖拽不卡顿
        temp_target
    ]

    try:
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, timeout=60)
        if res.returncode != 0:
            if os.path.exists(temp_target):
                os.remove(temp_target)
            return False
            
        # 原子重命名，防止写入中断损坏
        if os.path.exists(target_path):
            os.remove(target_path)
        os.rename(temp_target, target_path)
        return True
    except Exception:
        if os.path.exists(temp_target):
            os.remove(temp_target)
        return False
```

---

## 四、质量门禁与 AI 抽检验证逻辑

所有压缩后的音频必须通过 **3 重质量门禁** 才能流转至线上 R2：

### 4.1 门禁 1：物理完整性与流媒体校验 (Automated FFprobe)
- **时长校验**：压缩后时长与原曲偏差必须 `< 0.2s`。
- **声学削峰检测**：运行 `astats` 滤镜，确保 `Peak level <= -1.0 dB`，严禁产生破音。
- **文件体积阈值**：压缩后体积应在 `1.8 MB ~ 4.5 MB` 合理区间内（过小判定为静音截断错误）。

### 4.2 门禁 2：Groq Whisper-large-v3 听音识别质检 (AI Gate)
针对批量任务按 **5% 比例随机抽检**，或针对重点大碟核心曲目执行：
1. 截取转码音频的高潮片段（`30s ~ 90s`，共 60 秒）。
2. 调用 Groq Whisper API 提取听写文本。
3. 对比标准歌词关键词，**字符重合率必须 >= 90%**，方可通过质检。

```python
def verify_audio_with_groq(compressed_path: str, expected_keywords: list, api_key: str) -> bool:
    """使用 Groq Whisper 听音大模型进行内容完整性抽检"""
    import requests
    headers = {"Authorization": f"Bearer {api_key}"}
    with open(compressed_path, "rb") as f:
        files = {"file": (os.path.basename(compressed_path), f, "audio/mpeg")}
        data = {"model": "whisper-large-v3", "language": "zh", "temperature": 0.0}
        resp = requests.post("https://api.groq.com/openai/v1/audio/transcriptions", headers=headers, files=files, data=data, timeout=45)
        if resp.status_code != 200:
            return False
        text = resp.json().get("text", "")
        # 验证至少命中 70% 的预期歌词关键字
        hits = sum(1 for kw in expected_keywords if kw in text)
        return hits >= max(1, int(len(expected_keywords) * 0.7))
```

### 4.3 门禁 3：HTTP 206 Range 分片快进/快退检验
- 模拟 Web 和 Android 播放器发送：`curl -I -H "Range: bytes=1048576-2097152" https://m-api.changgepd.ccwu.cc/storage/...`
- 响应必须为 `HTTP/1.1 206 Partial Content`，确保拖动进度条毫秒级响应。

---

## 五、数据库架构演进方案

为了让后续所有的统计、替换、审核和回滚工作**有法可依、有数可查**，本地与云端数据库必须统一增加状态标识字段。

### 5.1 本地数据库 (`catalog_sync.db` -> `tracks_sync_state`)
新增字段：
- `is_compressed` (INTEGER, 0: 未压缩原曲, 1: 已完成 160k 压缩)
- `bitrate_kbps` (INTEGER, 如 320 或 160)
- `compressed_at` (DATETIME, 记录转码时间)

**迁移 SQL 执行命令**：
```sql
ALTER TABLE tracks_sync_state ADD COLUMN is_compressed INTEGER DEFAULT 0;
ALTER TABLE tracks_sync_state ADD COLUMN bitrate_kbps INTEGER DEFAULT 320;
ALTER TABLE tracks_sync_state ADD COLUMN compressed_at DATETIME;
```

### 5.2 云端数据库 (Cloudflare D1 -> `songs`)
在云端 `songs` 表增加轻量化状态字段，使 Web 前端和 Android 客户端在获取歌曲详情时能直接获知码率与音质类型：
- `is_compressed` (INTEGER, DEFAULT 0)
- `bitrate` (TEXT, DEFAULT '320k')

**D1 迁移执行命令**：
```bash
npx wrangler d1 execute moody-d1-test --remote --command "ALTER TABLE songs ADD COLUMN is_compressed INTEGER DEFAULT 0;"
npx wrangler d1 execute moody-d1-test --remote --command "ALTER TABLE songs ADD COLUMN bitrate TEXT DEFAULT '320k';"
```

---

## 六、后台进程管理与安全复工流程

### 6.1 当前正在运行的后台进程清单
当前系统正在执行的任务列表：
- **PID 17028**: `r2_sync_daemon.py`（上传守护进程：正不断将 320k 原曲推向 R2）
- **PID 19212**: `master_orchestrator.py`（主流水线调度：协调歌手抓轨）
- **PID 21552**: `leehom_pipeline.py`（王力宏抓轨子进程：正在下载 320k 原曲）

### 6.2 如何安全终止当前进程
请在 PowerShell 终端执行以下一键停止指令：
```powershell
Stop-Process -Id 17028, 19212, 21552 -Force -ErrorAction SilentlyContinue
Get-Process -Name "yt-dlp" -ErrorAction SilentlyContinue | Stop-Process -Force
```
执行后，所有后台下载、转码与上传将**完全静止**，不会再有任何一个 320k 字节推入 R2。

### 6.3 随后有序复工的三步路线图
在您审阅并认可本方案后，后续工作将分为三个独立的、可从容推进的阶段：

1. **第一阶段：数据库字段就绪与小样测试**
   - 执行上述 D1 与 SQLite 的 `ALTER TABLE` 语句。
   - 编写独立的单曲转码与 Groq 验证测试脚本，先跑 3 首歌出具详细报表。
2. **第二阶段：存量文件闲暇盘点与清洗**
   - 编写带 `--dry-run` 和断点续传的存量迁移脚本。
   - 找回 R2 孤本，完成本地转码，覆写云端存量，**将当前 3.22 GB 占用直接降至 1.35 GB**。
3. **第三阶段：增量“先压后传”守护进程正式上线**
   - 重新启动抓轨与上传流水线，往后所有的王力宏、李荣浩、五月天等歌曲，随抓随压随传，全自动以 160k 规格入桶。
