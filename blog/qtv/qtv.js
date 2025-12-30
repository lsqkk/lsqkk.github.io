// 配置信息
const config = {
    uid: '2105459088',
    apiUrl: 'https://uapis.cn/api/v1/social/bilibili/archives',
    videoInfoApiUrl: 'https://uapis.cn/api/v1/social/bilibili/videoinfo',
    pageSize: 12
};

// 状态管理
const state = {
    currentPage: 1,
    totalPages: 1,
    totalVideos: 0,
    orderBy: 'pubdate',
    keywords: '',
    loading: false,
    videoDetails: {} // 存储视频详细信息
};

// DOM元素
const elements = {
    videoContainer: document.getElementById('video-container'),
    loadingElement: document.getElementById('loading'),
    totalVideosElement: document.getElementById('total-videos'),
    currentPageElement: document.getElementById('current-page'),
    prevPageButton: document.getElementById('prev-page'),
    nextPageButton: document.getElementById('next-page'),
    searchInput: document.getElementById('search-input'),
    searchButton: document.getElementById('search-btn'),
    sortButtons: document.querySelectorAll('.sort-btn')
};

// 初始化页面
document.addEventListener('DOMContentLoaded', () => {
    loadVideos();
    setupEventListeners();
});

// 设置事件监听器
function setupEventListeners() {
    // 分页按钮
    elements.prevPageButton.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            loadVideos();
        }
    });

    elements.nextPageButton.addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
            state.currentPage++;
            loadVideos();
        }
    });

    // 搜索功能
    elements.searchButton.addEventListener('click', () => {
        state.keywords = elements.searchInput.value;
        state.currentPage = 1;
        loadVideos();
    });

    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            state.keywords = elements.searchInput.value;
            state.currentPage = 1;
            loadVideos();
        }
    });

    // 排序选项
    elements.sortButtons.forEach(button => {
        button.addEventListener('click', () => {
            elements.sortButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            state.orderBy = button.dataset.orderby;
            state.currentPage = 1;
            loadVideos();
        });
    });
}

