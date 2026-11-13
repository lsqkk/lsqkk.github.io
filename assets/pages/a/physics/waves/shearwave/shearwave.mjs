import { arrow, backdrop, colors, controlChanges, dot, experimentCanvas, get, label, line, number, simulationClock, tau, write } from '../../workbench.mjs';

const length = 8;
let phaseOffset = 0;

function value(x) {
    const phase = tau * x / number('wavelength') - phaseOffset;
    const sine = Math.sin(phase);
    let shape = sine;
    if (get('shape').value === 'triangle') shape = 2 * Math.asin(sine) / Math.PI;
    if (get('shape').value === 'square') shape = sine >= 0 ? 1 : -1;
    return shape * number('amplitude');
}

const { paint } = experimentCanvas((ctx, width, height) => {
    const left = 55;
    const right = width - 39;
    const middle = height / 2 + 12;
    const pixelsPerMeter = (right - left) / length;
    const wavelength = number('wavelength');
    const probe = number('probe');
    const amplitudeScale = 106;

    backdrop(ctx, width, height);
    arrow(ctx, right - 115, 48, right, 48, colors.mint);
    label(ctx, '传播方向', right, 31, colors.mint, 'right');
    const wavelengthEnd = left + wavelength * pixelsPerMeter;
    line(ctx, left, 68, wavelengthEnd, 68, colors.blue, 2);
    for (const x of [left, wavelengthEnd]) line(ctx, x, 62, x, 74, colors.blue, 2);
    label(ctx, 'λ = ' + wavelength.toFixed(1) + ' m', (left + wavelengthEnd) / 2, 54, colors.blue, 'center');
    line(ctx, left, middle, right, middle, colors.muted);
    for (let x = 0; x <= length; x += 2) {
        const px = left + x * pixelsPerMeter;
        line(ctx, px, middle - 5, px, middle + 5, colors.muted);
        label(ctx, x + ' m', px, height - 30, colors.muted, 'center');
    }

    ctx.beginPath();
    for (let px = left; px <= right; px++) {
        const y = middle - value((px - left) / pixelsPerMeter) * amplitudeScale;
        if (px === left) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
    }
    ctx.strokeStyle = colors.mint;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const nodes = number('nodes');
    for (let index = 0; index < nodes; index++) {
        const x = index * length / (nodes - 1);
        dot(ctx, left + x * pixelsPerMeter, middle - value(x) * amplitudeScale, 3, colors.text);
    }
    const probeX = left + probe * pixelsPerMeter;
    ctx.setLineDash([5, 7]);
    line(ctx, probeX, middle - amplitudeScale - 11, probeX, middle + amplitudeScale + 11, colors.amber);
    ctx.setLineDash([]);
    dot(ctx, probeX, middle - value(probe) * amplitudeScale, 8, colors.amber);
});

function render() {
    write('displacement', value(number('probe')).toFixed(2) + ' m');
    paint();
}

function update() {
    const frequency = number('frequency');
    const wavelength = number('wavelength');
    write('wavelength-output', wavelength.toFixed(1) + ' m');
    write('frequency-output', frequency.toFixed(2) + ' Hz');
    write('amplitude-output', number('amplitude').toFixed(2) + ' m');
    write('nodes-output', String(number('nodes')));
    write('probe-output', number('probe').toFixed(2) + ' m');
    write('rate-output', number('rate').toFixed(2) + '×');
    write('speed', (wavelength * frequency).toFixed(2) + ' m/s');
    write('period', (1 / frequency).toFixed(2) + ' s');
    render();
}

const clock = simulationClock(render, (dt) => {
    phaseOffset = (phaseOffset + tau * number('frequency') * number('rate') * dt) % tau;
});
get('step').addEventListener('click', () => {
    clock.pause();
    phaseOffset = (phaseOffset + tau / 16) % tau;
    render();
});
get('experiment-form').addEventListener('reset', () => { phaseOffset = 0; });
controlChanges(update);
update();
