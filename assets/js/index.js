// @ts-check

/**
 * @typedef {{url: string, icon: string, alt: string}} SocialLink
 * @typedef {{title: string, content: string}} AnnouncementConfig
 * @typedef {{file: string, title: string, date: string, wordCount?: number, tags?: string[]}} PostItem
 * @typedef {{url: string, icon: string, nickname: string, describe: string}} FriendLink
 * @typedef {{id?: string, title: string, content: string[], date: string}} DynamicEntry
 * @typedef {{cover: string, title: string, play_count: number, publish_time: number, duration: number, bvid: string}} VideoItem
 * @typedef {{ip: string, province: string, city: string, district: string, latitude: number, longitude: number, distance: number | string}} VisitorInfo
 * @typedef {{
 *   showPostNum?: number,
 *   showDynamicNum?: number,
 *   phrases?: string[],
 *   tips?: string[],
 *   bloggerLat?: number,
 *   bloggerLon?: number,
 *   socialLinks?: SocialLink[],
  *   contact?: { email?: string, phone?: string, cv?: string, academic?: string },
  *   Contact?: { email?: string, phone?: string, cv?: string, academic?: string },
 *   Nickname?: string,
 *   welcomeTitle?: string,
 *   welcomeText?: string,
 *   announcement?: AnnouncementConfig
 * }} HomeConfig
 * @typedef {{
 *   homeConfig?: HomeConfig,
 *   posts?: PostItem[],
 *   friends?: FriendLink[],
 *   cityBanter?: Record<string, string>,
 *   dynamicEntries?: DynamicEntry[]
 * }} HomePreloadedData
 */

/** @type {HomeConfig | null} */
var config = null;

/**
 * @returns {HomePreloadedData}
 */
function getPreloadedHomeData() {
    return /** @type {HomePreloadedData} */ (window.__HOME_PRELOADED__ || {});
}

/**
 * @returns {HomeConfig}
 */
function getHomeConfig() {
    return config || {};
}

/**
 * @returns {{postsTotal?: number, dynamicTotal?: number, toolsTotal?: number, projectsTotal?: number, gamesTotal?: number}}
 */
function getFooterStatsConfig() {
    const preload = getPreloadedHomeData();
    return preload.footerStats || {};
}

document.addEventListener('DOMContentLoaded', async () => {
    const mainContent = document.querySelector('.main-content');
    if (mainContent instanceof HTMLElement) {
        mainContent.style.opacity = '1';
    }

    await loadHomeConfig();

    // 先加载市级俏皮话数据
    await loadCityBanterData();

    // 然后加载其他内容 - 添加存在性检查
    if (document.getElementById('recent-posts')) {
        loadRecentPosts();
    }

    updateTime();
    updateGreeting();

    if (document.getElementById('welcome-info')) {
        getVisitorInfo(); // 此时cityBanterData应该已经加载完成
    }

    setInterval(updateTime, 1000);
    setInterval(updateGreeting, 60000);

    initFooterStats();
});

// 加载最近三篇文章
async function loadRecentPosts() {
    try {
        const preload = getPreloadedHomeData();
        /** @type {PostItem[]} */
        const posts = Array.isArray(preload.posts) ? preload.posts : [];
        if (posts.length === 0) {
            throw new Error('缺少预注入 posts 数据');
        }
        const showPostNum = getHomeConfig().showPostNum || 3;
        const recentPosts = posts.slice(0, showPostNum);

        const list = recentPosts.map(post => `
                    <div class="post-item post-item-link" data-href="/posts/${post.file.replace('.md', '')}">
                        <div class="post-title">
                            ${post.title}
                        </div>
                        <div class="post-date">${post.date}</div>
                        <div class="post-tags">
                            <span class="post-tag read-time">${post.wordCount || 0}字·${Math.ceil((post.wordCount || 0) / 400)}min</span>
                            ${(post.columns || []).map(column => `<a class="post-tag post-tag-col tag-link" href="/posts?columns=${encodeURIComponent(column)}"><i class="fa-solid fa-folder"></i>${column}</a>`).join('')}
                            ${(post.tags || ['未分类']).map(tag => `<a class="post-tag tag-link" href="/posts?tag=${encodeURIComponent(tag)}"><i class="fa-solid fa-tag"></i>${tag}</a>`).join('')}
                        </div>
                    </div>
                `).join('');

        const recentPostsElement = document.getElementById('recent-posts');
        if (recentPostsElement) {
            recentPostsElement.innerHTML = list;
            bindHomePostLinks(recentPostsElement);
        }
    } catch (error) {
        console.error('加载最近文章失败:', error);
        const recentPostsElement = document.getElementById('recent-posts');
        if (recentPostsElement) {
            recentPostsElement.innerHTML = '<div class="post-item">文章加载失败</div>';
        }
    }
}

// 新增PV/UV存储功能
function storeStatistics() {
    const pvElement = document.getElementById('busuanzi_value_site_pv');
    const uvElement = document.getElementById('busuanzi_value_site_uv');

    if (!pvElement || !uvElement) return;

    const pv = pvElement.innerText;
    const uv = uvElement.innerText;
    const today = new Date();
    // 格式化为 YYYY-MM-DD（本地时区）
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    localStorage.setItem(dateKey, JSON.stringify({
        pv: parseInt(pvElement.innerText),
        uv: parseInt(uvElement.innerText),
        timestamp: today.getTime()
    }));
}

