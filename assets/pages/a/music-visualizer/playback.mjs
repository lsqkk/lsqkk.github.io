import { FFT_SIZE, MIN_HZ, MAX_HZ, frequencyAt, positionOf, formatHz, rmsDb, strongestPeak, nearbyPeak, estimatePitch, makeDemo } from './signal.mjs';
import { FRAME_COUNT, FRAME_INTERVAL, setupWaterfall, clearWaterfall, addColumn, drawSpectrum, spectrumFrequency, spectrumUpperFrequency, drawWave, drawEnvelope, probeFrequencyAt } from './plots.mjs';

const get = id => document.getElementById(id);
const player = get('player');
const audioStatus = get('audioStatus');
const micToggle = get('micToggle');
const frameProbe = get('frameProbe');
const probeTime = get('probeTime');
const freezePlot = get('freezePlot');
const bandCenter = get('bandCenter');
const bandWidth = get('bandWidth');
const bandToggle = get('bandToggle');
const modeButtons = [...document.querySelectorAll('[data-viz]')];
const snapshots = [null, null];
const band = { center: 440, width: 1, enabled: false };
const markers = [440, 660];
const showMarkers = get('showMarkers');
const markerSource = get('markerSource');
const markerStatus = get('markerStatus');
const spectrumTarget = get('spectrumTarget');
const markerRows = [1, 2].map(number => ({
    slider: get('marker' + number),
    value: get('markerValue' + number),
    level: get('markerLevel' + number),
    snap: get('snapMarker' + number),
}));
const frames = Array.from({ length: FRAME_COUNT }, () => ({
    bins: new Float32Array(FFT_SIZE / 2),
    waveform: new Float32Array(FFT_SIZE),
}));

let audioContext, analyser, dry, wet, filter, fileNode, fileUrl, micStream, micNode;
let requestId = 0;
let source = 'none';
let sourceName = '';
let micStart = 0;
let pointA, pointB;
let looping = false;
let mode = 'spectrogram';
let head = 0;
let count = 0;
let frozen = false;
let selectedIndex = 0;
let probeFrequency = null;
let probeOffset = null;
let waveMode = 'wave';
let nextSample = 0;
let previousUiUpdate = 0;
let pitch = null;
let scenePromise;

const position = () => source === 'mic' ? audioContext.currentTime - micStart : player.currentTime;
const active = () => audioContext?.state === 'running' && (source === 'mic' ||
    (source === 'file' && !player.paused && !player.seeking && player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA));

function setupAudio() {
    if (audioContext) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is unavailable');
    audioContext = new AudioContextClass();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0;
    dry = audioContext.createGain();
    wet = audioContext.createGain();
    wet.gain.value = 0;
    filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    fileNode = audioContext.createMediaElementSource(player);
    fileNode.connect(dry).connect(audioContext.destination);
    fileNode.connect(filter).connect(wet).connect(audioContext.destination);
    updateFilter();
    const resolution = audioContext.sampleRate / FFT_SIZE;
    setupWaterfall(resolution, FFT_SIZE / 2);
    get('fftInfo').textContent = 'FFT ' + FFT_SIZE + ' 点 · Δf ' + resolution.toFixed(1) + ' Hz';
}

function resumeAudio() {
    try {
        setupAudio();
        return audioContext.resume();
    } catch (error) {
        return Promise.reject(error);
    }
}

function updateMicButton() {
    micToggle.textContent = source === 'mic' ? '关闭麦克风' : '启用麦克风';
    micToggle.setAttribute('aria-pressed', String(source === 'mic'));
}

function stopMic() {
    if (!micStream) return;
    micNode?.disconnect();
    for (const track of micStream.getTracks()) track.stop();
    micNode = micStream = undefined;
    source = 'none';
    updateMicButton();
}

