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

        // Initialize skeleton loading for gallery images
        if (window.DynamicGallery && typeof window.DynamicGallery.initSkeletonImages === 'function') {
            window.DynamicGallery.initSkeletonImages(container);
        }
    });
})();
