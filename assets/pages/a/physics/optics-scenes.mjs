const warm = '#ffd28f';
const aqua = '#8ee9e0';
const ink = '#b8cbd9';
const screen = { center: 745, radius: 140, radialY: 236, left: 592, top: 125, width: 306, height: 216 };

export function opticsProbe(slug, model, x, y, dragging = false) {
    const radial = slug === 'newton-rings' || slug === 'equal-inclination';
    const r = Math.hypot(x - screen.center, y - screen.radialY);
    const left = x - screen.left;
    const inside = radial ? r <= screen.radius
        : left >= 0 && left < screen.width && y >= screen.top && y <= screen.top + screen.height;
    if (!inside && !dragging) return undefined;
    const start = model.start ?? 0;
    const u = radial ? r / screen.radius : left / (screen.width - 1);
    return start + (model.end - start) * Math.min(1, Math.max(0, u));
}

export function spectralColor(wavelength) {
    if (wavelength < 490) return [Math.max(0, (465 - wavelength) * 2.6), (wavelength - 410) * 2.5, 255];
    if (wavelength < 550) return [(wavelength - 490) * 1.15, 255, (550 - wavelength) * 3.6];
    if (wavelength < 620) return [(wavelength - 550) * 2.6 + 69, 255 - (wavelength - 550) * 2.9, 35];
    return [255, Math.max(20, 52 - (wavelength - 620) * .56), 40];
}

export function expose(ctx, width, height, wavelength, intensity, radial = false) {
    const image = ctx.createImageData(width, height);
    const rgb = spectralColor(wavelength);
    const oversample = radial ? 4 : 1;
    const resolution = radial ? width * oversample / 2 + 1 : width;
    const levels = Float32Array.from({ length: resolution }, (_, index) =>
        Math.pow(Math.max(0, intensity(index / (resolution - 1))), .61));
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const radius = radial ? Math.hypot(x + .5 - width / 2, y + .5 - height / 2) : x;
            const address = radius * oversample;
            const sample = Math.floor(address);
            const exposure = radius <= width / 2 || !radial
                ? levels[sample] + (address - sample) * ((levels[sample + 1] ?? levels[sample]) - levels[sample])
                : 0;
            const falloff = radial ? 1 - .28 * (radius * 2 / width) ** 2 : .8 + .2 * Math.sin(Math.PI * y / height);
            const i = 4 * (y * width + x);
            image.data[i] = 6 + rgb[0] * exposure * falloff * .88;
            image.data[i + 1] = 13 + rgb[1] * exposure * falloff * .88;
            image.data[i + 2] = 23 + rgb[2] * exposure * falloff * .88;
            image.data[i + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);
}

let plate;
let exposureKey;
function detector(stage, p, model, radial, label) {
    const {ctx, panel, text, line, dot} = stage;
    panel(563, 28, 365, 464);
    text(label, 588, 67, ink, 20);
    const width = radial ? screen.radius * 2 : screen.width;
    const height = radial ? width : screen.height;
    const left = screen.center - width / 2;
    const top = radial ? screen.radialY - screen.radius : screen.top;
    const start = model.start ?? 0;
    const span = model.end - start;
    const key = JSON.stringify([label, width, height, Object.entries(p).filter(([id]) => id !== 'x')]);
    if (key !== exposureKey) {
        plate ??= document.createElement('canvas');
        plate.width = width;
        plate.height = height;
        expose(plate.getContext('2d'), width, height, p.lambda, u => model.read(start + span * u), radial);
        exposureKey = key;
    }
    ctx.save();
    if (radial) {
        ctx.beginPath();
        ctx.arc(745, top + height / 2, width / 2, 0, 2 * Math.PI);
        ctx.clip();
    }
    ctx.drawImage(plate, left, top);
    ctx.restore();
    if (radial) {
        ctx.strokeStyle = '#53748a';
        ctx.beginPath();
        ctx.arc(745, top + height / 2, width / 2, 0, 2 * Math.PI);
        ctx.stroke();
    }
    const probe = (model.at - start) / span;
    const px = radial ? 745 + width / 2 * probe : left + (width - 1) * probe;
    if (radial) {
        line([[745, 236], [px, 236]], warm, 1.5, [5, 5]);
        dot(px, 236, 5, warm);
    } else {
        line([[px, top - 11], [px, top + height + 12]], warm, 1.5, [6, 5]);
        dot(px, top - 10, 4, warm);
    }
    line([[592, 398], [902, 398]], '#30485e', 1);
    text('探头位置', 595, 427, ink, 16);
    text('I / Iₘₐₓ', 897, 427, ink, 16, 'right');
    text(model.at.toFixed(2) + (label === '角分辨光谱' ? '°' : ' mm'), 595, 462, warm, 24);
    text(model.read(model.at).toFixed(3), 897, 462, aqua, 24, 'right');
}