function useFile(blob, name, message = name) {
    ++requestId;
    micToggle.disabled = false;
    stopMic();
    player.pause();
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    fileUrl = URL.createObjectURL(blob);
    source = 'file';
    sourceName = name;
    player.src = fileUrl;
    band.enabled = false;
    updateFilter();
    get('transport').hidden = false;
    get('loopControls').hidden = get('loopStatus').hidden = true;
    clearLoop();
    clearHistory();
    refreshControls();
    audioStatus.textContent = message;
    const setup = resumeAudio().then(() => {
        if (source === 'file') connectFileAnalysis();
    }).catch(() => {
        // A media element continues to work if Web Audio could not be initialized.
        if (source === 'file' && sourceName === name) audioStatus.textContent = '无法启动频谱分析，可尝试重新播放。';
    });
    // The play call remains in the user's activation handler.
    const play = player.play().catch(error => {
        if (error.name === 'NotAllowedError' && source === 'file' && sourceName === name) {
            audioStatus.textContent = '点击播放器的播放按钮开始。';
        }
    });
    void Promise.all([setup, play]);
}

let fileAnalysisConnected = false;

function connectFileAnalysis() {
    if (!fileAnalysisConnected) {
        fileNode.connect(analyser);
        fileAnalysisConnected = true;
    }
}

function disconnectFileAnalysis() {
    if (fileAnalysisConnected) {
        fileNode.disconnect(analyser);
        fileAnalysisConnected = false;
    }
}

async function startMic() {
    if (!navigator.mediaDevices?.getUserMedia) {
        audioStatus.textContent = '麦克风需要受支持的浏览器和 HTTPS，仍可打开本地音频。';
        return;
    }
    const id = ++requestId;
    micToggle.disabled = true;
    const previousMessage = audioStatus.textContent;
    audioStatus.textContent = '等待麦克风授权…';
    try {
        // Request permission only after Web Audio is available.
        await resumeAudio();
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        if (id !== requestId) {
            for (const track of stream.getTracks()) track.stop();
            return;
        }
        micStream = stream;
        micNode = audioContext.createMediaStreamSource(stream);
        player.pause();
        disconnectFileAnalysis();
        micNode.connect(analyser);
        source = 'mic';
        sourceName = '麦克风';
        micStart = audioContext.currentTime;
        band.enabled = false;
        updateFilter();
        get('transport').hidden = true;
        clearHistory();
        refreshControls();
        updateMicButton();
        audioStatus.textContent = '麦克风已启用。试着持续哼一个音，观察基频和谱峰。';
        for (const track of stream.getTracks()) track.addEventListener('ended', () => {
            if (micStream === stream) finishMic('麦克风已断开。');
        });
    } catch (error) {
        if (id === requestId) {
            if (micStream) stopMic();
            audioStatus.textContent = error.name === 'NotAllowedError'
                ? '麦克风权限未开启。' : '无法打开麦克风，请检查输入设备。';
            if (source === 'file') audioStatus.textContent += ' ' + previousMessage;
        }
    } finally {
        if (id === requestId) micToggle.disabled = false;
    }
}

function finishMic(message) {
    stopMic();
    audioStatus.textContent = message;
    if (fileUrl) {
        source = 'file';
        sourceName = player.dataset.name;
        connectFileAnalysis();
        clearHistory();
        get('transport').hidden = false;
        audioStatus.textContent += ' 已返回播放器。';
    } else if (count) {
        setFrozen(true);
    }
    refreshControls();
}

get('playBtn').addEventListener('click', () => {
    const demo = makeDemo(get('demoType').value);
    player.dataset.name = demo.title;
    useFile(demo.blob, demo.title, demo.title + ' · ' + demo.hint);
});
get('audioInput').addEventListener('change', event => {
    const input = event.currentTarget;
    const file = input.files[0];
    if (file) {
        player.dataset.name = file.name;
        useFile(file, file.name);
    }
    input.value = '';
});
micToggle.addEventListener('click', () => {
    if (source === 'mic') finishMic('麦克风已关闭。');
    else void startMic();
});
player.addEventListener('play', () => {
    void resumeAudio().then(() => {
        if (source === 'file') connectFileAnalysis();
    }).catch(() => {
        audioStatus.textContent = '无法启动频谱分析，可尝试重新播放。';
    });
});
player.addEventListener('error', () => {
    if (source !== 'file') return;
    audioStatus.textContent = '浏览器无法播放此文件。请试试 WAV、MP3 或内置示例。';
    refreshControls();
});