// 监听不蒜子数据变化 - 添加存在性检查
const pvElement = document.getElementById('busuanzi_value_site_pv');
if (pvElement) {
    new MutationObserver(() => {
        const pvElement = document.getElementById('busuanzi_value_site_pv');
        const uvElement = document.getElementById('busuanzi_value_site_uv');
        if (pvElement && uvElement &&
            pvElement.innerText && uvElement.innerText) {
            storeStatistics();
        }
    }).observe(pvElement, {
        childList: true,
        subtree: true
    });
}

// 检查是否已登录 - 添加存在性检查
function checkLoginStatus() {
    const isLoggedIn = localStorage.getItem('github_code') || localStorage.getItem('github_user') || localStorage.getItem('qb_user');
    const loginButton = document.getElementById('login-button');
    const mobileLoginButton = document.getElementById('mobile-login-button');
    const headerLoginButton = document.getElementById('header-login');

    if (isLoggedIn) {
        // 隐藏电脑端和移动端的登录按钮
        if (loginButton) loginButton.style.display = 'none';
        if (mobileLoginButton) mobileLoginButton.style.display = 'none';
        if (headerLoginButton) headerLoginButton.style.display = 'none';
    } else {
        // 确保登录按钮显示（可能在之前被隐藏了）
        if (loginButton) loginButton.style.display = 'block';
        if (mobileLoginButton) mobileLoginButton.style.display = 'block';
        if (headerLoginButton) headerLoginButton.style.display = 'flex';
    }

    if (typeof window.renderNavUserProfile === 'function') {
        window.renderNavUserProfile();
    }
}

// 在DOM加载完成后检查登录状态
document.addEventListener('DOMContentLoaded', checkLoginStatus);

async function loadHomeConfig() {
    try {
        const preload = getPreloadedHomeData();
        /** @type {HomeConfig} */
        const loadedConfig = preload.homeConfig || {};
        if (!loadedConfig || Object.keys(loadedConfig).length === 0) {
            throw new Error('缺少预注入 homeConfig 数据');
        }
        config = loadedConfig;
        renderHomeConfig(loadedConfig);
    } catch (error) {
        console.error('加载主页配置失败:', error);
        setDefaultContent();
    }
}

// 修改打字机效果代码 - 添加等待机制和存在性检查
document.addEventListener('DOMContentLoaded', function () {
    const typewriterElement = document.getElementById('typewriter');
    if (!typewriterElement) return;

    // 等待 config 加载完成
    const waitForConfig = setInterval(() => {
        if (config && config.phrases) {
            clearInterval(waitForConfig);
            initTypewriter();
        }
    }, 100);

    function initTypewriter() {
        const phrases = getHomeConfig().phrases || ['欢迎访问 Quark Blog ~'];
        const safeTypewriterElement = /** @type {HTMLElement} */ (typewriterElement);
        let phraseIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        let isWaiting = false;

        function typeWriter() {
            const currentPhrase = phrases[phraseIndex];
            let displayText = currentPhrase.substring(0, charIndex);

            safeTypewriterElement.innerHTML = displayText || '&nbsp;';

            if (isDeleting) {
                charIndex--;
                if (charIndex <= 0) {
                    isDeleting = false;
                    phraseIndex = (phraseIndex + 1) % phrases.length;
                    setTimeout(typeWriter, 500);
                } else {
                    setTimeout(typeWriter, 50);
                }
            } else if (isWaiting) {
                if (charIndex < currentPhrase.length) {
                    charIndex++;
                    setTimeout(typeWriter, 100);
                } else {
                    isWaiting = false;
                    isDeleting = true;
                    setTimeout(typeWriter, 1500);
                }
            } else {
                charIndex++;
                if (charIndex >= currentPhrase.length) {
                    isWaiting = true;
                    setTimeout(typeWriter, 100);
                } else {
                    setTimeout(typeWriter, 100 + Math.random() * 50);
                }
            }
        }

        // 初始化光标样式
        const style = document.createElement('style');
        style.innerHTML = `
            #typewriter::after {
                content: "|";
                animation: blink 0.7s infinite;
                position: relative;
                left: -0.1em;
            }
            @keyframes blink { 0%,100% {opacity:1;} 50% {opacity:0;} }
        `;
        document.head.appendChild(style);

        setTimeout(typeWriter, 1000);
    }
});

