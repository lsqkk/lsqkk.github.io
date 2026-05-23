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
     * Create gallery grid HTML. Shows up to 9 images with "+X" overlay on the 9th.
     * Full image list is stored for modal viewing.
     * @param {string[]} images
     */
    function createGalleryHtml(images) {
        if (!Array.isArray(images) || images.length === 0) return '';
        const galleryId = nextGalleryId();
        galleryStore.set(galleryId, images);

        const total = images.length;
        const displayCount = Math.min(total, 9);
        const perRow = displayCount <= 4 ? 2 : 3;
        const rows = Math.ceil(displayCount / perRow);
        let html = `<div class="gallery-container" data-gallery-id="${galleryId}">`;

        let imgIdx = 0;
        for (let row = 0; row < rows; row += 1) {
            html += '<div class="gallery-row">';
            const start = row * perRow;
            const end = Math.min(start + perRow, displayCount);
            for (let i = start; i < end; i += 1, imgIdx += 1) {
                const image = images[imgIdx];
                const isOverflow = imgIdx === 8 && total > 9;
                html += `
                    <button type="button" class="gallery-item${isOverflow ? ' gallery-item-overflow' : ''}" aria-label="查看图片 ${imgIdx + 1}" onclick="DynamicGallery.open('${galleryId}', ${imgIdx})">
                        <img src="${image}" alt="动态图片 ${imgIdx + 1}" loading="lazy">
                        ${isOverflow ? `<div class="gallery-overlay">+${total - 9}</div>` : ''}
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

    // --- Current modal state (for keyboard + touch) ---
    let modalGalleryId = '';
    let modalIndex = 0;
    let touchStartX = 0;
    let touchStartY = 0;

    /**
     * @param {string} galleryId
     * @param {number} index
     */
    function renderModal(galleryId, index) {
        const images = galleryStore.get(galleryId);
        if (!images || images.length === 0) return;

        const existing = document.querySelector('.gallery-modal');
        if (existing) existing.remove();

        modalGalleryId = galleryId;
        modalIndex = index;

        const modal = document.createElement('div');
        modal.className = 'gallery-modal';
        modal.innerHTML = `
            <div class="gallery-modal-content">
                <button type="button" class="close-btn" onclick="DynamicGallery.close()" aria-label="关闭预览">&times;</button>
                <div class="gallery-modal-main" id="gallery-modal-main">
                    <img src="${images[index]}" class="current-image" alt="全屏图片">
                    <button type="button" class="gallery-nav-btn gallery-prev-btn" ${index === 0 ? 'style="display:none"' : ''} onclick="DynamicGallery.change('${galleryId}', ${index - 1})" aria-label="上一张"><span>❮</span></button>
                    <button type="button" class="gallery-nav-btn gallery-next-btn" ${index === images.length - 1 ? 'style="display:none"' : ''} onclick="DynamicGallery.change('${galleryId}', ${index + 1})" aria-label="下一张"><span>❯</span></button>
                    <div class="gallery-counter">${index + 1} / ${images.length}</div>
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

        // Touch swipe support
        const mainArea = modal.querySelector('#gallery-modal-main');
        if (mainArea) {
            mainArea.addEventListener('touchstart', (e) => {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }, { passive: true });

            mainArea.addEventListener('touchend', (e) => {
                const currentImages = galleryStore.get(modalGalleryId);
                if (!currentImages) return;
                const dx = e.changedTouches[0].clientX - touchStartX;
                const dy = e.changedTouches[0].clientY - touchStartY;
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                    if (dx < 0 && modalIndex < currentImages.length - 1) {
                        changeImage(modalGalleryId, modalIndex + 1);
                    } else if (dx > 0 && modalIndex > 0) {
                        changeImage(modalGalleryId, modalIndex - 1);
                    }
                }
            }, { passive: true });
        }

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        // Scroll thumbnail into view
        requestAnimationFrame(() => {
            const thumbs = modal.querySelector('.gallery-thumbnails');
            const active = modal.querySelector('.thumbnail.active');
            if (thumbs && active instanceof HTMLElement) {
                thumbs.scrollLeft = active.offsetLeft - thumbs.offsetWidth / 2 + active.offsetWidth / 2;
            }
        });
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
        if (!document.querySelector('.gallery-modal')) return;

        if (event.key === 'Escape') {
            closeGallery();
            return;
        }

        const currentImages = galleryStore.get(modalGalleryId);
        if (!currentImages) return;

        if (event.key === 'ArrowLeft' && modalIndex > 0) {
            changeImage(modalGalleryId, modalIndex - 1);
        } else if (event.key === 'ArrowRight' && modalIndex < currentImages.length - 1) {
            changeImage(modalGalleryId, modalIndex + 1);
        }
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
