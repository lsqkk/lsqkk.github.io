export const MIN_HZ = 45;
export const MAX_HZ = 12000;
export const FLOOR_DB = -95;
export const CEILING_DB = -25;
export const FFT_SIZE = 4096;

export function frequencyAt(position, upper = MAX_HZ) {
    return MIN_HZ * (upper / MIN_HZ) ** position;
}

export function positionOf(frequency, upper = MAX_HZ) {
    return Math.log(frequency / MIN_HZ) / Math.log(upper / MIN_HZ);
}

export function formatHz(frequency) {
    return frequency >= 1000 ? (frequency / 1000).toFixed(2) + ' kHz' : Math.round(frequency) + ' Hz';
}

export function rmsDb(waveform) {
    let power = 0;
    for (const sample of waveform) power += sample * sample;
    return 10 * Math.log10(power / waveform.length);
}

export function strongestPeak(bins, hzPerBin) {
    return findPeak(bins, hzPerBin, MIN_HZ, MAX_HZ);
}

export function nearbyPeak(frame, frequency, upper = MAX_HZ) {
    const limit = 2 ** (1 / 3);
    return findPeak(frame.bins, frame.step, Math.max(MIN_HZ, frequency / limit), Math.min(upper, frequency * limit), true);
}

function findPeak(bins, hzPerBin, low, high, local = false) {
    let peak = -1;
    let level = -85;
    const first = Math.max(1, Math.ceil(low / hzPerBin));
    const last = Math.min(bins.length - 2, Math.floor(high / hzPerBin));
    for (let bin = first; bin <= last; bin++) {
        if (local && (bins[bin] <= bins[bin - 1] || bins[bin] < bins[bin + 1])) continue;
        if (bins[bin] > level) {
            level = bins[bin];
            peak = bin;
        }
    }
    if (peak < 0) return null;
    return hzPerBin * (peak + parabolicOffset(bins[peak - 1], bins[peak], bins[peak + 1]));
}

function parabolicOffset(left, center, right) {
    const curvature = left - 2 * center + right;
    const offset = curvature ? (left - right) / (2 * curvature) : 0;
    return Number.isFinite(offset) ? Math.max(-0.5, Math.min(0.5, offset)) : 0;
}

// YIN difference and cumulative mean normalization, using a short mono window.
// Reference: de Cheveigné and Kawahara, JASA 111 (2002), DOI 10.1121/1.1458024.
export function estimatePitch(waveform, rate, level) {
    if (level < -58) return null;
    const stride = Math.max(1, Math.floor(rate / 12000));
    const reducedRate = rate / stride;
    const length = Math.floor(waveform.length / stride);
    const end = Math.ceil(reducedRate / 60);
    const start = Math.floor(reducedRate / 1100);
    const windowLength = Math.min(Math.floor(reducedRate * 0.04), length - end);
    if (windowLength <= end || start < 2) return null;
    const signal = new Float32Array(windowLength + end);
    const offset = waveform.length - signal.length * stride;
    for (let index = 0; index < signal.length; index++) {
        let sum = 0;
        for (let step = 0; step < stride; step++) sum += waveform[offset + index * stride + step];
        signal[index] = sum / stride;
    }
    const difference = new Float32Array(end + 1);
    difference[0] = 1;
    let running = 0;
    for (let lag = 1; lag <= end; lag++) {
        let sum = 0;
        for (let index = 0; index < windowLength; index++) {
            const delta = signal[index] - signal[index + lag];
            sum += delta * delta;
        }
        running += sum;
        difference[lag] = running ? sum * lag / running : 1;
    }
    for (let lag = start; lag < end; lag++) {
        if (difference[lag] >= 0.17) continue;
        while (lag < end && difference[lag + 1] < difference[lag]) lag++;
        const adjustment = lag < end ? parabolicOffset(difference[lag - 1], difference[lag], difference[lag + 1]) : 0;
        const frequency = reducedRate / (lag + adjustment);
        return frequency >= 60 && frequency <= 1100 ? frequency : null;
    }
    return null;
}

const DEMOS = {
    sweep: { seconds: 10, title: '扫频与鼓点', hint: '观察上升的频率曲线与反复出现的低频脉冲。' },
    missing: { seconds: 10, title: '消失的基频', hint: '试对照 440 / 660 Hz 的谱峰和 220 Hz 的基频。' },
    beats: { seconds: 12, title: '两个音的拍频', hint: '440 Hz 和 443 Hz 叠加，听每秒约 3 次的强弱变化。' },
};

export function makeDemo(kind) {
    const demo = DEMOS[kind] || DEMOS.sweep;
    const rate = 24000;
    const buffer = new ArrayBuffer(44 + rate * demo.seconds * 2);
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
    const sine = cycles => Math.sin(2 * Math.PI * cycles);
    let phase = 0;
    for (let index = 0; index < rate * demo.seconds; index++) {
        const time = index / rate;
        const envelope = Math.min(1, time * 12, (demo.seconds - time) * 12);
        let sample;
        switch (kind) {
            case 'missing':
                sample = sine(440 * time) * 0.23 + sine(660 * time) * 0.16;
                break;
            case 'beats':
                sample = (sine(440 * time) + sine(443 * time)) * 0.19;
                break;
            default:
                phase += 130 * 22 ** (time / demo.seconds) / rate;
                sample = sine(phase) * 0.2 + sine(phase * 2) * 0.085;
                sample += sine(84 * time) * Math.exp(-9 * (time % 0.5)) * 0.24;
        }
        wave.setInt16(44 + index * 2, Math.round(sample * envelope * 32767), true);
    }
    return { ...demo, blob: new Blob([buffer], { type: 'audio/wav' }) };
}
