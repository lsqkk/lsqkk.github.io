class TrueParallax {
    constructor() {
        this.parallaxBg = document.getElementById('parallaxBg');
        this.parallaxSpeed = 0.5; // 0.5x速度
        this.bgImage = null;
        this.parallaxImage = null;
        this.isImageLoaded = false;
        this.lastScrollY = 0;
        this.rafId = null;
        this.isDarkMode = false;
        this.darkModeOverlay = null;

        this.init();
    }

    init() {
        // 1. 创建并加载图片
        this.loadImage();

        // 2. 创建黑暗模式覆盖层
        this.createDarkModeOverlay();

        // 3. 设置初始样式和事件监听
        this.setupEvents();

        // 4. 检测黑暗模式
        this.checkDarkMode();

        // 5. 初始更新
        this.update();

        // 6. 确保图片加载后重新计算
        window.addEventListener('load', () => {
            setTimeout(() => {
                this.updateImageSize();
                this.update();
            }, 100);
        });
    }

    createDarkModeOverlay() {
        // 创建深蓝色覆盖层
        this.darkModeOverlay = document.createElement('div');
        this.darkModeOverlay.className = 'parallax-overlay';
        this.parallaxBg.appendChild(this.darkModeOverlay);
    }

    checkDarkMode() {
        // 检查系统颜色主题偏好
        const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        // 设置初始状态
        this.isDarkMode = darkModeMediaQuery.matches;
        this.applyDarkModeStyles();

        // 监听主题变化
        darkModeMediaQuery.addEventListener('change', (e) => {
            this.isDarkMode = e.matches;
            this.applyDarkModeStyles();
            console.log(`系统主题已切换为: ${this.isDarkMode ? '黑暗模式' : '正常模式'}`);
        });
    }

    applyDarkModeStyles() {
        if (this.isDarkMode) {
            // 应用黑暗模式样式
            this.darkModeOverlay.classList.add('dark-mode');
            if (this.parallaxImage) {
                this.parallaxImage.style.filter = 'blur(10px)';
            }
        } else {
            // 恢复正常模式样式
            this.darkModeOverlay.classList.remove('dark-mode');
            if (this.parallaxImage) {
                this.parallaxImage.style.filter = 'none';
            }
        }
    }

    loadImage() {
        // 创建图片元素
        this.bgImage = new Image();

        // 设置图片源 - 替换为你的图片路径
        const imagePath = '/assets/img/bg.png'; // 你的图片路径

        // 如果图片加载失败，使用一个默认图片或颜色
        this.bgImage.onerror = () => {
            console.warn('背景图片加载失败，使用备用背景');
            this.parallaxBg.innerHTML = '';
            this.parallaxBg.style.backgroundColor = '#2c3e50';
            this.isImageLoaded = true;

            // 移除覆盖层（如果有的话）
            if (this.darkModeOverlay && this.darkModeOverlay.parentNode) {
                this.darkModeOverlay.remove();
            }
        };

        this.bgImage.onload = () => {
            console.log('背景图片加载成功');
            this.setupImage();
            this.isImageLoaded = true;
            // 确保黑暗模式样式应用
            this.applyDarkModeStyles();
        };

        this.bgImage.src = imagePath;
    }

    setupImage() {
        // 清空容器（保留覆盖层）
        const overlay = this.darkModeOverlay;
        this.parallaxBg.innerHTML = '';

        // 重新添加覆盖层
        if (overlay) {
            this.parallaxBg.appendChild(overlay);
            this.darkModeOverlay = overlay;
        }

        // 克隆图片（避免原始图片被修改）
        const imgClone = this.bgImage.cloneNode();

        // 设置图片样式
        imgClone.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: auto;
            min-height: 100%;
            object-fit: cover;
            transform: translateY(0);
            will-change: transform;
            transition: filter 0.3s ease;
        `;

        // 添加到容器
        this.parallaxBg.appendChild(imgClone);
        this.parallaxImage = imgClone;

        // 更新图片尺寸
        this.updateImageSize();

        // 应用当前的黑暗模式状态
        this.applyDarkModeStyles();
    }

    updateImageSize() {
        if (!this.parallaxImage) return;

        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const imgNaturalWidth = this.bgImage.naturalWidth;
        const imgNaturalHeight = this.bgImage.naturalHeight;

        // 计算文档总高度（包含所有内容）
        const documentHeight = Math.max(
            document.body.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.clientHeight,
            document.documentElement.scrollHeight,
            document.documentElement.offsetHeight
        );

        // 最大滚动距离 = 文档总高度 - 窗口高度
        const maxScrollDistance = Math.max(0, documentHeight - windowHeight);

        // 背景需要移动的总距离 = 最大滚动距离 × 速度
        const bgTravelDistance = maxScrollDistance * this.parallaxSpeed;

        // 图片需要的最小高度 = 窗口高度 + 背景移动距离
        const minImageHeight = windowHeight + bgTravelDistance;

        // 计算图片宽高比
        const imgAspectRatio = imgNaturalWidth / imgNaturalHeight;

        let newWidth, newHeight;

        // 方法1：保持图片原始比例，确保高度足够
        if (imgNaturalHeight >= minImageHeight) {
            // 如果原始图片高度已经足够，保持原始比例
            newHeight = imgNaturalHeight;
            newWidth = newHeight * imgAspectRatio;
        } else {
            // 如果原始图片高度不够，按最小高度缩放
            newHeight = minImageHeight;
            newWidth = newHeight * imgAspectRatio;
        }

        // 确保宽度至少覆盖视口
        if (newWidth < windowWidth) {
            newWidth = windowWidth;
            newHeight = newWidth / imgAspectRatio;
        }

        // 计算最大背景移动距离（图片高度 - 窗口高度）
        this.maxBgMoveDistance = Math.max(0, newHeight - windowHeight);

        // 计算内容滚动到底时，背景应该移动的距离
        this.bgMoveAtBottom = Math.min(
            maxScrollDistance * this.parallaxSpeed,
            this.maxBgMoveDistance
        );
        // 应用尺寸
        this.parallaxImage.style.width = `${newWidth}px`;
        this.parallaxImage.style.height = `${newHeight}px`;
        this.parallaxImage.style.minHeight = 'auto';

        // 居中图片
        this.parallaxImage.style.left = '50%';
        this.parallaxImage.style.transform = 'translateX(-50%)';

        // 保存尺寸信息
        this.imageWidth = newWidth;
        this.imageHeight = newHeight;
        this.windowHeight = windowHeight;
    }

    setupEvents() {
        // 使用requestAnimationFrame优化滚动性能
        const handleScroll = () => {
            if (!this.rafId) {
                this.rafId = requestAnimationFrame(() => {
                    this.update();
                    this.rafId = null;
                });
            }
        };

        // 监听滚动事件
        window.addEventListener('scroll', handleScroll, { passive: true });

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.updateImageSize();
            this.update();
        }, { passive: true });
    }

    update() {
        if (!this.parallaxImage || !this.isImageLoaded) return;

        // 获取当前滚动位置
        const scrollY = window.scrollY || window.pageYOffset;

        // 计算文档总高度
        const documentHeight = Math.max(
            document.body.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.clientHeight,
            document.documentElement.scrollHeight,
            document.documentElement.offsetHeight
        );

        // 最大滚动距离
        const maxScrollDistance = Math.max(0, documentHeight - window.innerHeight);

        // 计算滚动比例 (0 到 1)
        const scrollProgress = maxScrollDistance > 0 ? Math.min(scrollY / maxScrollDistance, 1) : 0;

        // 计算背景应该移动的距离
        // 关键修改：当滚动到底时，背景移动距离 = this.bgMoveAtBottom
        let bgMoveY;
        if (scrollY >= maxScrollDistance) {
            // 已经滚动到底部
            bgMoveY = -this.bgMoveAtBottom;
        } else {
            // 正常滚动中
            bgMoveY = -(scrollY * this.parallaxSpeed);
        }

        // 确保背景移动不会超过图片允许的范围
        if (this.maxBgMoveDistance !== undefined) {
            bgMoveY = Math.max(-this.maxBgMoveDistance, bgMoveY);
        }
        // 应用变换
        this.parallaxImage.style.transform = `translate(-50%, ${bgMoveY}px)`;

        // 更新滚动指示器
        this.updateScrollIndicator(scrollY, maxScrollDistance);

        this.lastScrollY = scrollY;
    }

    updateScrollIndicator(scrollY, maxScrollDistance) {
        const indicator = document.querySelector('.scroll-indicator');
        if (!indicator) return;

        const scrollPercent = maxScrollDistance > 0 ? (scrollY / maxScrollDistance) * 100 : 0;

        if (scrollPercent >= 99) {
            indicator.textContent = "已滚动到底部";
            indicator.style.opacity = "0.5";
        } else if (scrollPercent > 80) {
            indicator.textContent = "接近底部";
        } else {
            indicator.textContent = "向下滚动体验视差效果";
        }

        // 滚动到一定程度后隐藏指示器
        if (scrollY > 100) {
            indicator.style.opacity = Math.max(0.3, 1 - scrollY / 500);
        }
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    const parallax = new TrueParallax();
});