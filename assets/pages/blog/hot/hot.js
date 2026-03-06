// API端点
const API_URL = 'https://uapis.cn/api/v1/misc/hotboard';

// 平台图标映射
const platformIcons = {
    'weibo': 'fab fa-weibo',
    'zhihu': 'fab fa-zhihu',
    'bilibili': 'fas fa-play-circle',
    'douyin': 'fas fa-music',
    'zhihu-daily': 'far fa-newspaper',
    'acfun': 'fas fa-tv',
    'kuaishou': 'fas fa-video',
    'douban-movie': 'fas fa-film',
    'douban-group': 'fas fa-users',
    'tieba': 'fab fa-baidu',
    'hupu': 'fas fa-basketball-ball',
    'miyoushe': 'fas fa-gamepad',
    'ngabbs': 'fas fa-dragon',
    'v2ex': 'fas fa-code',
    '52pojie': 'fas fa-lock-open',
    'hostloc': 'fas fa-server',
    'coolapk': 'fas fa-mobile-alt',
    'baidu': 'fas fa-search',
    'toutiao': 'fas fa-newspaper',
    'thepaper': 'fas fa-newspaper',
    'qq-news': 'fab fa-qq',
    'sina': 'fas fa-globe',
    'sina-news': 'far fa-newspaper',
    'netease-news': 'fas fa-portrait',
    'huxiu': 'fas fa-paw',
    'ifanr': 'fas fa-mobile-alt',
    'juejin': 'fas fa-gem',
    'sspai': 'fas fa-pen-fancy',
    'ithome': 'fas fa-home',
    'ithome-xijiayi': 'fas fa-gift',
    'csdn': 'fas fa-laptop-code',
    'jianshu': 'fas fa-book',
    'guokr': 'fas fa-flask',
    '36kr': 'fas fa-chart-line',
    '51cto': 'fas fa-network-wired',
    'nodeseek': 'fas fa-search',
    'hellogithub': 'fab fa-github',
    'lol': 'fas fa-gamepad',
    'genshin': 'fas fa-wind',
    'honkai': 'fas fa-meteor',
    'starrail': 'fas fa-star',
    'weread': 'fas fa-book-reader',
    'weatheralarm': 'fas fa-cloud-sun-rain',
    'earthquake': 'fas fa-mountain',
    'history': 'fas fa-history'
};

// 平台名称映射
const platformNames = {
    'weibo': '微博热搜',
    'zhihu': '知乎热榜',
    'bilibili': '哔哩哔哩热榜',
    'douyin': '抖音热榜',
    'zhihu-daily': '知乎日报热榜',
    'acfun': 'AcFun弹幕视频网',
    'kuaishou': '快手热榜',
    'douban-movie': '豆瓣电影榜单',
    'douban-group': '豆瓣小组话题',
    'tieba': '百度贴吧热帖',
    'hupu': '虎扑热帖',
    'miyoushe': '米游社话题榜',
    'ngabbs': 'NGA游戏论坛热帖',
    'v2ex': 'V2EX技术社区热帖',
    '52pojie': '吾爱破解热帖',
    'hostloc': '全球主机交流论坛',
    'coolapk': '酷安热榜',
    'baidu': '百度热搜',
    'toutiao': '今日头条热榜',
    'thepaper': '澎湃新闻热榜',
    'qq-news': '腾讯新闻热榜',
    'sina': '新浪热搜',
    'sina-news': '新浪新闻热榜',
    'netease-news': '网易新闻热榜',
    'huxiu': '虎嗅网热榜',
    'ifanr': '爱范儿热榜',
    'juejin': '掘金社区热榜',
    'sspai': '少数派热榜',
    'ithome': 'IT之家热榜',
    'ithome-xijiayi': 'IT之家·喜加一栏目',
    'csdn': 'CSDN博客热榜',
    'jianshu': '简书热榜',
    'guokr': '果壳热榜',
    '36kr': '36氪热榜',
    '51cto': '51CTO热榜',
    'nodeseek': 'NodeSeek 技术社区',
    'hellogithub': 'HelloGitHub 项目推荐',
    'lol': '英雄联盟热帖',
    'genshin': '原神热榜',
    'honkai': '崩坏3热榜',
    'starrail': '星穹铁道热榜',
    'weread': '微信读书热门书籍',
    'weatheralarm': '天气预警信息',
    'earthquake': '地震速报',
    'history': '历史上的今天'
};

