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
