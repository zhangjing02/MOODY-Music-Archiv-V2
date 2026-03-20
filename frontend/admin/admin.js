document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initGovernance();
    initFixer();
    initUploader();
    initAlbumManager();
    loadStats();
});

// === 工具：防丢提示 ===
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// === 模块 1：导航系统 ===
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const panels = document.querySelectorAll('.panel');

    function switchTab(targetId) {
        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.target === targetId);
        });
        panels.forEach(panel => {
            panel.classList.toggle('hidden', panel.id !== targetId);
        });
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(item.dataset.target);
        });
    });
}

// === 模块 2：运行大盘 ===
async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats');
        if (res.ok) {
            const data = await res.json();
            // Handle both legacy (data.data) and new Worker format (data.data)
            const stats = data.data || data;
            document.getElementById('stat-artists').textContent = stats.artists || 0;
            document.getElementById('stat-albums').textContent = stats.albums || 0;
            document.getElementById('stat-tracks').textContent = stats.tracks || 0;
        }
    } catch (err) {
        console.error("加载大盘失败", err);
    }
}

// === 模块 3：超级上传 ===

/**
 * 读取 MP3 文件的 ID3v2 标签（标题）
 * 返回 Promise，解析成功返回标题，失败返回 null
 */
function readMP3Title(file) {
    console.log(`      📖 [readMP3Title] 开始读取文件: ${file.name}`);
    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = function(e) {
            try {
                const buffer = e.target.result;
                const view = new DataView(buffer);
                console.log(`      📊 [readMP3Title] 读取了 ${buffer.byteLength} bytes`);

                // 检查 ID3v2 标识 (前3个字节应该是 "ID3")
                const byte0 = view.getUint8(0);
                const byte1 = view.getUint8(1);
                const byte2 = view.getUint8(2);
                console.log(`      🔍 [readMP3Title] 前3字节: ${byte0.toString(16)} ${byte1.toString(16)} ${byte2.toString(16)} (应该是: 49 44 43)`);

                if (byte0 !== 0x49 || byte1 !== 0x44 || byte2 !== 0x33) {
                    console.log(`      ❌ [readMP3Title] 不是 ID3v2 格式`);
                    resolve(null);
                    return;
                }

                // ID3v2 版本 (第4个字节)
                const version = view.getUint8(3);
                console.log(`      📌 [readMP3Title] ID3v2.${version} 版本`);

                // 读取标签大小（最后4个字节，synchsafe整数）
                const tagSize =
                    ((view.getUint8(6) & 0x7F) << 21) |
                    ((view.getUint8(7) & 0x7F) << 14) |
                    ((view.getUint8(8) & 0x7F) << 7) |
                    (view.getUint8(9) & 0x7F);

                console.log(`      📏 [readMP3Title] 标签大小: ${tagSize} bytes`);

                let offset = 10; // 跳过 ID3 头部
                let frameCount = 0;
                const maxFrames = 100; // 防止死循环

                while (offset < tagSize && frameCount < maxFrames) {
                    frameCount++;

                    // 读取帧 ID (4字节)
                    let frameId = '';
                    for (let i = 0; i < 4; i++) {
                        const charCode = view.getUint8(offset + i);
                        // 前3个字符必须是 A-Z，第4个字符可以是 A-Z 或 0-9
                        const isValid = (i < 3)
                            ? (charCode >= 65 && charCode <= 90)  // A-Z
                            : (charCode >= 65 && charCode <= 90) || (charCode >= 48 && charCode <= 57);  // A-Z 或 0-9

                        if (isValid) {
                            frameId += String.fromCharCode(charCode);
                        } else {
                            console.log(`      ⚠️ [readMP3Title] offset=${offset + i}, 字节 ${charCode} 不是有效帧ID字符`);
                            break;
                        }
                    }

                    // 每10帧输出一次，避免日志太多
                    if (frameCount % 10 === 0 || frameId.startsWith('TIT')) {
                        console.log(`      🔍 [readMP3Title] 扫描中... 已扫描 ${frameCount} 个帧`);
                    }

                    if (frameId.length < 4) {
                        console.log(`      🔚 [readMP3Title] 帧ID无效，结束解析 (offset=${offset}, 已读取${frameCount}个帧)`);
                        console.log(`      💡 [readMP3Title] 下20个字节: ${Array.from({length: 20}, (_, i) => view.getUint8(offset + i).toString(16).padStart(2, '0')).join(' ')}`);
                        break; // 帧ID无效，结束
                    }

                    // 读取帧大小
                    let frameSize;
                    if (version === 3) {
                        // ID3v2.3: 32位整数
                        frameSize = view.getUint32(offset + 4);
                    } else if (version === 4) {
                        // ID3v2.4: synchsafe整数
                        frameSize =
                            ((view.getUint8(offset + 4) & 0x7F) << 21) |
                            ((view.getUint8(offset + 5) & 0x7F) << 14) |
                            ((view.getUint8(offset + 6) & 0x7F) << 7) |
                            (view.getUint8(offset + 7) & 0x7F);
                    } else {
                        console.log(`      ⚠️ [readMP3Title] 不支持的 ID3 版本: ${version}`);
                        break; // 不支持的版本
                    }

                    console.log(`      📦 [readMP3Title] 帧 #${frameCount}: ID="${frameId}", Size=${frameSize}, Offset=${offset}`);

                    // 检查是否是标题帧
                    if (frameId === 'TIT2') {
                        console.log(`      ✅ [readMP3Title] 找到标题帧 TIT2!`);
                        // 跳过帧头（10字节）
                        const contentOffset = offset + 10;
                        const encoding = view.getUint8(contentOffset);

                        console.log(`      🔤 [readMP3Title] 编码方式: ${encoding} (0=ISO-8859-1, 1/2=UTF-16, 3=UTF-8)`);

                        // 读取标题内容
                        let title = '';
                        const contentSize = frameSize - 1; // 减去编码字节

                        if (encoding === 0) {
                            // ISO-8859-1
                            for (let i = 1; i <= contentSize; i++) {
                                title += String.fromCharCode(view.getUint8(contentOffset + i));
                            }
                        } else if (encoding === 1 || encoding === 2) {
                            // UTF-16 with BOM (encoding=1) or UTF-16BE (encoding=2)
                            const dataView = new Uint8Array(buffer, contentOffset + 1, contentSize);

                            // 对于 encoding=1，检查 BOM 确定字节序
                            if (encoding === 1 && contentSize >= 2) {
                                const bom1 = dataView[0];
                                const bom2 = dataView[1];

                                if (bom1 === 0xFF && bom2 === 0xFE) {
                                    // UTF-16 LE BOM
                                    const decoder = new TextDecoder('utf-16le');
                                    title = decoder.decode(dataView);
                                    console.log(`      📝 [readMP3Title] 使用 UTF-16LE 解码 (检测到 BOM: FF FE)`);
                                } else if (bom1 === 0xFE && bom2 === 0xFF) {
                                    // UTF-16 BE BOM
                                    const decoder = new TextDecoder('utf-16be');
                                    title = decoder.decode(dataView);
                                    console.log(`      📝 [readMP3Title] 使用 UTF-16BE 解码 (检测到 BOM: FE FF)`);
                                } else {
                                    // 没有 BOM，默认使用 UTF-16LE (大多数MP3使用)
                                    const decoder = new TextDecoder('utf-16le');
                                    title = decoder.decode(dataView);
                                    console.log(`      📝 [readMP3Title] 未检测到 BOM，默认使用 UTF-16LE`);
                                }
                            } else {
                                // encoding=2，直接使用 UTF-16BE
                                const decoder = new TextDecoder('utf-16be');
                                title = decoder.decode(dataView);
                                console.log(`      📝 [readMP3Title] 使用 UTF-16BE 解码 (encoding=2)`);
                            }
                        } else if (encoding === 3) {
                            // UTF-8
                            const dataView = new Uint8Array(buffer, contentOffset + 1, contentSize);
                            const decoder = new TextDecoder('utf-8');
                            title = decoder.decode(dataView);
                        }

                        // 移除空字符和null字符
                        title = title.replace(/\x00+/g, '').replace(/\uFFFD+/g, '').trim();

                        if (title) {
                            console.log(`      ✅ [readMP3Title] 成功读取标题: "${title}"`);
                            resolve(title);
                            return;
                        } else {
                            console.log(`      ⚠️ [readMP3Title] 标题为空`);
                        }
                    }

                    // 跳到下一个帧
                    offset += 10 + frameSize;
                }

                console.log(`      🔚 [readMP3Title] 解析完成，共扫描 ${frameCount} 个帧，未找到 TIT2`);
                resolve(null); // 未找到标题帧
            } catch (error) {
                console.warn('      ❌ [readMP3Title] 解析失败:', error);
                resolve(null);
            }
        };

        reader.onerror = () => resolve(null);

        // 读取前 100KB 数据（足够包含大型 ID3 标签）
        const blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
        const blob = blobSlice.call(file, 0, 102400); // 100KB
        reader.readAsArrayBuffer(blob);
    });
}

