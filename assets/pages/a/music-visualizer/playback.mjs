const get = id => document.getElementById(id);
const player = get('player');
const input = get('audioInput');
const audioStatus = get('audioStatus');
const plot = get('spectrogram');
const ctx = plot.getContext('2d');
const column = ctx.createImageData(1, plot.height);
const plotBins = new Uint16Array(plot.height);
const bands = new Uint8Array(128);
let audioContext;
let analyser;
let bins;
let audioUrl;
let pointA;
let pointB;
let looping = false;
let lastColumn = 0;

function demoAudio() {
    const rate = 16000;
    const seconds = 8;
    const buffer = new ArrayBuffer(44 + rate * seconds * 2);
    const wave = new DataView(buffer);
    const tag = (offset, text) => [...text].forEach((letter, index) => wave.setUint8(offset + index, letter.charCodeAt(0)));
    tag(0, 'RIFF');
    wave.setUint32(4, buffer.byteLength - 8, true);
    tag(8, 'WAVEfmt ');
    wave.setUint32(16, 16, true);
    wave.setUint16(20, 1, true);
    wave.setUint16(22, 1, true);
    wave.setUint32(24, rate, true);
    wave.setUint32(28, rate * 2, true);
    wave.setUint16(32, 2, true);
    wave.setUint16(34, 16, true);
    tag(36, 'data');
    wave.setUint32(40, buffer.byteLength - 44, true);
    let phase = 0;
    for (let index = 0; index < rate * seconds; index++) {
        const time = index / rate;
        const sweep = 130 * Math.pow(18, time / seconds);
        phase += 2 * Math.PI * sweep / rate;
        const beat = Math.exp(-7 * (time % 0.5));
        const envelope = Math.min(1, time * 12, (seconds - time) * 12);
        const sample = (Math.sin(phase) * 0.16 + Math.sin(phase * 2) * 0.08 +
            Math.sin(2 * Math.PI * 90 * time) * beat * 0.25) * envelope;
        wave.setInt16(44 + index * 2, Math.round(sample * 32767), true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
}

function connectAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.45;
        audioContext.createMediaElementSource(player).connect(analyser).connect(audioContext.destination);
        bins = new Uint8Array(analyser.frequencyBinCount);
        for (let y = 0; y < plot.height; y++) {
            const frequency = 60 * Math.pow(12000 / 60, 1 - y / (plot.height - 1));
            plotBins[y] = Math.min(bins.length - 1, Math.round(frequency * analyser.fftSize / audioContext.sampleRate));
        }
    }
    return audioContext.resume();
}

function clearPlot() {
    ctx.clearRect(0, 0, plot.width, plot.height);
    bands.fill(0);
    lastColumn = 0;
}

function loadAudio(file, label) {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(file);
    player.src = audioUrl;
    player.hidden = false;
    get('loopControls').hidden = true;
    get('loopStatus').hidden = true;
    clearLoop();
    clearPlot();
    audioStatus.textContent = label;
    void player.play().catch(error => {
        if (error.name === 'NotAllowedError') audioStatus.textContent = '点击播放器的播放按钮开始。';
    });
}

get('playBtn').onclick = () => loadAudio(demoAudio(), '扫频示例 · 低频鼓点下，上方的音调持续升高。');
input.onchange = () => {
    const file = input.files[0];
    if (file) loadAudio(file, file.name);
    input.value = '';
};
player.addEventListener('play', () => {
    void (async () => {
        try { await connectAudio(); }
        catch { audioStatus.textContent = '此浏览器暂时无法分析音频。'; }
    })();
});
player.addEventListener('error', () => {
    audioStatus.textContent = '浏览器无法播放此文件，请换用常见音频格式或试试扫频示例。';
});
player.addEventListener('seeking', clearPlot);
player.addEventListener('loadedmetadata', () => {
    const available = Number.isFinite(player.duration) && player.duration >= 0.25;
    get('loopControls').hidden = get('loopStatus').hidden = !available;
    updateLoop();
});

function updateLoop(message) {
    get('loopToggle').disabled = !(pointB - pointA >= 0.25);
    get('loopToggle').setAttribute('aria-pressed', String(looping));
    get('loopToggle').textContent = looping ? '停止循环' : '循环 A–B';
    get('clearLoop').disabled = pointA === undefined && pointB === undefined;
    const seconds = time => time === undefined ? '—' : time.toFixed(2) + ' 秒';
    get('loopStatus').textContent = 'A ' + seconds(pointA) + ' · B ' + seconds(pointB) +
        (looping ? ' · 正在循环' : '') + (message ? ' · ' + message : '');
}

function clearLoop() {
    pointA = pointB = undefined;
    looping = false;
    updateLoop();
}

get('markA').onclick = () => {
    pointA = player.currentTime;
    if (!(pointB - pointA >= 0.25)) pointB = undefined;
    looping = false;
    updateLoop('播放或拖动进度条后标记 B 点。');
};
get('markB').onclick = () => {
    if (pointA === undefined || player.currentTime - pointA < 0.25) {
        updateLoop('请先标记 A 点，并留出至少 0.25 秒。');
        return;
    }
    pointB = player.currentTime;
    looping = false;
    updateLoop();
};
get('loopToggle').onclick = () => {
    if (!(pointB - pointA >= 0.25)) return;
    looping = !looping;
    if (looping) {
        player.currentTime = pointA;
        void player.play().catch(() => updateLoop('点击播放器继续播放。'));
    }
    updateLoop();
};
get('clearLoop').onclick = clearLoop;

function checkLoop() {
    if (looping && !player.seeking && player.currentTime >= pointB) player.currentTime = pointA;
}
player.addEventListener('timeupdate', checkLoop);
player.addEventListener('ended', () => {
    if (looping) {
        player.currentTime = pointA;
        void player.play().catch(() => updateLoop('点击播放器继续播放。'));
    }
});

export function sampleAudio(now, showPlot) {
    if (!analyser || player.paused || player.seeking || audioContext.state !== 'running') return bands;
    if (showPlot && now - lastColumn < 1000 / 31) return bands;
    analyser.getByteFrequencyData(bins);
    if (!showPlot) {
        for (let i = 0; i < bands.length; i++) {
            bands[i] = bins[Math.floor(i * bins.length / bands.length)];
        }
        return bands;
    }
    lastColumn = now;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(plot, -1, 0);
    ctx.globalCompositeOperation = 'source-over';
    for (let y = 0; y < plot.height; y++) {
        const strength = bins[plotBins[y]] / 255;
        const offset = y * 4;
        column.data[offset] = 12 + 243 * strength ** 1.7;
        column.data[offset + 1] = 20 + 185 * strength ** 1.1;
        column.data[offset + 2] = 38 + 170 * strength * (1 - strength) + 118 * strength;
        column.data[offset + 3] = 255;
    }
    ctx.putImageData(column, plot.width - 1, 0);
    return bands;
}
