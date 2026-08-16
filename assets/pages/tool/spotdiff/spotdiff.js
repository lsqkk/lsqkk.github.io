/* =========================================================
   spotdiff.js - 找不同辅助（简洁版）
   上传找不同截屏 -> 用 5 条线精确框出 A/B 两图 -> 逐像素作差
   输出一张清晰的黑白差异图（自适应对比度，不做降采样）
   参考线与设置持久化：localStorage spotdiff-settings-v2
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
        resultPanel: $('sd-result'),
        viewBtns: document.querySelectorAll('[data-view]'),
        download: $('sd-download'),
        result: $('sd-result-canvas'),
        diffCount: $('sd-diff-count'),
        steps: document.querySelectorAll('.sd-step'),
    };

    // ---------- 常量 ----------
    const LS_KEY = 'spotdiff-settings-v2';
    const HIT_RADIUS = 18;      // 参考线命中半径（px），兼顾鼠标与触屏
    const MIN_GAP = 0.004;      // 线之间最小间距（ratio）
    const ORTH_KEYS = ['yTop', 'yBot', 'xLeft', 'xRight'];

    // 模式定义：
    //  h=左右：A 左 B 右。分割线=竖线 xA / xDiv(分界) / xB；正交线=横线 yTop / yBot
    //  v=上下：A 上 B 下。分割线=横线 yA / yDiv(分界) / yB；正交线=竖线 xLeft / xRight
    const MODE_LABELS = {
        h: { xA: 'A左缘', xDiv: 'B左缘·分界', xB: '右缘', yTop: '顶部', yBot: '底部' },
        v: { yA: 'A顶部', yDiv: 'B顶部·分界', yB: '底部', xLeft: '左缘', xRight: '右缘' },
    };

    function defaultLines() {
        return {
            h: { xA: 0, xDiv: 0.5, xB: 1, yTop: 0, yBot: 1 },
            v: { yA: 0, yDiv: 0.5, yB: 1, xLeft: 0, xRight: 1 },
        };
    }
    function splitKeys(mode) { return mode === 'h' ? ['xA', 'xDiv', 'xB'] : ['yA', 'yDiv', 'yB']; }
    function orthKeys(mode) { return mode === 'h' ? ['yTop', 'yBot'] : ['xLeft', 'xRight']; }
    function allKeys(mode) { return splitKeys(mode).concat(orthKeys(mode)); }
    function lineColor(key) {
        if (key === 'xDiv' || key === 'yDiv') return '#ff5a5a';               // 分界线（红）
        if (ORTH_KEYS.indexOf(key) !== -1) return '#0ea5a3';                   // 正交线（青）
        return '#2367d7';                                                      // A/B 外缘（蓝）
    }

    // ---------- 状态 ----------
    const state = {
        srcCanvas: null,
        workW: 0,
        workH: 0,
        mode: 'h',
        lines: defaultLines(),
        stageScale: 1,     // CSS px / 图像 px
        drag: null,        // { key, pointerId }
        diff: null,        // { offA, offDiff, compW, compH, count }
        view: 'diff',      // 'diff' | 'orig'
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

    // ---------- localStorage ----------
    function loadSettings() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return null;
            const d = JSON.parse(raw);
            if (!d || d.version !== 2) return null;
            return d;
        } catch (e) {
            return null;
        }
    }
    let saveTimer = null;
    function saveSettings() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try {
                localStorage.setItem(LS_KEY, JSON.stringify({
                    version: 2,
                    mode: state.mode,
                    lines: state.lines,
                }));
            } catch (e) { /* localStorage 不可用则忽略 */ }
        }, 150);
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
        els.viewBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.view === state.view));
    }

    // ---------- 分割区域 ----------
    function computeRects() {
        const L = state.lines[state.mode];
        const w = state.workW;
        const h = state.workH;
        if (state.mode === 'h') {
            const xA = Math.round(L.xA * w);
            const xD = Math.round(L.xDiv * w);
            const xB = Math.round(L.xB * w);
            const yT = Math.round(L.yTop * h);
            const yB = Math.round(L.yBot * h);
            return {
                rectA: { x: xA, y: yT, w: Math.max(1, xD - xA), h: Math.max(1, yB - yT) },
                rectB: { x: xD, y: yT, w: Math.max(1, xB - xD), h: Math.max(1, yB - yT) },
            };
        }
        const yA = Math.round(L.yA * h);
        const yD = Math.round(L.yDiv * h);
        const yB = Math.round(L.yB * h);
        const xL = Math.round(L.xLeft * w);
        const xR = Math.round(L.xRight * w);
        return {
            rectA: { x: xL, y: yA, w: Math.max(1, xR - xL), h: Math.max(1, yD - yA) },
            rectB: { x: xL, y: yD, w: Math.max(1, xR - xL), h: Math.max(1, yB - yD) },
        };
    }

    // ---------- 图像加载（不降采样，保持原始分辨率） ----------
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
        const releaseSrc = () => {
            if (bitmap) { bitmap.close(); bitmap = null; }
            if (imgUrl) { URL.revokeObjectURL(imgUrl); imgUrl = null; }
        };
        if (!width || !height) {
            showError('图片无效，请重试');
            releaseSrc();
            return;
        }
        if (width < 20 || height < 20) {
            showError('图片过小（小于 20px），无法处理');
            releaseSrc();
            return;
        }
        // 透明 PNG 先铺白底，避免 alpha 产生伪差异
        const canvas = newCanvas(width, height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(drawSrc, 0, 0, width, height);
        releaseSrc();

        state.srcCanvas = canvas;
        state.workW = width;
        state.workH = height;
        state.diff = null;

        els.splitPanel.classList.remove('sd-hidden');
        els.resultPanel.classList.add('sd-hidden');
        els.stageNote.textContent = `${width}×${height}`;
        setStep(1);
        fitStage();
        drawStage();
        scheduleRecompute();   // 加载即自动对比（用默认/已存参考线）
        saveSettings();
    }

    // ---------- 参考线画布（stage） ----------
    function fitStage() {
        if (!state.srcCanvas) return;
        const wrap = els.stage.parentElement;
        const availW = Math.max(1, wrap.clientWidth - 2);
        const availH = Math.min(window.innerHeight * 0.72, 640);
        const scale = Math.min(availW / state.workW, availH / state.workH);
        const dispW = Math.max(1, Math.round(state.workW * scale));
        const dispH = Math.max(1, Math.round(state.workH * scale));
        state.stageScale = dispW / state.workW;
        const dpr = window.devicePixelRatio || 1;
        els.stage.style.width = dispW + 'px';
        els.stage.style.height = dispH + 'px';
        els.stage.style.margin = '0 auto';
        els.stage.width = Math.round(dispW * dpr);
        els.stage.height = Math.round(dispH * dpr);
    }

    // 某条线在画布上的位置/方向信息
    function lineInfo(key) {
        const L = state.lines[state.mode];
        const s = state.stageScale;
        if (state.mode === 'h') {
            if (key === 'xA' || key === 'xDiv' || key === 'xB') {
                return { pos: L[key] * state.workW * s, vertical: true, len: state.workH * s };
            }
            return { pos: L[key] * state.workH * s, vertical: false, len: state.workW * s };
        }
        if (key === 'yA' || key === 'yDiv' || key === 'yB') {
            return { pos: L[key] * state.workH * s, vertical: false, len: state.workW * s };
        }
        return { pos: L[key] * state.workW * s, vertical: true, len: state.workH * s };
    }

    function drawLineAt(ctx, info, key) {
        const label = MODE_LABELS[state.mode][key];
        ctx.save();
        ctx.strokeStyle = lineColor(key);
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (info.vertical) {
            ctx.moveTo(info.pos, 0);
            ctx.lineTo(info.pos, info.len);
        } else {
            ctx.moveTo(0, info.pos);
            ctx.lineTo(info.len, info.pos);
        }
        ctx.stroke();
        ctx.font = '11px sans-serif';
        const tw = ctx.measureText(label).width + 10;
        // 标签夹取用的"垂直方向长度"：竖线的标签横向夹取用画布宽，横线的标签纵向夹取用画布高
        const perpLen = info.vertical ? state.workW * state.stageScale : state.workH * state.stageScale;
        let lx, ly;
        if (info.vertical) {
            lx = clamp(info.pos - tw / 2, 2, perpLen - tw - 2);
            ly = 2;
        } else {
            lx = 2;
            ly = clamp(info.pos - 15, 2, perpLen - 18);
        }
        ctx.fillStyle = lineColor(key);
        ctx.fillRect(lx, ly, tw, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, lx + 5, ly + 12);
        ctx.restore();
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
        ctx.drawImage(state.srcCanvas, 0, 0, state.workW * state.stageScale, state.workH * state.stageScale);

        // A/B 区域轻微染色，便于看清在比哪两块
        const r = computeRects();
        const s = state.stageScale;
        ctx.fillStyle = 'rgba(35,103,215,0.07)';
        ctx.fillRect(r.rectA.x * s, r.rectA.y * s, r.rectA.w * s, r.rectA.h * s);
        ctx.fillStyle = 'rgba(14,165,163,0.07)';
        ctx.fillRect(r.rectB.x * s, r.rectB.y * s, r.rectB.w * s, r.rectB.h * s);

        for (const key of allKeys(state.mode)) drawLineAt(ctx, lineInfo(key), key);
    }

    // ---------- 参考线交互 ----------
    function hitTest(e) {
        const rect = els.stage.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        let best = null;
        let bestDist = HIT_RADIUS;
        for (const key of allKeys(state.mode)) {
            const info = lineInfo(key);
            const dist = info.vertical ? Math.abs(cx - info.pos) : Math.abs(cy - info.pos);
            if (dist < bestDist) {
                bestDist = dist;
                best = key;
            }
        }
        return best;
    }
    function ratioFromEvent(e, vertical) {
        const rect = els.stage.getBoundingClientRect();
        const s = state.stageScale;
        const raw = vertical
            ? (e.clientX - rect.left) / (state.workW * s)
            : (e.clientY - rect.top) / (state.workH * s);
        return clamp01(raw);
    }
    function clampLine(key, ratio) {
        const L = state.lines[state.mode];
        // 线沿哪个轴，就用哪个轴的长度算最小间距
        const axisLen = state.mode === 'h'
            ? (key === 'xA' || key === 'xDiv' || key === 'xB' ? state.workW : state.workH)
            : (key === 'yA' || key === 'yDiv' || key === 'yB' ? state.workH : state.workW);
        const gap = Math.max(1 / Math.max(1, axisLen), MIN_GAP);
        if (state.mode === 'h') {
            if (key === 'xA') return clamp(ratio, 0, L.xDiv - gap);
            if (key === 'xDiv') return clamp(ratio, L.xA + gap, L.xB - gap);
            if (key === 'xB') return clamp(ratio, L.xDiv + gap, 1);
            if (key === 'yTop') return clamp(ratio, 0, L.yBot - gap);
            if (key === 'yBot') return clamp(ratio, L.yTop + gap, 1);
            return clamp01(ratio);
        }
        if (key === 'yA') return clamp(ratio, 0, L.yDiv - gap);
        if (key === 'yDiv') return clamp(ratio, L.yA + gap, L.yB - gap);
        if (key === 'yB') return clamp(ratio, L.yDiv + gap, 1);
        if (key === 'xLeft') return clamp(ratio, 0, L.xRight - gap);
        if (key === 'xRight') return clamp(ratio, L.xLeft + gap, 1);
        return clamp01(ratio);
    }

    els.stage.addEventListener('pointerdown', (e) => {
        if (!state.srcCanvas) return;
        const key = hitTest(e);
        els.stage.setPointerCapture(e.pointerId);
        state.drag = { key, pointerId: e.pointerId };
        els.stage.classList.add('sd-dragging');
        e.preventDefault();
    });
    els.stage.addEventListener('pointermove', (e) => {
        if (!state.srcCanvas) return;
        if (state.drag && state.drag.pointerId === e.pointerId) {
            if (state.drag.key) {
                const info = lineInfo(state.drag.key);
                const ratio = ratioFromEvent(e, info.vertical);
                state.lines[state.mode][state.drag.key] = clampLine(state.drag.key, ratio);
                drawStage();
            }
        } else {
            els.stage.style.cursor = hitTest(e) ? 'grab' : 'default';
        }
    });
    function endDrag(e) {
        if (!state.drag || state.drag.pointerId !== e.pointerId) return;
        els.stage.releasePointerCapture(e.pointerId);
        els.stage.classList.remove('sd-dragging');
        state.drag = null;
        saveSettings();
        scheduleRecompute();
    }
    els.stage.addEventListener('pointerup', endDrag);
    els.stage.addEventListener('pointercancel', endDrag);

    els.stage.addEventListener('dblclick', (e) => {
        if (!state.srcCanvas) return;
        const key = hitTest(e);
        const def = defaultLines()[state.mode];
        if (key) {
            state.lines[state.mode][key] = def[key];
        } else {
            state.lines[state.mode] = Object.assign({}, def);
        }
        drawStage();
        saveSettings();
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
        saveSettings();
        scheduleRecompute();
    }
    els.modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

    els.resetLinesBtn.addEventListener('click', () => {
        state.lines[state.mode] = Object.assign({}, defaultLines()[state.mode]);
        if (state.srcCanvas) drawStage();
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

    // ---------- 逐像素做差（原生分辨率，自适应黑白图） ----------
    function percentileOf(hist, total, pct) {
        const target = pct * total;
        let acc = 0;
        for (let v = 0; v < 256; v++) {
            acc += hist[v];
            if (acc >= target) return v;
        }
        return 255;
    }

    function computeDiff() {
        if (!state.srcCanvas) return;
        const r = computeRects();
        // 以 A、B 重合的最小尺寸为比对框：分隔线略偏时也能直接做差，不拉伸
        const compW = Math.min(r.rectA.w, r.rectB.w);
        const compH = Math.min(r.rectA.h, r.rectB.h);
        if (compW < 2 || compH < 2) {
            showError('框选区域过小，请检查参考线');
            return;
        }
        const offA = newCanvas(compW, compH);
        const offB = newCanvas(compW, compH);
        const ctxA = offA.getContext('2d', { willReadFrequently: true });
        const ctxB = offB.getContext('2d', { willReadFrequently: true });
        ctxA.imageSmoothingEnabled = false;
        ctxB.imageSmoothingEnabled = false;
        ctxA.drawImage(state.srcCanvas, r.rectA.x, r.rectA.y, compW, compH, 0, 0, compW, compH);
        ctxB.drawImage(state.srcCanvas, r.rectB.x, r.rectB.y, compW, compH, 0, 0, compW, compH);
        const da = ctxA.getImageData(0, 0, compW, compH).data;
        const db = ctxB.getImageData(0, 0, compW, compH).data;
        const n = compW * compH;

        // 差值数组 + 直方图
        const d = new Uint8Array(n);
        const hist = new Uint32Array(256);
        for (let i = 0, p = 0; i < n; i++, p += 4) {
            let v = da[p] - db[p]; if (v < 0) v = -v;
            let t = da[p + 1] - db[p + 1]; if (t < 0) t = -t; if (t > v) v = t;
            t = da[p + 2] - db[p + 2]; if (t < 0) t = -t; if (t > v) v = t;
            d[i] = v;
            hist[v]++;
        }

        // 自适应对比度：
        //  - 低分位(25%)以下的差异视为"相同/噪点"→输出纯黑，避免全是噪点
        //  - 高标位(98.5%)以上的差异→输出纯白
        //  中间按比例映射为灰阶。无需手动调阈值。
        const floor = percentileOf(hist, n, 0.25);
        const ceil = percentileOf(hist, n, 0.985);
        const range = Math.max(1, ceil - floor);

        const offDiff = newCanvas(compW, compH);
        const dctx = offDiff.getContext('2d');
        const img = dctx.createImageData(compW, compH);
        const od = img.data;
        let count = 0;
        for (let i = 0, p = 0; i < n; i++, p += 4) {
            const v = d[i];
            const g = v <= floor ? 0 : Math.min(255, Math.round((v - floor) / range * 255));
            od[p] = g;
            od[p + 1] = g;
            od[p + 2] = g;
            od[p + 3] = 255;
            if (g > 10) count++;
        }
        dctx.putImageData(img, 0, 0);

        state.diff = { offA, offDiff, compW, compH, count };
        els.resultPanel.classList.remove('sd-hidden');
        els.diffCount.textContent = count > 0 ? `差异像素：${count}` : '未检测到差异（两图一致）';
        setStep(2);
        renderResult();
    }

    // ---------- 结果渲染（差异图 / 原图A） ----------
    function renderResult() {
        const d = state.diff;
        if (!d) return;
        const src = state.view === 'diff' ? d.offDiff : d.offA;
        const dpr = window.devicePixelRatio || 1;
        const wrap = els.result.parentElement;
        const availW = Math.max(1, wrap.clientWidth - 2);
        const aspect = d.compW / d.compH;
        let dispW = availW;
        let dispH = dispW / aspect;
        // 长图允许超出视口高度、靠滚动查看；限制 display 缓冲避免内存过大（数据仍是全分辨率，下载不受影响）
        const maxDispH = 4096 / dpr;
        if (dispH > maxDispH) {
            dispH = maxDispH;
            dispW = dispH * aspect;
        }
        els.result.style.width = dispW + 'px';
        els.result.style.height = dispH + 'px';
        els.result.style.margin = '0 auto';
        els.result.width = Math.round(dispW * dpr);
        els.result.height = Math.round(dispH * dpr);
        const ctx = els.result.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, els.result.width, els.result.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, 0, 0, els.result.width, els.result.height);
    }

    // ---------- 下载（全分辨率） ----------
    els.download.addEventListener('click', () => {
        if (!state.diff) return;
        const src = state.view === 'diff' ? state.diff.offDiff : state.diff.offA;
        src.toBlob((blob) => {
            if (!blob) {
                showError('下载失败');
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = state.view === 'diff' ? 'spotdiff-差异.png' : 'spotdiff-原图A.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, 'image/png');
    });

    // ---------- 视图切换 ----------
    els.viewBtns.forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.view !== 'diff' && b.dataset.view !== 'orig') return;
        state.view = b.dataset.view;
        syncViewBtns();
        renderResult();
    }));

    // ---------- 重新对比（防抖） ----------
    let recomputeTimer = null;
    function scheduleRecompute() {
        if (recomputeTimer) clearTimeout(recomputeTimer);
        recomputeTimer = setTimeout(() => computeDiff(), 200);
    }

    // ---------- resize ----------
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (state.srcCanvas) fitStage();
            if (state.diff) renderResult();
        }, 150);
    });

    // ---------- 初始化 ----------
    function init() {
        const d = loadSettings();
        if (d) {
            if (d.mode === 'h' || d.mode === 'v') state.mode = d.mode;
            const def = defaultLines();
            state.lines = {
                h: Object.assign({}, def.h, (d.lines && d.lines.h) || {}),
                v: Object.assign({}, def.v, (d.lines && d.lines.v) || {}),
            };
        }
        els.modeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.mode === state.mode));
        syncViewBtns();
        setStep(0);
    }

    init();
})();