function initUploader() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const fileListEl = document.getElementById('file-list');
    const btnUpload = document.getElementById('btn-trigger-upload');
    const progContainer = document.getElementById('upload-progress-container');
    const progBar = document.getElementById('upload-progress');

    let pendingFiles = [];

    // 拖拽交互
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function renderFileList() {
        fileListEl.innerHTML = '';
        pendingFiles.forEach((fObj, index) => {
            const el = document.createElement('div');
            el.className = 'file-item';
            
            // 状态映射
            let statusHtml = '';
            if (fObj.status === 'waiting') statusHtml = '<span class="status-label status-waiting">等待中</span>';
            else if (fObj.status === 'uploading') statusHtml = `<span class="status-label status-uploading">上传中 ${fObj.progress || 0}%</span>`;
            else if (fObj.status === 'success') statusHtml = '<span class="status-label status-success">成功</span>';
            else if (fObj.status === 'error') statusHtml = `<span class="status-label status-error">失败: ${fObj.error || ''}</span>`;

            el.innerHTML = `
                <div class="file-info">
                    <span>${fObj.file.name}</span>
                    ${statusHtml}
                </div>
                ${fObj.status === 'waiting' ? `<span style="cursor:pointer;color:var(--danger)" onclick="window.removeFile(${index})">❌</span>` : ''}
            `;
            fileListEl.appendChild(el);
        });
        btnUpload.disabled = pendingFiles.length === 0 || pendingFiles.some(f => f.status === 'uploading');
    }

    async function handleFiles(files) {
        console.log(`📁 文件拖入: 共 ${files.length} 个文件`);
        for (let f of files) {
            console.log(`  📄 处理文件: ${f.name} (${f.size} bytes, ${f.type || 'unknown type'})`);
            // 只读取 MP3 文件的标题
            let title = null;
            if (f.name.toLowerCase().endsWith('.mp3')) {
                console.log(`    🔍 开始读取 MP3 标签...`);
                try {
                    title = await readMP3Title(f);
                    if (title) {
                        console.log(`    ✅ 读取到标题: "${title}"`);
                    } else {
                        console.log(`    ⚠️ 未读取到标题（文件可能没有 ID3 标签）`);
                    }
                } catch (e) {
                    console.warn('    ❌ 读取标题失败:', e);
                }
            } else {
                console.log(`    ⏭️ 跳过（非 MP3 文件）`);
            }

            pendingFiles.push({
                file: f,
                status: 'waiting',
                progress: 0,
                error: null,
                title: title // 存储从 ID3 标签读取的标题
            });
        }
        console.log(`✅ 文件列表已更新，待上传文件数: ${pendingFiles.length}`);
        renderFileList();
    }

    window.removeFile = (index) => {
        if (pendingFiles[index].status === 'uploading') return;
        pendingFiles.splice(index, 1);
        renderFileList();
    };

    // 单文件发送逻辑 (使用 XHR 以便获取进度)
    function uploadSingleFile(fObj, artist, album) {
        return new Promise((resolve) => {
            const formData = new FormData();
            formData.append('files', fObj.file);
            if (artist) formData.append('artistOverride', artist);
            if (album) formData.append('albumOverride', album);
            // 发送标题信息（优先级高于文件名）
            if (fObj.title) {
                formData.append('titleOverride', fObj.title);
                console.log(`📤 使用标题标签: "${fObj.title}"`);
            }

            const xhr = new XMLHttpRequest();
            // [CRITICAL CHANGE] 改为调用 Worker API
            xhr.open('POST', 'https://m-api.changgepd.top/api/admin/upload', true);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    fObj.progress = Math.round((e.loaded / e.total) * 100);
                    renderFileList();
                }
            };

            xhr.onload = () => {
                let data = {};
                try { data = JSON.parse(xhr.responseText); } catch(e) { data = { message: "非 JSON 响应" }; }

                if (xhr.status >= 200 && xhr.status < 300 && data.code === 200) {
                    fObj.status = 'success';
                    // 显示详细的上传结果
                    if (data.data && data.data.details) {
                        console.log('上传详情:', data.data.details);
                    }
                } else {
                    fObj.status = 'error';
                    fObj.error = data.message || `HTTP ${xhr.status}`;
                }
                renderFileList();
                resolve();
            };

            xhr.onerror = () => {
                fObj.status = 'error';
                fObj.error = "网络连接故障";
                renderFileList();
                resolve();
            };

            fObj.status = 'uploading';
            renderFileList();
            xhr.send(formData);
        });
    }

    btnUpload.addEventListener('click', async () => {
        const toUpload = pendingFiles.filter(f => f.status === 'waiting' || f.status === 'error');
        if (toUpload.length === 0) return;

        const artist = document.getElementById('up-artist').value.trim();
        const album = document.getElementById('up-album').value.trim();

        btnUpload.disabled = true;
        progContainer.classList.remove('hidden');

        let completed = 0;
        for (const fObj of toUpload) {
            await uploadSingleFile(fObj, artist, album);
            completed++;
            progBar.style.width = `${Math.round((completed / toUpload.length) * 100)}%`;
        }

        const allSuccess = toUpload.every(f => f.status === 'success');
        if (allSuccess) {
            showToast(`✅ 全部 ${toUpload.length} 首歌曲处理完毕！`);
            loadStats();

            // 上传成功后清空页面，方便继续上传
            setTimeout(() => {
                clearUploadForm();
            }, 1500);
        } else {
            showToast('部分文件上传失败，请检查列表状态', 'error');
        }

        setTimeout(() => {
            btnUpload.disabled = false;
        }, 1000);
    });

    // 清空上传表单和文件列表
    function clearUploadForm() {
        // 清空文件列表
        pendingFiles.length = 0;

        // 清空输入框
        document.getElementById('up-artist').value = '';
        document.getElementById('up-album').value = '';

        // 隐藏进度条
        progContainer.classList.add('hidden');
        progBar.style.width = '0%';

        // 重新渲染文件列表
        renderFileList();

        showToast('🔄 页面已清空，可继续上传', 'success');
    }

    // 清空按钮事件监听
    document.getElementById('btn-clear-upload').addEventListener('click', () => {
        if (pendingFiles.length === 0) {
            showToast('文件列表已经是空的', 'success');
            return;
        }

        // 如果有正在上传的文件，不允许清空
        if (pendingFiles.some(f => f.status === 'uploading')) {
            showToast('有文件正在上传中，请等待上传完成', 'error');
            return;
        }

        clearUploadForm();
    });
}