// 更新时间 - 添加存在性检查
function updateTime() {
    const now = new Date();

    const hoursElement = document.getElementById('hours');
    const minutesElement = document.getElementById('minutes');
    const secondsElement = document.getElementById('seconds');
    const dateElement = document.getElementById('date');

    if (hoursElement) hoursElement.textContent = now.getHours().toString().padStart(2, '0');
    if (minutesElement) minutesElement.textContent = now.getMinutes().toString().padStart(2, '0');
    if (secondsElement) secondsElement.textContent = now.getSeconds().toString().padStart(2, '0');
    if (dateElement) {
        dateElement.textContent = now.toLocaleDateString('zh-CN', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }
}

// 更新问候语 - 添加存在性检查
function updateGreeting() {
    const greetingElement = document.getElementById('greeting');
    const tipElement = document.getElementById('tip');

    if (!greetingElement || !tipElement) return;

    const hour = new Date().getHours();
    let greeting = '';

    if (hour < 6) greeting = '凌晨好~';
    else if (hour < 9) greeting = '早上好~';
    else if (hour < 12) greeting = '上午好~';
    else if (hour < 14) greeting = '中午好~';
    else if (hour < 18) greeting = '下午好~';
    else greeting = '晚上好~';

    greetingElement.textContent = greeting;
    tipElement.textContent = getRandomTip();
}

// 随机提示语 - 添加存在性检查
function getRandomTip() {
    const tips = getHomeConfig().tips;
    if (!tips || tips.length === 0) return '欢迎访问 Quark Blog ~';
    return tips[Math.floor(Math.random() * tips.length)];
}

function setTextSafe(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function initFooterStats() {
    const stats = getFooterStatsConfig();
    setTextSafe('footer-post-total', String(stats.postsTotal || 0));
    setTextSafe('footer-dynamic-total', String(stats.dynamicTotal || 0));
    setTextSafe('footer-tool-total', String((stats.toolsTotal || 0) + (stats.projectsTotal || 0)));
    setTextSafe('footer-game-total', String(stats.gamesTotal || 0));

    const start = new Date('2025-01-31T00:00:00+08:00');
    const now = new Date();
    const days = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    setTextSafe('footer-running-days', String(days));

    void loadFooterUserCount();
    void loadOpenSourceCount();
    void loadTodayCommitCount();

    window.addEventListener('firebase-config-loaded', () => {
        void loadFooterUserCount();
    });
}

async function loadFooterUserCount() {
    const el = document.getElementById('footer-user-total');
    if (!el) return;
    try {
        const db = await ensureOnlineFirebaseDatabase();
        const snap = await db.ref('user_activity').once('value');
        const raw = snap.val() || {};
        const entries = Object.values(raw);
        const count = entries.filter((user) => {
            const profile = user?.profile || {};
            const nickname = typeof profile.nickname === 'string' ? profile.nickname.trim() : '';
            const login = typeof profile.login === 'string' ? profile.login.trim() : '';
            return Boolean(nickname || login);
        }).length;
        el.textContent = String(count);
    } catch (error) {
        console.warn('加载注册用户失败:', error);
        el.textContent = '--';
    }
}

async function loadOpenSourceCount() {
    const el = document.getElementById('footer-project-total');
    if (!el) return;
    const excluded = new Set(['lsqkk.github.io', 'lsqkk', 'image', 'quarkdoc', 'academic-homepage']);
    try {
        const resp = await fetch('https://api.github.com/users/lsqkk/repos?per_page=100', {
            headers: { Accept: 'application/vnd.github+json' }
        });
        if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
        const repos = await resp.json();
        if (!Array.isArray(repos)) {
            el.textContent = '0';
            return;
        }
        const count = repos.filter((repo) => repo && !excluded.has(repo.name)).length;
        el.textContent = String(count);
    } catch (error) {
        console.warn('加载开源项目失败:', error);
        el.textContent = '--';
    }
}

function formatCstDate(date) {
    const cst = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const y = cst.getUTCFullYear();
    const m = String(cst.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cst.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getCstDayRange() {
    const now = new Date();
    const localDateStr = formatCstDate(now);
    const [year, month, day] = localDateStr.split('-').map((part) => Number(part));
    const startUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - 8 * 60 * 60 * 1000);
    const endUtc = new Date(Date.UTC(year, month - 1, day, 23, 59, 59) - 8 * 60 * 60 * 1000);
    return { startUtc, endUtc, localDateStr };
}

async function loadTodayCommitCount() {
    const el = document.getElementById('footer-commit-total');
    if (!el) return;
    const { startUtc, endUtc, localDateStr } = getCstDayRange();
    const since = startUtc.toISOString();
    const until = endUtc.toISOString();

    try {
        const allCommits = [];
        for (let page = 1; page <= 5; page += 1) {
            const url = `https://api.github.com/repos/lsqkk/lsqkk.github.io/commits?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&per_page=100&page=${page}`;
            const resp = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
            if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
            const commits = await resp.json();
            if (!Array.isArray(commits) || commits.length === 0) break;
            allCommits.push(...commits);
            if (commits.length < 100) break;
        }
        if (allCommits.length === 0) {
            el.textContent = '0';
            return;
        }
        const count = allCommits.filter((item) => {
            const dateText = item?.commit?.committer?.date || item?.commit?.author?.date;
            if (!dateText) return false;
            const dt = new Date(dateText);
            return formatCstDate(dt) === localDateStr;
        }).length;
        el.textContent = String(count);
    } catch (error) {
        console.warn('加载今日 commit 失败:', error);
        el.textContent = '--';
    }
}

function bindHomePostLinks(container) {
    if (!(container instanceof HTMLElement)) return;
    container.querySelectorAll('.post-item-link').forEach((item) => {
        if (!(item instanceof HTMLElement)) return;
        if (item.dataset.bound === 'true') return;
        const href = item.getAttribute('data-href');
        if (!href) return;
        item.dataset.bound = 'true';
        item.setAttribute('role', 'link');
        item.setAttribute('tabindex', '0');
        item.addEventListener('click', (event) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.closest('.tag-link')) {
                return;
            }
            window.location.href = href;
        });
        item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                window.location.href = href;
            }
        });
    });
}

// 计算距离
/**
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 地球半径(km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

// 修改省份俏皮话为市级优先，省级备用
/**
 * @param {string} province
 * @param {string} city
 * @returns {string}
 */
