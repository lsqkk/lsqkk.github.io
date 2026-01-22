// API配置
const API_KEY = '271d3f7012a6dc06a07cea3d08888fb1';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const ICON_URL = 'https://openweathermap.org/img/wn/';

// DOM元素
const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const refreshBtn = document.getElementById('refreshBtn');
const statusElement = document.getElementById('status');
const errorContainer = document.getElementById('errorContainer');
const currentWeatherContainer = document.getElementById('currentWeatherContainer');
const savedLocationsContainer = document.getElementById('savedLocationsContainer');
const currentLocationTitle = document.getElementById('currentLocationTitle');
const savedLocationsTitle = document.getElementById('savedLocationsTitle');

// 弹窗元素
const forecastModal = document.getElementById('forecastModal');
const modalCityName = document.getElementById('modalCityName');
const currentWeatherModal = document.getElementById('currentWeatherModal');
const forecastDays = document.getElementById('forecastDays');
const closeModal = document.querySelector('.close-modal');

// 存储常用位置
let savedLocations = JSON.parse(localStorage.getItem('savedLocations')) || [];

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    // 尝试获取当前位置
    getCurrentLocation();

    // 加载保存的位置
    loadSavedLocations();

    // 事件监听器
    searchBtn.addEventListener('click', searchWeather);
    refreshBtn.addEventListener('click', refreshWeather);
    cityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchWeather();
    });

    // 弹窗关闭
    closeModal.addEventListener('click', () => {
        forecastModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === forecastModal) {
            forecastModal.style.display = 'none';
        }
    });
});

// 获取当前位置
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                getWeatherByCoords(position.coords.latitude, position.coords.longitude, true);
            },
            error => {
                showError(`无法获取位置信息: ${error.message}`);
                statusElement.style.display = 'none';
            },
            { timeout: 10000 }
        );
    } else {
        showError("浏览器不支持地理位置功能");
        statusElement.style.display = 'none';
    }
}

// 搜索天气
function searchWeather() {
    const city = cityInput.value.trim();
    if (!city) {
        showError("请输入城市名称");
        return;
    }

    statusElement.style.display = 'block';
    statusElement.innerHTML = '<div class="loader"></div><p>正在查询天气数据...</p>';
    errorContainer.style.display = 'none';

    fetch(`${BASE_URL}/weather?q=${city}&appid=${API_KEY}&units=metric&lang=zh_cn`)
        .then(response => {
            if (!response.ok) throw new Error('城市未找到或网络错误');
            return response.json();
        })
        .then(data => {
            statusElement.style.display = 'none';
            displayWeather(data, false);
            cityInput.value = '';
        })
        .catch(error => {
            showError(error.message);
            statusElement.style.display = 'none';
        });
}

