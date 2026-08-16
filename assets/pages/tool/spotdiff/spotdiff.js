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
        nudgeStep: $('sd-nudge-step'),
        nudgeMinus: $('sd-nudge-minus'),
        nudgePlus: $('sd-nudge-plus'),
        autoAlignBtn: $('sd-auto-align-btn'),
        steps: document.querySelectorAll('.sd-step'),
    };

    // ---------- 常量 ----------
    const LS_KEY = 'spotdiff-settings-v2';
    const HIT_RADIUS = 18;      // 参考线命中半径（px），兼顾鼠标与触屏
    const ORTH_KEYS = ['yTop', 'yBot', 'xLeft', 'xRight'];

    // 模式定义：
    //  h=左右：A 左 B 右。分割线=竖线 xA / xDiv(分界) / xB；正交线=横线 yTop / yBot
    //  v=上下：A 上 B 下。分割线=横线 yA / yDiv(分界) / yB；正交线=竖线 xLeft / xRight
    // 左右：A 在左、B 在右。分界 = B 的左缘 = A 的右缘（红线）
    // 上下：A 在上、B 在下。分界 = B 的顶部 = A 的底部（红线）
    const MODE_LABELS = {
        h: { xA: 'A左缘', xDiv: '分界(A右/B左)', xB: 'B右缘', yTop: '顶部', yBot: '底部' },
        v: { yA: 'A顶部', yDiv: '分界(A底/B顶)', yB: 'B底部', xLeft: '左缘', xRight: '右缘' },
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
        nudgeStep: 1,      // 微调分界线步长（px）
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
                    nudgeStep: state.nudgeStep,
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
            // 三条分割线按位置排序：最左=A左，中间=分界，最右=B右（与拖动顺序无关）
            const xs = [L.xA, L.xDiv, L.xB].sort((a, b) => a - b);
            // 两条正交线排序：上/下（与拖动顺序无关）
            const ys = [L.yTop, L.yBot].sort((a, b) => a - b);
            const xA = Math.round(xs[0] * w);
            const xD = Math.round(xs[1] * w);
            const xB = Math.round(xs[2] * w);
            const yT = Math.round(ys[0] * h);
            const yB = Math.round(ys[1] * h);
            return {
                rectA: { x: xA, y: yT, w: Math.max(1, xD - xA), h: Math.max(1, yB - yT) },
                rectB: { x: xD, y: yT, w: Math.max(1, xB - xD), h: Math.max(1, yB - yT) },
            };
        }
        // 上下：三条横线排序：最上=A顶，中间=分界，最下=B底；两条竖线排序：左/右
        const ys = [L.yA, L.yDiv, L.yB].sort((a, b) => a - b);
        const xs = [L.xLeft, L.xRight].sort((a, b) => a - b);
        const yA = Math.round(ys[0] * h);
        const yD = Math.round(ys[1] * h);
        const yB = Math.round(ys[2] * h);
        const xL = Math.round(xs[0] * w);
        const xR = Math.round(xs[1] * w);
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
    // 不做任何位置限制：每条线都可在 0~1 内自由拖动，
    // 顺序无所谓，computeRects 里会按位置自动排序得出 A/B 区域
    function clampLine(key, ratio) {
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
        updateNudgeArrows();
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

    // ---------- 微调分界线（手动对齐） ----------
    function updateNudgeArrows() {
        if (state.mode === 'h') {
            els.nudgeMinus.textContent = '◀';
            els.nudgePlus.textContent = '▶';
        } else {
            els.nudgeMinus.textContent = '▲';
            els.nudgePlus.textContent = '▼';
        }
    }
    function nudgeDivider(dir) {
        if (!state.srcCanvas) return;
        const axisLen = state.mode === 'h' ? state.workW : state.workH;
        const key = state.mode === 'h' ? 'xDiv' : 'yDiv';
        const delta = (dir * state.nudgeStep) / Math.max(1, axisLen);
        state.lines[state.mode][key] = clamp01(state.lines[state.mode][key] + delta);
        drawStage();
        saveSettings();
        scheduleRecompute();
    }
    els.nudgeMinus.addEventListener('click', () => nudgeDivider(-1));
    els.nudgePlus.addEventListener('click', () => nudgeDivider(1));
    els.nudgeStep.addEventListener('change', () => {
        state.nudgeStep = clamp(parseInt(els.nudgeStep.value, 10) || 1, 1, 10);
        saveSettings();
    });
    window.addEventListener('keydown', (e) => {
        if (!e.ctrlKey || !state.srcCanvas) return;
        const isH = state.mode === 'h';
        if (isH && e.key === 'ArrowLeft') { e.preventDefault(); nudgeDivider(-1); }
        else if (isH && e.key === 'ArrowRight') { e.preventDefault(); nudgeDivider(1); }
        else if (!isH && e.key === 'ArrowUp') { e.preventDefault(); nudgeDivider(-1); }
        else if (!isH && e.key === 'ArrowDown') { e.preventDefault(); nudgeDivider(1); }
    });

    // ---------- 尝试自动对齐：分界线附近 ±range px 内找差异最小的位置 ----------
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
    function subtractMean(arr) {
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += arr[i];
        const m = s / arr.length;
        for (let i = 0; i < arr.length; i++) arr[i] -= m;
    }
    // 在 A/B 亮度图上沿分割轴做 SAD，返回得分最低的偏移（数组单元）
    function sadBest(la, lb, w, h, axis, rng, center) {
        let bestScore = Infinity;
        let bestD = 0;
        for (let d = center - rng; d <= center + rng; d++) {
            const dx = axis === 'x' ? d : 0;
            const dy = axis === 'y' ? d : 0;
            const ox0 = Math.max(0, -dx);
            const oy0 = Math.max(0, -dy);
            const ow = w - Math.abs(dx);
            const oh = h - Math.abs(dy);
            if (ow <= 0 || oh <= 0) continue;
            const n = ow * oh;
            let s = 0;
            for (let y = 0; y < oh; y++) {
                const rowA = (oy0 + y) * w + ox0;
                const rowB = (oy0 + y + dy) * w + ox0 + dx;
                for (let x = 0; x < ow; x++) {
                    const v = la[rowA + x] - lb[rowB + x];
                    s += v < 0 ? -v : v;
                }
            }
            // 减均值抗亮度差 + 正则项让平坦区域偏向零偏移
            const score = s / n + 0.002 * d * d;
            if (score < bestScore) {
                bestScore = score;
                bestD = d;
            }
        }
        return bestD;
    }
    // 返回让 A/B 差异最小的分界线移动量（源图像素，正值=向 B 方向移动）
    function estimateBestDividerShift(src, rectA, rectB, mode, range) {
        const axis = mode === 'h' ? 'x' : 'y';
        // 粗搜：1/4 降采样 ±range
        const scale = 0.25;
        const sw = Math.max(8, Math.round(rectA.w * scale));
        const sh = Math.max(8, Math.round(rectA.h * scale));
        const sA = lumaOf(src, rectA, sw, sh);
        const sB = lumaOf(src, rectB, sw, sh);
        subtractMean(sA);
        subtractMean(sB);
        const rng = Math.max(1, Math.round(range * scale));
        const coarse = sadBest(sA, sB, sw, sh, axis, rng, 0);
        let shift = Math.round(coarse / scale);
        // 精修：全分辨率在最优附近 ±3px（1px 精度）
        const fA = lumaOf(src, rectA, rectA.w, rectA.h);
        const fB = lumaOf(src, rectB, rectB.w, rectB.h);
        subtractMean(fA);
        subtractMean(fB);
        const fine = sadBest(fA, fB, rectA.w, rectA.h, axis, 3, shift);
        return fine;
    }
    function tryAutoAlign() {
        if (!state.srcCanvas) return;
        const r = computeRects();
        const key = state.mode === 'h' ? 'xDiv' : 'yDiv';
        const axisLen = state.mode === 'h' ? state.workW : state.workH;
        const range = Math.min(50, Math.floor(axisLen * 0.25));
        const shift = estimateBestDividerShift(state.srcCanvas, r.rectA, r.rectB, state.mode, range);
        state.lines[state.mode][key] = clamp01(state.lines[state.mode][key] + shift / Math.max(1, axisLen));
        drawStage();
        saveSettings();
        scheduleRecompute();
    }
    els.autoAlignBtn.addEventListener('click', tryAutoAlign);

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
            if (d.nudgeStep && d.nudgeStep >= 1 && d.nudgeStep <= 10) state.nudgeStep = d.nudgeStep;
        }
        els.modeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.mode === state.mode));
        els.nudgeStep.value = String(state.nudgeStep);
        updateNudgeArrows();
        syncViewBtns();
        setStep(0);
    }

    init();
})();
