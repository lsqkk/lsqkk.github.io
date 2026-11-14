import { experiments, sampleCurve } from './experiments.mjs';

const root = document.querySelector('#physics-lab');
const lab = experiments.find(item => item.slug === root.dataset.experiment);
const form = root.querySelector('form');
const canvas = root.querySelector('canvas');
const ctx = canvas.getContext('2d');
const clear = root.querySelector('#clear-run');
const status = root.querySelector('#curve-status');
const format = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
let reference;

function draw() {
    const parameters = Object.fromEntries(lab.parameters.map(p => {
        const value = root.querySelector('#lab-' + p.id).valueAsNumber;
        root.querySelector('#lab-' + p.id + '-output').textContent = format.format(value) + p.unit;
        return [p.id, value];
    }));
    const model = lab.model(parameters);
    const active = [model.read, model.second].filter(Boolean).map(read => sampleCurve(lab, model, read));
    const previous = reference ? sampleCurve(lab, reference, reference.read) : [];
    const values = [...active.flat(), ...previous].map(p => p[1]);
    const min = Math.min(0, model.bounds?.[0] ?? 0, ...values);
    const max = Math.max(model.bounds?.[1] ?? 0, ...values);
    const margin = (max - min || 1) * .08;
    const [left, right, top, bottom] = [76, 680, 62, 365];
    const start = Math.min(model.start ?? 0, reference?.start ?? model.start ?? 0);
    const end = Math.max(model.end, reference?.end ?? model.end);
    const px = x => left + (x - start) / (end - start) * (right - left);
    const py = y => bottom - (y - min + margin) / (max - min + 2 * margin) * (bottom - top);

    ctx.fillStyle = '#111c2a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '16px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a8bed1';
    ctx.fillText(lab.axes[1], left, 35);
    ctx.textAlign = 'right';
    ctx.fillText(lab.axes[0], right, 424);
    ctx.strokeStyle = '#34495e';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const x = start + (end - start) * i / 5;
        const y = min + (max - min) * i / 5;
        ctx.beginPath();
        ctx.moveTo(px(x), top);
        ctx.lineTo(px(x), bottom);
        ctx.moveTo(left, py(y));
        ctx.lineTo(right, py(y));
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(format.format(y), left - 10, py(y) + 5);
        ctx.textAlign = 'center';
        ctx.fillText(format.format(x), px(x), bottom + 25);
    }
    ctx.textAlign = 'left';

    function series(points, color, label, x, dashed = false) {
        ctx.beginPath();
        ctx.strokeStyle = ctx.fillStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash(dashed ? [7, 5] : []);
        points.forEach(([s, y], i) => (i ? ctx.lineTo(px(s), py(y)) : ctx.moveTo(px(s), py(y))));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText(label, x, 59);
    }
    if (previous.length) series(previous, '#aab6ca', '对照', 582, true);
    series(active[0], '#80e5db', lab.series?.[0] ?? '当前曲线', 385);
    if (active[1]) series(active[1], '#ffcf84', lab.series[1], 480);

    const y = model.read(model.at);
    ctx.strokeStyle = '#80e5db80';
    ctx.beginPath();
    ctx.moveTo(px(model.at), top);
    ctx.lineTo(px(model.at), bottom);
    ctx.stroke();
    ctx.fillStyle = '#80e5db';
    ctx.beginPath();
    ctx.arc(px(model.at), py(y), 5, 0, Math.PI * 2);
    ctx.fill();

    root.querySelector('#reading-x').textContent = format.format(model.at);
    root.querySelector('#reading-y').textContent = [y, ...(model.second ? [model.second(model.at)] : [])].map(v => format.format(v)).join(' / ');
    const [label, value, unit] = model.extra;
    root.querySelector('#reading-extra').previousElementSibling.textContent = label;
    root.querySelector('#reading-extra').textContent = format.format(value) + ' ' + unit;
    return model;
}

form.addEventListener('input', draw);
form.addEventListener('reset', () => requestAnimationFrame(draw));
root.querySelector('#pin-run').addEventListener('click', () => {
    reference = draw();
    clear.disabled = false;
    status.textContent = '已保存主曲线。调节参数后，灰色虚线显示对照值。';
    draw();
});
clear.addEventListener('click', () => {
    reference = undefined;
    clear.disabled = true;
    status.textContent = '已移除对照曲线。';
    draw();
});
draw();
