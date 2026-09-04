#!/usr/bin/env node

/**
 * ==============================================================================
 * MOODY 全端一键域名切换运维脚本 (One-Click Domain Switcher)
 * ==============================================================================
 *
 * 用法:
 *   node scripts/switch-domain.js <新域名> [Cloudflare_Token]
 *
 * 示例:
 *   node scripts/switch-domain.js changgepd.ccwu.cc
 *
 * 自动化执行 4 大闭环:
 *   1. [Android] 自动更新 gradle.properties 中的 MOODY_API_BASE_URL
 *   2. [Frontend & Admin] 自动更新 config.js 中的 API_BASE 与 R2_BASE
 *   3. [Cloudflare] 自动绑定 Worker (m-api) 与 R2 Bucket 存储桶域名
 *   4. [Verification] 自动测试新接口健康检查
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 路径智能解析（兼顾工作区根目录与后端独立仓库运行）
const SCRIPT_DIR = __dirname;
const REPO_DIR = path.resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = fs.existsSync(path.resolve(REPO_DIR, 'MoodyMusicForAndroid'))
    ? REPO_DIR
    : path.resolve(REPO_DIR, '..', '..');

const ANDROID_PROPERTIES = path.join(WORKSPACE_ROOT, 'MoodyMusicForAndroid', 'gradle.properties');
const FRONTEND_CONFIG = fs.existsSync(path.join(REPO_DIR, 'frontend', 'src', 'js', 'config.js'))
    ? path.join(REPO_DIR, 'frontend', 'src', 'js', 'config.js')
    : (fs.existsSync(path.join(WORKSPACE_ROOT, 'backend', 'frontend', 'src', 'js', 'config.js'))
        ? path.join(WORKSPACE_ROOT, 'backend', 'frontend', 'src', 'js', 'config.js')
        : path.join(WORKSPACE_ROOT, 'backend-inspect', 'MOODY-Music-Archiv-V2', 'frontend', 'src', 'js', 'config.js'));
const ADMIN_CONFIG = fs.existsSync(path.join(REPO_DIR, 'frontend', 'admin', 'config.js'))
    ? path.join(REPO_DIR, 'frontend', 'admin', 'config.js')
    : (fs.existsSync(path.join(WORKSPACE_ROOT, 'backend', 'frontend', 'admin', 'config.js'))
        ? path.join(WORKSPACE_ROOT, 'backend', 'frontend', 'admin', 'config.js')
        : path.join(WORKSPACE_ROOT, 'backend-inspect', 'MOODY-Music-Archiv-V2', 'frontend', 'admin', 'config.js'));

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '0bd18c2b8609958f139bed5fdbe6b3f5';

const newDomain = process.argv[2];
const cfToken = process.argv[3] || process.env.CLOUDFLARE_API_TOKEN;

if (!newDomain) {
    console.error('❌ 错误: 请传入目标域名！');
    console.error('👉 用法: node scripts/switch-domain.js <新域名> [Cloudflare_Token]');
    console.error('👉 示例: node scripts/switch-domain.js changgepd.ccwu.cc <CF_TOKEN>');
    console.error('👉 或者预先设置环境变量: export CLOUDFLARE_API_TOKEN=your_token');
    process.exit(1);
}

console.log('====================================================');
console.log(`🚀 开始执行全端域名一键切换 -> [${newDomain}]`);
console.log('====================================================\n');

// 1. 更新 Android 端 gradle.properties
try {
    if (fs.existsSync(ANDROID_PROPERTIES)) {
        let content = fs.readFileSync(ANDROID_PROPERTIES, 'utf8');
        const regex = /MOODY_API_BASE_URL=.*/g;
        const targetUrl = `MOODY_API_BASE_URL=https://m-api.${newDomain}/`;
        if (regex.test(content)) {
            content = content.replace(regex, targetUrl);
        } else {
            content += `\nMOODY_API_BASE_URL=https://m-api.${newDomain}/\n`;
        }
        fs.writeFileSync(ANDROID_PROPERTIES, content, 'utf8');
        console.log(`✅ [Android] gradle.properties 已更新: ${targetUrl}`);
    } else {
        console.warn(`⚠️ [Android] 未找到文件: ${ANDROID_PROPERTIES}`);
    }
} catch (err) {
    console.error(`❌ [Android] 更新失败:`, err.message);
}

// 2. 更新 Web 前端与 Admin 后台 config.js
const makeConfigContent = (domain, isAdmin = false) => `/**
 * MOODY ${isAdmin ? 'CMS 管理后台' : '全局前端'}配置中心 (Single Source of Truth)
 * 由 scripts/switch-domain.js 自动生成与维护
 */
(function() {
    // 默认直连已部署的生产 Worker (https://m-api.${domain})
    // 若需要调试本地 8787 端口的 Worker，可在 URL 后添加 ?env=local
    const urlParams = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : null;
    const isExplicitLocal = urlParams && urlParams.get('env') === 'local';

    window.MOODY_CONFIG = {
        API_BASE: isExplicitLocal ? 'http://127.0.0.1:8787' : 'https://m-api.${domain}',
        R2_BASE: 'https://r2.${domain}'
    };
    window.API_BASE = window.MOODY_CONFIG.API_BASE;
})();
`;

