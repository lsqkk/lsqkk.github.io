function checkFullscreen() {
    if (document.fullscreenElement) {
        // 如果处于全屏状态，添加fullscreen-hide类
        document.querySelectorAll('p, a').forEach(function (el) {
            el.classList.add('fullscreen-hide');
        });
    } else {
        // 如果不是全屏状态，移除fullscreen-hide类
        document.querySelectorAll('p, a').forEach(function (el) {
            el.classList.remove('fullscreen-hide');
        });
    }
}

// 监听全屏状态变化
document.addEventListener('fullscreenchange', checkFullscreen);

// 初始化检查



// 更新时间
function updateTime() {
    const now = new Date();
    document.getElementById('time').textContent = now.toLocaleTimeString();
}


// 获取地理位置
function getLocation() {
    fetch('https://ipapi.co/json/')
        .then(response => response.json())
        .then(data => {
            const lat = data.latitude;
            const lon = data.longitude;
            getWeather(lat, lon);
        })
        .catch(error => console.error('Error fetching location:', error));
}


// 初始化
function init() {
    updateTime();
    setInterval(updateTime, 1000); // 每秒更新时间
    getLocation();

}

init();