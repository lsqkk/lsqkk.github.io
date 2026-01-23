// 从当前URL中提取用户尝试访问的路径
const currentPath = window.location.pathname.replace(/^\//, '').replace(/\/$/, '');

// 获取所有已知的URL路径
async function getSiteUrls() {
    try {
        const response = await fetch('/sitemap.xml');
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        // 提取所有loc节点中的URL
        const locElements = xmlDoc.getElementsByTagName('loc');
        const urls = [];

        // 将URL转换为相对路径并存储
        for (let element of locElements) {
            const url = element.textContent;
            // 从完整URL中提取相对路径
            const urlObj = new URL(url);
            const path = urlObj.pathname.replace(/^\//, '').replace(/\/$/, '');
            if (path) {
                urls.push(path);
            }
        }

        return urls;
    } catch (error) {
        console.error('加载站点地图失败:', error);
        return [];
    }
}

// 计算字符串相似度（Levenshtein距离）
function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[b.length][a.length];
}

// 查找最接近的匹配项
function findClosestMatches(target, urls, maxResults = 2) {
    // 计算所有URL的相似度
    const results = urls.map(url => ({
        url,
        distance: levenshteinDistance(target.toLowerCase(), url.toLowerCase())
    }));

    // 按相似度排序（距离越小越相似）
    results.sort((a, b) => a.distance - b.distance);

    // 返回最接近的几个结果
    return results.slice(0, maxResults).filter(item => item.distance < target.length * 0.8);
}

// 显示搜索建议
function showSuggestions(matches) {
    const suggestionsDiv = document.getElementById('searchSuggestions');
    const suggestionList = document.getElementById('suggestionList');

    if (matches.length === 0) {
        suggestionsDiv.style.display = 'none';
        return;
    }

    // 清空现有列表
    suggestionList.innerHTML = '';

    // 添加匹配项
    matches.forEach(match => {
        const suggestionItem = document.createElement('div');
        suggestionItem.className = 'suggestion-item';

        const link = document.createElement('a');
        link.href = '/' + match.url;
        link.textContent = '/' + match.url;
        link.className = 'suggestion-link';

        suggestionItem.appendChild(link);
        suggestionList.appendChild(suggestionItem);
    });

    suggestionsDiv.style.display = 'block';
}

// 主逻辑
let isNavigating = false;
let redirectTimer;

async function init() {
    // 只有当有路径且不是根路径时才进行搜索
    if (currentPath && currentPath !== '') {
        const urls = await getSiteUrls();
        const matches = findClosestMatches(currentPath, urls, 2);
        showSuggestions(matches);
    }

    // 倒计时逻辑
    let seconds = 5;
    const countdownEl = document.getElementById("countdown");

    redirectTimer = setInterval(() => {
        if (!isNavigating) {
            seconds--;
            countdownEl.textContent = `${seconds} 秒后自动回到首页`;

            if (seconds <= 0) {
                clearInterval(redirectTimer);
                window.location.href = "/";
            }
        }
    }, 1000);

    // 点击建议链接时停止倒计时
    document.querySelectorAll('.suggestion-link').forEach(link => {
        link.addEventListener('click', () => {
            isNavigating = true;
            clearInterval(redirectTimer);
        });
    });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);