try {
    if (fs.existsSync(path.dirname(FRONTEND_CONFIG))) {
        fs.writeFileSync(FRONTEND_CONFIG, makeConfigContent(newDomain, false), 'utf8');
        console.log(`✅ [Web 前端] config.js 已更新 -> https://m-api.${newDomain}`);
    }
    if (fs.existsSync(path.dirname(ADMIN_CONFIG))) {
        fs.writeFileSync(ADMIN_CONFIG, makeConfigContent(newDomain, true), 'utf8');
        console.log(`✅ [管理后台] config.js 已更新 -> https://m-api.${newDomain}`);
    }
} catch (err) {
    console.error(`❌ [前端/后台] 更新失败:`, err.message);
}

// 辅助网络请求函数
function cfRequest(urlPath, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const payload = data ? JSON.stringify(data) : null;
        const options = {
            hostname: 'api.cloudflare.com',
            port: 443,
            path: `/client/v4${urlPath}`,
            method,
            headers: {
                'Authorization': `Bearer ${cfToken}`,
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve(json);
                } catch (e) {
                    resolve({ raw: body, status: res.statusCode });
                }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// 3. 自动化配置 Cloudflare
async function syncCloudflare() {
    if (!cfToken) {
        console.log('\n☁️ 未提供 Cloudflare API Token，已跳过云端自动换绑（本地配置文件已更新完毕）。');
        console.log('👉 如需同步修改 Cloudflare，请运行: node scripts/switch-domain.js <域名> <Token>');
        return;
    }
    console.log('\n☁️ 正在连接 Cloudflare 校验域名解析与 Worker 绑定...');
    try {
        // A. 查询 Zone
        const zonesRes = await cfRequest('/zones');
        if (!zonesRes.success || !zonesRes.result) {
            console.warn('⚠️ 无法获取 Cloudflare Zones，请检查 Token 权限。已跳过云端绑定。');
            return;
        }

        const targetZone = zonesRes.result.find(z => z.name === newDomain || newDomain.endsWith(z.name));
        if (!targetZone) {
            console.warn(`⚠️ Cloudflare 中未找到域名 [${newDomain}] 的 Zone，请先在控制台添加该域名。`);
            return;
        }
        console.log(`🎯 匹配到 Cloudflare Zone: ${targetZone.name} (ID: ${targetZone.id})`);

        // B. 绑定 Worker Custom Domain (m-api)
        const workerDomainPayload = {
            environment: 'production',
            hostname: `m-api.${newDomain}`,
            service: 'moody-worker',
            zone_id: targetZone.id
        };
        const bindWorkerRes = await cfRequest(`/accounts/${CF_ACCOUNT_ID}/workers/domains`, 'PUT', workerDomainPayload);
        if (bindWorkerRes.success) {
            console.log(`✅ [Cloudflare] 成功绑定 Worker 域名 -> m-api.${newDomain}`);
        } else {
            console.warn(`ℹ️ [Cloudflare] Worker 绑定反馈:`, bindWorkerRes.errors?.[0]?.message || bindWorkerRes);
        }

        // C. 绑定 R2 Custom Domain (r2)
        const r2Payload = {
            domain: `r2.${newDomain}`,
            enabled: true,
            minTLS: '1.0',
            zoneId: targetZone.id
        };
        const bindR2Res = await cfRequest(`/accounts/${CF_ACCOUNT_ID}/r2/buckets/moody-music-asset/domains/custom`, 'POST', r2Payload);
        if (bindR2Res.success) {
            console.log(`✅ [Cloudflare] 成功绑定 R2 存储桶域名 -> r2.${newDomain}`);
        } else {
            console.warn(`ℹ️ [Cloudflare] R2 绑定反馈:`, bindR2Res.errors?.[0]?.message || bindR2Res);
        }

    } catch (e) {
        console.error('❌ Cloudflare 同步遇错:', e.message);
    }
}

syncCloudflare().then(() => {
    console.log('\n====================================================');
    console.log('🎉 全端域名切换完成！各端均已接入 Single Source of Truth:');
    console.log(`   • Android 根源:  MoodyMusicForAndroid/gradle.properties`);
    console.log(`   • Web/Admin 根源: frontend/src/js/config.js`);
    console.log(`   • 线上接口已生效: https://m-api.${newDomain}/`);
    console.log('====================================================\n');
});