function getBanter(province, city) {
    console.log('获取俏皮话，省份:', province, '城市:', city);
    console.log('cityBanterData 状态:', window.cityBanterData ? '已加载' : '未加载');

    // 首先尝试加载并匹配市级俏皮话
    if (window.cityBanterData) {
        console.log('cityBanterData 内容:', window.cityBanterData);

        // 先尝试匹配完整的城市名（如"徐州市"）
        if (city && window.cityBanterData[city]) {
            console.log('匹配到市级俏皮话:', city);
            return window.cityBanterData[city];
        }

        // 如果城市名包含"市"字，尝试去除"市"字匹配（如"徐州"）
        if (city && city.endsWith('市')) {
            const cityWithoutSuffix = city.slice(0, -1);
            console.log('尝试去除"市"字匹配:', cityWithoutSuffix);
            if (window.cityBanterData[cityWithoutSuffix]) {
                console.log('匹配到市级俏皮话(无市字):', cityWithoutSuffix);
                return window.cityBanterData[cityWithoutSuffix];
            }
        }

        console.log('未找到市级俏皮话，回退到省级');
    }

    // 如果没有市级俏皮话，回退到省级俏皮话（使用现有逻辑）
    return getProvinceBanterFallback(province);
}

// 保留原有的省级俏皮话作为后备（当JSON未加载或加载失败时使用）
/**
 * @param {string} province
 * @returns {string}
 */
function getProvinceBanterFallback(province) {
    // 创建一个映射，将不包含后缀的省份名称映射到完整的省份名称
    /** @type {Record<string, string>} */
    const provinceMapping = {
        '北京': '北京市',
        '上海': '上海市',
        '广东': '广东省',
        '四川': '四川省',
        '重庆': '重庆市',
        '陕西': '陕西省',
        '山西': '山西省',
        '内蒙古': '内蒙古自治区',
        '新疆': '新疆维吾尔自治区',
        '西藏': '西藏自治区',
        '云南': '云南省',
        '贵州': '贵州省',
        '广西': '广西壮族自治区',
        '海南': '海南省',
        '福建': '福建省',
        '浙江': '浙江省',
        '江苏': '江苏省',
        '山东': '山东省',
        '河南': '河南省',
        '河北': '河北省',
        '天津': '天津市',
        '辽宁': '辽宁省',
        '吉林': '吉林省',
        '黑龙江': '黑龙江省',
        '江西': '江西省',
        '安徽': '安徽省',
        '湖北': '湖北省',
        '湖南': '湖南省',
        '甘肃': '甘肃省',
        '宁夏': '宁夏回族自治区',
        '青海': '青海省',
        '台湾': '台湾省',
        '香港': '香港',
        '澳门': '澳门'
    };

    /** @type {Record<string, string>} */
    const banterMap = {
        '北京市': '来碗豆汁儿配焦圈？',
        '上海市': '侬好呀！要尝尝小笼包伐？',
        '广东省': '饮茶先啦！',
        '四川省': '火锅整起？微辣还是中辣？',
        '重庆市': '重庆火锅，巴适得板！',
        '陕西省': '来碗羊肉泡馍？',
        '山西省': '老陈醋管够！',
        '内蒙古自治区': '草原骑马去不？',
        '新疆维吾尔自治区': '羊肉串来十串？',
        '西藏自治区': '布达拉宫约起？',
        '云南省': '过桥米线整一碗？',
        '贵州省': '茅台还是老干妈？',
        '广西壮族自治区': '桂林山水甲天下！',
        '海南省': '椰子管饱！',
        '福建省': '喝茶话仙啦！',
        '浙江省': '龙井茶来一杯？',
        '江苏省': '盐水鸭来一份？',
        '山东省': '煎饼卷大葱整起？',
        '河南省': '烩面来一碗？',
        '河北省': '驴肉火烧走起？',
        '天津市': '煎饼果子来一套？',
        '辽宁省': '整点锅包肉？',
        '吉林省': '东北酸菜管够！',
        '黑龙江省': '冰雪大世界走起？',
        '江西省': '瓦罐汤来一盅？',
        '安徽省': '黄山烧饼来几个？',
        '湖北省': '热干面过早？',
        '湖南省': '辣椒炒肉走起？',
        '甘肃省': '兰州拉面来一碗？',
        '宁夏回族自治区': '枸杞泡起来？',
        '青海省': '青海湖约起？',
        '台湾省': '珍珠奶茶来一杯？',
        '香港': '饮茶食点心啦！',
        '澳门': '葡式蛋挞来一打？'
    };

    // 将输入的省份名称转换为完整的省份名称
    const fullProvinceName = provinceMapping[province] || province;

    return banterMap[fullProvinceName] || '欢迎来玩！';
}

function loadCityBanterData() {
    const preload = getPreloadedHomeData();
    if (preload.cityBanter) {
        window.cityBanterData = preload.cityBanter;
        return Promise.resolve();
    }

    return fetch('/json/city-banter.json')
        .then(response => response.json())
        .then(data => {
            /** @type {Record<string, string>} */
            const cityBanterData = data;
            window.cityBanterData = cityBanterData;
            console.log('市级俏皮话数据加载成功');
            console.log('数据包含城市:', Object.keys(cityBanterData).filter(key => key.includes('州')));

            // 数据加载成功后，重新显示欢迎信息（如果已经显示过）
            if (window.visitorInfoDisplayed) {
                console.log('重新显示欢迎信息');
                showVisitorInfo(/** @type {VisitorInfo} */(window.cachedVisitorInfo));
            }
        })
        .catch(error => {
            console.log('市级俏皮话数据加载失败，使用省级备用:', error);
            window.cityBanterData = null;
        });
}

/**
 * @param {VisitorInfo} info
 */