// === 模块 4：数据纠偏 ===
function initFixer() {
    document.getElementById('btn-fix-album').addEventListener('click', async () => {
        const artist = document.getElementById('fix-artist').value.trim();
        const oldAlbum = document.getElementById('fix-old-album').value.trim();
        const newAlbum = document.getElementById('fix-new-album').value.trim();

        if (!artist || !oldAlbum || !newAlbum) {
            showToast('请填写完整信息', 'error');
            return;
        }

        try {
            const res = await fetch('/api/admin/album/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    artist_name: artist,
                    old_album_title: oldAlbum,
                    new_album_title: newAlbum
                })
            });
            if (res.ok) {
                showToast('修订已执行！');
            } else {
                showToast('执行失败', 'error');
            }
        } catch (e) {
            showToast('请求异常', 'error');
        }
    });

    document.getElementById('btn-fix-song').addEventListener('click', async () => {
        const songId = parseInt(document.getElementById('fix-song-id').value);
        const newTitle = document.getElementById('fix-song-title').value.trim();

        if (isNaN(songId) || !newTitle) {
            showToast('请填写完整 ID 和新标题', 'error');
            return;
        }

        try {
            const res = await fetch('/api/admin/album/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    artist_name: "ADMIN_OVERRIDE", // 后端逻辑需支持跳过歌手校验或由前端传正确值
                    old_album_title: "ADMIN_OVERRIDE",
                    specific_tracks: [{ id: songId, title: newTitle }]
                })
            });
            if (res.ok) {
                showToast('曲目名已成功覆盖！');
                loadStats();
            } else {
                showToast('覆盖失败', 'error');
            }
        } catch (e) {
            showToast('请求异常', 'error');
        }
    });
}

