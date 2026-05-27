// 配置信息
const config = {
    uid: '2105459088',
    pageSize: 12
};

const BILI_PROXY = '__API_BASE__/api/stream-proxy?mode=bili&url=';

// 状态管理
const state = {
    currentPage: 1,
    totalPages: 1,
    totalVideos: 0,
    orderBy: 'pubdate',
    keywords: '',
    loading: false,
    videoDetails: {}
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

// ── 骨架屏 ──

function generateSkeletonCards(count) {
    let html = '<div class="skeleton-grid">';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="skeleton-card">
                <div class="skeleton-cover"></div>
                <div class="skeleton-body">
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line"></div>
                </div>
            </div>
        `;
    }
    html += '</div>';
    return html;
}

function showSkeleton() {
    elements.videoContainer.innerHTML = generateSkeletonCards(config.pageSize);
}

// ── 初始化 ──

document.addEventListener('DOMContentLoaded', () => {
    loadVideos();
    setupEventListeners();
});

// ── 事件监听 ──

function setupEventListeners() {
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

// ── 数据加载 ──

async function loadVideos() {
    state.loading = true;
    showSkeleton();

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

        const targetUrl = `https://uapis.cn/api/v1/social/bilibili/archives?${params}`;
        const response = await fetch(BILI_PROXY + encodeURIComponent(targetUrl));

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.videos && Array.isArray(data.videos)) {
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

// ── 视频详情 ──

async function loadVideoDetails(videos) {
    state.videoDetails = {};

    const promises = videos.map(async (video) => {
        try {
            const targetUrl = `https://uapis.cn/api/v1/social/bilibili/videoinfo?bvid=${video.bvid}`;
            const response = await fetch(BILI_PROXY + encodeURIComponent(targetUrl));
            if (response.ok) {
                const data = await response.json();
                state.videoDetails[video.bvid] = data;
            }
        } catch (error) {
            console.error(`Error loading video details for ${video.bvid}:`, error);
        }
    });

    await Promise.all(promises);
}

// ── 渲染 ──

function renderVideos(data) {
    elements.videoContainer.innerHTML = '';

    if (data.videos.length === 0) {
        elements.videoContainer.innerHTML = `
            <div class="error">没有找到相关视频</div>
        `;
        return;
    }

    // 小型 requestAnimationFrame 延迟，确保骨架屏被清理后浏览器已完成布局
    requestAnimationFrame(() => {
        const videoGrid = document.createElement('div');
        videoGrid.className = 'video-grid';

        data.videos.forEach((video, index) => {
            const videoCard = createVideoCard(video, index);
            videoGrid.appendChild(videoCard);
        });

        elements.videoContainer.appendChild(videoGrid);
    });
}

// ── 创建视频卡片 ──

function createVideoCard(video, index) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.style.animationDelay = `${Math.min(index * 0.04, 0.6)}s`;

    const duration = formatDuration(video.duration);
    const playCount = formatPlayCount(video.play_count);
    const publishTime = formatTime(video.publish_time);

    const proxyCoverUrl = `https://images.weserv.nl/?url=${encodeURIComponent(video.cover)}&w=320&h=180`;

    const videoDetail = state.videoDetails[video.bvid];
    const likeCount = videoDetail ? formatCount(videoDetail.stat.like) : '--';
    const coinCount = videoDetail ? formatCount(videoDetail.stat.coin) : '--';
    const favoriteCount = videoDetail ? formatCount(videoDetail.stat.favorite) : '--';
    const shareCount = videoDetail ? formatCount(videoDetail.stat.share) : '--';

    card.innerHTML = `
        <div class="video-cover">
            <img src="${proxyCoverUrl}" alt="${video.title}"
                 loading="lazy"
                 onerror="this.src='https://via.placeholder.com/320x180/1e88e5/ffffff?text=封面加载中'">
            <div class="video-duration">${duration}</div>
        </div>
        <div class="video-info">
            <h3 class="video-title">${video.title}</h3>
            <div class="video-stats">
                <div class="stat">
                    <span class="stat-icon"><i class="fas fa-thumbs-up"></i></span>
                    <span>${likeCount}</span>
                </div>
                <div class="stat">
                    <span class="stat-icon"><i class="fas fa-coins"></i></span>
                    <span>${coinCount}</span>
                </div>
                <div class="stat">
                    <span class="stat-icon"><i class="fas fa-star"></i></span>
                    <span>${favoriteCount}</span>
                </div>
                <div class="stat">
                    <span class="stat-icon"><i class="fas fa-share-alt"></i></span>
                    <span>${shareCount}</span>
                </div>
            </div>
            <div class="video-meta">
                <span><i class="fas fa-play" style="margin-right:3px;font-size:0.75rem;"></i>${playCount}</span>
                <span><i class="far fa-calendar-alt" style="margin-right:3px;font-size:0.75rem;"></i>${publishTime}</span>
            </div>
        </div>
    `;

    card.addEventListener('click', () => {
        window.open(`https://www.bilibili.com/video/${video.bvid}`, '_blank');
    });

    return card;
}

// ── 分页 ──

function updatePagination(data) {
    state.totalVideos = data.total;
    state.totalPages = Math.ceil(data.total / config.pageSize);

    elements.totalVideosElement.textContent = data.total;
    elements.currentPageElement.textContent = state.currentPage;

    elements.prevPageButton.disabled = state.currentPage <= 1;
    elements.nextPageButton.disabled = state.currentPage >= state.totalPages;
}

// ── 加载提示（兜底，仅在骨架屏 JS 失败时显示）──
function showLoading() {
    elements.videoContainer.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'loading';
    el.textContent = '正在加载视频列表...';
    elements.videoContainer.appendChild(el);
}

// ── 错误 ──

function showError(message) {
    elements.videoContainer.innerHTML = `
        <div class="error">${message}</div>
    `;
}

// ── 格式化工具 ──

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatPlayCount(count) {
    return formatCount(count);
}

function formatCount(count) {
    if (count >= 100000000) {
        return (count / 100000000).toFixed(1) + '亿';
    } else if (count >= 10000) {
        return (count / 10000).toFixed(1) + '万';
    }
    return count;
}

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