function showVisitorInfo(info) {
    const welcomeInfoElement = document.getElementById('welcome-info');
    if (!welcomeInfoElement) return;

    const { ip, province, city, district, latitude, longitude, distance } = info;

    // 获取俏皮话（使用新函数，传入省份和城市）
    const banter = getBanter(province, city);
    console.log('最终使用的俏皮话:', banter);

    // 显示位置信息
    let locationText = `${province} ${city}`;
    if (district) {
        locationText = `${province} ${city} ${district}`;
    }

    // 显示欢迎信息
    welcomeInfoElement.innerHTML = `
        欢迎来自 <span class="highlight">${locationText}</span> 的朋友<br>
        <span class="highlight">${banter}</span><br>
        ${distance !== "未知距离" ? `您当前距站主约 <span class="highlight">${distance}</span> 公里<br>` : ""}
        您的IP地址为: <span class="highlight">${ip}</span>
    `;

    // 标记已经显示过
    window.visitorInfoDisplayed = true;
}

// 修改getVisitorInfo函数
async function getVisitorInfo() {
    try {
        const ipResponse = await fetch('https://api.b52m.cn/api/IP/');
        const ipData = await ipResponse.json();

        if (ipData.code === 200) {
            const ip = ipData.data.ip;
            const ipPro = ipData.data.region_name || ipData.data.province_name_2;
            const ipCity = ipData.data.city_name || ipData.data.city_name_2;
            const district = ipData.data.district_name_3 || ipData.data.district_name || "";

            // 获取经纬度
            const latitude = ipData.data.latitude_2 || ipData.data.latitude_3 || 0;
            const longitude = ipData.data.longitude_2 || ipData.data.longitude_3 || 0;

            // 站主位置
            const cfg = getHomeConfig();
            const bloggerLat = typeof cfg.bloggerLat === 'number' ? cfg.bloggerLat : 0;
            const bloggerLon = typeof cfg.bloggerLon === 'number' ? cfg.bloggerLon : 0;

            /** @type {number | string} */
            let distance = "未知距离";
            if (latitude && longitude) {
                distance = getDistance(
                    bloggerLat, bloggerLon,
                    latitude, longitude
                );
            }

            // 缓存访客信息
            window.cachedVisitorInfo = /** @type {VisitorInfo} */ ({
                ip,
                province: ipPro,
                city: ipCity,
                district,
                latitude,
                longitude,
                distance
            });

            // 如果市级数据已加载，立即显示
            if (window.cityBanterData) {
                showVisitorInfo(/** @type {VisitorInfo} */(window.cachedVisitorInfo));
            } else {
                // 否则先显示省级备用，等数据加载后再更新
                const fallbackBanter = getProvinceBanterFallback(ipPro);

                let locationText = `${ipPro} ${ipCity}`;
                if (district) {
                    locationText = `${ipPro} ${ipCity} ${district}`;
                }

                const welcomeInfoElement = document.getElementById('welcome-info');
                if (welcomeInfoElement) {
                    welcomeInfoElement.innerHTML = `
                        欢迎来自 <span class="highlight">${locationText}</span> 的朋友<br>
                        <span class="highlight">${fallbackBanter}</span><br>
                        ${distance !== "未知距离" ? `您当前距站主约 <span class="highlight">${distance}</span> 公里<br>` : ""}
                        您的IP地址为: <span class="highlight">${ip}</span>
                    `;

                    // 标记为已显示
                    window.visitorInfoDisplayed = true;

                    // 设置一个检查，等数据加载后重新显示
                    const checkInterval = setInterval(() => {
                        if (window.cityBanterData && window.visitorInfoDisplayed) {
                            clearInterval(checkInterval);
                            console.log('数据已加载，重新显示欢迎信息');
                            showVisitorInfo(/** @type {VisitorInfo} */(window.cachedVisitorInfo));
                        }
                    }, 100);
                }
            }
        } else {
            throw new Error(`IP数据API返回错误: ${ipData.message}`);
        }
    } catch (error) {
        console.error('获取IP信息失败:', error);
        const welcomeInfoElement = document.getElementById('welcome-info');
        if (welcomeInfoElement) {
            welcomeInfoElement.textContent = '';
        }
    }
}

async function loadDynamicFeed() {
    try {
        const preload = getPreloadedHomeData();
        const entries = Array.isArray(preload.dynamicEntries) ? preload.dynamicEntries : [];
        if (entries.length === 0) {
            throw new Error('缺少预注入 dynamicEntries 数据');
        }
        const showDynamicNum = getHomeConfig().showDynamicNum || 3;
        renderDynamicEntries(entries.slice(0, showDynamicNum));
    } catch (error) {
        console.error('加载动态失败:', error);
        const dynamicEntriesElement = document.getElementById('dynamic-entries');
        if (dynamicEntriesElement) {
            dynamicEntriesElement.innerHTML =
                '<div class="dynamic-card">动态加载中...</div>';
        }
    }
}

/**
 * @param {string} content
 * @returns {DynamicEntry[]}
 */
function parseMdEntries(content) {
    /** @type {DynamicEntry[]} */
    const entries = [];
    const lines = content.split('\n');
    /** @type {DynamicEntry | null} */
    let currentEntry = null;

    lines.forEach(line => {
        if (line.startsWith('# ')) {
            if (currentEntry) entries.push(currentEntry);
            currentEntry = {
                title: line.replace('# ', '').trim(),
                content: [],
                date: ''
            };
        } else if (currentEntry) {
            if (line.startsWith('## 日期：')) {
                currentEntry.date = line.replace('## 日期：', '').trim();
            } else if (!line.startsWith('#') && line.trim()) {
                currentEntry.content.push(line.trim());
            }
        }
    });

    if (currentEntry) entries.push(currentEntry);
    return entries;
}

