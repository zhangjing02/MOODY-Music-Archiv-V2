/**
 * MOODY Atmosphere System (v1.0)
 * 包含:
 * 1. SnowSystem (v4.1): 双层积雪物理粒子系统
 * 2. AtmosphereController: 全局氛围管理器与 UI 开关
 */

class SnowSystem {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // 关键布局位置
        this.tabsY = 0; // 第一层：分割线
        this.bottomY = 0; // 第二层：播放栏

        this.maxParticles = 60;
        this.wind = 0;
        this.animationId = null;
        this.isRunning = false; // 运行状态控制

        // [优化] 预渲染缓存
        this.snowflakeCache = [];
        this.preRenderSnowflakes();

        // 积雪高度图
        this.resolution = 4;
        this.midGroundMap = [];
        this.bottomGroundMap = [];

        // 初始化但不立即启动循环，由 Controller 控制
        this.setupCanvas();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    setupCanvas() {
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '9999';
        // 默认透明，淡入淡出
        this.canvas.style.opacity = '0';
        this.canvas.style.transition = 'opacity 1.5s ease-in-out';
        document.body.appendChild(this.canvas);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.canvas.style.opacity = '1';
        this.loop();
    }

    stop() {
        this.isRunning = false;
        this.canvas.style.opacity = '0';
        // 延迟停止计算，让动画平滑消失
        setTimeout(() => {
            if (!this.isRunning) cancelAnimationFrame(this.animationId);
        }, 1500);
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.updateLayoutInfo();

        const bins = Math.ceil(this.width / this.resolution);

        if (this.midGroundMap.length !== bins) {
            this.midGroundMap = new Float32Array(bins).fill(0);
        }
        if (this.bottomGroundMap.length !== bins) {
            this.bottomGroundMap = new Float32Array(bins).fill(0);
        }
    }

    updateLayoutInfo() {
        const navTabs = document.querySelector('.nav-tabs');
        const playerBar = document.querySelector('.player-bar');

        this.tabsY = -1;
        if (navTabs && navTabs.offsetParent !== null && navTabs.innerHTML !== '') {
            this.tabsY = navTabs.getBoundingClientRect().top;
        }

        if (playerBar) {
            this.bottomY = playerBar.getBoundingClientRect().top;
        } else {
            this.bottomY = this.height;
        }
    }

    createParticle() {
        const branchType = Math.floor(Math.random() * 3);
        const sizeLevel = Math.floor(Math.random() * 3); // 对应 preRender 中的 3 个尺寸
        const size = [5, 8, 12][sizeLevel];

        return {
            x: Math.random() * this.width,
            y: -30,
            vx: (Math.random() - 0.5) * 0.8,
            vy: Math.random() * 0.8 + 0.6,
            size: size,
            rotation: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.03,
            branchType: branchType,
            cacheIdx: branchType * 3 + sizeLevel,
            alpha: Math.min(0.9, (size / 12) + 0.3)
        };
    }

    // [优化] 预渲染雪花到离屏 Canvas，避免逐帧绘制路径
    preRenderSnowflakes() {
        const sizes = [5, 8, 12]; // 对应不同尺寸等级
        const branchTypes = [0, 1, 2];

        branchTypes.forEach(bt => {
            sizes.forEach(sz => {
                const canvas = document.createElement('canvas');
                const padding = 4;
                canvas.width = (sz + padding) * 2;
                canvas.height = (sz + padding) * 2;
                const ctx = canvas.getContext('2d');

                // 绘制一个静态雪花
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.lineWidth = 1.2;
                ctx.lineCap = 'round';

                // 移除实时阴影，改用稍微厚一点的线条或预模糊处理
                for (let i = 0; i < 6; i++) {
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(0, -sz);
                    ctx.stroke();

                    if (sz > 4) {
                        ctx.beginPath();
                        if (bt === 0) {
                            ctx.moveTo(0, -sz * 0.6);
                            ctx.lineTo(sz * 0.3, -sz * 0.8);
                            ctx.moveTo(0, -sz * 0.6);
                            ctx.lineTo(-sz * 0.3, -sz * 0.8);
                        } else if (bt === 1) {
                            ctx.moveTo(0, -sz * 0.5);
                            ctx.lineTo(sz * 0.25, -sz * 0.7);
                            ctx.moveTo(0, -sz * 0.5);
                            ctx.lineTo(-sz * 0.25, -sz * 0.7);
                            ctx.moveTo(0, -sz * 0.8);
                            ctx.lineTo(sz * 0.2, -sz * 0.95);
                            ctx.moveTo(0, -sz * 0.8);
                            ctx.lineTo(-sz * 0.2, -sz * 0.95);
                        } else {
                            ctx.moveTo(0, -sz * 0.7);
                            ctx.lineTo(sz * 0.15, -sz * 0.6);
                            ctx.moveTo(0, -sz * 0.7);
                            ctx.lineTo(-sz * 0.15, -sz * 0.6);
                        }
                        ctx.stroke();
                    }
                    ctx.rotate(Math.PI / 3);
                }

                this.snowflakeCache.push({
                    canvas: canvas,
                    size: sz,
                    branchType: bt
                });
            });
        });
    }

