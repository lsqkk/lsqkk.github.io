document.addEventListener('DOMContentLoaded', function() {
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  // 创建自定义光标
  const cursor = document.createElement('div');
  cursor.className = 'custom-cursor';
  document.body.appendChild(cursor);

  // 粒子配置
  const config = {
    particleCount: 15,       // 同时显示的粒子数量
    sizeVariation: 6,       // 粒子大小变化范围
    baseSize: 4,            // 基础粒子大小
    speed: 0.6,             // 动画速度(秒)
    colors: [               // 粒子颜色数组
      'rgba(255, 100, 100, 0.8)',
      'rgba(100, 255, 100, 0.8)',
      'rgba(100, 100, 255, 0.8)',
      'rgba(255, 255, 100, 0.8)'
    ]
  };

  // 鼠标移动监听
  document.addEventListener('mousemove', function(e) {
    // 更新光标位置
    cursor.style.left = (e.clientX - 5) + 'px';
    cursor.style.top = (e.clientY - 5) + 'px';
    
    // 创建新粒子
    createParticle(e.clientX, e.clientY);
  });

  // 创建粒子
  function createParticle(x, y) {
    const p = document.createElement('div');
    p.className = 'cursor-particle';
    
    // 随机属性
    const size = Math.random() * config.sizeVariation + config.baseSize;
    const color = config.colors[Math.floor(Math.random() * config.colors.length)];
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 30 + 30;
    
    // 设置粒子样式
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.background = color;
    p.style.setProperty('--tx', Math.cos(angle) * distance + 'px');
    p.style.setProperty('--ty', Math.sin(angle) * distance + 'px');
    p.style.animationDuration = config.speed + 's';

    document.body.appendChild(p);
    
    // 动画结束后移除元素
    p.addEventListener('animationend', function() {
      p.remove();
    });
  }

  // 确保光标在页面加载时就有位置
  document.addEventListener('mousemove', function init(e) {
    cursor.style.left = (e.clientX - 5) + 'px';
    cursor.style.top = (e.clientY - 5) + 'px';
    document.removeEventListener('mousemove', init);
  });
 }
});
