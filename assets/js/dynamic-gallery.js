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
                        <img src="${image}" alt="动态图片 ${imgIdx + 1}" loading="lazy" data-skeleton-img onload="this.closest('.gallery-item')?.classList.add('is-loaded')" onerror="this.closest('.gallery-item')?.classList.add('is-loaded')">
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
    let modalEl = null;
    let modalGalleryId = '';
    let modalIndex = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let lastFocus = null;

    function ensureModal() {
        if (modalEl) return modalEl;

        modalEl = document.createElement('div');
        modalEl.className = 'gallery-modal';
        modalEl.setAttribute('role', 'dialog');
        modalEl.setAttribute('aria-modal', 'true');
        modalEl.setAttribute('aria-label', '图片查看');
        modalEl.innerHTML = `
            <div class="gallery-modal-content">
                <button type="button" class="close-btn" data-gallery-close aria-label="关闭预览">&times;</button>
                <div class="gallery-modal-main" id="gallery-modal-main">
                    <img class="current-image" alt="">
                    <button type="button" class="gallery-nav-btn gallery-prev-btn" data-gallery-prev aria-label="上一张"><span>‹</span></button>
                    <button type="button" class="gallery-nav-btn gallery-next-btn" data-gallery-next aria-label="下一张"><span>›</span></button>
                    <div class="gallery-counter"></div>
                </div>
                <div class="gallery-thumbnails"></div>
            </div>
        `;

        modalEl.addEventListener('click', (event) => {
            if (event.target === modalEl) closeGallery();
        });
        modalEl.querySelector('[data-gallery-close]')?.addEventListener('click', closeGallery);
        modalEl.querySelector('[data-gallery-prev]')?.addEventListener('click', () => changeImage(modalGalleryId, modalIndex - 1));
        modalEl.querySelector('[data-gallery-next]')?.addEventListener('click', () => changeImage(modalGalleryId, modalIndex + 1));

        const thumbs = modalEl.querySelector('.gallery-thumbnails');
        thumbs?.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target.closest('.thumbnail') : null;
            if (!target) return;
            changeImage(modalGalleryId, Number(target.dataset.index || '0'));
        });

        const mainArea = modalEl.querySelector('#gallery-modal-main');
        if (mainArea) {
            mainArea.addEventListener('touchstart', (event) => {
                touchStartX = event.touches[0].clientX;
                touchStartY = event.touches[0].clientY;
            }, { passive: true });

            mainArea.addEventListener('touchend', (event) => {
                const images = galleryStore.get(modalGalleryId);
                if (!images) return;
                const dx = event.changedTouches[0].clientX - touchStartX;
                const dy = event.changedTouches[0].clientY - touchStartY;
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                    if (dx < 0 && modalIndex < images.length - 1) changeImage(modalGalleryId, modalIndex + 1);
                    else if (dx > 0 && modalIndex > 0) changeImage(modalGalleryId, modalIndex - 1);
                }
            }, { passive: true });
        }

        return modalEl;
    }

    function updateModal() {
        const images = galleryStore.get(modalGalleryId) || [];
        if (!images.length || !modalEl) return;

        const image = modalEl.querySelector('.current-image');
        if (image instanceof HTMLImageElement) {
            image.classList.remove('is-loaded');
            image.src = images[modalIndex];
            image.alt = `图片 ${modalIndex + 1} / ${images.length}`;
            const markLoaded = () => image.classList.add('is-loaded');
            if (image.complete && image.naturalWidth > 0) markLoaded();
            else image.addEventListener('load', markLoaded, { once: true });
        }

        const counter = modalEl.querySelector('.gallery-counter');
        if (counter) counter.textContent = `${modalIndex + 1} / ${images.length}`;

        const prev = modalEl.querySelector('[data-gallery-prev]');
        const next = modalEl.querySelector('[data-gallery-next]');
        if (prev instanceof HTMLElement) prev.style.display = modalIndex === 0 ? 'none' : '';
        if (next instanceof HTMLElement) next.style.display = modalIndex === images.length - 1 ? 'none' : '';

        const thumbs = modalEl.querySelector('.gallery-thumbnails');
        if (thumbs) {
            thumbs.innerHTML = images.map((url, i) => `
                <img src="${url}" class="thumbnail ${i === modalIndex ? 'active' : ''}" data-index="${i}" alt="缩略图 ${i + 1}" loading="lazy">
            `).join('');
            requestAnimationFrame(() => {
                const active = thumbs.querySelector('.thumbnail.active');
                if (active instanceof HTMLElement) {
                    thumbs.scrollLeft = active.offsetLeft - thumbs.offsetWidth / 2 + active.offsetWidth / 2;
                }
            });
        }

        [images[modalIndex - 1], images[modalIndex + 1]].forEach((url) => {
            if (!url) return;
            const preload = new Image();
            preload.src = url;
        });
    }

    /**
     * @param {string} galleryId
     * @param {number} index
     */
    function renderModal(galleryId, index) {
        const images = galleryStore.get(galleryId);
        if (!images || images.length === 0) return;

        modalGalleryId = galleryId;
        modalIndex = index;

        const firstOpen = !modalEl || !modalEl.isConnected;
        ensureModal();
        if (firstOpen) {
            lastFocus = document.activeElement;
            document.body.appendChild(modalEl);
            document.body.classList.add('gallery-open');
        }
        updateModal();

        if (firstOpen) {
            modalEl.querySelector('[data-gallery-close]')?.focus({ preventScroll: true });
        }
    }

    function closeGallery() {
        if (!modalEl) return;
        modalEl.remove();
        modalEl = null;
        document.body.classList.remove('gallery-open');
        if (lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll: true });
        lastFocus = null;
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

    /**
     * Initialize skeleton loading: add is-loaded class when images finish loading.
     * Handles both cached (already complete) and fresh images.
     * @param {ParentNode} [root=document]
     */
    function initSkeletonImages(root) {
        root = root || document;
        root.querySelectorAll('img[data-skeleton-img]').forEach(function (img) {
            if (!(img instanceof HTMLImageElement)) return;
            if (img.dataset.skeletonInit === 'true') return;
            img.dataset.skeletonInit = 'true';

            var parent = img.closest('.gallery-item');
            if (!parent) return;

            if (img.complete && img.naturalWidth > 0) {
                parent.classList.add('is-loaded');
                return;
            }

            img.addEventListener('load', function () {
                parent.classList.add('is-loaded');
            }, { once: true });

            img.addEventListener('error', function () {
                parent.classList.add('is-loaded');
            }, { once: true });
        });
    }

    // Auto-initialize on DOMContentLoaded for already-rendered content
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initSkeletonImages();
        });
    } else {
        initSkeletonImages();
    }

    window.DynamicGallery = {
        extractImages,
        createGalleryHtml,
        registerImages,
        hydrateStaticGalleries,
        initSkeletonImages,
        open: openGallery,
        change: changeImage,
        close: closeGallery,
        reset: resetGalleries
    };
})();
