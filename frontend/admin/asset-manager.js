// ==========================================
// 视觉资产管理模块 (Asset Studio)
// ==========================================
function initAssetManager() {
    const API_BASE = 'https://m-api.changgepd.top';
    const dropzone = document.getElementById('asset-dropzone');
    const fileInput = document.getElementById('asset-file-input');
    const fileListEl = document.getElementById('asset-file-list');
    const btnUpload = document.getElementById('btn-trigger-asset-upload');
    const btnClear = document.getElementById('btn-clear-asset-upload');
    const btnRefresh = document.getElementById('btn-refresh-gallery');
    const progContainer = document.getElementById('asset-upload-progress-container');
    const progBar = document.getElementById('asset-upload-progress');
    const galleryGrid = document.getElementById('asset-gallery-grid');
    const tabButtons = document.querySelectorAll('.gallery-tabs button');

    let pendingFiles = [];
    let currentGalleryCategory = 'all';

    if (!dropzone || !fileInput) return;

    // 拖拽与点击事件绑定
    dropzone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) {
            showToast('请拖入有效的图片文件 (JPG, PNG, WEBP)', 'error');
            return;
        }
        addFiles(files);
    });

    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files);
        addFiles(files);
        fileInput.value = '';
    });

    btnClear.addEventListener('click', () => {
        pendingFiles = [];
        renderFileList();
    });

    function addFiles(files) {
        for (const f of files) {
            pendingFiles.push({
                file: f,
                status: 'waiting',
                progress: 0,
                error: null
            });
        }
        renderFileList();
    }

    function renderFileList() {
        if (pendingFiles.length === 0) {
            fileListEl.innerHTML = '';
            btnUpload.disabled = true;
            return;
        }

        btnUpload.disabled = false;
        fileListEl.innerHTML = pendingFiles.map((fObj, idx) => `
            <div class="file-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-panel); border-radius: var(--radius); margin-bottom: 6px; border: 1px solid var(--border);">
                <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                    <span style="font-size: 18px;">🖼️</span>
                    <span style="font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; max-width: 260px;">${fObj.file.name}</span>
                    <span style="font-size: 11px; color: var(--text-muted);">(${(fObj.file.size / 1024).toFixed(1)} KB)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="status-badge" style="font-size: 11px; padding: 2px 6px; border-radius: 4px; ${getStatusStyle(fObj.status)}">
                        ${getStatusText(fObj.status, fObj.progress)}
                    </span>
                    ${fObj.status === 'waiting' ? `<button onclick="removeAssetFile(${idx})" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 14px;">✕</button>` : ''}
                </div>
            </div>
        `).join('');
    }

    window.removeAssetFile = (index) => {
        if (pendingFiles[index] && pendingFiles[index].status === 'uploading') return;
        pendingFiles.splice(index, 1);
        renderFileList();
    };

    function getStatusStyle(status) {
        if (status === 'success') return 'background: #2ed573; color: #000;';
        if (status === 'error') return 'background: var(--danger); color: #fff;';
        if (status === 'uploading') return 'background: var(--accent); color: #000;';
        return 'background: var(--border); color: var(--text-muted);';
    }

    function getStatusText(status, progress) {
        if (status === 'success') return '✓ 已完成';
        if (status === 'error') return '✗ 失败';
        if (status === 'uploading') return `上传中 ${progress}%`;
        return '待上传';
    }

    // 单张图片上传
    function uploadSingleAsset(fObj, category, customName) {
        return new Promise((resolve) => {
            const formData = new FormData();
            formData.append('file', fObj.file);
            formData.append('category', category);
            if (customName) formData.append('filename', customName);

            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${API_BASE}/api/admin/assets/upload`, true);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    fObj.progress = Math.round((e.loaded / e.total) * 100);
                    renderFileList();
                }
            };

            xhr.onload = () => {
                let data = {};
                try { data = JSON.parse(xhr.responseText); } catch (e) { data = { message: "非 JSON 响应" }; }

                if (xhr.status >= 200 && xhr.status < 300 && data.code === 200) {
                    fObj.status = 'success';
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

    // 执行上传
    btnUpload.addEventListener('click', async () => {
        const toUpload = pendingFiles.filter(f => f.status === 'waiting' || f.status === 'error');
        if (toUpload.length === 0) return;

        const category = document.getElementById('asset-category').value;
        const customName = document.getElementById('asset-filename').value.trim();

        btnUpload.disabled = true;
        progContainer.classList.remove('hidden');

        let completed = 0;
        for (const fObj of toUpload) {
            await uploadSingleAsset(fObj, category, customName);
            completed++;
            progBar.style.width = `${Math.round((completed / toUpload.length) * 100)}%`;
        }

        showToast(`成功上传 ${completed} 张视觉素材！`);
        setTimeout(() => {
            progContainer.classList.add('hidden');
            loadAssetGallery(currentGalleryCategory);
        }, 1200);
    });

    // 资产画廊加载
    async function loadAssetGallery(cat = 'all') {
        currentGalleryCategory = cat;
        galleryGrid.innerHTML = '<p class="hint">正在从 Cloudflare R2 检索资产...</p>';

        try {
            const res = await fetch(`${API_BASE}/api/admin/assets/list?category=${cat}`);
            const data = await res.json();

            if (data.code === 200 && data.data.items && data.data.items.length > 0) {
                renderGallery(data.data.items);
            } else {
                galleryGrid.innerHTML = '<p class="hint" style="grid-column: 1 / -1;">暂无该分类下的资产，点击上方上传。</p>';
            }
        } catch (e) {
            console.error('加载画廊失败:', e);
            galleryGrid.innerHTML = '<p class="hint" style="grid-column: 1 / -1; color: var(--danger);">加载资产列表失败，请检查网络</p>';
        }
    }

    function renderGallery(items) {
        galleryGrid.innerHTML = items.map(item => `
            <div class="asset-card" style="background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; display: flex; flex-direction: column;">
                <div style="width: 100%; height: 140px; background: #000; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                    <img src="${item.url}" alt="${item.filename}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s;" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
                </div>
                <div style="padding: 10px; display: flex; flex-direction: column; gap: 4px; flex: 1;">
                    <div style="font-size: 12px; font-weight: bold; color: var(--text-main); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" title="${item.filename}">${item.filename}</div>
                    <div style="font-size: 11px; color: var(--text-muted); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">${item.key}</div>
                    <div style="margin-top: auto; display: flex; gap: 6px; padding-top: 6px;">
                        <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px; flex: 1;" onclick="copyAssetUrl('${item.url}')">📋 复制 URL</button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    window.copyAssetUrl = (url) => {
        navigator.clipboard.writeText(url).then(() => {
            showToast('已复制 CDN 地址到剪贴板！');
        }).catch(() => {
            prompt('请复制以下 URL:', url);
        });
    };

    // 分类 Tab 切换
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('tab-active'));
            btn.classList.add('tab-active');
            loadAssetGallery(btn.dataset.cat);
        });
    });

    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => loadAssetGallery(currentGalleryCategory));
    }

    // 初次加载资产画廊
    loadAssetGallery('all');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initAssetManager();
});
