/**
 * 友链页面应用脚本
 */

// DOM加载完成后执行
document.addEventListener('DOMContentLoaded', function () {
    // 设置当前年份
    document.getElementById('currentYear').textContent = new Date().getFullYear();

    // 初始化我的信息复制功能
    initCopyFunctionality();

    // 加载友链列表
    loadFriendsList();
});

/**
 * 初始化我的信息复制功能
 */
function initCopyFunctionality() {
    const infoItems = document.querySelectorAll('.my-info-item');

    infoItems.forEach(item => {
        item.tabIndex=0;item.setAttribute('role','button');item.setAttribute('aria-label','复制'+item.querySelector('.info-label').textContent);
        item.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();item.click();}});
        item.addEventListener('click', async function () {
            const textToCopy = this.getAttribute('data-copy');
            const copied=await copyToClipboard(textToCopy);
            showCopyToast(copied?`已复制: ${textToCopy}`:'复制未成功，请选择文字后手动复制。');
        });
    });
}

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 */
async function copyToClipboard(text) {
    // 使用现代剪贴板API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try { await navigator.clipboard.writeText(text);return true; } catch { return fallbackCopy(text); }
    } else {
        // 降级方案
        return fallbackCopy(text);
    }
}

/**
 * 降级复制方案
 * @param {string} text - 要复制的文本
 */
function fallbackCopy(text) {
    const before=document.activeElement;
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    let copied=false;
    try {
        copied=document.execCommand('copy');
    } catch (err) {
        console.error('降级复制失败: ', err);
    }

    document.body.removeChild(textArea);
    before?.focus({preventScroll:true});return copied;
}

/**
 * 显示复制成功提示
 * @param {string} message - 提示消息
 */
function showCopyToast(message) {
    const toast = document.getElementById('copyToast');
    const toastText = document.getElementById('copyToastText');

    toastText.textContent = message || '已复制到剪贴板';
    toast.classList.add('show');

    // 3秒后隐藏
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * 加载友链列表
 */
function loadFriendsList() {
    const friendsContainer = document.getElementById('friendsContainer');
    const preloadedFriends = Array.isArray(window.__FRIENDS_DATA__) ? window.__FRIENDS_DATA__ : null;

    // 从构建期注入数据读取，注入不存在时回退请求 JSON
    const dataPromise = preloadedFriends
        ? Promise.resolve(preloadedFriends)
        : fetch('/json/friends.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        });

    dataPromise
        .then(friends => {
            // 清空加载提示
            friendsContainer.innerHTML = '';

            // 如果没有友链
            if (!friends || friends.length === 0) {
                friendsContainer.innerHTML = `
                    <div class="no-friends glass-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                        <i class="fas fa-users" style="font-size: 3rem; color: rgba(255, 255, 255, 0.5); margin-bottom: 20px;"></i>
                        <h3 style="color: rgba(255, 255, 255, 0.8); margin-bottom: 10px;">暂无友链</h3>
                        <p style="color: rgba(255, 255, 255, 0.6);">前往留言板交换友链吧！</p>
                    </div>
                `;
                return;
            }

            // 创建并添加友链卡片
            friends.forEach(friend => {
                const friendCard = createFriendCard(friend);
                friendsContainer.appendChild(friendCard);
            });
        })
        .catch(error => {
            console.error('加载友链数据失败:', error);
            friendsContainer.innerHTML = `
                <div class="error glass-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: rgba(255, 100, 100, 0.7); margin-bottom: 20px;"></i>
                    <h3 style="color: rgba(255, 255, 255, 0.8); margin-bottom: 10px;">加载失败</h3>
                    <p style="color: rgba(255, 255, 255, 0.6);">无法加载友链数据，请稍后再试。</p>
                    <p style="color: rgba(255, 255, 255, 0.5); font-size: 0.9rem; margin-top: 10px;">${error.message}</p>
                </div>
            `;
        });
}

/**
 * 创建友链卡片元素
 * @param {Object} friend - 友链对象
 * @returns {HTMLElement} 友链卡片元素
 */
function createFriendCard(friend) {
    const card = document.createElement('div');
    card.className = 'friend-card';

    // 提取域名用于alt属性
    const domain = friend.url ? new URL(friend.url).hostname : '';

    card.innerHTML = `
        <div class="friend-card-header">
            <img src="${friend.icon || ''}"
                 alt="${friend.nickname} 头像"
                 class="friend-icon" loading="lazy">
            <div class="friend-name-container">
                <div class="friend-nickname">${friend.nickname || '未命名'}</div>
                <div class="friend-url">${friend.url || '无链接'}</div>
            </div>
        </div>
        <div class="friend-card-body">
            <div class="friend-describe">${friend.describe || '暂无描述'}</div>
            <a href="${friend.url || '#'}" 
               class="friend-link" 
               target="_blank" 
               rel="noopener noreferrer"
               ${!friend.url ? 'style="pointer-events: none; opacity: 0.5;"' : ''}>
                <i class="fas fa-external-link-alt"></i>
                访问网站
            </a>
        </div>
    `;

    const avatar=card.querySelector('.friend-icon');
    const fallback=()=>{const initial=document.createElement('span');initial.className='friend-icon friend-initial';initial.textContent=String(friend.nickname||'友').slice(0,1);initial.setAttribute('aria-hidden','true');avatar.replaceWith(initial);};
    if(friend.icon)avatar.addEventListener('error',fallback,{once:true});else fallback();
    return card;
}
