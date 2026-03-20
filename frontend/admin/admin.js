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

    function handleFiles(files) {
        for (let f of files) {
            pendingFiles.push({
                file: f,
                status: 'waiting',
                progress: 0,
                error: null
            });
        }
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

            const xhr = new XMLHttpRequest();
            // [CRITICAL CHANGE] 改为调用 Worker API
            xhr.open('POST', 'https://moody-worker.changgepd.workers.dev/api/admin/upload', true);

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
