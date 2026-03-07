const API_KEY = window.OPENWEATHER_API_KEY || '';
let currentLat, currentLon;

// 页面加载完成后自动获取位置
window.onload = function () {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                currentLat = position.coords.latitude;
                currentLon = position.coords.longitude;
                getWeatherForecast(currentLat, currentLon);
            },
            error => {
                console.error('无法获取位置信息：', error);
                // 使用默认位置
                getWeatherForecast(39.9042, 116.4074); // 北京
            }
        );
    } else {
        console.error("浏览器不支持地理位置功能");
        // 使用默认位置
        getWeatherForecast(39.9042, 116.4074); // 北京
    }
};

async function getWeatherForecast(lat, lon) {
    try {
        if (!API_KEY) {
            console.error('缺少 OPENWEATHER_API_KEY，请检查 /api/openweather-key 配置');
            return;
        }
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=zh_cn`
        );

        if (!response.ok) {
            throw new Error('获取天气预报数据失败');
        }

        const data = await response.json();
        updateForecastCharts(data);
        updateThreeDayForecast(data);
    } catch (error) {
        console.error(error.message);
    }
}

function updateForecastCharts(data) {
    // 生成未来7天日期
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        dates.push(`${date.getMonth() + 1}-${date.getDate()}`);
    }

    // 更新火险预报图表
    const forecastCtx = document.getElementById('forecastChart').getContext('2d');
    const forecastChart = new Chart(forecastCtx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: '火险指数',
                data: [0, 0, 0, 0, 0, 0, 0], // 火险指数设为0
                borderColor: '#ff6b35',
                backgroundColor: 'rgba(255, 107, 53, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: '火险指数',
                        color: '#b0b0b0'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b0b0b0'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b0b0b0'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e0e0e0'
                    }
                }
            }
        }
    });
}

function updateThreeDayForecast(data) {
    const threeDayContainer = document.getElementById('threeDayForecast');
    threeDayContainer.innerHTML = '';

    // 获取未来三天的数据（每天取中午时段的预报）
    const dailyData = {};
    data.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        const dateStr = `${date.getMonth() + 1}-${date.getDate()}`;

        // 选择每天12:00左右的数据
        if (date.getHours() >= 11 && date.getHours() <= 13) {
            if (!dailyData[dateStr]) {
                dailyData[dateStr] = item;
            }
        }
    });

    // 获取未来三天的日期
    const today = new Date();
    const dayNames = ['明天', '后天', '大后天'];

    for (let i = 0; i < 3; i++) {
        const forecastDate = new Date(today);
        forecastDate.setDate(today.getDate() + i + 1);
        const dateStr = `${forecastDate.getMonth() + 1}-${forecastDate.getDate()}`;

        const dayData = dailyData[dateStr] || data.list[i * 8]; // 如果没有中午数据，取近似数据

        if (dayData) {
            const weatherIcon = getWeatherIcon(dayData.weather[0].main);
            const temp = Math.round(dayData.main.temp);
            const humidity = dayData.main.humidity;
            const windSpeed = dayData.wind.speed;

            const dayCard = document.createElement('div');
            dayCard.className = 'day-card';
            dayCard.innerHTML = `
                        <div class="day-name">${dayNames[i]}</div>
                        <div class="weather-icon">${weatherIcon}</div>
                        <div class="day-risk" style="color: var(--accent-green);">0</div>
                        <div class="risk-indicator">
                            <div class="risk-dot risk-low"></div>
                            <span>低风险</span>
                        </div>
                        <div style="font-size: 14px; color: var(--text-gray); margin-top: 10px;">
                            <div>温度: ${temp}°C</div>
                            <div>湿度: ${humidity}%</div>
                            <div>风速: ${windSpeed} m/s</div>
                        </div>
                    `;
            threeDayContainer.appendChild(dayCard);
        }
    }
}

function getWeatherIcon(weatherMain) {
    const iconMap = {
        'Clear': '☀️',
        'Clouds': '☁️',
        'Rain': '🌧️',
        'Drizzle': '🌦️',
        'Thunderstorm': '⛈️',
        'Snow': '❄️',
        'Mist': '🌫️',
        'Smoke': '🌫️',
        'Haze': '🌫️',
        'Dust': '🌫️',
        'Fog': '🌫️',
        'Sand': '🌫️',
        'Ash': '🌫️',
        'Squall': '💨',
        'Tornado': '🌪️'
    };
    return iconMap[weatherMain] || '☀️';
}

// 区域选择事件
document.getElementById('regionSelect').addEventListener('change', function () {
    // 在实际应用中，这里会重新获取数据并更新图表
    alert('区域已更改为: ' + this.options[this.selectedIndex].text);
});
