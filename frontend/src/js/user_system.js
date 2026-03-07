/**
 * MOODY User System - Frontend Logic
 * Handles Authentication, Session Management, and User Settings
 */

const USER_API_BASE = `${window.API_BASE || ''}/api/user`;

// 全局用户状态
let currentUser = null;
let sessionToken = localStorage.getItem('moody_token') || null;

/**
 * 初始化用户系统
 */
async function initUserSystem() {
    console.log('正在初始化用户系统...');

    // 如果本地有 Token，尝试获取最新设置并恢复状态
    if (sessionToken) {
        try {
            await fetchUserSettings();
            console.log('用户已从本地 Session 恢复');
        } catch (e) {
            console.warn('Session 已过期或无法连接:', e);
            logout();
        }
    }

    // 绑定登录按钮事件
    const submitBtn = document.getElementById('loginSubmitBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', handleLogin);
    }
}

/**
 * 显示登录弹窗
 */
function showLoginModal() {
    if (currentUser) {
        // 如果已经登录，这里可以改为弹出“个人中心”或“退出登录”
        if (confirm(`当前已登录: ${currentUser.username}\n是否退出登录？`)) {
            logout();
        }
        return;
    }
    const modal = document.getElementById('loginModal');
    modal.classList.add('active');
}

/**
 * 隐藏登录弹窗
 */
function hideLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.classList.remove('active');
}

/**
 * 处理登录逻辑
 */
async function handleLogin() {
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const msgDiv = document.getElementById('loginMessage');
    const btn = document.getElementById('loginSubmitBtn');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username) {
        showLoginMsg('请输入用户名', 'error');
        return;
    }

    try {
        btn.innerText = '正在进入存档...';
        btn.disabled = true;

        const response = await fetch(`${USER_API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) throw new Error('网络请求失败');

        const data = await response.json();

        // 登录成功处理
        currentUser = data.user;
        sessionToken = data.token;
        localStorage.setItem('moody_token', sessionToken);
        localStorage.setItem('moody_user', JSON.stringify(currentUser));

        updateUserUI();
        showLoginMsg('登录成功！欢迎回来', 'success');

        // 延时关闭弹窗
        setTimeout(() => {
            hideLoginModal();
            // 重置文案
            btn.innerText = '进入 MOODY 存档';
            btn.disabled = false;
        }, 1000);

        // 获取并应用用户设置
        await fetchUserSettings();

    } catch (err) {
        console.error('Login Error:', err);
        showLoginMsg('连接服务器失败，请检查后端状态', 'error');
        btn.innerText = '进入 MOODY 存档';
        btn.disabled = false;
    }
}

/**
 * 更新侧边栏的用户 UI
 */
function updateUserUI() {
    const nameEl = document.getElementById('userName');
    const statusEl = document.getElementById('userStatus');
    const avatarImg = document.querySelector('#userAvatar img');

    if (currentUser) {
        nameEl.innerText = currentUser.username;
        statusEl.innerText = `Level ${currentUser.level} · ${currentUser.role === 'admin' ? '管理员' : '正式用户'}`;
        if (currentUser.avatar_url) {
            avatarImg.src = currentUser.avatar_url;
        }
    } else {
        nameEl.innerText = '未登录';
        statusEl.innerText = '点击登录系统';
        avatarImg.src = 'src/assets/images/avatars/default.png';
    }
}

/**
 * 获取并应用用户个人设置
 */
async function fetchUserSettings() {
    if (!sessionToken) return;

    try {
        const response = await fetch(`${USER_API_BASE}/settings`, {
            headers: { 'Authorization': sessionToken }
        });

        if (response.status === 401) {
            logout();
            return;
        }

        const settings = await response.json();

        // 应用到全局 (例如音量)
        if (settings.last_volume !== undefined) {
            applyVolume(settings.last_volume);
        }

        // 更新 UI 状态
        // 这里可以根据设置更新主题等
        console.log('用户设置已应用:', settings);

        // 如果之前是从保存的 User 信息恢复，这里手动触发一次 UI 更新
        if (!currentUser) {
            currentUser = JSON.parse(localStorage.getItem('moody_user'));
            updateUserUI();
        }

    } catch (e) {
        console.error('Fetch settings failed:', e);
    }
}

/**
 * 应用音量设置 (与 player.js 交互)
 */
function applyVolume(val) {
    const audio = document.getElementById('audioPlayer');
    if (audio) {
        audio.volume = val;
        // 如果有音量条 UI，也要更新
        const fill = document.getElementById('volumeFill');
        if (fill) fill.style.width = `${val * 100}%`;
    }
}

/**
 * 退出登录
 */
function logout() {
    currentUser = null;
    sessionToken = null;
    localStorage.removeItem('moody_token');
    localStorage.removeItem('moody_user');
    updateUserUI();
}

/**
 * 辅助函数：显示登录反馈信息
 */
function showLoginMsg(text, type) {
    const msgDiv = document.getElementById('loginMessage');
    msgDiv.innerText = text;
    msgDiv.className = `login-message ${type}`;
}

// 导出全局函数供 index.html 使用
window.showLoginModal = showLoginModal;
window.hideLoginModal = hideLoginModal;

// 启动执行
document.addEventListener('DOMContentLoaded', initUserSystem);