// 加载视频数据
async function loadVideos() {
    state.loading = true;
    showLoading();

    try {
        const params = new URLSearchParams({
            mid: config.uid,
            pn: state.currentPage.toString(),
            ps: config.pageSize.toString(),
            orderby: state.orderBy
        });

        if (state.keywords) {
            params.append('keywords', state.keywords);
        }

        const response = await fetch(`${config.apiUrl}?${params}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.videos && Array.isArray(data.videos)) {
            // 获取视频详细信息
            await loadVideoDetails(data.videos);
            renderVideos(data);
            updatePagination(data);
        } else {
            throw new Error('Invalid data format');
        }
    } catch (error) {
        console.error('Error loading videos:', error);
        showError('加载视频失败，请稍后重试');
    } finally {
        state.loading = false;
    }
}

// 加载视频详细信息
async function loadVideoDetails(videos) {
    // 清空之前的详细信息
    state.videoDetails = {};

    // 为每个视频获取详细信息
    const promises = videos.map(async (video) => {
        try {
            const response = await fetch(`${config.videoInfoApiUrl}?bvid=${video.bvid}`);
            if (response.ok) {
                const data = await response.json();
                state.videoDetails[video.bvid] = data;
            }
        } catch (error) {
            console.error(`Error loading video details for ${video.bvid}:`, error);
        }
    });

    // 等待所有详细信息加载完成
    await Promise.all(promises);
}

// 渲染视频列表
function renderVideos(data) {
    elements.videoContainer.innerHTML = '';

    if (data.videos.length === 0) {
        elements.videoContainer.innerHTML = `
                    <div class="error">
                        没有找到相关视频
                    </div>
                `;
        return;
    }

    const videoGrid = document.createElement('div');
    videoGrid.className = 'video-grid';

    data.videos.forEach(video => {
        const videoCard = createVideoCard(video);
        videoGrid.appendChild(videoCard);
    });

    elements.videoContainer.appendChild(videoGrid);
}

// 创建视频卡片
function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';

    // 格式化时长
    const duration = formatDuration(video.duration);

    // 格式化播放量
    const playCount = formatPlayCount(video.play_count);

    // 格式化发布时间
    const publishTime = formatTime(video.publish_time);

    // 使用图片代理服务解决防盗链问题
    const proxyCoverUrl = `https://images.weserv.nl/?url=${encodeURIComponent(video.cover)}&w=320&h=180`;

    // 获取视频详细信息
    const videoDetail = state.videoDetails[video.bvid];
    const likeCount = videoDetail ? formatCount(videoDetail.stat.like) : '--';
    const coinCount = videoDetail ? formatCount(videoDetail.stat.coin) : '--';
    const favoriteCount = videoDetail ? formatCount(videoDetail.stat.favorite) : '--';
    const shareCount = videoDetail ? formatCount(videoDetail.stat.share) : '--';
    const danmakuCount = videoDetail ? formatCount(videoDetail.stat.danmaku) : '--';
    const replyCount = videoDetail ? formatCount(videoDetail.stat.reply) : '--';

    card.innerHTML = `
                <div class="video-cover">
                    <img src="${proxyCoverUrl}" alt="${video.title}" 
                         onerror="this.src='https://via.placeholder.com/320x180/1e88e5/ffffff?text=封面加载中'">
                    <div class="video-duration">${duration}</div>
                </div>
                <div class="video-info">
                    <h3 class="video-title">${video.title}</h3>
                    <div class="video-stats">
                        <div class="stat">
                            <span class="stat-icon">👍</span>
                            <span>${likeCount}</span>
                        </div>
                        <div class="stat">
                            <span class="stat-icon">🪙</span>
                            <span>${coinCount}</span>
                        </div>
                        <div class="stat">
                            <span class="stat-icon">⭐</span>
                            <span>${favoriteCount}</span>
                        </div>
                        <div class="stat">
                            <span class="stat-icon">📤</span>
                            <span>${shareCount}</span>
                        </div>
                    </div>
                    <div class="video-meta">
                        <span>播放: ${playCount}</span>
                        <span>${publishTime}</span>
                    </div>
                </div>
            `;

    // 添加点击事件，跳转到B站视频页面
    card.addEventListener('click', () => {
        window.open(`https://www.bilibili.com/video/${video.bvid}`, '_blank');
    });

    return card;
}

// 更新分页信息
function updatePagination(data) {
    state.totalVideos = data.total;
    state.totalPages = Math.ceil(data.total / config.pageSize);

    elements.totalVideosElement.textContent = data.total;
    elements.currentPageElement.textContent = state.currentPage;

    elements.prevPageButton.disabled = state.currentPage <= 1;
    elements.nextPageButton.disabled = state.currentPage >= state.totalPages;
}

// 显示加载状态
function showLoading() {
    elements.videoContainer.innerHTML = '';
    elements.videoContainer.appendChild(elements.loadingElement);
    elements.loadingElement.style.display = 'block';
}

// 显示错误信息
function showError(message) {
    elements.videoContainer.innerHTML = `
                <div class="error">
                    ${message}
                </div>
            `;
}

// 格式化时长（秒 -> MM:SS）
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 格式化播放量
function formatPlayCount(count) {
    return formatCount(count);
}

// 通用格式化数字
function formatCount(count) {
    if (count >= 100000000) {
        return (count / 100000000).toFixed(1) + '亿';
    } else if (count >= 10000) {
        return (count / 10000).toFixed(1) + '万';
    }
    return count;
}

// 格式化时间戳
function formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diff === 0) {
        return '今天';
    } else if (diff === 1) {
        return '昨天';
    } else if (diff < 7) {
        return `${diff}天前`;
    } else if (diff < 30) {
        return `${Math.floor(diff / 7)}周前`;
    } else {
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    }
}