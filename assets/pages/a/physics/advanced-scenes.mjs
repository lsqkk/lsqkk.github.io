import { magneticPoint, torsionResponse } from './advanced-labs.mjs';

const mint = '#68efd7';
const amber = '#ffc984';
const blue = '#9db6fc';
const muted = '#7592ab';
const steel = '#3a5970';
const turn = 2 * Math.PI;
const signed = (n, digits = 2) => (n > 0 ? '+' : '') + n.toFixed(digits);

function tickScale(stage, x, y, width, max, step) {
    stage.line([[x, y], [x + width, y]], steel);
    for (let value = 0; value <= max; value += step) {
        const xx = x + width * value / max;
        stage.line([[xx, y], [xx, y + 9]], steel);
        stage.text(String(value), xx, y + 28, muted, 16, 'center');
    }
}

function ring(ctx, x, y, r, color, width = 2) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, turn);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
}

function magnetic(stage, p, model, clock) {
    const { ctx, panel, text, line, arrow, dot, grid } = stage;
    const beam = model.beam;
    panel(30, 83, 610, 327, '#0c1a2a');
    panel(663, 83, 267, 327, '#0b1727');
    text('螺线管侧视', 48, 116, blue, 19);
    text('探测屏横截面', 682, 116, blue, 19);
    grid(55, 144, 560, 215, 28);
    const x0 = 80;
    const span = 515;
    const y0 = 252;
    const scale = Math.max(100, 2000 * beam.radius);
    const map = (z, y) => [x0 + span * z / .6, y0 + y * 83000 / scale];
    const screen = x0 + span * p.x / 60;
    const crossX = 796;
    const crossY = 241;
    const screenScale = 99 / scale * 1000;

    panel(x0 - 13, y0 - 21, 24, 42, '#304758', amber, 4);
    for (let i = 0; i <= 11; i++) {
        const x = 100 + 43 * i;
        const gradient = ctx.createLinearGradient(0, 151, 0, 339);
        gradient.addColorStop(0, '#a47450');
        gradient.addColorStop(.5, '#a4745020');
        gradient.addColorStop(1, '#a47450');
        ctx.beginPath();
        ctx.ellipse(x, y0, 10, 83, 0, 0, turn);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }

    line([[x0, y0], [610, y0]], '#89adc16a', 1, [6, 7]);
    arrow(110, 149, 201, 149, amber);
    text('B', 211, 154, amber, 18);
    const samples = 150;
    for (let j = 0; j < 12; j++) {
        const azimuth = turn * j / 12;
        const coords = Array.from({ length: samples + 1 }, (_, i) => {
            const [z, y] = magneticPoint(beam, .6 * i / samples, azimuth);
            return map(z, y);
        });
        line(coords, j % 3 === 0 ? '#68efd7a3' : '#68efd746', j % 3 === 0 ? 1.8 : 1);
        const [z, y] = magneticPoint(beam, .6 * ((clock * .38 + j * .17) % 1), azimuth);
        dot(...map(z, y), 3, mint, 10);
    }
    for (let z = beam.pitch; z <= .6; z += beam.pitch) dot(...map(z, 0), 4, amber, 9);
    line([[screen, 154], [screen, 346]], blue, 2.5);
    tickScale(stage, x0, 353, span, 60, 10);

    for (const radius of [33, 66, 99]) ring(ctx, crossX, crossY, radius, '#35516a');
    line([[crossX - 100, crossY], [crossX + 100, crossY]], steel, 1);
    line([[crossX, crossY - 100], [crossX, crossY + 100]], steel, 1);
    const spot = model.read(p.x);
    ring(ctx, crossX, crossY, Math.max(.5, spot * screenScale / 1000), '#68efd75e');
    for (let j = 0; j < 18; j++) {
        const [, y, z] = magneticPoint(beam, p.x / 100, turn * j / 18);
        dot(crossX + y * screenScale, crossY + z * screenScale, 2.9, mint, 9);
    }
    text('束斑半径 ' + spot.toFixed(2) + ' mm', crossX, 377, mint, 20, 'center');
    text('灯丝', 55, 451, amber, 20);
    text('探测屏 ' + p.x.toFixed(1) + ' cm', 308, 451, blue, 20);
    text('外圈 ' + scale.toFixed(0) + ' mm', crossX, 451, muted, 18, 'center');
}

