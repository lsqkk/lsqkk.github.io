import { arrow, backdrop, colors, controlChanges, degrees, dot, experimentCanvas, get, label, lightPulse, line, number, radians, simulationClock, write } from './workbench.mjs';
import { refraction } from './models.mjs';

function values() {
    return refraction(radians(number('angle')), Number(get('source').value), Number(get('target').value));
}

const { paint } = experimentCanvas((ctx, width, height) => {
    const { transmittedAngle } = values();
    const angle = radians(number('angle'));
    const cx = width / 2;
    const cy = height / 2;
    backdrop(ctx, width, height);
    ctx.fillStyle = '#31526955';
    ctx.fillRect(0, cy, width, cy);
    line(ctx, 0, cy, width, cy, colors.muted, 2);
    ctx.setLineDash([7, 8]);
    line(ctx, cx, 30, cx, height - 30, colors.muted);
    ctx.setLineDash([]);
    label(ctx, get('source').selectedOptions[0].textContent, 20, 34);
    label(ctx, get('target').selectedOptions[0].textContent, 20, height - 21);
    const n1 = Number(get('source').value);
    const n2 = Number(get('target').value);
    const sourceX = cx - 180 * Math.sin(angle);
    const sourceY = cy - 180 * Math.cos(angle);
    arrow(ctx, sourceX, sourceY, cx, cy, colors.amber, 3);
    lightPulse(ctx, sourceX, sourceY, cx, cy, travel / n1, colors.amber);
    if (Number(get('source').value) !== Number(get('target').value)) {
        arrow(ctx, cx, cy, cx + 180 * Math.sin(angle), cy - 180 * Math.cos(angle), colors.blue);
        lightPulse(ctx, cx, cy, cx + 180 * Math.sin(angle), cy - 180 * Math.cos(angle), travel / n1 - 180, colors.blue);
    }
    if (transmittedAngle !== null) {
        arrow(ctx, cx, cy, cx + 180 * Math.sin(transmittedAngle), cy + 180 * Math.cos(transmittedAngle), colors.mint, 3);
        lightPulse(ctx, cx, cy, cx + 180 * Math.sin(transmittedAngle), cy + 180 * Math.cos(transmittedAngle), (travel - 180 * n1) / n2, colors.mint, 48 * n1 / n2);
    } else {
        label(ctx, '发生全反射', width - 20, height - 21, colors.amber, 'right');
    }
    if (angle > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, 38, -Math.PI / 2 - angle, -Math.PI / 2);
        ctx.strokeStyle = colors.amber;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
    dot(ctx, cx, cy, 4, colors.text);
});
let travel = 0;

function render() {
    const { transmittedAngle, criticalAngle, speedRatio } = values();
    write('angle-output', number('angle') + '°');
    write('transmitted', transmittedAngle === null ? '全反射' : degrees(transmittedAngle).toFixed(1) + '°');
    write('critical', criticalAngle === null ? '无' : degrees(criticalAngle).toFixed(1) + '°');
    write('speed-ratio', speedRatio.toFixed(2));
    get('threshold').disabled = criticalAngle === null;
    paint();
}

get('swap').addEventListener('click', () => {
    const source = get('source');
    const target = get('target');
    [source.value, target.value] = [target.value, source.value];
    render();
});

get('threshold').addEventListener('click', () => {
    const { criticalAngle } = values();
    if (criticalAngle === null) return;
    const boundary = degrees(criticalAngle);
    get('angle').value = number('angle') > boundary ? Math.floor(boundary) : Math.floor(boundary) + 1;
    render();
});

controlChanges(render);
simulationClock(paint, dt => { travel += 120 * dt; });
render();