    drawSnowflake(ctx, p) {
        const cache = this.snowflakeCache[p.cacheIdx] || this.snowflakeCache[0];
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.alpha;
        // 使用 drawImage 替代反复 path 绘制
        ctx.drawImage(cache.canvas, -cache.canvas.width / 2, -cache.canvas.height / 2);
        ctx.restore();
    }

    melt(map, rate) {
        for (let k = 0; k < 8; k++) {
            const idx = Math.floor(Math.random() * map.length);
            if (map[idx] > 0) {
                map[idx] -= rate;
                if (map[idx] < 0) map[idx] = 0;
            }
        }
    }

    smooth(map) {
        if (Math.random() < 0.5) {
            for (let i = 1; i < map.length - 1; i++) {
                const h = map[i];
                if (h > map[i - 1] + 1.5) {
                    map[i] -= 0.4;
                    map[i - 1] += 0.4;
                } else if (h > map[i + 1] + 1.5) {
                    map[i] -= 0.4;
                    map[i + 1] += 0.4;
                }
            }
        }
    }

    update() {
        if (this.particles.length < this.maxParticles && Math.random() < 0.04) {
            this.particles.push(this.createParticle());
        }

        this.wind = Math.sin(Date.now() / 3500) * 0.4;

        this.melt(this.midGroundMap, 0.04);
        this.smooth(this.midGroundMap);

        this.melt(this.bottomGroundMap, 0.06);
        this.smooth(this.bottomGroundMap);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            p.rotation += p.vRot;
            p.x += p.vx + this.wind;
            p.y += p.vy;

            // 1. 强制清理：一旦落出底部，必须销毁！
            // 放到 index check 之前，防止粒子因为在左右俩边被 continue 而导致无法销毁
            if (p.y > this.height + 20) {
                this.particles.splice(i, 1);
                continue;
            }

            const colIndex = Math.floor(p.x / this.resolution);

            // 2. 左右边界外检查：可以 continue，但一定要保证它在上面已经被检查过 y > height
            if (colIndex < 0 || colIndex >= this.midGroundMap.length) continue;

            // Tabs Collision
            let caughtByTabs = false;
            // 优化：如果已经低于 Tabs 太多，就别检测碰撞了
            if (this.tabsY > 0 && p.y < this.tabsY + 10) {
                const groundH = this.midGroundMap[colIndex];
                const limitY = this.tabsY - groundH - (p.size / 2);

                if (p.y >= limitY && p.y < limitY + p.vy + 2) {
                    if (Math.random() < 0.3) {
                        caughtByTabs = true;
                        this.midGroundMap[colIndex] += p.size * 0.3;

                        // 堆积扩散
                        if (colIndex > 0) this.midGroundMap[colIndex - 1] += p.size * 0.1;
                        if (colIndex < this.midGroundMap.length - 1) this.midGroundMap[colIndex + 1] += p.size * 0.1;

                        const MAX_H = 15;
                        if (this.midGroundMap[colIndex] > MAX_H) this.midGroundMap[colIndex] = MAX_H;

                        this.particles.splice(i, 1);
                        continue;
                    }
                }
            }

            // Bottom Collision
            if (!caughtByTabs) {
                const groundH = this.bottomGroundMap[colIndex];
                const limitY = this.bottomY - groundH - (p.size / 2);

                if (p.y >= limitY) {
                    this.bottomGroundMap[colIndex] += p.size * 0.15;

                    if (colIndex > 0) this.bottomGroundMap[colIndex - 1] += p.size * 0.05;
                    if (colIndex < this.bottomGroundMap.length - 1) this.bottomGroundMap[colIndex + 1] += p.size * 0.05;

                    const MAX_H = 6;
                    if (this.bottomGroundMap[colIndex] > MAX_H) this.bottomGroundMap[colIndex] = MAX_H;

                    this.particles.splice(i, 1);
                }
            }
        }
    }

    drawGround(ctx, map, baseY) {
        if (baseY <= 0) return;

        ctx.beginPath();
        ctx.moveTo(0, baseY);
        for (let i = 0; i < map.length; i++) {
            const x = i * this.resolution;
            const y = baseY - map[i];
            ctx.lineTo(x, y);
        }
        ctx.lineTo(map.length * this.resolution, baseY);
        ctx.lineTo(0, baseY);
        ctx.fill();
    }

    draw() {
        if (!this.isRunning && this.canvas.style.opacity === '0') return;
        this.ctx.clearRect(0, 0, this.width, this.height);

        for (const p of this.particles) {
            this.drawSnowflake(this.ctx, p);
        }

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        this.ctx.shadowBlur = 6;
        this.ctx.shadowColor = 'rgba(255,255,255,0.4)';

        this.drawGround(this.ctx, this.midGroundMap, this.tabsY);

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.drawGround(this.ctx, this.bottomGroundMap, this.bottomY);
    }

    loop() {
        if (!this.isRunning) return; // 停止循环

        if (Math.random() < 0.1) this.updateLayoutInfo();
        this.update();
        this.draw();
        this.animationId = requestAnimationFrame(() => this.loop());
    }
}