function beam(stage, points, color, phase) {
    stage.line(points, color.replace('rgb', 'rgba').replace(')', ', .13)'), 13);
    stage.line(points, color, 2);
    let traveled = 0;
    const lengths = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]));
    const total = lengths.reduce((sum, d) => sum + d, 0);
    const tick = ((phase % 1) + 1) % 1;
    const position = total * tick;
    for (const [i, length] of lengths.entries()) {
        if (position <= traveled + length) {
            const t = (position - traveled) / length;
            const [x, y] = points[i];
            const [a, b] = points[i + 1];
            stage.dot(x + (a - x) * t, y + (b - y) * t, 4, '#e7fcff', 11);
            break;
        }
        traveled += length;
    }
}

function aperture(stage, p, model, clock, grating, color) {
    const {ctx, text, line, panel, grid, dot} = stage;
    grid(40, 95, 497, 288);
    text(grating ? '测角台 · 主极大与探头' : '远场光路 · 次波叠加', 42, 64, ink, 20);
    const [sx, sy] = [209, 243];
    const spacing = grating ? Math.min(6, 70 / p.N) : 0;
    const slit = grating ? (p.N - 1) * spacing + 5 : 11 + p.a * .4;
    line([[sx, 106], [sx, sy - slit / 2]], '#7996ac', 10);
    line([[sx, sy + slit / 2], [sx, 374]], '#7996ac', 10);
    panel(47, sy - 16, 55, 32, '#273d51', '#637a90', 5);
    beam(stage, [[102, sy], [sx, sy]], color, clock);
    for (let i = 0; i < 5; i++) {
        const px = sx - ((clock * 37 + i * 20) % 100);
        line([[px, sy - 36], [px, sy + 36]], '#aacbe04d', 1.5);
    }
    if (!grating) {
        const [dx, ey] = [504, 111];
        const py = sy - 2 * model.at;
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx + 4, ey, dx - sx, 266);
        ctx.clip();
        for (let source = -2; source <= 2; source++) {
            const cy = sy + source * slit / 5;
            dot(sx + 5, cy, 2, color, 8);
            ctx.strokeStyle = color.replace('rgb', 'rgba').replace(')', ', .27)');
            ctx.lineWidth = 1.3;
            const separation = p.lambda / 20;
            for (let i = 0; i < 12; i++) {
                ctx.beginPath();
                ctx.arc(sx, cy, i * separation + (clock * 40) % separation + 1, -1.32, 1.32);
                ctx.stroke();
            }
        }
        ctx.restore();
        line([[sx, sy], [dx, py]], warm, 1.5, [6, 6]);
        panel(dx, 109, 10, 268, '#1d3949', '#5f849a', 3);
        for (let y = 0; y < 263; y++) {
            ctx.fillStyle = color;
            ctx.globalAlpha = Math.pow(model.read((131 - y) / 2), .55);
            ctx.fillRect(dx + 2, y + 112, 6, 1);
        }
        ctx.globalAlpha = 1;
        dot(dx + 6, py, 5, warm, 8);
    } else {
        for (let i = 0; i < p.N; i++) dot(sx, sy + (i - (p.N - 1) / 2) * spacing, 1 + p.f * 2, color, 3);
        const radius = 217, radians = Math.PI / 180;
        ctx.strokeStyle = '#6c8ba3';
        ctx.beginPath();
        ctx.arc(sx, sy, radius, -75 * radians, 75 * radians);
        ctx.stroke();
        const polar = (a, r = radius) => [sx + r * Math.cos(a * radians), sy - r * Math.sin(a * radians)];
        for (let a = -75; a <= 75; a += 15) {
            line([polar(a, radius - 6), polar(a, radius + 5)], '#6c8ba3', 1);
            text(a + '°', ...polar(a, radius + 26), ink, 13, 'center');
        }
        const quotient = p.lambda * p.d / 1e6;
        const maxOrder = Math.floor(Math.sin(75 * radians) / quotient);
        for (let m = -maxOrder; m <= maxOrder; m++) {
            const angle = Math.asin(m * quotient) / radians;
            const intensity = model.read(angle);
            if (intensity < 1e-8) {
                line([[sx, sy], polar(angle)], '#7790a16b', 1.5, [4, 7]);
                continue;
            }
            line([[sx, sy], polar(angle)], color.replace('rgb', 'rgba').replace(')', ', ' + (.2 + .65 * Math.sqrt(intensity)) + ')'), 2);
            dot(...polar(angle), 2.8 + 3 * Math.sqrt(intensity), color, 12 * intensity);
            dot(...polar(angle, (clock * 92) % radius), 2, color, 8);
        }
        line([[sx, sy], polar(model.at)], warm, 1.6, [6, 5]);
        dot(...polar(model.at), 5, warm, 8);
    }
    text('单色光源', 45, 420, ink, 16);
    text(grating ? '光栅' : '狭缝', 209, 420, ink, 16, 'center');
    text(grating ? '转动探头扫描角度' : '光屏截面', 508, 420, ink, 16, 'right');
}

