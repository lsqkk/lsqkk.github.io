import { sampleCurve } from './experiments.mjs';
import { createStage } from './stage.mjs';

const color = { reading: '#83f0d9', second: '#ffc680', reference: '#aabbd0', axis: '#b8cbd9' };
const format = new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 4 });

export function createPlot(canvas, lab) {
    const stage = createStage(canvas);
    const { ctx, line, dot, text, w, h } = stage;
    const area = { left: 106, right: w - 48, top: 92, bottom: h - 85 };
    let cached;
    let domain;

    function update(model, reference, key) {
        if (key === cached?.key && reference === cached?.reference) return;
        const primary = sampleCurve(lab, model, model.read, 960);
        const secondary = model.second ? sampleCurve(lab, model, model.second, 960) : [];
        const prior = reference ? sampleCurve(lab, reference, reference.read, 960) : [];
        const signals = [[primary, color.reading], [secondary, color.second], [prior, color.reference, [8, 7]]];
        const values = [...primary, ...secondary, ...prior].map(point => point[1]);
        const start = Math.min(model.start ?? 0, reference?.start ?? Infinity);
        const end = Math.max(model.end, reference?.end ?? -Infinity);
        const low = Math.min(model.bounds?.[0] ?? 0, reference?.bounds?.[0] ?? 0, ...values);
        const high = Math.max(model.bounds?.[1] ?? 0, reference?.bounds?.[1] ?? 0, ...values);
        const padding = (high - low || 1) * .06;
        domain = { start, end, low: low - padding, high: high + padding };
        cached = { key, reference, signals };
    }

    function draw(model, reference, key) {
        update(model, reference, key);
        stage.begin();
        const { left, right, top, bottom } = area;
        const { start, end, low, high } = domain;
        const px = x => left + (x - start) / (end - start) * (right - left);
        const py = y => bottom - (y - low) / (high - low) * (bottom - top);

        text(lab.axes[1], left, 46, color.axis, 22);
        text(lab.axes[0], right, h - 24, color.axis, 22, 'right');

        for (let i = 0; i <= 5; i++) {
            const x = start + (end - start) * i / 5;
            const y = low + (high - low) * i / 5;
            line([[px(x), top], [px(x), bottom]], '#42608066', 1);
            line([[left, py(y)], [right, py(y)]], '#42608066', 1);
            text(format.format(x), px(x), bottom + 30, color.axis, 18, 'center');
            text(format.format(y), left - 13, py(y) + 6, color.axis, 18, 'right');
        }
        if (low < 0 && high > 0) line([[left, py(0)], [right, py(0)]], '#7f9db477', 1.5);
        const points = cached.signals;
        if (points[0][0].every(([, y]) => y >= 0)) {
            const filled = points[0][0].map(([x, y]) => [px(x), py(y)]);
            ctx.beginPath();
            ctx.moveTo(filled[0][0], py(0));
            filled.forEach(([x, y]) => ctx.lineTo(x, y));
            ctx.lineTo(filled.at(-1)[0], py(0));
            ctx.closePath();
            const wash = ctx.createLinearGradient(0, top, 0, bottom);
            wash.addColorStop(0, '#83f0d944');
            wash.addColorStop(1, '#83f0d906');
            ctx.fillStyle = wash;
            ctx.fill();
        }
        [...points].reverse().forEach(([samples, ink, dash]) => {
            if (samples.length) line(samples.map(([x, y]) => [px(x), py(y)]), ink, 3, dash);
        });
        const cursor = px(model.at);
        line([[cursor, top], [cursor, bottom]], '#ffffff88', 1.5, [5, 6]);
        dot(cursor, py(model.read(model.at)), 6, color.reading, 12);
        if (model.second) dot(cursor, py(model.second(model.at)), 5, color.second, 10);
    }

    function position(event) {
        const rect = canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width * w - area.left) / (area.right - area.left);
        return domain.start + (domain.end - domain.start) * Math.max(0, Math.min(x, 1));
    }

    return { draw, position };
}