function updateLoop(message = '') {
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
    updateLoop('在稍后的位置标记 B 点。');
};
get('markB').onclick = () => {
    if (!(player.currentTime - pointA >= 0.25)) {
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
player.addEventListener('loadedmetadata', () => {
    const available = Number.isFinite(player.duration) && player.duration >= 0.25;
    get('loopControls').hidden = get('loopStatus').hidden = !available;
    refreshControls();
});
player.addEventListener('seeking', () => {
    if (source === 'file' && !frozen) clearHistory();
});
function checkLoop() {
    if (source !== 'file' || !looping || player.seeking) return;
    if (player.currentTime >= pointB || player.currentTime < pointA) player.currentTime = pointA;
}
player.addEventListener('timeupdate', checkLoop);
player.addEventListener('ended', () => {
    if (source === 'file' && looping) {
        player.currentTime = pointA;
        void player.play().catch(() => updateLoop('点击播放器继续播放。'));
    }
});

function frameAt(index) {
    if (!count) return null;
    return frames[(head + FRAME_COUNT - count + index) % FRAME_COUNT];
}

function displayedFrame() {
    return frameAt(frozen ? selectedIndex : count - 1);
}

function clearHistory() {
    count = head = 0;
    selectedIndex = 0;
    nextSample = previousUiUpdate = 0;
    pitch = null;
    frozen = false;
    probeFrequency = null;
    probeOffset = null;
    clearWaterfall();
    updateSelection();
    render();
}

function setFrozen(value) {
    if (!count || value === frozen) return;
    if (!value) {
        clearHistory();
        return;
    }
    frozen = true;
    selectedIndex = count - 1;
    updateSelection();
    render();
}

function updateSelection() {
    const selected = displayedFrame();
    const line = get('probeLine');
    const frequencyLine = get('probeFrequencyLine');
    line.hidden = !frozen;
    frequencyLine.hidden = !frozen || probeOffset === null;
    if (!frequencyLine.hidden) frequencyLine.style.top = probeOffset * 100 + '%';
    frameProbe.max = String(Math.max(0, count - 1));
    frameProbe.value = String(frozen ? selectedIndex : Math.max(0, count - 1));
    if (frozen && selected) {
        const column = FRAME_COUNT - count + selectedIndex;
        line.style.left = (column + 0.5) / FRAME_COUNT * 100 + '%';
        probeTime.textContent = selected.time.toFixed(2) + ' s';
        if (probeFrequency) {
            const level = selected.bins[Math.round(probeFrequency / selected.step)];
            probeTime.textContent += ' · ' + formatHz(probeFrequency) + ' · ' + (Number.isFinite(level) ? level.toFixed(1) + ' dBFS' : '—');
        }
        frameProbe.setAttribute('aria-valuetext', probeTime.textContent);
    } else {
        probeTime.textContent = '实时';
        frameProbe.setAttribute('aria-valuetext', '最新一帧');
    }
    const seekable = frozen && source === 'file' && Number.isFinite(player.duration);
    get('probeActions').hidden = !frozen || (!seekable && !probeFrequency);
    get('seekFrame').hidden = !seekable;
    get('bandFromProbe').hidden = !probeFrequency;
    get('emptyWaterfall').hidden = !!count;
    const newest = frameAt(count - 1);
    const oldest = frameAt(0);
    get('historyLength').textContent = count > 1 ? (newest.time - oldest.time).toFixed(1) + ' s 已采集' : '约 12 秒视窗';
    get('historyEnd').textContent = newest ? newest.time.toFixed(2) + ' s' : '最新帧';
    freezePlot.textContent = frozen ? '恢复实时' : '冻结画面';
    freezePlot.setAttribute('aria-pressed', String(frozen));
    refreshControls();
}

function selectFrame(index, offset = null) {
    if (!count || index < 0 || index >= count) return;
    frozen = true;
    selectedIndex = index;
    probeOffset = offset;
    probeFrequency = offset === null ? null : probeFrequencyAt(offset);
    updateSelection();
    render();
}

freezePlot.onclick = () => setFrozen(!frozen);
frameProbe.addEventListener('input', () => selectFrame(Number(frameProbe.value), probeOffset));
get('spectrogram').addEventListener('click', event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(0.999999, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    selectFrame(Math.floor(x * FRAME_COUNT) - (FRAME_COUNT - count), y);
});
get('seekFrame').onclick = () => {
    const frame = displayedFrame();
    if (source !== 'file' || !frame || !frozen) return;
    looping = false;
    updateLoop();
    player.currentTime = frame.time;
    clearHistory();
};

function updateFilter() {
    band.width = Number(bandWidth.value);
    get('bandValue').textContent = formatHz(band.center);
    bandToggle.textContent = band.enabled ? '恢复原声' : '独听频带';
    bandToggle.setAttribute('aria-pressed', String(band.enabled));
    if (!audioContext) return;
    const time = audioContext.currentTime;
    const q = 1 / (2 ** (band.width / 2) - 2 ** (-band.width / 2));
    filter.frequency.setTargetAtTime(Math.min(band.center, audioContext.sampleRate * 0.49), time, 0.02);
    filter.Q.setTargetAtTime(q, time, 0.02);
    dry.gain.setTargetAtTime(band.enabled ? 0 : 1, time, 0.02);
    wet.gain.setTargetAtTime(band.enabled ? 1 : 0, time, 0.02);
}

function setBand(frequency) {
    band.center = Math.max(MIN_HZ, Math.min(MAX_HZ, frequency));
    bandCenter.value = String(Math.round(positionOf(band.center) * 1000));
    updateFilter();
    if (mode === 'spectrum') render();
}

bandCenter.addEventListener('input', () => setBand(frequencyAt(Number(bandCenter.value) / 1000)));
bandWidth.addEventListener('change', () => setBand(band.center));
bandToggle.onclick = () => {
    if (source !== 'file') return;
    band.enabled = !band.enabled;
    updateFilter();
    if (mode === 'spectrum') render();
};
get('bandFromPeak').onclick = () => {
    const peak = displayedFrame()?.peak;
    if (peak) setBand(peak);
};
get('bandFromProbe').onclick = () => {
    if (probeFrequency) setBand(probeFrequency);
};

function measuredFrame(current = displayedFrame()) {
    return markerSource.value === 'current' ? current : snapshots[Number(markerSource.value)];
}

function updateMarkers(current) {
    const upper = spectrumUpperFrequency();
    const frame = measuredFrame(current);
    const markerFrequencies = markers.map(frequency => Math.min(upper, frequency));
    markerRows.forEach(({ slider, value, level, snap }, index) => {
        const frequency = markerFrequencies[index];
        const readout = frequency.toFixed(1) + ' Hz';
        slider.value = String(Math.round(positionOf(frequency, upper) * 1000));
        slider.setAttribute('aria-valuetext', readout);
        value.textContent = readout;
        const db = frame?.bins[Math.round(frequency / frame.step)];
        level.textContent = Number.isFinite(db) ? db.toFixed(1) + ' dBFS' : '—';
        snap.disabled = !frame;
    });
    get('markerDelta').textContent = Math.abs(markerFrequencies[1] - markerFrequencies[0]).toFixed(1) + ' Hz';
    return markerFrequencies;
}

function setMarker(index, frequency) {
    markers[index] = frequency;
    markerStatus.textContent = '';
    render();
}

function updateMarkerControls() {
    get('markerControls').hidden = !showMarkers.checked;
    markerStatus.textContent = '';
    if (!showMarkers.checked) spectrumTarget.value = 'band';
    render();
}

showMarkers.onchange = updateMarkerControls;
spectrumTarget.onchange = () => {
    if (spectrumTarget.value !== 'band') showMarkers.checked = true;
    updateMarkerControls();
};
markerSource.onchange = updateMarkerControls;
markerRows.forEach(({ slider, snap }, index) => {
    slider.oninput = () => setMarker(index, frequencyAt(Number(slider.value) / 1000, spectrumUpperFrequency()));
    snap.onclick = () => {
        const frame = measuredFrame();
        if (!frame) return;
        const upper = spectrumUpperFrequency();
        const frequency = nearbyPeak(frame, Math.min(upper, markers[index]), upper);
        if (!frequency) {
            markerStatus.textContent = '标记 ' + (index + 1) + ' 的上下 ⅓ 倍频程内没有明显谱峰。';
            return;
        }
        setMarker(index, frequency);
        markerStatus.textContent = '标记 ' + (index + 1) + ' 已吸附到 ' + frequency.toFixed(1) + ' Hz。';
    };
});

get('spectrumCanvas').onclick = event => {
    const frequency = spectrumFrequency(event.clientX, event.clientY);
    if (!frequency) return;
    if (spectrumTarget.value === 'band') setBand(frequency);
    else setMarker(Number(spectrumTarget.value), frequency);
};

function captureSnapshot(index) {
    const frame = displayedFrame();
    if (!frame) return;
    snapshots[index] = { ...frame, bins: frame.bins.slice(), waveform: undefined };
    updateSnapshots();
    selectMode('spectrum');
}

function updateSnapshots() {
    snapshots.forEach((frame, index) => {
        get(index === 0 ? 'snapshotA' : 'snapshotB').textContent = frame
            ? frame.name + ' · ' + frame.time.toFixed(2) + ' s' + (frame.peak ? ' · ' + formatHz(frame.peak) : '')
            : '尚未保存';
    });
    const [a, b] = snapshots;
    markerStatus.textContent = '';
    markerSource.options[1].disabled = !a;
    markerSource.options[2].disabled = !b;
    if (markerSource.selectedOptions[0]?.disabled) markerSource.value = 'current';
    const summary = get('compareStatus');
    summary.hidden = !(a && b);
    if (a && b) {
        const change = b.rms - a.rms;
        summary.textContent = 'B − A 有效电平 ' + (Number.isFinite(change) ? signed(change, 1) + ' dB' : '—');
        if (a.peak && b.peak) summary.textContent += ' · 谱峰差 ' + signed(b.peak - a.peak, 1) + ' Hz';
    }
    refreshControls();
}

function signed(value, precision) {
    return (value > 0 ? '+' : '') + value.toFixed(precision);
}

function refreshControls() {
    const frame = displayedFrame();
    freezePlot.disabled = !frame;
    frameProbe.disabled = count < 2;
    get('bandFromPeak').disabled = !frame?.peak;
    bandToggle.disabled = source !== 'file' || !audioContext || player.readyState < HTMLMediaElement.HAVE_METADATA || !!player.error;
    get('captureA').disabled = get('captureB').disabled = !frame;
    get('clearSpectra').disabled = get('exportSpectra').disabled = !snapshots.some(Boolean);
}

get('captureA').onclick = () => captureSnapshot(0);
get('captureB').onclick = () => captureSnapshot(1);
get('clearSpectra').onclick = () => {
    snapshots.fill(null);
    updateSnapshots();
    render();
};
get('exportSpectra').onclick = () => {
    const rows = ['snapshot,source_time_s,frequency_hz,level_dbfs'];
    for (let index = 0; index < snapshots.length; index++) {
        const frame = snapshots[index];
        if (!frame) continue;
        const label = index === 0 ? 'A' : 'B';
        for (let bin = 0; bin < frame.bins.length; bin++) {
            const level = frame.bins[bin];
            rows.push([label, frame.time.toFixed(3), (bin * frame.step).toFixed(3), Number.isFinite(level) ? level.toFixed(2) : ''].join(','));
        }
    }
    const url = URL.createObjectURL(new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'spectrum-snapshots.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const panels = {
    spectrogram: get('spectrogramPanel'),
    spectrum: get('spectrumPanel'),
    waves: get('wavesPanel'),
    scene: get('scenePanel'),
};

function setWaveMode(next) {
    waveMode = next;
    get('waveMode').setAttribute('aria-pressed', String(next === 'wave'));
    get('envelopeMode').setAttribute('aria-pressed', String(next === 'envelope'));
    const envelope = next === 'envelope';
    get('waveNote').textContent = envelope
        ? '有效电平随时间变化。试播“两个音的拍频”，数一数每秒有几次起伏。'
        : '波形以满幅 1.0 为基准。连续、规律的周期通常对应可辨的音高。';
    get('waveCanvas').setAttribute('aria-label', envelope
        ? '最近两秒的 RMS 电平变化'
        : '时域波形，横轴为毫秒，纵轴为相对振幅');
    render();
}
get('waveMode').onclick = () => setWaveMode('wave');
get('envelopeMode').onclick = () => setWaveMode('envelope');

function selectMode(next) {
    mode = next;
    for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== next;
    for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.viz === next));
    if (mode === 'scene') {
        scenePromise ??= import('./music.js')
            .then(({ startScene }) => startScene(() => mode === 'scene', displayedFrame))
            .catch(() => { get('container').textContent = '当前浏览器无法显示三维视图。'; });
    }
    render();
}
for (const button of modeButtons) button.onclick = () => selectMode(button.dataset.viz);

function render() {
    const frame = displayedFrame();
    if (mode === 'spectrum') {
        const markerFrequencies = showMarkers.checked ? updateMarkers(frame) : [];
        drawSpectrum(frame, snapshots, band, markerFrequencies);
    }
    if (mode === 'waves') {
        if (waveMode === 'wave') drawWave(frame);
        else drawEnvelope(frame, frameAt, frozen ? selectedIndex : count - 1);
    }
    get('peakValue').textContent = frame?.peak ? formatHz(frame.peak) : '—';
    const frequency = frame && (frozen ? estimatePitch(frame.waveform, frame.rate, frame.rms) : pitch);
    get('pitchValue').textContent = frequency ? formatHz(frequency) : '—';
    get('rmsValue').textContent = Number.isFinite(frame?.rms) ? frame.rms.toFixed(1) + ' dBFS' : '—';
}

function sample(now) {
    if (!active() || frozen || now < nextSample) return;
    if (!nextSample || now - nextSample > FRAME_INTERVAL) nextSample = now;
    nextSample += FRAME_INTERVAL;
    const frame = frames[head];
    analyser.getFloatFrequencyData(frame.bins);
    analyser.getFloatTimeDomainData(frame.waveform);
    frame.rate = audioContext.sampleRate;
    frame.step = frame.rate / FFT_SIZE;
    frame.time = position();
    frame.name = sourceName;
    frame.rms = rmsDb(frame.waveform);
    frame.peak = strongestPeak(frame.bins, frame.step);
    head = (head + 1) % FRAME_COUNT;
    count = Math.min(FRAME_COUNT, count + 1);
    addColumn(frame.bins);
    if (now - previousUiUpdate >= 100 || count === 1) {
        previousUiUpdate = now;
        pitch = estimatePitch(frame.waveform, frame.rate, frame.rms);
        updateSelection();
        render();
    } else if (mode === 'waves' && waveMode === 'envelope') {
        drawEnvelope(frame, frameAt, count - 1);
    }
}

function animate(now) {
    checkLoop();
    sample(now);
    requestAnimationFrame(animate);
}
window.addEventListener('resize', render);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && active() && !frozen) clearHistory();
});
window.addEventListener('pagehide', () => {
    ++requestId;
    micToggle.disabled = false;
    if (source === 'mic') finishMic('麦克风已关闭。');
});
setupWaterfall(48000 / FFT_SIZE, FFT_SIZE / 2);
setBand(band.center);
clearHistory();
requestAnimationFrame(animate);
