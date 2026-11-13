import { MIN_HZ, MAX_HZ, FLOOR_DB, CEILING_DB, frequencyAt, positionOf } from './signal.mjs';

export const FRAME_COUNT = 360;
export const FRAME_INTERVAL = 1000 / 30;

const BG = '#101c26';
const GRID = '#2c4354';
const MUTED = '#a7bdca';
const CURRENT = '#6fe6cc';
const REFERENCE_A = '#f0ad6e';
const REFERENCE_B = '#d9a8f8';

const get = id => document.getElementById(id);
const spectrogram = get('spectrogram');
const spectrum = get('spectrumCanvas');
const wave = get('waveCanvas');
const waterfall = spectrogram.getContext('2d', { alpha: false });
const spectrumContext = spectrum.getContext('2d', { alpha: false });
const waveContext = wave.getContext('2d', { alpha: false });
const column = waterfall.createImageData(1, spectrogram.height);
const colorStops = [
    [16, 28, 38],
    [33, 103, 137],
    [49, 186, 188],
    [255, 215, 140],
];
let topFrequency = MAX_HZ;
let rowBins;
let plotSize;

function makePalette() {
    const palette = [];
    for (let index = 0; index < 256; index++) {
        const position = index / 255 * (colorStops.length - 1);
        const floor = Math.min(colorStops.length - 2, Math.floor(position));
        palette.push(colorStops[floor].map((low, channel) => low + (colorStops[floor + 1][channel] - low) * (position - floor)));
    }
    return palette;
}
const palette = makePalette();

function axisTicks(frequencies, length) {
    const separation = length < 400 ? 58 : 45;
    let previous = 0;
    return frequencies.filter((frequency, index) => {
        if (index === 0 || index === frequencies.length - 1) return true;
        const offset = positionOf(frequency, topFrequency) * length;
        if (offset - previous < separation || length - offset < separation) return false;
        previous = offset;
        return true;
    });
}

function ticks() {
    return [MIN_HZ, ...[100, 200, 500, 1000, 2000, 5000].filter(hz => hz < topFrequency), topFrequency];
}

function tickLabel(frequency) {
    return frequency >= 1000 ? Number((frequency / 1000).toFixed(1)) + 'k' : Math.round(frequency) + ' Hz';
}

export function setupWaterfall(hzPerBin, bins) {
    topFrequency = Math.min(MAX_HZ, (bins - 1) * hzPerBin);
    rowBins = Array.from({ length: spectrogram.height }, (_, y) => {
        const step = 1 / (spectrogram.height - 1);
        const position = 1 - y * step;
        const start = frequencyAt(Math.max(0, position - step / 2), topFrequency) / hzPerBin;
        const end = frequencyAt(Math.min(1, position + step / 2), topFrequency) / hzPerBin;
        return [Math.round(start), Math.round(end)];
    });
    const axis = get('spectrogramAxis');
    const grid = get('spectrogramGrid');
    axis.replaceChildren();
    grid.replaceChildren();
    const availableTicks = [MIN_HZ, ...[200, 1000, 5000].filter(hz => hz < topFrequency * 0.55), topFrequency];
    for (const hz of availableTicks.reverse()) {
        const top = (1 - positionOf(hz, topFrequency)) * 100 + '%';
        const label = document.createElement('span');
        const line = document.createElement('span');
        label.style.top = line.style.top = top;
        label.textContent = tickLabel(hz);
        axis.append(label);
        grid.append(line);
    }
}

export function clearWaterfall() {
    waterfall.fillStyle = BG;
    waterfall.fillRect(0, 0, spectrogram.width, spectrogram.height);
}

