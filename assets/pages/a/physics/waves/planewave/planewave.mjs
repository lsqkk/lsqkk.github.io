import { colors, controlChanges, dot, experimentCanvas, get, label, number, pointerPosition, radians, simulationClock, tau, write } from '../../workbench.mjs';

const extent = { x: 10, y: 6 };
const field = document.createElement('canvas');
field.width = 240;
field.height = 144;
const fieldContext = field.getContext('2d');
const image = fieldContext.createImageData(field.width, field.height);
const real = new Float32Array(field.width * field.height);
const imaginary = new Float32Array(real.length);
let time = 0;
let phaseOffset = 0;
let sources = initialSources();

function initialSources() {
    return [{ x: 3.5, y: 3 }, { x: 6.5, y: 3 }];
}

function mode() {
    return get('mode').value;
}

function selected() {
    return sources[Number(get('source').value)];
}

function rebuildField() {
    const type = mode();
    const waveNumber = tau / number('wavelength');
    const amplitude = number('amplitude');
    const phaseShift = radians(number('phase'));
    for (let py = 0; py < field.height; py++) {
        const y = py * extent.y / (field.height - 1);
        for (let px = 0; px < field.width; px++) {
            const index = py * field.width + px;
            const x = px * extent.x / (field.width - 1);
            let phase = waveNumber * x;
            let weight = amplitude;
            if (type !== 'plane') {
                const distance = Math.hypot(x - sources[0].x, y - sources[0].y);
                phase = waveNumber * distance;
                weight = amplitude / Math.sqrt(1 + distance);
            }
            real[index] = weight * Math.cos(phase);
            imaginary[index] = weight * Math.sin(phase);
            if (type === 'double') {
                const distance = Math.hypot(x - sources[1].x, y - sources[1].y);
                phase = waveNumber * distance + phaseShift;
                weight = amplitude / Math.sqrt(1 + distance);
                real[index] += weight * Math.cos(phase);
                imaginary[index] += weight * Math.sin(phase);
            }
        }
    }
}

function updateImage() {
    const cosine = Math.cos(phaseOffset);
    const sine = Math.sin(phaseOffset);
    const magnitude = get('view').value === 'amplitude';
    for (let i = 0; i < real.length; i++) {
        const value = magnitude ? Math.hypot(real[i], imaginary[i]) : imaginary[i] * cosine - real[i] * sine;
        const weight = Math.min(1, Math.abs(value));
        const positive = value >= 0;
        image.data[i * 4] = 17 + weight * (positive ? 91 : 93);
        image.data[i * 4 + 1] = 28 + weight * (positive ? 209 : 82);
        image.data[i * 4 + 2] = 42 + weight * (positive ? 170 : 200);
        image.data[i * 4 + 3] = 255;
    }
    fieldContext.putImageData(image, 0, 0);
}

const { canvas, paint, width, height } = experimentCanvas((ctx, w, h) => {
    ctx.drawImage(field, 0, 0, w, h);
    if (mode() === 'plane') return;
    sources.slice(0, mode() === 'double' ? 2 : 1).forEach((source, index) => {
        const x = source.x * w / extent.x;
        const y = source.y * h / extent.y;
        dot(ctx, x, y, 10, colors.background);
        dot(ctx, x, y, 6, source === selected() ? colors.amber : colors.text);
        ctx.fillStyle = colors.background;
        ctx.fillRect(x + 13, y - 11, 32, 22);
        label(ctx, index ? 'B' : 'A', x + 29, y + 6, colors.text, 'center');
    });
});

function drawFrame() {
    write('time', time.toFixed(2) + ' s');
    updateImage();
    paint();
}

function render() {
    const type = mode();
    const animated = get('view').value === 'instant';
    const point = selected();
    const pointDisabled = type === 'plane';
    get('source').disabled = type !== 'double';
    get('source-x').disabled = pointDisabled;
    get('source-y').disabled = pointDisabled;
    get('phase').disabled = type !== 'double';
    get('step').disabled = !animated;
    clock.setAvailable(animated);
    get('source-x').value = point.x;
    get('source-y').value = point.y;

    write('wavelength-output', number('wavelength').toFixed(2) + ' m');
    write('frequency-output', number('frequency').toFixed(2) + ' Hz');
    write('amplitude-output', number('amplitude').toFixed(2) + ' m');
    write('source-x-output', pointDisabled ? '—' : point.x.toFixed(2) + ' m');
    write('source-y-output', pointDisabled ? '—' : point.y.toFixed(2) + ' m');
    write('phase-output', type === 'double' ? number('phase') + '°' : '—');
    write('speed', (number('wavelength') * number('frequency')).toFixed(2) + ' m/s');
    write('separation', type === 'double' ? Math.hypot(sources[0].x - sources[1].x, sources[0].y - sources[1].y).toFixed(2) + ' m' : '—');
    rebuildField();
    drawFrame();
}

const clock = simulationClock(drawFrame, (dt) => {
    time += dt;
    phaseOffset = (phaseOffset + dt * tau * number('frequency')) % tau;
});
get('step').addEventListener('click', () => {
    clock.pause();
    time += 1 / (16 * number('frequency'));
    phaseOffset = (phaseOffset + tau / 16) % tau;
    drawFrame();
});
get('mode').addEventListener('input', () => {
    if (mode() !== 'double') get('source').value = '0';
});
get('source-x').addEventListener('input', () => { selected().x = number('source-x'); });
get('source-y').addEventListener('input', () => { selected().y = number('source-y'); });
get('experiment-form').addEventListener('reset', () => {
    sources = initialSources();
    time = 0;
    phaseOffset = 0;
});
canvas.addEventListener('pointerdown', (event) => {
    if (mode() === 'plane' || event.button !== 0) return;
    const { x, y } = pointerPosition(canvas, event, width, height);
    selected().x = Math.round(Math.min(9.5, Math.max(.5, x * extent.x / width)) * 20) / 20;
    selected().y = Math.round(Math.min(5.5, Math.max(.5, y * extent.y / height)) * 20) / 20;
    render();
});
controlChanges(render);
render();