/**
 * @param {DynamicEntry[]} entries
 */
function renderDynamicEntries(entries) {
    const container = document.getElementById('dynamic-entries');
    if (!container) return;

    const emotionParser = new QQEmotionParser();
    if (window.DynamicGallery && typeof window.DynamicGallery.reset === 'function') {
        window.DynamicGallery.reset();
    }

    container.innerHTML = entries.map((entry, index) => {
        const contentString = entry.content.join('\n');
        const dynamicId = entry.id || `${entry.date || 'undated'}-${index + 1}`;
        const extracted = window.DynamicGallery
            ? window.DynamicGallery.extractImages(contentString)
            : { text: contentString.replace(/!\[.*?\]\((.*?)\)/g, ''), images: [] };
        const parsedContent = emotionParser.parse(extracted.text);
        const htmlContent = marked.parse(parsedContent, { breaks: true, gfm: true });
        const galleryHtml = extracted.images.length > 0 && window.DynamicGallery
            ? window.DynamicGallery.createGalleryHtml(extracted.images)
            : '';

        return `
        <div class="dynamic-card" data-dynamic-id="${dynamicId}" data-dynamic-link="/blog/dt/${dynamicId}">
            <div class="dynamic-title">${entry.title}</div>
            ${entry.date ? `<div class="dynamic-date">📅 ${entry.date}</div>` : ''}
            <div class="dynamic-content">${htmlContent}</div>
            ${galleryHtml}
            <div class="dynamic-entry-footer">
                <a class="dynamic-detail-link" href="/blog/dt/${dynamicId}">查看详情</a>
                <div class="dynamic-entry-stats">
                    <span>点赞 <span data-dynamic-like-count>0</span></span>
                    <span>评论 <span data-dynamic-comment-count>0</span></span>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// 加载最新视频
async function loadLatestVideo() {
    try {
        const uid = '2105459088'; // 您的B站UID
        const apiUrl = 'https://uapis.cn/api/v1/social/bilibili/archives';

        const params = new URLSearchParams({
            mid: uid,
            pn: '1',
            ps: '1', // 只获取最新1个视频
            orderby: 'pubdate'
        });

        const response = await fetch(`${apiUrl}?${params}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.videos && data.videos.length > 0) {
            const latestVideo = /** @type {VideoItem} */ (data.videos[0]);
            renderLatestVideo(latestVideo);
        } else {
            throw new Error('No videos found');
        }
    } catch (error) {
        console.error('加载最新视频失败:', error);
        const videoContainer = document.getElementById('latest-video-container');
        if (videoContainer) {
            videoContainer.innerHTML = `
                <div class="loading-placeholder">
                    视频加载失败
                </div>
            `;
        }
    }
}

// 渲染最新视频
/**
 * @param {VideoItem} video
 */
function renderLatestVideo(video) {
    const container = document.getElementById('latest-video-container');
    if (!container) return;

    // 使用图片代理服务解决防盗链问题
    const proxyCoverUrl = `https://images.weserv.nl/?url=${encodeURIComponent(video.cover)}&w=320&h=180`;

    // 格式化播放量
    const playCount = formatVideoCount(video.play_count);
    // 格式化发布时间
    const publishTime = formatVideoTime(video.publish_time);

    container.innerHTML = `
        <div class="latest-video-card">
            <div class="latest-video-cover-wrap">
                <img src="${proxyCoverUrl}" 
                     alt="${video.title}" 
                     class="latest-video-cover"
                     onerror="this.src='https://via.placeholder.com/320x180/1e88e5/ffffff?text=封面加载中'">
                <div class="latest-video-duration">
                    ${formatVideoDuration(video.duration)}
                </div>
            </div>
            <div class="latest-video-body">
                <h4 class="latest-video-title">
                    ${video.title}
                </h4>
                <div class="latest-video-meta">
                    <span>播放: ${playCount}</span>
                    <span>${publishTime}</span>
                </div>
            </div>
        </div>
    `;

    // 添加点击事件，跳转到B站视频页面
    const videoCard = container.querySelector('.latest-video-card');
    if (videoCard instanceof HTMLElement) {
        videoCard.addEventListener('click', () => {
            window.open(`https://www.bilibili.com/video/${video.bvid}`, '_blank');
        });
    }
}

// 格式化视频时长（秒 -> MM:SS）
/**
 * @param {number} seconds
 * @returns {string}
 */
function formatVideoDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 格式化视频播放量
/**
 * @param {number} count
 * @returns {string}
 */
function formatVideoCount(count) {
    if (count >= 100000000) {
        return (count / 100000000).toFixed(1) + '亿';
    } else if (count >= 10000) {
        return (count / 10000).toFixed(1) + '万';
    }
    return String(count);
}

// 格式化视频发布时间
/**
 * @param {number} timestamp
 * @returns {string}
 */
function formatVideoTime(timestamp) {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diff === 0) {
        return '今天';
    } else if (diff === 1) {
        return '昨天';
    } else if (diff < 7) {
        return `${diff}天前`;
    } else if (diff < 30) {
        return `${Math.floor(diff / 7)}周前`;
    } else {
        return `${date.getMonth() + 1}-${date.getDate()}`;
    }
}

function formatCompactNumber(value) {
    const count = Number(value) || 0;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(count);
}

