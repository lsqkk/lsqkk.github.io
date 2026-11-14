import { backdrop, colors, controlChanges, dot, experimentCanvas, get, label, lightPulse, line, number, pointerPosition, simulationClock, write } from './workbench.mjs';
import { doubleSlitIntensity } from './models.mjs';

const bounds = { left: 68, right: 683, top: 232, bottom: 382 };
const halfScreen = 24;
let travel = 0;

function parameters() {
    return {
        wavelength: number('wavelength') * 1e-9,
        spacing: number('spacing') * 1e-6,
        slitWidth: number('slit-width') * 1e-6,
        distance: number('distance'),
    };
}

function spectralColor(wavelength) {
    if (wavelength < 445) return [115, 74, 255];
    if (wavelength < 490) return [50, 150, 255];
    if (wavelength < 510) return [62, 225, 218];
    if (wavelength < 570) return [152, 245, 86];
    if (wavelength < 600) return [255, 209, 74];
    if (wavelength < 635) return [255, 148, 75];
    return [255, 89, 78];
}

function screenPosition(x) {
    return (2 * (x - bounds.left) / (bounds.right - bounds.left) - 1) * halfScreen;
}

const { canvas, paint, width, height } = experimentCanvas((ctx, w, h) => {
    const { wavelength, spacing, slitWidth, distance } = parameters();
    const { left, right, top, bottom } = bounds;
    const [red, green, blue] = spectralColor(number('wavelength'));
    const probe = number('probe');
    const intensityAt = (x) => doubleSlitIntensity(screenPosition(x) / 1000, wavelength, spacing, slitWidth, distance);

    backdrop(ctx, w, h, false);
    const ink = `rgb(${red}, ${green}, ${blue})`;
    const probeX = left + (probe + halfScreen) * (right - left) / (2 * halfScreen);
    const slitLeft = 360 - number('spacing') * .2;
    const slitRight = 360 + number('spacing') * .2;
    const slitHalf = 1 + number('slit-width') * .07;
    label(ctx, '双缝与探针光路', left, 32);
    const paths = [[left, slitLeft - slitHalf], [slitLeft + slitHalf, slitRight - slitHalf], [slitRight + slitHalf, right]];
    for (const [a, b] of paths) line(ctx, a, 57, b, 57, colors.muted, 5);
    for (const slit of [slitLeft, slitRight]) {
        line(ctx, slit, 57, probeX, 148, '#dbe6fa70', 1.5);
        lightPulse(ctx, slit, 57, probeX, 148, travel, ink, 38);
        dot(ctx, slit, 57, 3.5, ink);
    }
    label(ctx, '探测屏', left, 135);
    for (let x = left; x <= right; x++) {
        const glow = Math.sqrt(intensityAt(x).intensity);
        ctx.fillStyle = `rgb(${red * glow}, ${green * glow}, ${blue * glow})`;
        ctx.fillRect(x, 148, 1, 38);
    }
    ctx.strokeStyle = colors.grid;
    ctx.strokeRect(left - .5, 147.5, right - left + 1, 39);
    label(ctx, '相对光强', left, 216);
    for (let level = 0; level <= 4; level++) {
        const y = bottom - (bottom - top) * level / 4;
        line(ctx, left, y, right, y);
        if (level % 2 === 0) label(ctx, (level / 4).toFixed(1), left - 10, y + 5, colors.muted, 'right');
    }
    for (let mm = -24; mm <= 24; mm += 8) {
        const x = left + (mm + halfScreen) * (right - left) / (2 * halfScreen);
        line(ctx, x, top, x, bottom);
        label(ctx, String(mm), x, bottom + 25, colors.muted, 'center');
    }
    label(ctx, '屏幕位置 y / mm', (left + right) / 2, h - 11, colors.muted, 'center');

    for (const [series, stroke, dash] of [['envelope', colors.muted, [5, 6]], ['intensity', colors.mint, []]]) {
        ctx.setLineDash(dash);
        ctx.beginPath();
        for (let x = left; x <= right; x++) {
            const y = bottom - intensityAt(x)[series] * (bottom - top);
            if (x === left) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    ctx.setLineDash([]);
    line(ctx, probeX, 148, probeX, 188, colors.amber);
    line(ctx, probeX, top, probeX, bottom, colors.amber);
    dot(ctx, probeX, bottom - intensityAt(probeX).intensity * (bottom - top), 5, colors.amber);
});

function render() {
    const { wavelength, spacing, slitWidth, distance } = parameters();
    const probe = number('probe') / 1000;
    const { intensity } = doubleSlitIntensity(probe, wavelength, spacing, slitWidth, distance);
    write('wavelength-output', number('wavelength') + ' nm');
    write('spacing-output', number('spacing') + ' μm');
    write('slit-width-output', number('slit-width') + ' μm');
    write('distance-output', distance.toFixed(1) + ' m');
    write('probe-output', number('probe').toFixed(1) + ' mm');
    write('fringe', (1000 * wavelength * distance / spacing).toFixed(2) + ' mm');
    write('path', (spacing * probe / Math.hypot(probe, distance) / wavelength).toFixed(2));
    write('intensity', (intensity * 100).toFixed(1) + '%');
    paint();
}

canvas.addEventListener('pointerdown', (event) => {
    const { x } = pointerPosition(canvas, event, width, height);
    get('probe').value = Math.max(-halfScreen, Math.min(halfScreen, screenPosition(x))).toFixed(1);
    render();
});

for (const [id, wavelength] of [['red-light', 650], ['blue-light', 450]]) {
    get(id).addEventListener('click', () => {
        get('wavelength').value = wavelength;
        render();
    });
}

controlChanges(render);
simulationClock(paint, dt => { travel += 135 * dt; });
render();