function hall(stage, p, model, clock) {
    const { ctx, line, grid, panel, text, arrow, dot } = stage;
    const voltage = model.read(p.b);
    const top = voltage < 0 ? amber : blue;
    const bottom = voltage > 0 ? amber : blue;
    panel(63, 146, 566, 255, '#102335', steel, 22);
    panel(651, 146, 255, 210, '#0a1522', steel, 20);
    panel(85, 178, 520, 191, '#102c40', '#2b4e68', 7);
    grid(99, 190, 492, 166, 27);
    panel(57, 215, 37, 113, '#a47450', amber, 6);
    panel(598, 215, 37, 113, '#a47450', amber, 6);
    arrow(108, 113, 292, 113, amber);
    text('常规电流  ' + p.i.toFixed(1) + ' mA', 311, 120, amber, 20);
    if (p.b !== 0) {
        ctx.globalAlpha = .24 + .62 * Math.abs(p.b);
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 10; col++) {
                const x = 117 + col * 51;
                const y = 217 + row * 54;
                ring(ctx, x, y, 9, blue, 1.3);
                if (p.b > 0) dot(x, y, 2.1, blue);
                else {
                    line([[x - 4, y - 4], [x + 4, y + 4]], blue, 1.4);
                    line([[x + 4, y - 4], [x - 4, y + 4]], blue, 1.4);
                }
            }
        }
        ctx.globalAlpha = 1;
    }
    const drift = p.i / 30;
    for (let j = 0; j < 31; j++) {
        const motion = (((j * .617 + clock * drift * .39 * p.q) % 1) + 1) % 1;
        const x = 111 + 475 * motion;
        const y = 232 + 19 * (j % 5);
        line([[x - p.q * 14 * drift, y], [x, y]], '#68efd753', 1.5);
        dot(x, y, 3.1, mint, 7);
    }
    if (voltage !== 0) {
        ctx.globalAlpha = .38 + .62 * Math.min(1, Math.abs(voltage) / 65);
        line([[101, 185], [588, 185]], top, 3);
        line([[101, 363], [588, 363]], bottom, 3);
        for (let j = 0; j < 18; j++) {
            text(voltage > 0 ? '−' : '+', 110 + j * 27, 205, top, 16);
            text(voltage > 0 ? '+' : '−', 110 + j * 27, 353, bottom, 16);
        }
        ctx.globalAlpha = 1;
    }
    dot(373, 185, 5, blue);
    dot(395, 363, 5, amber);
    line([[373, 185], [373, 132], [680, 132], [680, 190]], blue, 2);
    line([[395, 363], [395, 419], [878, 419], [878, 318]], amber, 2);
    text('霍尔电压  Uₕ', 681, 188, blue, 20);
    panel(672, 205, 214, 65, '#132e35', '#367064', 8);
    text(signed(voltage) + ' mV', 779, 246, mint, 29, 'center');
    text(p.q < 0 ? '载流子：电子' : '载流子：空穴', 681, 302, muted, 18);
    text('B = ' + signed(p.b) + ' T', 96, 447, blue, 20);
    text(p.b === 0 ? '无外加磁场' : p.b > 0 ? '磁场朝屏外' : '磁场朝屏内', 320, 447, muted, 19);
}

function spectral(wavelength) {
    if (wavelength < 380) return '#bd9aff';
    if (wavelength < 490) return '#7eaeff';
    if (wavelength < 555) return '#6cecb4';
    if (wavelength < 600) return '#f8d171';
    return '#f88582';
}

function photoelectric(stage, p, model, clock) {
    const { panel, text, arrow, dot, line, grid } = stage;
    const { energy, stopping, current } = model.signal;
    const light = spectral(p.l);
    panel(180, 132, 563, 268, '#0b202f', '#41647d', 108);
    grid(285, 179, 375, 176, 25);
    panel(209, 177, 26, 176, '#77a7bc78', '#9dc2cb', 8);
    panel(280, 162, 18, 207, '#bd905d', amber, 8);
    panel(692, 162, 18, 207, '#467e80', mint, 8);
    text('光阴极', 275, 130, amber, 20);
    text('收集极', 680, 130, mint, 20);
    text('单色光', 51, 180, light, 20);
    panel(52, 228, 59, 79, '#263a50', light, 9);
    panel(44, 244, 11, 46, '#0a1828', steel, 5);
    for (let row = 0; row < 3; row++) {
        const y = 243 + row * 23;
        line([[111, y], [280, y]], light + '49', 1.5);
        arrow(141, y, 172, y, light);
        const count = Math.max(1, Math.floor(p.f / 14));
        for (let j = 0; j < count; j++) {
            const phase = (clock * 1.4 + j / count + row * .13) % 1;
            dot(115 + 165 * phase, y, 3.5, light, 10);
        }
    }
    if (stopping > 0) {
        const count = 4 + Math.floor(p.f / 5);
        for (let j = 0; j < count; j++) {
            const k = stopping * (.02 + .98 * ((j * .618) % 1));
            const phase = (clock * .66 + j / count) % 1;
            const u = Math.sqrt(k);
            const collectionSpeed = Math.sqrt(Math.max(0, k + p.v));
            const duration = k + p.v > 0 ? 2 / (u + collectionSpeed) : -4 * u / p.v;
            const elapsed = phase * duration;
            const fraction = u * elapsed + p.v * .25 * elapsed ** 2;
            const x = 299 + Math.min(1, fraction) * 393;
            const y = 204 + (j % 7) * 19 + 8 * Math.sin(j * 4) * fraction;
            const movingRight = u + p.v * elapsed / 2 > 0;
            line([[x + (movingRight ? -1 : 1) * Math.min(13, Math.abs(x - 299)), y], [x, y]], '#68efd771', 2);
            dot(x, y, 3.2, mint, 10);
        }
    }
    if (Math.abs(p.v) > .001) {
        const dir = Math.sign(p.v);
        arrow(498 - 43 * dir, 187, 498 + 43 * dir, 187, blue, 2);
        text('电子受力方向', 499, 168, blue, 16, 'center');
    }
    panel(763, 163, 162, 194, '#0b1726', steel, 12);
    text('入射光子', 781, 200, blue, 18);
    text(energy.toFixed(2) + ' eV', 781, 233, light, 25);
    text('阳极电流', 781, 284, blue, 18);
    text(current(p.v).toFixed(2) + ' μA', 781, 321, mint, 24);
    line([[289, 372], [289, 435], [437, 435]], amber);
    line([[701, 372], [701, 435], [568, 435]], mint);
    panel(437, 413, 131, 42, '#15283b', steel, 6);
    text(signed(p.v) + ' V', 503, 440, blue, 21, 'center');
}