function formatDateText(dateText) {
    if (!dateText) return '--';
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) return '--';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const ONLINE_WINDOW = 15 * 60 * 1000;
const ONLINE_PREVIEW_MAX = 4;

function getOnlineFirebaseConfig() {
    return window.firebaseConfig || window._firebaseConfig || null;
}

function waitForOnlineFirebaseReady() {
    return new Promise((resolve) => {
        const timer = window.setInterval(() => {
            const config = getOnlineFirebaseConfig();
            if (window.firebase && window.firebase.database && config && config.projectId) {
                window.clearInterval(timer);
                resolve(config);
            }
        }, 300);
    });
}

async function ensureOnlineFirebaseDatabase() {
    const config = getOnlineFirebaseConfig();
    if (config && config.projectId && window.firebase && window.firebase.database) {
        if (!window.firebase.apps || !window.firebase.apps.length) {
            window.firebase.initializeApp(config);
        }
        return window.firebase.database();
    }
    const waited = await waitForOnlineFirebaseReady();
    if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp(waited);
    }
    return window.firebase.database();
}

function getOnlineInitial(name) {
    const value = (name || '').trim();
    if (!value) return 'Q';
    return value.slice(0, 1).toUpperCase();
}

function getGuestName(uid) {
    const suffix = uid ? String(uid).slice(-4) : '0000';
    return `访客${suffix}`;
}

function getDisplayName(nickname, login, uid) {
    if (nickname && String(nickname).trim()) return String(nickname).trim();
    if (login && String(login).trim()) return String(login).trim();
    return getGuestName(uid);
}

function setOnlineCount(value) {
    const countEl = document.getElementById('online-preview-count');
    if (countEl) {
        countEl.textContent = String(value);
    }
}

async function loadOnlinePreview() {
    const container = document.getElementById('online-preview');
    if (!container) return;
    try {
        const db = await ensureOnlineFirebaseDatabase();
        const snap = await db.ref('presence').once('value');
        const raw = snap.val() || {};
        const now = Date.now();
        const allItems = Object.values(raw)
            .filter((item) => item && item.lastSeen && now - item.lastSeen <= ONLINE_WINDOW)
            .map((item) => ({
                uid: item.uid || '',
                nickname: item.nickname || '',
                login: item.login || '',
                avatarUrl: item.avatarUrl || '',
                province: item.province || '',
                city: item.city || '',
                lastSeen: item.lastSeen || 0
            }))
            .sort((a, b) => b.lastSeen - a.lastSeen);
        const items = allItems.slice(0, ONLINE_PREVIEW_MAX);

        setOnlineCount(allItems.length);
        if (items.length === 0) {
            container.innerHTML = '<div class="index-announcement"><p class="index-announcement-text">暂无在线用户</p></div>';
            return;
        }

        container.innerHTML = `
            <div class="online-preview-grid">
                ${items.map((item) => {
        const name = getDisplayName(item.nickname, item.login, item.uid);
        const location = [item.province, item.city].filter(Boolean).join(' ');
        const avatar = item.avatarUrl
            ? `<img src="${item.avatarUrl}" alt="${name}">`
            : `<span>${getOnlineInitial(name)}</span>`;
        return `
                        <a class="online-preview-card" href="/a/online">
                            <div class="online-preview-avatar">${avatar}</div>
                            <div>
                                <div class="online-preview-name">${name}</div>
                                <div class="online-preview-meta">${location || '在线'}</div>
                            </div>
                        </a>
                    `;
        }).join('')}
            </div>
        `;
    } catch (error) {
        console.error('在线预览加载失败:', error);
        container.innerHTML = '<div class="index-announcement"><p class="index-announcement-text">在线加载失败</p></div>';
    }
}