function film(stage, p, model, clock, rings, color) {
    const {ctx, text, line, panel, grid, dot} = stage;
    text(rings ? '装置剖面 · 透镜与玻璃平板' : '实验台剖面 · 空气劈尖', 42, 64, ink, 20);
    grid(41, 98, 498, 309);
    const baseline = 352;
    panel(55, baseline, 466, 39, '#1b384c', '#83a6b9', 5);
    const middle = 289;
    const left = 66, right = 510;
    const low = x => rings
        ? baseline - p.g * .044 - 80 / Math.sqrt(p.R) * ((x - middle) / 223) ** 2
        : baseline - p.g * .046 - (x - left) * p.a * .25;
    const curve = Array.from({length: 101}, (_, i) => {
        const x = left + (right - left) * i / 100;
        return [x, low(x)];
    });
    const upper = rings ? 190 : 218;
    ctx.beginPath();
    ctx.moveTo(left, upper);
    ctx.lineTo(right, upper);
    for (let i = curve.length - 1; i >= 0; i--) ctx.lineTo(...curve[i]);
    ctx.closePath();
    const glass = ctx.createLinearGradient(0, upper, 0, baseline);
    glass.addColorStop(0, '#679dc058');
    glass.addColorStop(1, '#2c62787a');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = '#86adc7';
    ctx.lineWidth = 2;
    ctx.stroke();
    const x = rings ? middle + 199 * model.at / model.end : left + 418 * model.at / model.end;
    const floor = low(x);
    const run = x > 465 ? -1 : 1;
    const origin = Math.max(43, Math.min(530, x - run * 61));
    beam(stage, [[origin, 106], [x, floor], [x + run * 30, 110]], color, clock * .55);
    beam(stage, [[x, floor], [x + run * 5, baseline], [x + run * 10, low(x + run * 10)], [x + run * 42, 112]], color, clock * .55 + .04);
    line([[x, floor], [x, baseline]], warm, 2.5);
    dot(x, floor, 4, warm, 9);
    text(rings ? '平凸透镜' : '上玻璃板', 86, upper + 28, '#deeffb', 16);
    text('基准玻璃平板', 75, baseline + 27, '#deeffb', 16);
    text('采样点空气膜厚', 52, 443, ink, 16);
    text(model.thickness(model.at).toFixed(0) + ' nm', 511, 443, warm, 23, 'right');
}

function michelson(stage, p, model, clock, color) {
    const {text, panel, line, grid, dot} = stage;
    text('实验台 · 分光与双臂往返', 42, 64, ink, 20);
    grid(41, 96, 497, 323);
    const [x, y] = [269, 248];
    const mirror = 443 + p.d / 7;
    panel(44, y - 16, 59, 33, '#273d51', '#637a90', 5);
    panel(mirror, y - 44, 11, 88, '#667f9b', '#9cbed2', 2);
    panel(x - 44, 104, 88, 11, '#667f9b', '#9cbed2', 2);
    line([[x - 28, y - 28], [x + 28, y + 28]], '#668da6', 13);
    beam(stage, [[103, y], [x, y], [mirror, y]], color, clock * .5);
    beam(stage, [[x, y], [x, 115]], color, clock * .65);
    beam(stage, [[mirror, y + 5], [x - 5, y + 5], [x - 5, 398]], color, clock * .52);
    beam(stage, [[x + 5, 115], [x + 5, y], [x + 5, 398]], color, clock * .54);
    line([[x - 31, 365], [x + 31, 365]], '#7fbdd4', 5);
    dot(x, 398, 5, warm, 9);
    text('分光镜', 298, 285, ink, 16);
    text('固定镜', 328, 112, ink, 16);
    text('动镜', mirror + 5, y + 71, ink, 16, 'center');
    text('焦平面', x, 439, ink, 16, 'center');
    text('Δ = ' + (2 * p.d * Math.cos(Math.atan(model.at / p.f))).toFixed(2) + ' μm', 489, 443, warm, 21, 'right');
}

export function drawOpticsScene(stage, lab, p, model, clock) {
    const color = 'rgb(' + spectralColor(p.lambda).map(Math.round).join(', ') + ')';
    switch (lab.slug) {
        case 'single-slit':
            aperture(stage, p, model, clock, false, color);
            detector(stage, p, model, false, '光屏 · 实空间');
            break;
        case 'diffraction-grating':
            aperture(stage, p, model, clock, true, color);
            detector(stage, p, model, false, '角分辨光谱');
            break;
        case 'equal-thickness':
            film(stage, p, model, clock, false, color);
            detector(stage, p, model, false, '显微镜 · 平行条纹');
            break;
        case 'equal-inclination':
            michelson(stage, p, model, clock, color);
            detector(stage, p, model, true, '焦平面 · 等倾圆纹');
            break;
        case 'newton-rings':
            film(stage, p, model, clock, true, color);
            detector(stage, p, model, true, '显微镜 · 反射牛顿环');
            break;
    }
}
