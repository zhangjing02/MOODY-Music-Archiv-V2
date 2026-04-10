/**
 * MOODY User System - Frontend Logic
 * Handles Authentication, Session Management, and User Settings
 * V2: Separate Login/Register with Supabase Auth + JWT Bearer Token
 */

const USER_API_BASE = `${window.API_BASE || ''}/api/user`;

// 全局用户状态
let currentUser = JSON.parse(localStorage.getItem('moody_user') || 'null');
let sessionToken = localStorage.getItem('moody_token') || null;
let refreshToken = localStorage.getItem('moody_refresh_token') || null;

/**
 * 初始化用户系统
 */
async function initUserSystem() {
    console.log('正在初始化用户系统...');

    // 绑定登录按钮事件
    const submitBtn = document.getElementById('loginSubmitBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', handleLogin);
    }
    const registerBtn = document.getElementById('registerSubmitBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', handleRegister);
    }

    // Tab 切换
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    if (loginTab) loginTab.addEventListener('click', () => switchTab('login'));
    if (registerTab) registerTab.addEventListener('click', () => switchTab('register'));

    // 如果本地有 Token，尝试获取最新设置并恢复状态
    if (sessionToken) {
        try {
            await fetchUserSettings();
            console.log('用户已从本地 Session 恢复');
        } catch (e) {
            console.warn('Session 已过期，尝试刷新...', e);
            // 尝试刷新 token
            const refreshed = await tryRefreshToken();
            if (!refreshed) {
                logout();
            }
        }
    }

    // 初始化 UI
    updateUserUI();
}

/**
 * 切换登录/注册 Tab
 */
function switchTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');

    if (tab === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        loginTab.classList.remove('active');
        registerTab.classList.add('active');
    }

    // 清空消息
    showLoginMsg('', '');
}

/**
 * 显示登录弹窗
 */
function showLoginModal() {
    if (currentUser) {
        if (confirm(`当前已登录: ${currentUser.username}\n是否退出登录？`)) {
            logout();
        }
        return;
    }
    const modal = document.getElementById('loginModal');
    modal.classList.add('active');
    // 默认显示登录 Tab
    switchTab('login');
}

/**
 * 隐藏登录弹窗
 */
function hideLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.classList.remove('active');
    // 清空输入框
    const inputs = modal.querySelectorAll('input');
    inputs.forEach(input => input.value = '');
    showLoginMsg('', '');
}

/**
 * 处理登录逻辑
 */
