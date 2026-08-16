/* =========================================================
   spotdiff.js - 找不同辅助
   上传找不同截屏 -> 拖拽参考线分割 A/B -> 逐像素作差 -> 高亮差异
   纯原生 JS + Canvas，localStorage 持久化（spotdiff-settings-v1）
   ========================================================= */
(() => {
    'use strict';

    // ---------- DOM ----------
    const $ = (id) => document.getElementById(id);
    const els = {
        uploadArea: $('sd-upload-area'),
        fileInput: $('sd-file'),
        uploadError: $('sd-upload-error'),
        splitPanel: $('sd-split'),
        modeBtns: document.querySelectorAll('[data-mode]'),
        resetLinesBtn: $('sd-reset-lines'),
        stage: $('sd-stage'),
        stageNote: $('sd-stage-note'),
        paramPanel: $('sd-param'),
        threshold: $('sd-threshold'),
        thresholdVal: $('sd-threshold-val'),
        denoise: $('sd-denoise'),
        denoiseVal: $('sd-denoise-val'),
        autoAlign: $('sd-auto-align'),
        minSize: $('sd-min-size'),
        runBtn: $('sd-run'),
        resultPanel: $('sd-result'),
        viewBtns: document.querySelectorAll('[data-view]'),
        zoomIn: $('sd-zoom-in'),
        zoomOut: $('sd-zoom-out'),
        resetView: $('sd-reset-view'),
        download: $('sd-download'),
        result: $('sd-result-canvas'),
        emptyBanner: $('sd-empty-banner'),
        stats: $('sd-stats'),
        steps: document.querySelectorAll('.sd-step'),
    };

    // ---------- 常量 ----------
    const LS_KEY = 'spotdiff-settings-v1';
    const MAX_EDGE = 2400;      // 最长边 > 此值则降采样
    const HIT_RADIUS = 12;      // 参考线命中半径（CSS px）
    const MIN_GAP = 0.005;      // 线之间的最小间距（ratio）
    const MAX_BOXES = 30;       // 区域框选上限
    const VIEWS = ['orig', 'heatmap', 'diff', 'mark', 'boxes'];
    const LINE_ORDER = ['main', 'divider', 'aux'];
    const LINE_LABELS = {
        main: '主参考线',
        divider: '分隔线',
        aux: '辅参考线',
    };
    const LINE_COLORS = {
        main: '#2367d7',
        divider: '#ff5a5a',
        aux: '#2367d7',
    };

    // ---------- 状态 ----------
    const state = {
        srcCanvas: null,        // offscreen 源图（降采样后），唯一绘制来源
        workW: 0,
        workH: 0,
        downsampled: false,
        mode: 'h',              // 'h' 左右并列 | 'v' 上下堆叠
        lines: {
            h: { main: 0, divider: 0.5, aux: 1 },
            v: { main: 0, divider: 0.5, aux: 1 },
        },
        settings: {
            threshold: 32,
            denoise: 0,
            autoAlign: true,
            minSize: 3,
            view: 'heatmap',
        },
        // 参考线画布（stage）
        stageScale: 1,
        drag: null,             // { line, pointerId }
        // 结果
        result: null,           // { out, mask, base, count, maxD, boxes, rectA, rectB, offset, compW, compH, empty, offA }
        viewScale: 1,
        viewOX: 0,
        viewOY: 0,
        viewDPR: 1,
        viewDrag: null,         // { pointerId, lastX, lastY }
    };

    // ---------- 小工具 ----------
    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function newCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    }
    function subtractMean(arr) {
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += arr[i];
        const m = s / arr.length;
        for (let i = 0; i < arr.length; i++) arr[i] -= m;
    }

    // ---------- localStorage ----------
    function defaultSettings() {
        return {
            version: 1,
            mode: 'h',
            lines: {
                h: { main: 0, divider: 0.5, aux: 1 },
                v: { main: 0, divider: 0.5, aux: 1 },
            },
            settings: {
                threshold: 32,
                denoise: 0,
                autoAlign: true,
                minSize: 3,
                view: 'heatmap',
            },
        };
    }
    function loadSettings() {
        const def = defaultSettings();
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return def;
            const d = JSON.parse(raw);
            if (!d || d.version !== 1) return def;
            const s = Object.assign({}, def, d);
            s.settings = Object.assign({}, def.settings, d.settings || {});
            for (const m of ['h', 'v']) {
                s.lines[m] = Object.assign({}, def.lines[m], (d.lines && d.lines[m]) || {});
            }
            if (s.mode !== 'h' && s.mode !== 'v') s.mode = def.mode;
            return s;
        } catch (e) {
            return def;
        }
    }
    let saveTimer = null;
    function saveSettings() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try {
                localStorage.setItem(LS_KEY, JSON.stringify({
                    version: 1,
                    mode: state.mode,
                    lines: state.lines,
                    settings: state.settings,
                }));
            } catch (e) { /* localStorage 不可用时静默降级 */ }
        }, 200);
    }

    // ---------- UI 同步 ----------
    function setStep(n) {
        els.steps.forEach((s, i) => s.classList.toggle('is-active', i <= n));
    }
    function showError(msg) {
        els.uploadError.textContent = msg;
        setTimeout(() => {
            if (els.uploadError.textContent === msg) els.uploadError.textContent = '';
        }, 4000);
    }
    function syncViewBtns() {
        els.viewBtns.forEach((b) => {
            b.classList.toggle('is-active', b.dataset.view === state.settings.view);
            if (b.dataset.view === 'boxes' && state.result && state.result.empty) {
                b.disabled = true;
            } else {
                b.disabled = false;
            }
        });
    }
    function hasValidRects() {
        if (!state.srcCanvas) return false;
        const { rectA, rectB } = computeRects();
        return rectA.w > 0 && rectA.h > 0 && rectB.w > 0 && rectB.h > 0;
    }
    function syncRunBtn() {
        els.runBtn.disabled = !hasValidRects();
    }

    // ---------- 参考线分割 ----------
    function computeRects() {
        const { main, divider, aux } = state.lines[state.mode];
        const w = state.workW;
        const h = state.workH;
        let rectA, rectB;
        if (state.mode === 'h') {
            const x1 = Math.round(main * w);
            const xd = Math.round(divider * w);
            const x2 = Math.round(aux * w);
            rectA = { x: x1, y: 0, w: Math.max(1, xd - x1), h };
            rectB = { x: xd, y: 0, w: Math.max(1, x2 - xd), h };
        } else {
            const y1 = Math.round(main * h);
            const yd = Math.round(divider * h);
            const y2 = Math.round(aux * h);
            rectA = { x: 0, y: y1, w, h: Math.max(1, yd - y1) };
            rectB = { x: 0, y: yd, w, h: Math.max(1, y2 - yd) };
        }
        return { rectA, rectB };
    }

    // ---------- 图像加载 ----------
    async function loadImage(file) {
        els.uploadError.textContent = '';
        let bitmap = null;
        let imgUrl = null;
        let drawSrc = null;
        let width = 0;
        let height = 0;
        try {
            if ('createImageBitmap' in window) {
                bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
                width = bitmap.width;
                height = bitmap.height;
                drawSrc = bitmap;
            }
        } catch (e) { /* 回退到 Image */ }
        if (!drawSrc) {
            try {
                const img = new Image();
                imgUrl = URL.createObjectURL(file);
                await new Promise((res, rej) => {
                    img.onload = res;
                    img.onerror = rej;
                    img.src = imgUrl;
                });
                width = img.naturalWidth;
                height = img.naturalHeight;
                drawSrc = img;
            } catch (e) {
                showError('图片无效，请重试');
                return;
            }
        }
        if (!width || !height) {
            showError('图片无效，请重试');
            releaseSrc();
            return;
        }
        if (width < 16 || height < 16) {
            showError('图片过小（小于 16px），无法处理');
            releaseSrc();
            return;
        }
        // 降采样
        const maxEdge = Math.max(width, height);
        let scale = 1;
        if (maxEdge > MAX_EDGE) scale = MAX_EDGE / maxEdge;
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        state.downsampled = scale < 1;

        const canvas = newCanvas(w, h);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        // 透明 PNG 先铺白底，避免 alpha 产生伪差异
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(drawSrc, 0, 0, w, h);
        releaseSrc();

        state.srcCanvas = canvas;
        state.workW = w;
        state.workH = h;
        state.result = null;
        state.viewScale = 1;
        state.viewOX = 0;
        state.viewOY = 0;

        els.splitPanel.classList.remove('sd-hidden');
        els.paramPanel.classList.remove('sd-hidden');
        els.resultPanel.classList.add('sd-hidden');
        els.stageNote.textContent = state.downsampled
            ? `已降采样至 ${w}×${h}（原始 ${width}×${height}）`
            : `${w}×${h}`;
        setStep(1);
        fitStage();
        drawStage();
        syncRunBtn();
        saveSettings();

        function releaseSrc() {
            if (bitmap) { bitmap.close(); bitmap = null; }
            if (imgUrl) { URL.revokeObjectURL(imgUrl); imgUrl = null; }
        }
    }

    // ---------- 参考线画布（stage） ----------
    function fitStage() {
        if (!state.srcCanvas) return;
        const wrap = els.stage.parentElement;
        const availW = wrap.clientWidth - 2;
        const availH = Math.min(window.innerHeight * 0.7, 600);
        if (availW <= 0) return;
        const scale = Math.min(availW / state.workW, availH / state.workH);
        const dispW = Math.max(1, Math.round(state.workW * scale));
        const dispH = Math.max(1, Math.round(state.workH * scale));
        state.stageScale = dispW / state.workW; // CSS px / image px
        const dpr = window.devicePixelRatio || 1;
        els.stage.style.width = dispW + 'px';
        els.stage.style.height = dispH + 'px';
        els.stage.style.margin = '0 auto';
        els.stage.width = Math.round(dispW * dpr);
        els.stage.height = Math.round(dispH * dpr);
    }

    function drawStage() {
        if (!state.srcCanvas) return;
        const ctx = els.stage.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, els.stage.width, els.stage.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
            state.srcCanvas,
            0, 0,
            state.workW * state.stageScale,
            state.workH * state.stageScale
        );

        const isH = state.mode === 'h';
        const len = isH ? state.workW : state.workH;
        const px = (r) => r * len * state.stageScale;
        const { main, divider, aux } = state.lines[state.mode];
        const pMain = px(main);
        const pDiv = px(divider);
        const pAux = px(aux);
        const full = isH ? state.workH * state.stageScale : state.workW * state.stageScale;

        // A/B 区域染色
        ctx.save();
        ctx.fillStyle = 'rgba(35,103,215,0.06)'; // A 区（accent）
        if (isH) {
            ctx.fillRect(pMain, 0, pDiv - pMain, full);
            ctx.fillStyle = 'rgba(14,165,163,0.06)'; // B 区（accent-2）
            ctx.fillRect(pDiv, 0, pAux - pDiv, full);
        } else {
            ctx.fillRect(0, pMain, full, pDiv - pMain);
            ctx.fillStyle = 'rgba(14,165,163,0.06)';
            ctx.fillRect(0, pDiv, full, pAux - pDiv);
        }
        ctx.restore();

        drawLine(ctx, pMain, 'main', isH, full);
        drawLine(ctx, pDiv, 'divider', isH, full);
        drawLine(ctx, pAux, 'aux', isH, full);
    }

    function drawLine(ctx, pos, type, isH, full) {
        const label = LINE_LABELS[type];
        ctx.save();
        ctx.strokeStyle = LINE_COLORS[type];
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (isH) {
            ctx.moveTo(pos, 0);
            ctx.lineTo(pos, full);
        } else {
            ctx.moveTo(0, pos);
            ctx.lineTo(full, pos);
        }
        ctx.stroke();
        // 标签小牌
        ctx.font = '11px sans-serif';
        const tw = ctx.measureText(label).width + 10;
        let lx, ly;
        if (isH) {
            lx = clamp(pos - tw / 2, 2, full - tw - 2);
            ly = 4;
        } else {
            lx = 4;
            ly = clamp(pos - 15, 2, full - 18);
        }
        ctx.fillStyle = LINE_COLORS[type];
        ctx.fillRect(lx, ly, tw, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, lx + 5, ly + 12);
        ctx.restore();
    }

    function hitTestLine(e) {
        const rect = els.stage.getBoundingClientRect();
        const isH = state.mode === 'h';
        const len = isH ? state.workW : state.workH;
        let best = null;
        let bestDist = HIT_RADIUS;
        for (const type of LINE_ORDER) {
            const pos = state.lines[state.mode][type] * len * state.stageScale;
            const dist = isH
                ? Math.abs(e.clientX - rect.left - pos)
                : Math.abs(e.clientY - rect.top - pos);
            if (dist < bestDist) {
                bestDist = dist;
                best = type;
            }
        }
        return best;
    }

    function lineRatioFromEvent(e) {
        const rect = els.stage.getBoundingClientRect();
        const isH = state.mode === 'h';
        const len = isH ? state.workW : state.workH;
        const cssLen = len * state.stageScale;
        const raw = isH ? e.clientX - rect.left : e.clientY - rect.top;
        return clamp01(raw / cssLen);
    }

    // ---------- 参考线交互 ----------
    els.stage.addEventListener('pointerdown', (e) => {
        if (!state.srcCanvas) return;
        const line = hitTestLine(e);
        els.stage.setPointerCapture(e.pointerId);
        state.drag = { line, pointerId: e.pointerId };
        els.stage.classList.add('sd-dragging');
        e.preventDefault();
    });

    els.stage.addEventListener('pointermove', (e) => {
        if (!state.srcCanvas) return;
        if (state.drag && state.drag.pointerId === e.pointerId) {
            const ratio = lineRatioFromEvent(e);
            const lines = state.lines[state.mode];
            const gap = Math.max(1 / (state.mode === 'h' ? state.workW : state.workH), MIN_GAP);
            const type = state.drag.line;
            if (type === 'main') lines.main = clamp(ratio, 0, lines.divider - gap);
            else if (type === 'aux') lines.aux = clamp(ratio, lines.divider + gap, 1);
            else lines.divider = clamp(ratio, lines.main + gap, lines.aux - gap);
            drawStage();
        } else {
            const line = hitTestLine(e);
            els.stage.style.cursor = line
                ? (state.mode === 'h' ? 'ew-resize' : 'ns-resize')
                : 'grab';
        }
    });

    function endDrag(e) {
        if (!state.drag || state.drag.pointerId !== e.pointerId) return;
        els.stage.releasePointerCapture(e.pointerId);
        els.stage.classList.remove('sd-dragging');
        state.drag = null;
        saveSettings();
        syncRunBtn();
        scheduleRecompute();
    }
    els.stage.addEventListener('pointerup', endDrag);
    els.stage.addEventListener('pointercancel', endDrag);

    els.stage.addEventListener('dblclick', (e) => {
        if (!state.srcCanvas) return;
        const line = hitTestLine(e);
        const lines = state.lines[state.mode];
        if (line === 'main') lines.main = 0;
        else if (line === 'aux') lines.aux = 1;
        else if (line === 'divider') lines.divider = (lines.main + lines.aux) / 2;
        else {
            lines.main = 0;
            lines.aux = 1;
            lines.divider = 0.5;
        }
        drawStage();
        saveSettings();
        syncRunBtn();
        scheduleRecompute();
    });

    // ---------- 模式 / 重置 ----------
    function setMode(mode) {
        if (mode !== 'h' && mode !== 'v') return;
        state.mode = mode;
        els.modeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
        if (state.srcCanvas) {
            fitStage();
            drawStage();
        }
        syncRunBtn();
        saveSettings();
        scheduleRecompute();
    }
    els.modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

    els.resetLinesBtn.addEventListener('click', () => {
        state.lines[state.mode] = { main: 0, divider: 0.5, aux: 1 };
        if (state.srcCanvas) drawStage();
        syncRunBtn();
        saveSettings();
        scheduleRecompute();
    });

    // ---------- 上传 ----------
    els.uploadArea.addEventListener('click', () => els.fileInput.click());
    els.uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        els.uploadArea.classList.add('sd-active');
    });
    els.uploadArea.addEventListener('dragleave', () => els.uploadArea.classList.remove('sd-active'));
    els.uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        els.uploadArea.classList.remove('sd-active');
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) loadImage(f);
    });
    els.fileInput.addEventListener('change', () => {
        const f = els.fileInput.files && els.fileInput.files[0];
        if (f) {
            loadImage(f);
            els.fileInput.value = '';
        }
    });
    window.addEventListener('paste', (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const it of items) {
            if (it.type && it.type.startsWith('image/')) {
                const f = it.getAsFile();
                if (f) {
                    loadImage(f);
                    return;
                }
            }
        }
    });

    // ---------- 灰度采样 / 自动对齐 ----------
    function lumaOf(src, rect, w, h) {
        const c = newCanvas(w, h);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const l = new Float32Array(w * h);
        for (let i = 0, p = 0; i < w * h; i++, p += 4) {
            l[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        }
        return l;
    }

    function estimateOffset(src, rectA, rectB, mode, maxOffset) {
        // 粗搜：沿分隔轴在降采样尺度上做 SAD（带减均值抗亮度差）
        const coarseScale = Math.min(0.25, 320 / Math.max(rectA.w, rectA.h));
        const sw = Math.max(8, Math.round(rectA.w * coarseScale));
        const sh = Math.max(8, Math.round(rectA.h * coarseScale));
        const la = lumaOf(src, rectA, sw, sh);
        const lb = lumaOf(src, rectB, sw, sh);
        subtractMean(la);
        subtractMean(lb);
        const mo = Math.max(1, Math.min(maxOffset, Math.floor(sw * 0.4)));
        const axis = mode === 'h' ? 'x' : 'y';
        let bestScore = Infinity;
        let bestDx = 0;
        let bestDy = 0;
        for (let i = -mo; i <= mo; i++) {
            const dx = axis === 'x' ? i : 0;
            const dy = axis === 'y' ? i : 0;
            const ox0 = Math.max(0, -dx);
            const oy0 = Math.max(0, -dy);
            const ow = sw - Math.abs(dx);
            const oh = sh - Math.abs(dy);
            if (ow <= 0 || oh <= 0) continue;
            const n = ow * oh;
            let s = 0;
            for (let y = 0; y < oh; y++) {
                const rowA = (oy0 + y) * sw + ox0;
                const rowB = (oy0 + y + dy) * sw + ox0 + dx;
                for (let x = 0; x < ow; x++) {
                    const v = la[rowA + x] - lb[rowB + x];
                    s += v < 0 ? -v : v;
                }
            }
            // 正则项：平坦区域偏向零偏移
            const score = s / n + 0.01 * (dx * dx + dy * dy);
            if (score < bestScore) {
                bestScore = score;
                bestDx = dx;
                bestDy = dy;
            }
        }
        const fullDx = Math.round(bestDx / coarseScale);
        const fullDy = Math.round(bestDy / coarseScale);

        // 精修：半尺度中心条带 ±3（二维）
        const rScale = 0.5;
        const strip = mode === 'h'
            ? {
                a: { x: rectA.x, y: rectA.y + Math.round(rectA.h * 0.2), w: rectA.w, h: Math.max(1, Math.round(rectA.h * 0.6)) },
                b: { x: rectB.x, y: rectB.y + Math.round(rectB.h * 0.2), w: rectB.w, h: Math.max(1, Math.round(rectB.h * 0.6)) },
            }
            : {
                a: { x: rectA.x + Math.round(rectA.w * 0.2), y: rectA.y, w: Math.max(1, Math.round(rectA.w * 0.6)), h: rectA.h },
                b: { x: rectB.x + Math.round(rectB.w * 0.2), y: rectB.y, w: Math.max(1, Math.round(rectB.w * 0.6)), h: rectB.h },
            };
        const rw = Math.max(8, Math.round(strip.a.w * rScale));
        const rh = Math.max(8, Math.round(strip.a.h * rScale));
        const sA = lumaOf(src, strip.a, rw, rh);
        const sB = lumaOf(src, strip.b, rw, rh);
        subtractMean(sA);
        subtractMean(sB);
        const cx = Math.round(fullDx / 2);
        const cy = Math.round(fullDy / 2);
        let bestS = Infinity;
        let best = { dx: cx, dy: cy };
        for (let dx = cx - 3; dx <= cx + 3; dx++) {
            for (let dy = cy - 3; dy <= cy + 3; dy++) {
                const ox0 = Math.max(0, -dx);
                const oy0 = Math.max(0, -dy);
                const ow = rw - Math.abs(dx);
                const oh = rh - Math.abs(dy);
                if (ow <= 0 || oh <= 0) continue;
                let s = 0;
                for (let y = 0; y < oh; y++) {
                    const rowA = (oy0 + y) * rw + ox0;
                    const rowB = (oy0 + y + dy) * rw + ox0 + dx;
                    for (let x = 0; x < ow; x++) {
                        const v = sA[rowA + x] - sB[rowB + x];
                        s += v < 0 ? -v : v;
                    }
                }
                if (s < bestS) {
                    bestS = s;
                    best.dx = dx;
                    best.dy = dy;
                }
            }
        }
        return { dx: best.dx * 2, dy: best.dy * 2 };
    }

    function clampOffset(off, rectB) {
        const srcW = state.workW;
        const srcH = state.workH;
        let dx = off.dx;
        let dy = off.dy;
        if (rectB.x + dx < 0) dx = -rectB.x;
        if (rectB.y + dy < 0) dy = -rectB.y;
        if (rectB.x + dx + rectB.w > srcW) dx = srcW - rectB.x - rectB.w;
        if (rectB.y + dy + rectB.h > srcH) dy = srcH - rectB.y - rectB.h;
        return { dx: Math.round(dx), dy: Math.round(dy) };
    }

    // ---------- 降噪（分离式 box blur） ----------
    function boxBlur(data, w, h, r) {
        const tmp = new Uint8ClampedArray(data.length);
        const win = 2 * r + 1;
        // 水平
        for (let y = 0; y < h; y++) {
            const row = y * w * 4;
            for (let ch = 0; ch < 4; ch++) {
                const base = row + ch;
                let sum = 0;
                for (let k = -r; k <= r; k++) {
                    sum += data[base + Math.max(0, Math.min(w - 1, k)) * 4];
                }
                tmp[base] = sum / win;
                for (let x = 1; x < w; x++) {
                    const xOut = x + r;
                    const xIn = x - r - 1;
                    sum += data[base + Math.min(w - 1, xOut) * 4]
                        - data[base + Math.max(0, xIn) * 4];
                    tmp[base + x * 4] = sum / win;
                }
            }
        }
        // 垂直
        for (let x = 0; x < w; x++) {
            const col = x * 4;
            for (let ch = 0; ch < 4; ch++) {
                const base = col + ch;
                let sum = 0;
                for (let k = -r; k <= r; k++) {
                    sum += tmp[Math.max(0, Math.min(h - 1, k)) * w * 4 + base];
                }
                data[base] = sum / win;
                for (let y = 1; y < h; y++) {
                    const yOut = y + r;
                    const yIn = y - r - 1;
                    sum += tmp[Math.min(h - 1, yOut) * w * 4 + base]
                        - tmp[Math.max(0, yIn) * w * 4 + base];
                    data[y * w * 4 + base] = sum / win;
                }
            }
        }
    }

    // ---------- 连通域聚类 ----------
    const NB8 = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0], [1, 0],
        [-1, 1], [0, 1], [1, 1],
    ];
    function labelComponents(mask, w, h, minSize) {
        const visited = new Uint8Array(w * h);
        const boxes = [];
        for (let i = 0; i < w * h; i++) {
            if (!mask[i] || visited[i]) continue;
            const stack = [i];
            visited[i] = 1;
            let cnt = 0;
            let x0 = w, y0 = h, x1 = 0, y1 = 0;
            while (stack.length) {
                const p = stack.pop();
                const x = p % w;
                const y = (p / w) | 0;
                cnt++;
                if (x < x0) x0 = x;
                if (y < y0) y0 = y;
                if (x > x1) x1 = x;
                if (y > y1) y1 = y;
                for (let k = 0; k < 8; k++) {
                    const nx = x + NB8[k][0];
                    const ny = y + NB8[k][1];
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    const q = ny * w + nx;
                    if (mask[q] && !visited[q]) {
                        visited[q] = 1;
                        stack.push(q);
                    }
                }
            }
            if (cnt >= minSize) {
                boxes.push({ id: boxes.length + 1, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, count: cnt });
            }
        }
        boxes.sort((a, b) => b.count - a.count);
        return boxes.slice(0, MAX_BOXES);
    }

    // ---------- 差异计算 ----------
    function computeDiff() {
        if (!state.srcCanvas || !hasValidRects()) return;
        const { rectA, rectB } = computeRects();
        const compW = rectA.w;
        const compH = rectA.h;

        const offA = newCanvas(compW, compH);
        const offB = newCanvas(compW, compH);
        const ctxA = offA.getContext('2d', { willReadFrequently: true });
        const ctxB = offB.getContext('2d', { willReadFrequently: true });
        ctxA.imageSmoothingEnabled = false;
        ctxB.imageSmoothingEnabled = false;

        // 自动对齐
        let offset = { dx: 0, dy: 0 };
        if (state.settings.autoAlign) {
            const est = estimateOffset(state.srcCanvas, rectA, rectB, state.mode, 12);
            offset = clampOffset(est, rectB);
        }
        ctxA.drawImage(state.srcCanvas, rectA.x, rectA.y, rectA.w, rectA.h, 0, 0, compW, compH);
        ctxB.drawImage(state.srcCanvas, rectB.x + offset.dx, rectB.y + offset.dy, rectB.w, rectB.h, 0, 0, compW, compH);

        const imgA = ctxA.getImageData(0, 0, compW, compH);
        const imgB = ctxB.getImageData(0, 0, compW, compH);
        if (state.settings.denoise > 0) {
            boxBlur(imgA.data, compW, compH, state.settings.denoise);
            boxBlur(imgB.data, compW, compH, state.settings.denoise);
            ctxA.putImageData(imgA, 0, 0);
            ctxB.putImageData(imgB, 0, 0);
        }
        const da = imgA.data;
        const db = imgB.data;
        const n = compW * compH;
        const out = new Uint8Array(n);
        const mask = new Uint8Array(n);
        const thr = state.settings.threshold;
        let count = 0;
        let maxD = 0;
        for (let i = 0, p = 0; i < n; i++, p += 4) {
            const dr = da[p] - db[p];
            const dg = da[p + 1] - db[p + 1];
            const dbb = da[p + 2] - db[p + 2];
            let d = dr < 0 ? -dr : dr;
            let t = dg < 0 ? -dg : dg;
            if (t > d) d = t;
            t = dbb < 0 ? -dbb : dbb;
            if (t > d) d = t;
            out[i] = d;
            if (d > maxD) maxD = d;
            if (d >= thr) {
                mask[i] = 1;
                count++;
            }
        }
        const boxes = labelComponents(mask, compW, compH, state.settings.minSize);

        state.result = {
            out,
            mask,
            base: da,
            offA,
            count,
            maxD,
            boxes,
            rectA,
            rectB,
            offset,
            compW,
            compH,
            empty: count === 0,
        };

        els.resultPanel.classList.remove('sd-hidden');
        els.emptyBanner.classList.toggle('sd-hidden', !state.result.empty);
        setStep(3);
        fitResultCanvas();
        updateStats();
        syncViewBtns();
    }

    // 阈值 / 最小区域变化时，仅从已缓存 diff 重算 mask（廉价）
    function recomputeMask() {
        const r = state.result;
        if (!r) return;
        const thr = state.settings.threshold;
        const n = r.compW * r.compH;
        r.mask.fill(0);
        let count = 0;
        for (let i = 0; i < n; i++) {
            if (r.out[i] >= thr) {
                r.mask[i] = 1;
                count++;
            }
        }
        r.count = count;
        r.boxes = labelComponents(r.mask, r.compW, r.compH, state.settings.minSize);
        r.empty = count === 0;
        els.emptyBanner.classList.toggle('sd-hidden', !r.empty);
        updateStats();
        syncViewBtns();
        renderResultView();
    }

    let recomputeTimer = null;
    function scheduleRecompute() {
        if (recomputeTimer) clearTimeout(recomputeTimer);
        recomputeTimer = setTimeout(() => {
            if (state.result) computeDiff();
        }, 200);
    }

    // ---------- 结果渲染 ----------
    function renderViewInto(ctx, view) {
        const r = state.result;
        const compW = r.compW;
        const compH = r.compH;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, compW, compH);
        if (view === 'orig') {
            ctx.drawImage(r.offA, 0, 0);
            return;
        }
        const imgData = ctx.createImageData(compW, compH);
        const d = imgData.data;
        const base = r.base;
        const out = r.out;
        const mask = r.mask;
        for (let i = 0, p = 0; i < compW * compH; i++, p += 4) {
            const diff = out[i];
            if (view === 'heatmap') {
                d[p] = diff;
                d[p + 1] = 0;
                d[p + 2] = 0;
                d[p + 3] = 255;
            } else if (view === 'diff') {
                d[p] = diff;
                d[p + 1] = diff;
                d[p + 2] = diff;
                d[p + 3] = 255;
            } else { // mark / boxes：底图为 A，差异处叠红
                d[p] = base[p];
                d[p + 1] = base[p + 1];
                d[p + 2] = base[p + 2];
                d[p + 3] = 255;
                if (mask[i]) {
                    d[p] = 255;
                    d[p + 1] = (base[p + 1] * 0.4) | 0;
                    d[p + 2] = (base[p + 2] * 0.4) | 0;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
        if (view === 'boxes') drawBoxes(ctx, r.boxes, 1);
    }

    function drawBoxes(ctx, boxes, scale) {
        if (!boxes.length) return;
        ctx.save();
        ctx.strokeStyle = '#ff3b3b';
        ctx.lineWidth = 2 / scale;
        for (const b of boxes) {
            ctx.strokeRect(b.x + 0.5, b.y + 0.5, Math.max(1, b.w - 1), Math.max(1, b.h - 1));
            const label = String(b.id);
            ctx.font = 'bold 13px sans-serif';
            const tw = ctx.measureText(label).width + 8;
            const cx = Math.max(0, b.x);
            const cy = Math.max(0, b.y - 18);
            ctx.fillStyle = '#ff3b3b';
            ctx.fillRect(cx, cy, tw, 16);
            ctx.fillStyle = '#fff';
            ctx.fillText(label, cx + 4, cy + 12);
        }
        ctx.restore();
    }

    function renderResultView() {
        if (!state.result) return;
        const ctx = els.result.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, els.result.width, els.result.height);
        ctx.setTransform(state.viewScale, 0, 0, state.viewScale, state.viewOX, state.viewOY);
        ctx.imageSmoothingEnabled = false;
        renderViewInto(ctx, state.settings.view);
        if (state.settings.view === 'boxes') {
            drawBoxes(ctx, state.result.boxes, state.viewScale);
        }
    }

    // ---------- 结果画布适配 / 缩放平移 ----------
    function fitResultCanvas() {
        const r = state.result;
        if (!r) return;
        const dpr = window.devicePixelRatio || 1;
        state.viewDPR = dpr;
        const wrap = els.result.parentElement;
        const availW = Math.max(1, wrap.clientWidth - 2);
        const aspect = r.compW / r.compH;
        let dispW = availW;
        let dispH = dispW / aspect;
        const maxH = Math.min(window.innerHeight * 0.7, 560);
        if (dispH > maxH) {
            dispH = maxH;
            dispW = dispH * aspect;
        }
        els.result.style.width = dispW + 'px';
        els.result.style.height = dispH + 'px';
        els.result.width = Math.round(dispW * dpr);
        els.result.height = Math.round(dispH * dpr);
        // 初始适配
        state.viewScale = (dispW * dpr) / r.compW;
        state.viewOX = 0;
        state.viewOY = 0;
        renderResultView();
    }

    function zoomAt(cx, cy, factor) {
        const newScale = clamp(state.viewScale * factor, 0.02, 40);
        const k = newScale / state.viewScale;
        state.viewOX = cx - (cx - state.viewOX) * k;
        state.viewOY = cy - (cy - state.viewOY) * k;
        state.viewScale = newScale;
        renderResultView();
    }

    els.result.addEventListener('wheel', (e) => {
        if (!state.result) return;
        e.preventDefault();
        const rect = els.result.getBoundingClientRect();
        const cx = (e.clientX - rect.left) * state.viewDPR;
        const cy = (e.clientY - rect.top) * state.viewDPR;
        zoomAt(cx, cy, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    els.result.addEventListener('pointerdown', (e) => {
        if (!state.result) return;
        els.result.setPointerCapture(e.pointerId);
        state.viewDrag = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
        els.result.classList.add('sd-dragging');
    });
    els.result.addEventListener('pointermove', (e) => {
        if (state.viewDrag && state.viewDrag.pointerId === e.pointerId) {
            const dx = e.clientX - state.viewDrag.lastX;
            const dy = e.clientY - state.viewDrag.lastY;
            state.viewDrag.lastX = e.clientX;
            state.viewDrag.lastY = e.clientY;
            state.viewOX += dx * state.viewDPR;
            state.viewOY += dy * state.viewDPR;
            renderResultView();
        }
    });
    function endViewDrag(e) {
        if (state.viewDrag && state.viewDrag.pointerId === e.pointerId) {
            els.result.releasePointerCapture(e.pointerId);
            els.result.classList.remove('sd-dragging');
            state.viewDrag = null;
        }
    }
    els.result.addEventListener('pointerup', endViewDrag);
    els.result.addEventListener('pointercancel', endViewDrag);

    els.zoomIn.addEventListener('click', () => {
        if (!state.result) return;
        const w = els.result.width / 2;
        const h = els.result.height / 2;
        zoomAt(w, h, 1.3);
    });
    els.zoomOut.addEventListener('click', () => {
        if (!state.result) return;
        const w = els.result.width / 2;
        const h = els.result.height / 2;
        zoomAt(w, h, 1 / 1.3);
    });
    els.resetView.addEventListener('click', () => {
        if (!state.result) return;
        const dpr = window.devicePixelRatio || 1;
        const dispW = parseFloat(els.result.style.width) || els.result.parentElement.clientWidth;
        state.viewScale = (dispW * dpr) / state.result.compW;
        state.viewOX = 0;
        state.viewOY = 0;
        renderResultView();
    });

    // ---------- 下载 ----------
    els.download.addEventListener('click', () => {
        if (!state.result) return;
        const off = newCanvas(state.result.compW, state.result.compH);
        const ctx = off.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        renderViewInto(ctx, state.settings.view);
        off.toBlob((blob) => {
            if (!blob) {
                showError('下载失败');
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `spotdiff-${state.settings.view}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, 'image/png');
    });

    // ---------- 参数控件 ----------
    els.threshold.addEventListener('input', () => {
        state.settings.threshold = parseInt(els.threshold.value, 10);
        els.thresholdVal.textContent = els.threshold.value;
        saveSettings();
        recomputeMask();
    });
    els.denoise.addEventListener('input', () => {
        state.settings.denoise = parseInt(els.denoise.value, 10);
        els.denoiseVal.textContent = els.denoise.value;
        saveSettings();
        computeDiff();
    });
    els.autoAlign.addEventListener('change', () => {
        state.settings.autoAlign = els.autoAlign.checked;
        saveSettings();
        computeDiff();
    });
    els.minSize.addEventListener('input', () => {
        state.settings.minSize = clamp(parseInt(els.minSize.value, 10) || 1, 1, 100);
        els.minSize.value = state.settings.minSize;
        saveSettings();
        recomputeMask();
    });
    els.runBtn.addEventListener('click', computeDiff);
    els.viewBtns.forEach((b) => b.addEventListener('click', () => {
        if (!VIEWS.includes(b.dataset.view)) return;
        state.settings.view = b.dataset.view;
        saveSettings();
        syncViewBtns();
        renderResultView();
    }));

    // ---------- 统计 ----------
    function updateStats() {
        const r = state.result;
        if (!r) {
            els.stats.innerHTML = '';
            return;
        }
        const pct = (r.count / (r.compW * r.compH) * 100).toFixed(2);
        const parts = [];
        parts.push(`差异像素 <b>${r.count}</b>（${pct}%）`);
        parts.push(`差异区域 <b>${r.boxes.length}</b>`);
        if (state.settings.autoAlign) {
            parts.push(`对齐偏移 <b>${r.offset.dx}, ${r.offset.dy}</b>px`);
        }
        els.stats.innerHTML = parts.join(' &middot; ');
    }

    // ---------- resize ----------
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (state.srcCanvas) fitStage();
            if (state.result) fitResultCanvas();
        }, 150);
    });

    // ---------- 初始化 ----------
    function applySettingsToUI() {
        els.modeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.mode === state.mode));
        els.threshold.value = state.settings.threshold;
        els.thresholdVal.textContent = state.settings.threshold;
        els.denoise.value = state.settings.denoise;
        els.denoiseVal.textContent = state.settings.denoise;
        els.autoAlign.checked = state.settings.autoAlign;
        els.minSize.value = state.settings.minSize;
        syncViewBtns();
    }

    function init() {
        const d = loadSettings();
        state.mode = d.mode;
        state.lines = d.lines;
        state.settings = d.settings;
        applySettingsToUI();
        syncRunBtn();
        setStep(0);
    }

    init();
})();