// 通过坐标获取天气
function getWeatherByCoords(lat, lon, isCurrentLocation = false) {
    fetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=zh_cn`)
        .then(response => {
            if (!response.ok) throw new Error('获取天气数据失败');
            return response.json();
        })
        .then(data => {
            statusElement.style.display = 'none';
            displayWeather(data, isCurrentLocation);
        })
        .catch(error => {
            showError(error.message);
            statusElement.style.display = 'none';
        });
}

// 显示天气信息
function displayWeather(data, isCurrentLocation) {
    const { name, sys, main, weather, wind, coord } = data;
    const country = sys.country || '';
    const temp = Math.round(main.temp);
    const feelsLike = Math.round(main.feels_like);
    const humidity = main.humidity;
    const windSpeed = wind.speed;
    const description = weather[0].description;
    const icon = weather[0].icon;

    const cardId = `weather-card-${name.replace(/\s+/g, '-')}-${country}`;

    // 检查是否已存在相同的卡片
    const existingCard = document.getElementById(cardId);
    if (existingCard) {
        existingCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }

    const weatherCard = document.createElement('div');
    weatherCard.className = `weather-card ${isCurrentLocation ? 'current-location' : 'saved-location'}`;
    weatherCard.id = cardId;

    weatherCard.innerHTML = `
                <h2>${name}, ${country} 
                    ${!isCurrentLocation ? `<button class="btn btn-sm btn-danger remove-btn" data-city="${name}" data-country="${country}">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                </h2>
                <img class="weather-icon" src="${ICON_URL}${icon}@2x.png" alt="${description}">
                <div class="temp-main">${temp}°C</div>
                <div class="weather-desc">${description}</div>
                <div class="weather-details">
                    <div class="weather-detail"><i class="fas fa-temperature-low"></i> 体感: ${feelsLike}°C</div>
                    <div class="weather-detail"><i class="fas fa-tint"></i> 湿度: ${humidity}%</div>
                    <div class="weather-detail"><i class="fas fa-wind"></i> 风速: ${windSpeed} m/s</div>
                    <div class="weather-detail"><i class="fas fa-compress-alt"></i> 气压: ${main.pressure} hPa</div>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-sm forecast-btn" data-lat="${coord.lat}" data-lon="${coord.lon}" data-city="${name}, ${country}">
                        <i class="fas fa-calendar-alt"></i> 天气预报
                    </button>
                    ${!isLocationSaved(name, country) && !isCurrentLocation ?
            `<button class="btn btn-sm save-btn" data-city="${name}" data-country="${country}" data-lat="${coord.lat}" data-lon="${coord.lon}">
                            <i class="fas fa-heart"></i> 收藏
                        </button>` : ''}
                </div>
            `;

    if (isCurrentLocation) {
        currentWeatherContainer.innerHTML = '';
        currentWeatherContainer.appendChild(weatherCard);
        currentLocationTitle.style.display = 'block';
    } else {
        // 添加到搜索结果的临时显示
        currentWeatherContainer.appendChild(weatherCard);
        currentLocationTitle.style.display = 'block';
    }

    // 添加事件监听器
    weatherCard.querySelector('.forecast-btn')?.addEventListener('click', showForecast);
    weatherCard.querySelector('.save-btn')?.addEventListener('click', saveLocation);
    weatherCard.querySelector('.remove-btn')?.addEventListener('click', removeLocation);
}

// 显示天气预报
function showForecast(e) {
    const lat = e.target.closest('.forecast-btn').dataset.lat;
    const lon = e.target.closest('.forecast-btn').dataset.lon;
    const cityName = e.target.closest('.forecast-btn').dataset.city;

    modalCityName.textContent = cityName;
    forecastModal.style.display = 'block';
    forecastDays.innerHTML = '<div class="loader"></div>';

    // 获取当前天气
    fetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=zh_cn`)
        .then(response => response.json())
        .then(data => {
            const { main, weather, wind } = data;
            const icon = weather[0].icon;

            currentWeatherModal.innerHTML = `
                        <div style="display: flex; align-items: center; justify-content: space-around; flex-wrap: wrap;">
                            <img src="${ICON_URL}${icon}@4x.png" alt="${weather[0].description}" style="width: 120px; height: 120px;">
                            <div>
                                <div style="font-size: 2rem; font-weight: bold;">${Math.round(main.temp)}°C</div>
                                <div style="text-transform: capitalize;">${weather[0].description}</div>
                                <div style="margin-top: 10px;">
                                    <div>湿度: ${main.humidity}%</div>
                                    <div>风速: ${wind.speed} m/s</div>
                                    <div>体感: ${Math.round(main.feels_like)}°C</div>
                                </div>
                            </div>
                        </div>
                    `;
        });

    // 获取5天预报
    fetch(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=zh_cn`)
        .then(response => response.json())
        .then(data => {
            forecastDays.innerHTML = '';

            // 按天分组预报数据
            const dailyForecasts = {};
            data.list.forEach(item => {
                const date = new Date(item.dt * 1000);
                const dateStr = date.toLocaleDateString('zh-CN', { weekday: 'long', month: 'short', day: 'numeric' });

                if (!dailyForecasts[dateStr]) {
                    dailyForecasts[dateStr] = {
                        temps: [],
                        icons: [],
                        descriptions: []
                    };
                }

                dailyForecasts[dateStr].temps.push(item.main.temp);
                dailyForecasts[dateStr].icons.push(item.weather[0].icon);
                dailyForecasts[dateStr].descriptions.push(item.weather[0].description);
            });

            // 显示每天的预报
            Object.entries(dailyForecasts).slice(0, 5).forEach(([date, forecast]) => {
                const avgTemp = forecast.temps.reduce((a, b) => a + b, 0) / forecast.temps.length;
                const maxTemp = Math.max(...forecast.temps);
                const minTemp = Math.min(...forecast.temps);
                const mostCommonIcon = getMostCommon(forecast.icons);
                const mostCommonDesc = getMostCommon(forecast.descriptions);

                const forecastDay = document.createElement('div');
                forecastDay.className = 'forecast-day';
                forecastDay.innerHTML = `
                            <h4>${date}</h4>
                            <img class="forecast-icon" src="${ICON_URL}${mostCommonIcon}@2x.png" alt="${mostCommonDesc}">
                            <div>${mostCommonDesc}</div>
                            <div class="forecast-temp">
                                <span class="temp-high">${Math.round(maxTemp)}°</span>
                                <span class="temp-low">${Math.round(minTemp)}°</span>
                            </div>
                            <div>平均: ${Math.round(avgTemp)}°C</div>
                        `;
                forecastDays.appendChild(forecastDay);
            });
        })
        .catch(error => {
            forecastDays.innerHTML = `<div class="error-message">无法加载预报数据: ${error.message}</div>`;
        });
}

