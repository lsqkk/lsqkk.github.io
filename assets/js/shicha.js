class TrueParallax {
    constructor() {
        this.parallaxBg = document.getElementById('parallaxBg');
        this.parallaxSpeed = 0.5; // 0.5x速度
        this.bgImage = null;
        this.isImageLoaded = false;
        this.lastScrollY = 0;
        this.rafId = null;

        this.init();
    }

    init() {
        // 1. 创建并加载图片
        this.loadImage();

        // 2. 设置初始样式和事件监听
        this.setupEvents();

        // 3. 初始更新
        this.update();

        // 4. 确保图片加载后重新计算
        window.addEventListener('load', () => {
            setTimeout(() => {
                this.updateImageSize();
                this.update();
            }, 100);
        });
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
        };

        this.bgImage.onload = () => {
            console.log('背景图片加载成功');
            this.setupImage();
            this.isImageLoaded = true;
        };

        this.bgImage.src = imagePath;
    }

    setupImage() {
        // 清空容器
        this.parallaxBg.innerHTML = '';

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
                `;

        // 添加到容器
        this.parallaxBg.appendChild(imgClone);
        this.parallaxImage = imgClone;

        // 更新图片尺寸
        this.updateImageSize();
    }

    updateImageSize() {
        if (!this.parallaxImage) return;

        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const imgNaturalWidth = this.bgImage.naturalWidth;
        const imgNaturalHeight = this.bgImage.naturalHeight;

        // 计算需要的图片尺寸
        // 确保图片足够大，能够覆盖整个滚动区域
        const documentHeight = document.body.scrollHeight;
        const maxScroll = documentHeight - windowHeight;

        // 背景需要移动的距离
        const bgTravelDistance = maxScroll * this.parallaxSpeed;

        // 图片需要的最小高度 = 视口高度 + 背景移动距离
        const minImageHeight = windowHeight + bgTravelDistance;

        // 计算缩放比例
        const imgAspectRatio = imgNaturalWidth / imgNaturalHeight;

        let newWidth, newHeight;

        if (imgNaturalHeight >= minImageHeight) {
            // 如果原始图片高度已经足够，保持原始比例
            newHeight = imgNaturalHeight;
            newWidth = newHeight * imgAspectRatio;
        } else {
            // 否则，按最小高度缩放
            newHeight = minImageHeight;
            newWidth = newHeight * imgAspectRatio;
        }

        // 确保宽度至少覆盖视口
        if (newWidth < windowWidth) {
            newWidth = windowWidth;
            newHeight = newWidth / imgAspectRatio;
        }

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

        // 计算背景应该移动的距离
        // 使用0.5倍速度，所以移动距离是滚动距离的一半
        const bgMoveY = -(scrollY * this.parallaxSpeed);

        // 应用变换
        this.parallaxImage.style.transform = `translate(-50%, ${bgMoveY}px)`;

        // 更新滚动指示器
        this.updateScrollIndicator(scrollY);

        this.lastScrollY = scrollY;
    }

    updateScrollIndicator(scrollY) {
        const indicator = document.querySelector('.scroll-indicator');
        if (indicator) {
            const maxScroll = document.body.scrollHeight - window.innerHeight;
            const scrollPercent = (scrollY / maxScroll) * 100;

            if (scrollPercent > 95) {
                indicator.textContent = "已滚动到底部";
                indicator.style.opacity = "0.5";
            } else if (scrollPercent > 80) {
                indicator.textContent = "接近底部";
            }

            // 滚动到一定程度后隐藏指示器
            if (scrollY > 100) {
                indicator.style.opacity = Math.max(0.3, 1 - scrollY / 500);
            }
        }
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new TrueParallax();
});