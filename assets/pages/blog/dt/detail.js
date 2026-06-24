// @ts-check

(function () {
    document.addEventListener('DOMContentLoaded', () => {
        const detail = window.__DT_DETAIL__;
        const container = document.getElementById('dynamic-detail-content');
        if (!container || !detail) return;

        const content = detail.content || '';
        const images = Array.isArray(detail.images) ? detail.images : [];
        // 解析 QQ @提及: @{uin:12345,nick:某人,who:1} → Markdown 链接语法
        const mentionParsed = content.replace(/@\{uin:(\d+),nick:([^,}]+)(?:,who:\d+)?\}/g, (_m, uin, nick) => {
            const safeNick = nick.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
            return `[@${safeNick}](https://user.qzone.qq.com/${uin})`;
        });
        const emotionParser = new QQEmotionParser();
        const parsedText = emotionParser.parse(mentionParsed);
        const htmlContent = marked.parse(parsedText, { breaks: true, gfm: true });
        const galleryHtml = images.length > 0 && window.DynamicGallery
            ? window.DynamicGallery.createGalleryHtml(images)
            : '';

        container.innerHTML = `${htmlContent}${galleryHtml}`;

        // 让 @mention 链接在新窗口打开，阻止冒泡到父卡片
        container.querySelectorAll('a[href*="user.qzone.qq.com"]').forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.stopPropagation();
                e.preventDefault();
                window.open(this.href, '_blank', 'noopener');
            });
        });

        // Initialize skeleton loading for gallery images
        if (window.DynamicGallery && typeof window.DynamicGallery.initSkeletonImages === 'function') {
            window.DynamicGallery.initSkeletonImages(container);
        }
    });
})();
