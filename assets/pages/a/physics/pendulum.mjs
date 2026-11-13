import { backdrop, colors, controlChanges, degrees, dot, experimentCanvas, get, label, line, number, radians, simulationClock, write } from './workbench.mjs';
import { pendulumMeasurementRow, pendulumMeasurementsCsv, pendulumStep, smallAnglePeriod } from './models.mjs';

const step = 1 / 240;
const sampleInterval = 1 / 30;
const historySpan = 8;
let length, gravity, damping, initialEnergy, angle, velocity, elapsed, remainder, nextSample, lastCrossing, measured;
let history = [];
let release, cycle, savedCycle;
const records = [];
const saveMeasurement = get('save-measurement');

function mechanicalEnergy() {
    return gravity * length * (1 - Math.cos(angle)) + (length * velocity) ** 2 / 2;
}

function launch() {
    length = number('length');
    gravity = number('gravity');
    damping = number('damping');
    release = number('release');
    angle = radians(release);
    velocity = 0;
    initialEnergy = mechanicalEnergy();
    elapsed = 0;
    remainder = 0;
    nextSample = sampleInterval;
    lastCrossing = null;
    measured = null;
    cycle = 0;
    savedCycle = 0;
    history = [{ time: 0, angle }];
}

function advance(dt) {
    remainder += dt;
    while (remainder >= step) {
        const previous = angle;
        [angle, velocity] = pendulumStep(angle, velocity, step, length, gravity, damping);
        if (previous > 0 && angle <= 0) {
            const crossing = elapsed + step * previous / (previous - angle);
            if (lastCrossing !== null) {
                measured = crossing - lastCrossing;
                cycle++;
                saveMeasurement.disabled = false;
            }
            lastCrossing = crossing;
        }
        elapsed += step;
        if (elapsed >= nextSample) {
            history.push({ time: elapsed, angle });
            nextSample += sampleInterval;
        }
        remainder -= step;
    }
    while (history.length > 1 && history[1].time < elapsed - historySpan) history.shift();
}

launch();
const { paint } = experimentCanvas((ctx, w, h) => {
    backdrop(ctx, w, h);
    const origin = { x: 181, y: 115 };
    const rod = 99 + length * 22;
    const x = origin.x + rod * Math.sin(angle);
    const y = origin.y + rod * Math.cos(angle);
    label(ctx, '单摆', 26, 39);
    label(ctx, '摆角 / °', 404, 39);
    line(ctx, origin.x - 41, origin.y, origin.x + 41, origin.y, colors.muted, 2);
    ctx.setLineDash([5, 7]);
    line(ctx, origin.x, origin.y, origin.x, origin.y + rod + 26, colors.muted);
    ctx.setLineDash([]);
    line(ctx, origin.x, origin.y, x, y, colors.text, 2);
    dot(ctx, origin.x, origin.y, 5, colors.text);
    dot(ctx, x, y, 13, colors.mint);
    label(ctx, degrees(angle).toFixed(1) + '°', origin.x, h - 55, colors.mint, 'center');

    const left = 405;
    const right = w - 27;
    const top = 75;
    const bottom = h - 65;
    const mid = (top + bottom) / 2;
    const extent = Math.max(10, release);
    for (const sign of [-1, 0, 1]) {
        const level = mid - sign * (bottom - top) / 2;
        line(ctx, left, level, right, level, sign ? colors.grid : colors.muted);
        label(ctx, String(extent * sign), left - 9, level + 6, colors.muted, 'right');
    }
    const start = Math.max(0, elapsed - historySpan);
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top - 4, right - left, bottom - top + 8);
    ctx.clip();
    ctx.beginPath();
    history.forEach((sample, index) => {
        const px = left + (sample.time - start) / historySpan * (right - left);
        const py = mid - degrees(sample.angle) / extent * (bottom - top) / 2;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = colors.amber;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    label(ctx, start.toFixed(1) + ' s', left, bottom + 29, colors.muted);
    label(ctx, (start + historySpan).toFixed(1) + ' s', right, bottom + 29, colors.muted, 'right');
});

function render() {
    write('measured-period', measured === null ? '采样中' : measured.toFixed(2) + ' s');
    write('ideal-period', smallAnglePeriod(length, gravity).toFixed(2) + ' s');
    write('energy', Math.min(100, 100 * mechanicalEnergy() / initialEnergy).toFixed(1) + '%');
    paint();
}

function restart() {
    launch();
    saveMeasurement.disabled = true;
    write('measurement-status', records.length ? '已有 ' + records.length + ' 条记录，等待新周期。' : '完成第一个周期后可以记录。');
    write('length-output', length.toFixed(2) + ' m');
    write('gravity-output', gravity.toFixed(2) + ' m/s²');
    write('release-output', release + '°');
    write('damping-output', damping.toFixed(2) + ' s⁻¹');
    render();
}

saveMeasurement.addEventListener('click', () => {
    if (measured === null || cycle === savedCycle) return;
    savedCycle = cycle;
    const record = {
        index: records.length + 1, cycle, length, gravity, release, damping, measured,
        theoretical: smallAnglePeriod(length, gravity),
    };
    records.push(record);
    const row = get('measurement-rows').insertRow();
    for (const value of pendulumMeasurementRow(record)) row.insertCell().textContent = value;
    get('measurement-table').hidden = false;
    get('download-measurements').disabled = false;
    saveMeasurement.disabled = true;
    write('measurement-status', '已记录第 ' + record.index + ' 条测量。');
});

get('download-measurements').addEventListener('click', () => {
    if (!records.length) return;
    const download = document.createElement('a');
    const csv = pendulumMeasurementsCsv(records);
    download.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    download.download = 'pendulum-measurements.csv';
    document.body.append(download);
    download.click();
    download.remove();
    const url = download.href;
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});

get('relaunch').addEventListener('click', restart);
get('moon').addEventListener('click', () => {
    get('gravity').value = 1.62;
    restart();
});
controlChanges(restart);
simulationClock(render, advance);
restart();
