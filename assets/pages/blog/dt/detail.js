// @ts-check

(function () {
    document.addEventListener('DOMContentLoaded', () => {
        const detail = window.__DT_DETAIL__;
        const container = document.getElementById('dynamic-detail-content');
        if (!container || !detail) return;

        const content = detail.content || '';
        const images = Array.isArray(detail.images) ? detail.images : [];
        const emotionParser = new QQEmotionParser();

        const parsedText = emotionParser.parse(content);
        // 解析 QQ @提及: @{uin:12345,nick:某人,who:1} → 可点击的 QQ 空间链接
        const mentionParsed = parsedText.replace(/@\{uin:(\d+),nick:([^,}]+)(?:,who:\d+)?\}/g, (_m, uin, nick) => {
            const safeNick = nick.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<a href="https://user.qzone.qq.com/${uin}" target="_blank" rel="noopener noreferrer">@${safeNick}</a>`;
        });
        const htmlContent = marked.parse(mentionParsed, { breaks: true, gfm: true });
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