async function handleLogin() {
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const btn = document.getElementById('loginSubmitBtn');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username) {
        showLoginMsg('请输入用户名', 'error');
        return;
    }
    if (!password) {
        showLoginMsg('请输入密码', 'error');
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

        const data = await response.json();

        if (!response.ok || data.code !== 200) {
            showLoginMsg(data.message || '登录失败', 'error');
            btn.innerText = '进入 MOODY 存档';
            btn.disabled = false;
            return;
        }

        // 登录成功
        saveSession(data);

        updateUserUI();
        showLoginMsg('登录成功！欢迎回来', 'success');

        setTimeout(() => {
            hideLoginModal();
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
 * 处理注册逻辑
 */
async function handleRegister() {
    const usernameInput = document.getElementById('registerUsername');
    const passwordInput = document.getElementById('registerPassword');
    const confirmPasswordInput = document.getElementById('registerConfirmPassword');
    const btn = document.getElementById('registerSubmitBtn');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    if (!username) {
        showLoginMsg('请输入用户名', 'error');
        return;
    }
    if (username.length < 3 || username.length > 20) {
        showLoginMsg('用户名长度需在 3-20 个字符之间', 'error');
        return;
    }
    if (!password) {
        showLoginMsg('请输入密码', 'error');
        return;
    }
    if (password.length < 6) {
        showLoginMsg('密码长度至少 6 个字符', 'error');
        return;
    }
    if (password !== confirmPassword) {
        showLoginMsg('两次密码输入不一致', 'error');
        return;
    }

    try {
        btn.innerText = '正在注册...';
        btn.disabled = true;

        const response = await fetch(`${USER_API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok || data.code !== 200) {
            showLoginMsg(data.message || '注册失败', 'error');
            btn.innerText = '注册新账号';
            btn.disabled = false;
            return;
        }

        // 注册成功，自动登录
        saveSession(data);

        updateUserUI();
        showLoginMsg('注册成功！欢迎加入 MOODY', 'success');

        setTimeout(() => {
            hideLoginModal();
            btn.innerText = '注册新账号';
            btn.disabled = false;
        }, 1500);

    } catch (err) {
        console.error('Register Error:', err);
        showLoginMsg('连接服务器失败，请检查后端状态', 'error');
        btn.innerText = '注册新账号';
        btn.disabled = false;
    }
}

/**
 * 保存会话信息到本地存储
 */
function saveSession(data) {
    currentUser = data.user;
    sessionToken = data.token;
    refreshToken = data.refresh_token || null;

    localStorage.setItem('moody_token', sessionToken);
    localStorage.setItem('moody_user', JSON.stringify(currentUser));
    if (refreshToken) {
        localStorage.setItem('moody_refresh_token', refreshToken);
    }
}

/**
 * 尝试刷新 Token
 */
async function tryRefreshToken() {
    if (!refreshToken) return false;

    try {
        const response = await fetch(`${USER_API_BASE}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        const data = await response.json();

        if (data.code === 200 && data.token) {
            sessionToken = data.token;
            refreshToken = data.refresh_token || refreshToken;
            localStorage.setItem('moody_token', sessionToken);
            if (data.refresh_token) {
                localStorage.setItem('moody_refresh_token', data.refresh_token);
            }
            console.log('Token 刷新成功');
            return true;
        }
        return false;
    } catch (e) {
        console.error('Token refresh failed:', e);
        return false;
    }
}

/**
 * 带认证的 fetch 封装（自动带 Bearer token + 过期自动刷新）
 */
async function authFetch(url, options = {}) {
    if (!sessionToken) {
        logout();
        throw new Error('未登录');
    }

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${sessionToken}`,
    };

    let response = await fetch(url, { ...options, headers });

    // 如果 401，尝试刷新 token 重试一次
    if (response.status === 401 && refreshToken) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
            headers['Authorization'] = `Bearer ${sessionToken}`;
            response = await fetch(url, { ...options, headers });
        } else {
            logout();
        }
    }

    return response;
}

/**
 * 更新侧边栏的用户 UI
 */
function updateUserUI() {
    const nameEl = document.getElementById('userName');
    const statusEl = document.getElementById('userStatus');
    const avatarImg = document.querySelector('#userAvatar img');

    if (!nameEl || !statusEl) return;

    if (currentUser) {
        nameEl.innerText = currentUser.username;
        statusEl.innerText = `Level ${currentUser.level || 1} · ${currentUser.role === 'admin' ? '管理员' : '正式用户'}`;
        if (currentUser.avatar_url) {
            avatarImg.src = currentUser.avatar_url;
        }
    } else {
        nameEl.innerText = '未登录';
        statusEl.innerText = '点击登录系统';
        if (avatarImg) avatarImg.src = 'src/assets/images/avatars/default.png';
    }
}

/**
 * 获取并应用用户个人设置
 */
async function fetchUserSettings() {
    if (!sessionToken) return;

    try {
        const response = await authFetch(`${USER_API_BASE}/settings`);

        if (response.status === 401) {
            logout();
            return;
        }

        const settings = await response.json();

        // 应用到全局 (例如音量)
        if (settings.last_volume !== undefined) {
            applyVolume(settings.last_volume);
        }

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
    refreshToken = null;
    localStorage.removeItem('moody_token');
    localStorage.removeItem('moody_user');
    localStorage.removeItem('moody_refresh_token');
    updateUserUI();
}

/**
 * 辅助函数：显示登录反馈信息
 */
function showLoginMsg(text, type) {
    const msgDiv = document.getElementById('loginMessage');
    if (!msgDiv) return;
    msgDiv.innerText = text;
    if (text) {
        msgDiv.className = `login-message ${type}`;
    } else {
        msgDiv.className = 'login-message';
    }
}

// 导出全局函数供 index.html 使用
window.showLoginModal = showLoginModal;
window.hideLoginModal = hideLoginModal;

// 启动执行
document.addEventListener('DOMContentLoaded', initUserSystem);