export function addColumn(bins) {
    waterfall.drawImage(spectrogram, -1, 0);
    for (let y = 0; y < rowBins.length; y++) {
        const [start, end] = rowBins[y];
        let level = FLOOR_DB;
        for (let bin = start; bin <= end; bin++) level = Math.max(level, bins[bin]);
        const intensity = Math.min(255, Math.round((level - FLOOR_DB) * 255 / (CEILING_DB - FLOOR_DB)));
        const pixel = y * 4;
        column.data[pixel] = palette[intensity][0];
        column.data[pixel + 1] = palette[intensity][1];
        column.data[pixel + 2] = palette[intensity][2];
        column.data[pixel + 3] = 255;
    }
    waterfall.putImageData(column, spectrogram.width - 1, 0);
}

function startChart(canvas, context) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return null;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = BG;
    context.fillRect(0, 0, width, height);
    context.fillStyle = MUTED;
    context.strokeStyle = GRID;
    context.lineWidth = 1;
    context.font = '11px ui-monospace, monospace';
    const left = 48;
    const top = 18;
    return { left, top, width: width - left - 19, height: height - top - 36 };
}

function gridLine(context, x1, y1, x2, y2) {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
}

function frequencyValues(frame, width) {
    const values = new Float32Array(width + 1);
    let previous = MIN_HZ;
    for (let x = 0; x <= width; x++) {
        const next = frequencyAt(Math.min(1, (x + 0.5) / width), topFrequency);
        const firstBin = Math.round(previous / frame.step);
        const lastBin = Math.min(frame.bins.length - 1, Math.round(next / frame.step));
        let level = FLOOR_DB;
        for (let bin = firstBin; bin <= lastBin; bin++) level = Math.max(level, frame.bins[bin]);
        values[x] = level;
        previous = next;
    }
    return values;
}

export function drawSpectrum(current, snapshots, band, markers = []) {
    const context = spectrumContext;
    const box = startChart(spectrum, context);
    if (!box) return;
    plotSize = box;
    const { left, top, width, height } = box;
    const min = -95;
    const max = -5;
    const xAt = hz => left + positionOf(hz, topFrequency) * width;
    const yAt = db => top + Math.max(0, Math.min(1, (max - db) / (max - min))) * height;
    if (band.enabled) {
        const start = xAt(Math.max(MIN_HZ, band.center / 2 ** (band.width / 2)));
        const end = xAt(Math.min(topFrequency, band.center * 2 ** (band.width / 2)));
        context.fillStyle = '#6fe6cc25';
        context.fillRect(start, top, end - start, height);
        context.fillStyle = MUTED;
    }
    for (const db of [max, -35, -65, min]) {
        const y = yAt(db);
        context.textAlign = 'right';
        context.fillText(String(db), left - 7, y + 4);
        gridLine(context, left, y, left + width, y);
    }
    context.fillText('dBFS', left - 7, 11);
    for (const frequency of axisTicks(ticks(), width)) {
        const x = xAt(frequency);
        context.textAlign = x === left ? 'left' : x >= left + width - 1 ? 'right' : 'center';
        context.fillText(tickLabel(frequency), x, top + height + 18);
        gridLine(context, x, top, x, top + height);
    }
    for (const [frame, color, dash] of [[snapshots[0], REFERENCE_A, [6, 4]], [snapshots[1], REFERENCE_B, [2, 4]], [current, CURRENT, []]]) {
        if (!frame) continue;
        const values = frequencyValues(frame, width);
        context.setLineDash(dash);
        context.strokeStyle = color;
        context.lineWidth = 1.6;
        context.beginPath();
        for (let x = 0; x < values.length; x++) {
            const y = yAt(values[x]);
            if (x) context.lineTo(left + x, y);
            else context.moveTo(left, y);
        }
        context.stroke();
    }
    context.setLineDash([]);
    markers.forEach((frequency, index) => {
        const x = xAt(frequency);
        context.strokeStyle = index === 0 ? '#eef6fb' : '#a3b7cb';
        context.fillStyle = context.strokeStyle;
        context.lineWidth = 1;
        context.setLineDash(index === 0 ? [4, 3] : [1, 3]);
        gridLine(context, x, top, x, top + height);
        context.textAlign = x > left + width - 14 ? 'right' : 'left';
        context.fillText(String(index + 1), x + (context.textAlign === 'left' ? 3 : -3), top - 5);
    });
    context.setLineDash([]);
}

