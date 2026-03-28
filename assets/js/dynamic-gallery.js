// @ts-check

(function () {
    const galleryStore = new Map();
    let gallerySeq = 0;

    function nextGalleryId() {
        gallerySeq += 1;
        return `dg-${gallerySeq}`;
    }

    /**
     * @param {string} markdown
     */
    function extractImages(markdown) {
        const source = String(markdown || '');
        const matches = Array.from(source.matchAll(/!\[.*?\]\((.*?)\)/g));
        const images = matches.map((item) => item[1]).filter(Boolean);
        const text = source.replace(/!\[.*?\]\((.*?)\)/g, '').trim();
        return { text, images };
    }

    /**
     * @param {string[]} images
     */
    function createGalleryHtml(images) {
        if (!Array.isArray(images) || images.length === 0) return '';
        const galleryId = nextGalleryId();
        galleryStore.set(galleryId, images);

        const total = images.length;
        const perRow = total <= 4 ? 2 : 3;
        const rows = Math.ceil(total / perRow);
        let html = `<div class="gallery-container" data-gallery-id="${galleryId}">`;

        for (let row = 0; row < rows; row += 1) {
            html += '<div class="gallery-row">';
            const start = row * perRow;
            const end = Math.min(start + perRow, total);
            for (let i = start; i < end; i += 1) {
                const image = images[i];
                html += `
                    <button type="button" class="gallery-item" aria-label="查看图片 ${i + 1}" onclick="DynamicGallery.open('${galleryId}', ${i})">
                        <img src="${image}" alt="动态图片 ${i + 1}" loading="lazy">
                    </button>
                `;
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    /**
     * @param {string[]} images
     */
    function registerImages(images) {
        if (!Array.isArray(images) || images.length === 0) return '';
        const galleryId = nextGalleryId();
        galleryStore.set(galleryId, images);
        return galleryId;
    }

    /**
     * @param {ParentNode} root
     */
    function hydrateStaticGalleries(root = document) {
        const containers = root.querySelectorAll('.gallery-container[data-gallery-images]');
        containers.forEach((container) => {
            if (!(container instanceof HTMLElement)) return;
            if (container.dataset.galleryHydrated === 'true') return;
            let images = [];
            try {
                images = JSON.parse(container.dataset.galleryImages || '[]');
            } catch {
                images = [];
            }
            if (!Array.isArray(images) || images.length === 0) return;
            const galleryId = registerImages(images);
            container.dataset.galleryId = galleryId;
            container.dataset.galleryHydrated = 'true';
            container.querySelectorAll('.gallery-item').forEach((btn) => {
                if (!(btn instanceof HTMLElement)) return;
                const index = Number(btn.dataset.galleryIndex || '0');
                btn.addEventListener('click', () => openGallery(galleryId, index));
            });
        });
    }

    /**
     * @param {string} galleryId
     * @param {number} index
     */
    function openGallery(galleryId, index) {
        const images = galleryStore.get(galleryId);
        if (!images || images.length === 0) return;
        const safeIndex = Math.max(0, Math.min(index, images.length - 1));
        renderModal(galleryId, safeIndex);
    }

    /**
     * @param {string} galleryId
     * @param {number} index
     */
    function renderModal(galleryId, index) {
        const images = galleryStore.get(galleryId);
        if (!images || images.length === 0) return;

        const existing = document.querySelector('.gallery-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'gallery-modal';
        modal.innerHTML = `
            <div class="gallery-modal-content">
                <button type="button" class="close-btn" onclick="DynamicGallery.close()" aria-label="关闭预览">&times;</button>
                <div class="gallery-modal-main">
                    <img src="${images[index]}" class="current-image" alt="全屏图片">
                    <div class="gallery-nav">
                        <button type="button" class="nav-btn prev-btn" ${index === 0 ? 'style="visibility:hidden"' : ''} onclick="DynamicGallery.change('${galleryId}', ${index - 1})">❮</button>
                        <span class="image-counter">${index + 1} / ${images.length}</span>
                        <button type="button" class="nav-btn next-btn" ${index === images.length - 1 ? 'style="visibility:hidden"' : ''} onclick="DynamicGallery.change('${galleryId}', ${index + 1})">❯</button>
                    </div>
                </div>
                <div class="gallery-thumbnails">
                    ${images.map((url, i) => `
                        <img
                            src="${url}"
                            class="thumbnail ${i === index ? 'active' : ''}"
                            onclick="DynamicGallery.change('${galleryId}', ${i})"
                            alt="缩略图 ${i + 1}">
                    `).join('')}
                </div>
            </div>
        `;

        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeGallery();
        });

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
    }

    function closeGallery() {
        const modal = document.querySelector('.gallery-modal');
        if (!modal) return;
        modal.remove();
        document.body.style.overflow = 'auto';
    }

    /**
     * @param {string} galleryId
     * @param {number} index
     */
    function changeImage(galleryId, index) {
        const images = galleryStore.get(galleryId);
        if (!images || images.length === 0) return;
        if (index < 0 || index >= images.length) return;
        renderModal(galleryId, index);
    }

    function resetGalleries() {
        galleryStore.clear();
        gallerySeq = 0;
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeGallery();
    });

    window.DynamicGallery = {
        extractImages,
        createGalleryHtml,
        registerImages,
        hydrateStaticGalleries,
        open: openGallery,
        change: changeImage,
        close: closeGallery,
        reset: resetGalleries
    };
})();