function pohl(stage, p, _model, clock) {
    const { ctx, line, panel, text, grid, dot } = stage;
    const phase = turn * p.f * clock;
    const response = torsionResponse(p.f, p.n, p.z);
    const angle = response.amplitude * Math.cos(phase - response.phase);
    const driveX = 168;
    const driveY = 259;
    const wheelX = 400;
    const wheelY = 259;
    panel(45, 99, 533, 323, '#0b1b2a');
    panel(603, 99, 312, 323, '#081625');
    text('驱动轮', 83, 138, amber, 20);
    text('扭摆示针', 338, 138, mint, 20);
    const eccentric = [driveX + 30 * Math.cos(phase), driveY + 30 * Math.sin(phase)];
    ring(ctx, driveX, driveY, 55, steel, 8);
    ring(ctx, driveX, driveY, 31, '#705638', 1.5);
    line([[driveX, driveY], eccentric], amber, 4);
    const lever = [wheelX + 86 * Math.cos(angle + Math.PI), wheelY + 86 * Math.sin(angle + Math.PI)];
    const spring = Array.from({ length: 24 }, (_, i) => [
        eccentric[0] + (lever[0] - eccentric[0]) * i / 23,
        eccentric[1] + (lever[1] - eccentric[1]) * i / 23 + (i === 0 || i === 23 ? 0 : i % 2 === 0 ? 6 : -6)
    ]);
    line(spring, '#93a9bd', 2.3);
    dot(...eccentric, 6, amber, 7);
    ring(ctx, wheelX, wheelY, 96, '#193a4b', 15);
    ring(ctx, wheelX, wheelY, 97, '#78aba5', 2.5);
    for (let j = 0; j < 12; j++) {
        const a = j * turn / 12 + angle;
        line([[wheelX + 22 * Math.cos(a), wheelY + 22 * Math.sin(a)], [wheelX + 87 * Math.cos(a), wheelY + 87 * Math.sin(a)]], '#38586c', 2);
    }
    for (let j = -6; j <= 6; j++) {
        const a = j * Math.PI / 12 - Math.PI / 2;
        line([[wheelX + 102 * Math.cos(a), wheelY + 102 * Math.sin(a)], [wheelX + 111 * Math.cos(a), wheelY + 111 * Math.sin(a)]], '#658c9c', 1.5);
    }
    line([[wheelX, wheelY], [wheelX + 110 * Math.sin(angle), wheelY - 110 * Math.cos(angle)]], mint, 4);
    dot(wheelX, wheelY, 11, '#a3b9c7');
    const magnetGap = 30 - 32 * p.z;
    panel(412 + magnetGap, 344, 64, 31, '#625b9c', blue, 5);
    text('涡流制动', 382, 397, blue, 17);

    text('驱动与响应 · 同周期', 627, 138, blue, 19);
    const left = 627;
    const width = 264;
    const middle = 250;
    grid(left, 176, width, 148, 22);
    line([[left, middle], [left + width, middle]], steel, 1);
    const wave = (lag, amplitude) => Array.from({ length: 111 }, (_, j) => [
        left + j / 110 * width, middle - amplitude * Math.cos(phase - turn * 2 * (1 - j / 110) - lag)
    ]);
    line(wave(0, 29), amber, 2, [5, 5]);
    const responseWave = wave(response.phase, Math.min(68, 74 * response.amplitude));
    line(responseWave, mint, 2.6);
    dot(...responseWave.at(-1), 4, mint, 9);
    text('驱动力矩', 638, 355, amber, 17);
    text('摆角', 798, 355, mint, 17);
    text('相位滞后 ' + (response.phase * 180 / Math.PI).toFixed(1) + '°', 627, 391, blue, 18);
}

const scenes = { 'magnetic-focus': magnetic, 'hall-effect': hall, photoelectric, 'pohl-resonance': pohl };

export function drawAdvancedScene(stage, lab, p, model, clock) {
    scenes[lab.slug]?.(stage, p, model, clock);
}