// === 模块 5：运维治理 ===
function initGovernance() {
    const postGov = async (targets) => {
        try {
            showToast('正在执行任务...');
            const res = await fetch('/api/admin/governance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targets })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || '执行成功');
                loadStats();
            } else {
                showToast('执行遇错', 'error');
            }
        } catch (e) {
            showToast('请求超时/异常', 'error');
        }
    };

    document.getElementById('btn-clean-orphans').addEventListener('click', () => postGov(['clean-orphans']));
    document.getElementById('btn-clean-duplicates').addEventListener('click', async () => {
        if (!confirm('确认清理冗余专辑？此操作将保留包含歌曲最多的版本并删除重复占位符。')) return;
        try {
            showToast('正在清理中...');
            const res = await fetch('/api/admin/cleanup-duplicates', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || '清理完成');
                loadStats();
            } else {
                showToast('清理失败', 'error');
            }
        } catch (e) {
            showToast('网络异常', 'error');
        }
    });

    document.getElementById('btn-scrub').addEventListener('click', async () => {
        if (!confirm('确认执行路径自修复？此操作将自动补全所有缺失的 music/ 前缀。')) return;
        try {
            showToast('正在对齐路径，请稍候...');
            const res = await fetch('/api/admin/scrub', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || '修复完成！');
                loadStats();
            } else {
                showToast('修复失败', 'error');
            }
        } catch (e) {
            showToast('网络异常', 'error');
        }
    });
}