export function spectrumFrequency(clientX, clientY) {
    if (!plotSize) return null;
    const bounds = spectrum.getBoundingClientRect();
    const ratio = (clientX - bounds.left - plotSize.left) / plotSize.width;
    const y = clientY - bounds.top - plotSize.top;
    return ratio >= 0 && ratio <= 1 && y >= 0 && y <= plotSize.height ? frequencyAt(ratio, topFrequency) : null;
}

export function spectrumUpperFrequency() {
    return topFrequency;
}

export function drawWave(frame) {
    const context = waveContext;
    const box = startChart(wave, context);
    if (!box) return;
    const { left, top, width, height } = box;
    const count = frame ? Math.min(frame.waveform.length, Math.round(frame.rate * 0.04)) : 1;
    const duration = frame ? count * 1000 / frame.rate : 40;
    const yAt = value => top + (1 - Math.max(-1, Math.min(1, value))) * height / 2;
    for (const value of [1, 0.5, 0, -0.5, -1]) {
        const y = yAt(value);
        context.textAlign = 'right';
        context.fillText(value.toFixed(1), left - 7, y + 4);
        gridLine(context, left, y, left + width, y);
    }
    for (let index = 0; index <= 4; index++) {
        const x = left + width * index / 4;
        context.textAlign = index === 0 ? 'left' : index === 4 ? 'right' : 'center';
        context.fillText(Math.round(duration * index / 4) + ' ms', x, top + height + 18);
        gridLine(context, x, top, x, top + height);
    }
    if (!frame) return;
    const start = frame.waveform.length - count;
    context.strokeStyle = CURRENT;
    context.lineWidth = 1.6;
    context.beginPath();
    for (let index = 0; index < count; index++) {
        const x = left + width * index / (count - 1);
        const y = yAt(frame.waveform[start + index]);
        if (index) context.lineTo(x, y);
        else context.moveTo(x, y);
    }
    context.stroke();
}

export function drawEnvelope(frame, history, selected) {
    const context = waveContext;
    const box = startChart(wave, context);
    if (!box) return;
    const { left, top, width, height } = box;
    const minDb = -65;
    const yAt = level => top + Math.max(0, Math.min(1, level / minDb)) * height;
    for (const db of [0, -15, -30, -45, -65]) {
        const y = yAt(db);
        context.textAlign = 'right';
        context.fillText(String(db), left - 7, y + 4);
        gridLine(context, left, y, left + width, y);
    }
    context.fillText('dBFS', left - 7, 11);
    const duration = 2;
    const xAt = seconds => left + width * (1 - seconds / duration);
    for (let index = 0; index <= 4; index++) {
        const seconds = duration - index * duration / 4;
        const x = xAt(seconds);
        context.textAlign = index === 0 ? 'left' : index === 4 ? 'right' : 'center';
        context.fillText(seconds ? '−' + seconds + ' s' : '0 s', x, top + height + 18);
        gridLine(context, x, top, x, top + height);
    }
    if (!frame) return;
    context.strokeStyle = CURRENT;
    context.lineWidth = 1.8;
    context.beginPath();
    let drawing = false;
    for (let index = Math.max(0, selected - 180); index <= selected; index++) {
        const earlier = history(index);
        const delta = frame.time - earlier.time;
        if (delta > duration || delta < 0) continue;
        const x = xAt(delta);
        const y = yAt(earlier.rms);
        if (drawing) context.lineTo(x, y);
        else context.moveTo(x, y);
        drawing = true;
    }
    context.stroke();
}

export function probeFrequencyAt(offset) {
    return frequencyAt(1 - offset, topFrequency);
}