async function loadGithubRepoCard() {
    const container = document.getElementById('github-promo-card');
    if (!container) return;

    const repoUrl = 'https://github.com/lsqkk/lsqkk.github.io';
    const fallbackHtml = `
        <div class="github-promo-main">
            <div class="github-promo-head">
                <a class="github-promo-title" href="${repoUrl}" target="_blank">
                    <i class="fab fa-github"></i><span>lsqkk.github.io</span>
                </a>
            </div>
            <p class="github-promo-desc">夸克博客 | 基于原生技术栈的个人网站，分享笔记、工具、游戏、前端实验等。</p>
            <div class="github-promo-foot">
                <span class="github-updated">由 Astro 构建</span>
                <a class="github-open-link" href="${repoUrl}" target="_blank">打开仓库</a>
            </div>
        </div>
    `;

    try {
        const response = await fetch('https://api.github.com/repos/lsqkk/lsqkk.github.io', {
            headers: { Accept: 'application/vnd.github+json' }
        });
        if (!response.ok) throw new Error(`GitHub API: ${response.status}`);
        const repo = await response.json();

        container.innerHTML = `
            <div class="github-promo-main">
                <div class="github-promo-head">
                    <a class="github-promo-title" href="${repo.html_url || repoUrl}" target="_blank">
                        <i class="fab fa-github"></i><span>${repo.full_name || 'lsqkk/lsqkk.github.io'}</span>
                    </a>
                    <span class="github-promo-branch">${repo.default_branch || 'main'}</span>
                </div>
                <p class="github-promo-desc">${repo.description || '个人博客源码仓库，欢迎访问与交流。'}</p>
                <div class="github-promo-stats">
                    <div class="github-stat">
                        <div class="github-stat-label">Stars</div>
                        <div class="github-stat-value">${formatCompactNumber(repo.watchers)}</div>
                    </div>
                    <div class="github-stat">
                        <div class="github-stat-label">Forks</div>
                        <div class="github-stat-value">${formatCompactNumber(repo.forks)}</div>
                    </div>
                    <div class="github-stat">
                        <div class="github-stat-label">Issues</div>
                        <div class="github-stat-value">${formatCompactNumber(repo.open_issues_count)}</div>
                    </div>
                </div>
                <div class="github-promo-foot">
                    <span class="github-updated">Updated ${formatDateText(repo.updated_at)}</span>
                    <a class="github-open-link" href="${repo.html_url || repoUrl}" target="_blank">打开仓库</a>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('加载 GitHub 仓库信息失败:', error);
        container.innerHTML = fallbackHtml;
    }
}

// 加载友链
async function loadFriendLinks() {
    try {
        const preload = getPreloadedHomeData();
        /** @type {FriendLink[]} */
        const friends = Array.isArray(preload.friends) ? preload.friends : [];
        if (friends.length === 0) {
            throw new Error('缺少预注入 friends 数据');
        }
        displayFriendLinks(friends);
    } catch (error) {
        console.error('加载友链失败:', error);
        const friendLinksElement = document.getElementById('friend-links');
        if (friendLinksElement) {
            friendLinksElement.innerHTML =
                '<div class="index-announcement"><p style="margin: 0;">友链加载失败</p></div>';
        }
    }
}

// 显示友链
/**
 * @param {FriendLink[]} friends
 */
function displayFriendLinks(friends) {
    const container = document.getElementById('friend-links');
    if (!container) return;

    if (!friends || friends.length === 0) {
        container.innerHTML = '<div class="index-announcement"><p style="margin: 0;">暂无友链</p></div>';
        return;
    }

    let html = '';
    friends.forEach(friend => {
        html += `
            <a href="${friend.url}" target="_blank" class="friend-link-item">
                <img src="${friend.icon}" alt="${friend.nickname}" class="friend-icon" onerror="this.src='assets/img/logo_blue.png'">
                <div class="friend-info">
                    <div class="friend-nickname">${friend.nickname}</div>
                    <div class="friend-describe">${friend.describe}</div>
                </div>
            </a>
        `;
    });

    container.innerHTML = html;
}

// 渲染主页配置
/**
 * @param {HomeConfig} config
 */
function renderHomeConfig(config) {
    // 渲染社交链接 - 添加存在性检查
    const socialContainer = document.getElementById('social-icons-container');
    if (socialContainer && config.socialLinks) {
        socialContainer.innerHTML = config.socialLinks.map(link => `
            <a href="${link.url}" target="_blank">
                <img src="${link.icon}" alt="${link.alt}" 
                     style="height:30px; width:30px; border-radius: 50%;">
            </a>
        `).join('');
    }

    const nicknameElement = document.getElementById('Nickname');
    if (nicknameElement) nicknameElement.textContent = config.Nickname || '';

    const welcomeTitleElement = document.getElementById('welcome-title');
    if (welcomeTitleElement) welcomeTitleElement.textContent = config.welcomeTitle || '';

    const welcomeTextElement = document.getElementById('welcome-text');
    if (welcomeTextElement) welcomeTextElement.textContent = config.welcomeText || '';

    // 渲染公告 - 添加存在性检查
    const announcementContainer = document.getElementById('announcement-container');
    if (announcementContainer && config.announcement) {
        announcementContainer.innerHTML = `
            <div class="index-announcement-text">
                <span class="index-announcement-title">${config.announcement.title || ''}</span>
                <span class="index-announcement-body">${config.announcement.content || ''}</span>
            </div>
        `;
    }

}

// 设置默认内容（备用）
function setDefaultContent() {
    const socialContainer = document.getElementById('social-icons-container');
    if (socialContainer) {
        socialContainer.innerHTML = `
            <a href="https://github.com/lsqkk" target="_blank">
                <img src="https://cdn.pixabay.com/photo/2022/01/30/13/33/github-6980894_1280.png" 
                     style="height:30px; width:30px; border-radius: 50%;">
            </a>
            <!-- 其他默认社交图标 -->
        `;
    }

    const announcementContainer = document.getElementById('announcement-container');
    if (announcementContainer) {
        announcementContainer.innerHTML = `
            <div class="index-announcement-text">
                <span class="index-announcement-title">想要更方便的阅读博文、移动端获得更好的阅读体验？</span>
                <span class="index-announcement-body">欢迎<a href="/assets/apk/QuarkBlog.apk">下载『夸克博客』APP</a>！</span>
            </div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', function () {
    // 动态加载内容 - 添加存在性检查
    const dynamicEntriesElement = document.getElementById('dynamic-entries');
    if (dynamicEntriesElement) {
        loadDynamicFeed();
    }

    const friendLinksElement = document.getElementById('friend-links');
    if (friendLinksElement) {
        loadFriendLinks();
    }

    const latestVideoContainer = document.getElementById('latest-video-container');
    if (latestVideoContainer) {
        loadLatestVideo();
    }

    if (document.getElementById('github-promo-card')) {
        loadGithubRepoCard();
    }

    if (document.getElementById('online-preview')) {
        loadOnlinePreview();
    }

    window.addEventListener('firebase-config-loaded', () => {
        if (document.getElementById('online-preview')) {
            loadOnlinePreview();
        }
    });

    // 检查并显示弹窗
    checkAndShowPopup();
});
