document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initGovernance();
    initFixer();
    initUploader();
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
            document.getElementById('stat-artists').textContent = data.data.artists || 0;
            document.getElementById('stat-albums').textContent = data.data.albums || 0;
            document.getElementById('stat-tracks').textContent = data.data.tracks || 0;
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

    function handleFiles(files) {
        for (let f of files) {
            pendingFiles.push(f);
        }
        renderFileList();
    }

    function renderFileList() {
        fileListEl.innerHTML = '';
        pendingFiles.forEach((file, index) => {
            const el = document.createElement('div');
            el.className = 'file-item';
            el.innerHTML = `<span>${file.name}</span> <span style="cursor:pointer;color:var(--danger)" onclick="window.removeFile(${index})">❌</span>`;
            fileListEl.appendChild(el);
        });
        btnUpload.disabled = pendingFiles.length === 0;
    }

    window.removeFile = (index) => {
        pendingFiles.splice(index, 1);
        renderFileList();
    };

    btnUpload.addEventListener('click', async () => {
        if (pendingFiles.length === 0) return;

        const artist = document.getElementById('up-artist').value.trim();
        const album = document.getElementById('up-album').value.trim();

        const formData = new FormData();
        pendingFiles.forEach(f => formData.append('files', f));
        if (artist) formData.append('artistOverride', artist);
        if (album) formData.append('albumOverride', album);

        btnUpload.disabled = true;
        progContainer.classList.remove('hidden');
        progBar.style.width = '30%';

        try {
            const res = await fetch('/api/admin/upload', {
                method: 'POST',
                body: formData // 浏览器会自动设为 multipart/form-data
            });
            const data = await res.json();

            progBar.style.width = '100%';

            if (res.ok && data.code === 200) {
                showToast('上传与入库成功！');
                pendingFiles = [];
                renderFileList();
                loadStats(); // 刷新统计
            } else {
                showToast(`上传失败: ${data.message || '未知错误'}`, 'error');
            }
        } catch (err) {
            showToast('网络错误', 'error');
        } finally {
            setTimeout(() => {
                btnUpload.disabled = pendingFiles.length === 0;
                progContainer.classList.add('hidden');
                progBar.style.width = '0%';
            }, 1000);
        }
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
    document.getElementById('btn-clean-duplicates').addEventListener('click', () => postGov(['clean-duplicates']));

    document.getElementById('btn-scrub').addEventListener('click', async () => {
        if (!confirm('警告：此操作将强力对齐物理文件和数据库，可能耗时极长且具破坏性！确认继续？')) return;
        try {
            showToast('强力扫除中，请勿关闭页面...');
            const res = await fetch('/api/admin/scrub', { method: 'POST' });
            if (res.ok) {
                showToast('数据库对齐完成！');
                loadStats();
            }
        } catch (e) {
            showToast('连接中断或错误', 'error');
        }
    });
}