// 获取数组中出现最频繁的元素
function getMostCommon(arr) {
    const frequency = {};
    let maxCount = 0;
    let mostCommon = arr[0];

    arr.forEach(item => {
        frequency[item] = (frequency[item] || 0) + 1;
        if (frequency[item] > maxCount) {
            maxCount = frequency[item];
            mostCommon = item;
        }
    });

    return mostCommon;
}

// 保存位置到收藏
function saveLocation(e) {
    const btn = e.target.closest('.save-btn');
    const city = btn.dataset.city;
    const country = btn.dataset.country;
    const lat = btn.dataset.lat;
    const lon = btn.dataset.lon;

    if (!isLocationSaved(city, country)) {
        savedLocations.push({ city, country, lat, lon });
        localStorage.setItem('savedLocations', JSON.stringify(savedLocations));
        loadSavedLocations();

        // 更新按钮状态
        btn.innerHTML = '<i class="fas fa-check"></i> 已收藏';
        btn.classList.add('btn-secondary');
        btn.classList.remove('btn');
        btn.disabled = true;
    }
}

// 从收藏中移除位置
function removeLocation(e) {
    const btn = e.target.closest('.remove-btn');
    const city = btn.dataset.city;
    const country = btn.dataset.country;

    savedLocations = savedLocations.filter(loc => !(loc.city === city && loc.country === country));
    localStorage.setItem('savedLocations', JSON.stringify(savedLocations));
    loadSavedLocations();

    // 移除卡片
    const card = btn.closest('.weather-card');
    card.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => card.remove(), 300);
}

// 检查位置是否已保存
function isLocationSaved(city, country) {
    return savedLocations.some(loc => loc.city === city && loc.country === country);
}

// 加载保存的位置
function loadSavedLocations() {
    savedLocationsContainer.innerHTML = '';

    if (savedLocations.length > 0) {
        savedLocationsTitle.style.display = 'block';
        statusElement.style.display = 'none';

        savedLocations.forEach(location => {
            getWeatherByCoords(location.lat, location.lon, false);
        });
    } else {
        savedLocationsTitle.style.display = 'none';
    }
}

// 刷新天气数据
function refreshWeather() {
    statusElement.style.display = 'block';
    statusElement.innerHTML = '<div class="loader"></div><p>正在刷新天气数据...</p>';
    errorContainer.style.display = 'none';

    // 重新获取当前位置
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                getWeatherByCoords(position.coords.latitude, position.coords.longitude, true);
            },
            error => {
                showError(`无法获取位置信息: ${error.message}`);
                statusElement.style.display = 'none';
            }
        );
    }

    // 刷新保存的位置
    loadSavedLocations();
}

// 显示错误信息
function showError(message) {
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
}