// 当前选中的平台
let currentPlatform = 'weibo';

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    // 初始化加载微博热搜
    loadHotData('weibo');

    // 为分类导航项添加点击事件
    const categoryItems = document.querySelectorAll('.category-item');
    categoryItems.forEach(item => {
        item.addEventListener('click', function () {
            // 更新选中状态
            categoryItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');

            // 获取平台类型
            const platformType = this.getAttribute('data-type');

            // 更新平台标题和图标
            updatePlatformHeader(platformType);

            // 加载新数据
            loadHotData(platformType);
        });
    });
});

// 更新平台标题和图标
function updatePlatformHeader(platformType) {
    const platformTitle = document.querySelector('.platform-title');
    const platformIcon = document.querySelector('.platform-icon i');

    platformTitle.innerHTML = `
                <span class="platform-icon">
                    <i class="${platformIcons[platformType]}"></i>
                </span>
                ${platformNames[platformType]}
            `;
}

// 加载热搜数据
async function loadHotData(platform) {
    currentPlatform = platform;

    // 显示加载状态
    const contentArea = document.getElementById('hot-content');
    contentArea.innerHTML = `
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <div>正在加载热搜数据...</div>
                </div>
            `;

    try {
        // 调用API获取数据
        const response = await fetch(`${API_URL}?type=${platform}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // 更新更新时间
        const updateTimeElement = document.getElementById('update-time');
        updateTimeElement.textContent = data.update_time || new Date().toLocaleString();

        // 渲染热搜列表
        renderHotList(data.list);

    } catch (error) {
        console.error('获取热搜数据失败:', error);
        contentArea.innerHTML = `
                    <div class="error">
                        <div class="error-icon">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        加载失败: ${error.message}<br>
                        请稍后重试
                    </div>
                `;
    }
}

// 渲染热搜列表
function renderHotList(hotList) {
    const contentArea = document.getElementById('hot-content');

    if (!hotList || hotList.length === 0) {
        contentArea.innerHTML = `
                    <div class="error">
                        <div class="error-icon">
                            <i class="far fa-frown"></i>
                        </div>
                        暂无数据
                    </div>
                `;
        return;
    }

    let html = '';

    hotList.forEach((item, index) => {
        // 生成排名样式
        const rankClass = index < 3 ? `rank-${index + 1}` : '';

        // 随机生成趋势（实际应用中应从API获取）
        const trendTypes = ['up', 'down', 'new', ''];
        const trendType = trendTypes[Math.floor(Math.random() * trendTypes.length)];
        let trendHtml = '';

        if (trendType === 'up') {
            trendHtml = `<span class="hot-trend trend-up"><i class="fas fa-caret-up"></i> 上升</span>`;
        } else if (trendType === 'down') {
            trendHtml = `<span class="hot-trend trend-down"><i class="fas fa-caret-down"></i> 下降</span>`;
        } else if (trendType === 'new') {
            trendHtml = `<span class="hot-trend trend-new"><i class="fas fa-star"></i> 新上榜</span>`;
        }

        // 处理热度值显示
        let hotValue = '';
        if (item.hot) {
            hotValue = `<div class="hot-value"><i class="fas fa-fire"></i> ${formatHotValue(item.hot)}</div>`;
        }

        // 创建热搜项HTML
        html += `
                    <div class="hot-card ${rankClass}">
                        <div class="hot-header">
                            <div class="hot-rank ${rankClass}">${index + 1}</div>
                            <a href="${item.url || '#'}" target="_blank" class="hot-link">
                                <div class="hot-title">${item.title} ${trendHtml}</div>
                            </a>
                        </div>
                        <div class="hot-meta">
                            ${hotValue}
                            <div class="hot-link-icon">
                                <i class="fas fa-external-link-alt"></i>
                            </div>
                        </div>
                    </div>
                `;
    });

    contentArea.innerHTML = html;
}

// 格式化热度值
function formatHotValue(value) {
    if (typeof value === 'number') {
        if (value >= 100000000) {
            return (value / 100000000).toFixed(1) + '亿';
        } else if (value >= 10000) {
            return (value / 10000).toFixed(1) + '万';
        }
        return value.toString();
    }
    return value;
}