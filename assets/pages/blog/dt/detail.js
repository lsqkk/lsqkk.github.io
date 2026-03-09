// @ts-check

(function () {
    document.addEventListener('DOMContentLoaded', () => {
        const detail = window.__DT_DETAIL__;
        const container = document.getElementById('dynamic-detail-content');
        if (!container || !detail) return;

        const content = detail.content || '';
        const emotionParser = new QQEmotionParser();
        const extracted = window.DynamicGallery
            ? window.DynamicGallery.extractImages(content)
            : { text: content.replace(/!\[.*?\]\((.*?)\)/g, ''), images: [] };

        const parsedText = emotionParser.parse(extracted.text);
        const htmlContent = marked.parse(parsedText, { breaks: true, gfm: true });
        const galleryHtml = extracted.images.length > 0 && window.DynamicGallery
            ? window.DynamicGallery.createGalleryHtml(extracted.images)
            : '';

        container.innerHTML = `${htmlContent}${galleryHtml}`;
    });
})();