/**
 * AtmosphereController
 * 管理全局氛围特效的开关与状态
 */
class AtmosphereController {
    constructor() {
        // 使用 Settings 模块加载用户偏好（默认关闭）
        this.enabled = (typeof Settings !== 'undefined') ? Settings.loadAtmosphere() : false;
        this.snowSystem = new SnowSystem();
        this.injectButton();

        if (this.enabled) {
            this.snowSystem.start();
        }
    }

    injectButton() {
        const btn = document.createElement('div');
        btn.id = 'atmosphere-toggle';

        // 样式：极简、悬浮、左下角
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            cursor: 'pointer',
            zIndex: '10000',
            transition: 'all 0.5s ease', // 更平滑的过渡
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff', // 初始颜色
        });

        // 抽象的 "Planet/Orbit" 图标 SVG
        btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"></circle>
                <path d="M3.6 9h16.8"></path>
                <path d="M3.6 15h16.8"></path>
                <path d="M11.5 3a17 17 0 0 0 0 18"></path>
                <path d="M12.5 3a17 17 0 0 1 0 18"></path>
            </svg>
        `;

        // 交互效果
        btn.onmouseenter = () => {
            btn.style.opacity = '1.0';
            btn.style.transform = 'scale(1.1) rotate(180deg)';
            btn.style.filter = 'drop-shadow(0 0 8px rgba(255,255,255,0.8))';
        };
        btn.onmouseleave = () => {
            btn.style.transform = 'scale(1) rotate(0deg)';
            this.updateBtnState(); // 恢复到当前状态对应的样式
        };
        btn.onclick = () => this.toggle();

        // 提示标题
        btn.title = "Toggle Atmosphere";

        document.body.appendChild(btn);
        this.btn = btn;
        this.updateBtnState(); // 初始化状态
    }

    toggle() {
        this.enabled = !this.enabled;
        // 使用 Settings 模块保存（按用户区分存储）
        if (typeof Settings !== 'undefined') {
            Settings.saveAtmosphere(this.enabled);
        }

        if (this.enabled) {
            this.snowSystem.start();
            console.log('[MOODY] Atmosphere: ON');
        } else {
            this.snowSystem.stop();
            console.log('[MOODY] Atmosphere: OFF');
        }

        this.updateBtnState();
    }

    updateBtnState() {
        if (!this.btn) return;

        if (this.enabled) {
            // ON: 高亮显示 (呼吸感)
            this.btn.style.opacity = '0.7';
            this.btn.style.filter = 'drop-shadow(0 0 3px rgba(255,255,255,0.5))';
            this.btn.style.color = '#fff';
        } else {
            // OFF: 极度隐蔽 (暗色)
            this.btn.style.opacity = '0.2';
            this.btn.style.filter = 'none';
            this.btn.style.color = 'rgba(255,255,255,0.6)';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 延迟初始化，确保 DOM 加载
    setTimeout(() => {
        window.atmosphere = new AtmosphereController();
        console.log('[MOODY] Atmosphere Controller initialized 🪐');
    }, 1000);
});
