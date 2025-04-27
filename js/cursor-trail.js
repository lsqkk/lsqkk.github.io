document.addEventListener('DOMContentLoaded', function() {
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    // 创建自定义光标
    const cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    document.body.appendChild(cursor);

    // 粒子配置
    const config = {
      particleCount: 15,
      sizeVariation: 6,
      baseSize: 4,
      speed: 0.6,
      colors: [
        'rgba(255, 100, 100, 0.8)',
        'rgba(100, 255, 100, 0.8)',
        'rgba(100, 100, 255, 0.8)',
        'rgba(255, 255, 100, 0.8)'
      ]
    };

    // 鼠标移动监听
    document.addEventListener('mousemove', function(e) {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
      createParticle(e.clientX, e.clientY);
    });

    // 检测可点击元素
    document.addEventListener('mouseover', function(e) {
      const target = e.target;
      if (target.closest('a, button, input, textarea, select, [role="button"], [onclick], [tabindex]')) {
        cursor.classList.add('clickable');
      } else {
        cursor.classList.remove('clickable');
      }
    });

    // 创建粒子
    function createParticle(x, y) {
      const p = document.createElement('div');
      p.className = 'cursor-particle';
      
      const size = Math.random() * config.sizeVariation + config.baseSize;
      const color = config.colors[Math.floor(Math.random() * config.colors.length)];
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 30 + 30;
      
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.background = color;
      p.style.setProperty('--tx', Math.cos(angle) * distance + 'px');
      p.style.setProperty('--ty', Math.sin(angle) * distance + 'px');
      p.style.animationDuration = config.speed + 's';

      document.body.appendChild(p);
      
      p.addEventListener('animationend', function() {
        p.remove();
      });
    }

    // 确保光标在页面加载时就有位置
    document.addEventListener('mousemove', function init(e) {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
      document.removeEventListener('mousemove', init);
    });
  }
});
