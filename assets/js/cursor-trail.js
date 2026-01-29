document.addEventListener('DOMContentLoaded', function () {
  // 检测是否为非触摸设备
  const isTouchDevice = !matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (isTouchDevice) return;

  // 全局变量
  let cursor, follower;
  let mouseX = 0, mouseY = 0;
  let followerX = 0, followerY = 0;
  let isCursorVisible = false;
  let isInitialized = false;

  // 粒子配置
  const config = {
    particleCount: 8,
    sizeVariation: 4,
    baseSize: 3,
    speed: 1.2,
    colors: [
      'rgba(255, 255, 255, 0.9)',
      'rgba(100, 150, 255, 0.8)',
      'rgba(255, 200, 100, 0.8)',
      'rgba(150, 255, 150, 0.7)'
    ],
    spawnDistance: 15,
    maxDistance: 50
  };

  // 初始化光标系统
  function initCursor() {
    if (isInitialized) return;

    // 隐藏系统光标 - 使用更彻底的方法
    hideSystemCursor();

    // 创建主光标
    cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    cursor.style.display = 'none';
    document.body.appendChild(cursor);

    // 创建延迟跟随光标
    follower = document.createElement('div');
    follower.className = 'cursor-follower';
    follower.style.display = 'none';
    document.body.appendChild(follower);

    // 初始位置设为屏幕中央
    mouseX = window.innerWidth / 2;
    mouseY = window.innerHeight / 2;
    followerX = mouseX;
    followerY = mouseY;

    // 开始动画循环
    animate();

    // 监听鼠标进入窗口
    document.addEventListener('mouseenter', showCursor);
    // 监听鼠标离开窗口
    document.addEventListener('mouseleave', hideCursor);
    // 监听鼠标移动
    document.addEventListener('mousemove', handleMouseMove);
    // 监听可点击元素
    document.addEventListener('mouseover', handleMouseOver);

    isInitialized = true;

    // 初始显示光标（延迟一小段时间）
    setTimeout(() => {
      if (document.body.contains(cursor)) {
        showCursor();
      }
    }, 100);
  }

  // 隐藏系统光标
  function hideSystemCursor() {
    const style = document.createElement('style');
    style.id = 'cursor-hide-style';
    style.textContent = `
      * { cursor: none !important; }
      .popup-overlay * { cursor: auto !important; }
    `;
    document.head.appendChild(style);
  }

  // 显示自定义光标
  function showCursor() {
    if (!cursor || !follower) return;

    isCursorVisible = true;
    cursor.style.display = 'block';
    follower.style.display = 'block';

    // 立即更新位置到当前鼠标位置
    cursor.style.left = mouseX + 'px';
    cursor.style.top = mouseY + 'px';
  }

  // 隐藏自定义光标
  function hideCursor() {
    if (!cursor || !follower) return;

    isCursorVisible = false;
    cursor.style.display = 'none';
    follower.style.display = 'none';
  }

  // 处理鼠标移动
  function handleMouseMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;

    // 如果光标之前是隐藏的，现在显示它
    if (!isCursorVisible) {
      showCursor();
    }

    // 更新主光标位置
    if (cursor) {
      cursor.style.left = mouseX + 'px';
      cursor.style.top = mouseY + 'px';
    }

    // 创建粒子（减少频率）
    if (Math.random() > 0.5) {
      createParticle(mouseX, mouseY);
    }
  }

  // 处理鼠标悬停
  function handleMouseOver(e) {
    if (!cursor || isPopupOpen()) return;

    const target = e.target;
    const clickableSelectors = 'a, button, input, textarea, select, [role="button"], [onclick], [tabindex]';

    if (target.closest(clickableSelectors)) {
      cursor.classList.add('clickable');
    } else {
      cursor.classList.remove('clickable');
    }
  }

  // 动画循环
  function animate() {
    if (!follower) return;

    // 计算延迟跟随光标的位置
    const speedFactor = 0.15; // 调整跟随速度
    followerX += (mouseX - followerX) * speedFactor;
    followerY += (mouseY - followerY) * speedFactor;

    // 更新延迟跟随光标位置
    follower.style.left = followerX + 'px';
    follower.style.top = followerY + 'px';

    // 计算与主光标的距离
    const distance = Math.sqrt(
      Math.pow(mouseX - followerX, 2) +
      Math.pow(mouseY - followerY, 2)
    );

    // 根据距离调整透明度
    follower.style.opacity = Math.max(0.1, Math.min(0.3, distance / 100));

    // 如果距离很近，完全透明（融合效果）
    if (distance < 10) {
      follower.style.opacity = 0;
    }

    requestAnimationFrame(animate);
  }

  // 创建粒子
  function createParticle(x, y) {
    if (isPopupOpen() || !isCursorVisible) return;

    const p = document.createElement('div');
    p.className = 'cursor-particle';

    const size = Math.random() * config.sizeVariation + config.baseSize;
    const color = config.colors[Math.floor(Math.random() * config.colors.length)];
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * config.maxDistance + config.spawnDistance;

    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.background = color;
    p.style.setProperty('--tx', Math.cos(angle) * distance + 'px');
    p.style.setProperty('--ty', Math.sin(angle) * distance + 'px');
    p.style.animationDuration = config.speed + 's';

    document.body.appendChild(p);

    // 动画结束后移除粒子
    p.addEventListener('animationend', function () {
      if (p.parentNode) {
        p.parentNode.removeChild(p);
      }
    });

    // 安全移除：如果动画未正常结束，3秒后强制移除
    setTimeout(() => {
      if (p.parentNode) {
        p.parentNode.removeChild(p);
      }
    }, 3000);
  }

  // 检查弹窗状态
  function isPopupOpen() {
    const popup = document.getElementById('popup-overlay');
    return popup && (popup.style.display === 'flex' || popup.style.display === 'block' ||
      popup.classList.contains('active') || popup.classList.contains('open'));
  }

  // 监听弹窗状态变化
  function setupPopupObserver() {
    const popupOverlay = document.getElementById('popup-overlay');
    if (!popupOverlay) return;

    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type === 'attributes') {
          if (isPopupOpen()) {
            // 弹窗打开时隐藏自定义光标
            hideCursor();
            // 移除所有粒子
            document.querySelectorAll('.cursor-particle').forEach(particle => {
              if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
              }
            });
          } else {
            // 弹窗关闭时显示自定义光标
            showCursor();
          }
        }
      });
    });

    observer.observe(popupOverlay, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }

  // 页面可见性变化处理
  function handleVisibilityChange() {
    if (document.hidden) {
      hideCursor();
    } else {
      // 页面重新可见时，尝试恢复光标显示
      setTimeout(showCursor, 100);
    }
  }

  // 初始化
  initCursor();

  // 设置弹窗观察器
  setTimeout(setupPopupObserver, 500);

  // 监听页面可见性变化
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // 监听窗口大小变化
  window.addEventListener('resize', function () {
    // 确保光标位置不会超出窗口
    mouseX = Math.min(mouseX, window.innerWidth);
    mouseY = Math.min(mouseY, window.innerHeight);
  });

  // 全局导出函数（可选）
  window.customCursor = {
    show: showCursor,
    hide: hideCursor,
    isVisible: () => isCursorVisible
  };
});