export const foundationScenes = {
    projectile: {
        sceneTitle: '发射台与落点',
        sceneCaption: '青色矢量表示瞬时速度，金色矢量表示恒定重力加速度。横纵采用相同比例。',
        playback: ['t', 22],
        presets: [{ label: '低弧 30°', values: { a: 30 } }, { label: '最大射程 45°', values: { a: 45 } }, { label: '高弧 60°', values: { a: 60 } }]
    },
    spring: {
        sceneTitle: '水平振子与能量分配',
        sceneCaption: '无摩擦导轨上的滑块往复运动。观察动能与弹性势能的交换。',
        playback: ['t', 1]
    },
    collision: {
        sceneTitle: '气垫导轨',
        sceneCaption: '箭头表示两车速度的大小和方向。对比碰撞前后的总动量与动能。',
        playback: ['t', 1],
        presets: [{ label: '完全弹性', values: { e: 1 } }, { label: '完全非弹性', values: { e: 0 } }]
    },
    standing: {
        sceneTitle: '固定端弦与频闪观测',
        sceneCaption: '金色圆点标记波节，青色圆点标记观测质点。虚线给出每一点的最大位移。',
        playback: ['p', 140]
    },
    beats: {
        sceneTitle: '双源信号示波器',
        sceneCaption: '三条通道共用时间轴。窗口跟随游标移动，展示同相增强和反相抵消。',
        playback: ['t', .65]
    },
    rc: {
        sceneTitle: '电容充电台',
        sceneCaption: '流动光点示意常规电流，电容极板旁的符号表示等量异号电荷，动画速度随电流衰减。',
        playback: ['t', 1]
    },
    divider: {
        sceneTitle: '电阻分压电路',
        sceneCaption: '电压表以电源负端为基准。右侧标尺显示两只电阻各自承担的电压降。',
        presets: [{ label: '下臂短路', values: { x: 0 } }, { label: '两臂相等', values: { r: 5, x: 5 } }]
    },
    cooling: {
        sceneTitle: '热成像观测台',
        sceneCaption: '热流箭头的明暗和长度随温差改变，右侧温标同时显示物体和环境温度。',
        playback: ['t', 1]
    },
    'ideal-gas': {
        sceneTitle: '透明活塞与分子运动',
        sceneCaption: '粒子数量用于示意，速度随 √T 改变。分子在箱壁弹性反射，压力表显示状态方程读数。'
    },
    hydrostatic: {
        sceneTitle: '液柱与潜水压力探头',
        sceneCaption: '探头中心与深度游标对齐，周围箭头表示液体从各方向施加的压力。',
        playback: ['x', 1]
    },
    buoyancy: {
        sceneTitle: '浸没与排水观测槽',
        sceneCaption: '高亮部分表示液面下的棱柱体积。完全浸没后，浮力箭头长度与排水量保持不变。',
        playback: ['x', .13]
    },
    decay: {
        sceneTitle: '衰变样本探测器',
        sceneCaption: '每个圆点代表一个原子核。模拟样本使用固定随机序列，曲线显示同样初始条件下的统计期望。',
        playback: ['t', .7]
    }
};

const teal = '#68e5dc';
const gold = '#ffd28a';
const violet = '#abafff';
const steel = '#4e647c';
const muted = '#9fb6cb';
const pale = '#e7f4fe';
const tau = Math.PI * 2;
const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const f = (value, digits = 2) => value.toFixed(digits);
const frac = value => value - Math.floor(value);
const noise = index => frac(Math.sin(index * 12.9898 + 1.17) * 43758.5453123);
const sample = (read, count = 160) => Array.from({ length: count + 1 }, (_, i) => read(i / count));

function plate(s, x, y, w, h, hi, lo, border = steel, radius = 10) {
    const fill = s.ctx.createLinearGradient(x, y, x, y + h);
    fill.addColorStop(0, hi);
    fill.addColorStop(1, lo);
    s.panel(x, y, w, h, fill, border, radius);
}

function screen(s, x, y, w, label, value, color = teal) {
    s.panel(x, y, w, 78, '#071926', '#345b70');
    s.text(label, x + 16, y + 25, muted, 18);
    s.text(value, x + 16, y + 57, color, 26);
}

function segmentLabel(s, x1, x2, y, label, color = muted) {
    s.line([[x1, y - 6], [x1, y + 6]], color, 1);
    s.line([[x1, y], [x2, y]], color, 1);
    s.line([[x2, y - 6], [x2, y + 6]], color, 1);
    s.text(label, (x1 + x2) / 2, y + 28, color, 19, 'center');
}

function projectile(s, p, model) {
    const scale = Math.min(810 / model.end, 267 / model.read(model.end / 2));
    const originX = (960 - model.end * scale) / 2;
    const floor = 417;
    const xy = x => [originX + x * scale, floor - model.read(x) * scale];
    const [cx, cy] = xy(model.at);
    const angle = p.a * Math.PI / 180;
    const vx = p.v * Math.cos(angle);
    const elapsed = model.at / vx;
    const vy = p.v * Math.sin(angle) - 9.81 * elapsed;
    s.grid(48, 100, 864, 314, 32);
    plate(s, 44, floor, 872, 19, '#34566b', '#112b3e');
    s.line(sample(q => xy(model.end * q)), '#4e7891', 2, [8, 8]);
    s.line(sample(q => xy(model.at * q)), teal, 3);
    for (let i = 0; i < 12; i++) {
        const [x, y] = xy(model.end * i / 12);
        s.dot(x, y, 3, model.at >= model.end * i / 12 ? teal : steel);
    }
    const [ax, ay] = xy(model.end / 2);
    s.line([[ax, ay], [ax, floor]], '#748a9d', 1, [4, 7]);
    s.text('最高点 ' + f(model.read(model.end / 2)) + ' m', ax, ay - 16, pale, 18, 'center');
    s.line([[originX, floor], [originX + 36 * Math.cos(angle), floor - 36 * Math.sin(angle)]], '#758ba3', 16);
    s.dot(originX, floor, 14, '#546f89');
    s.dot(cx, cy, 9, '#eaffff', 20);
    s.arrow(cx, cy, cx + vx * 3, cy - vy * 3, teal, 3);
    s.arrow(cx - 12, cy + 8, cx - 12, cy + 53, gold, 2);
    screen(s, 62, 20, 212, '飞行时间', f(elapsed, 2) + ' s');
    screen(s, 686, 20, 212, '当前速率', f(Math.hypot(vx, vy), 1) + ' m/s');
    segmentLabel(s, originX, originX + model.end * scale, 463, '射程 ' + f(model.end) + ' m');
}

function spring(s, p, model) {
    const x = 532 + model.read(p.t) * 430;
    const phase = Math.sqrt(p.k / p.m) * p.t;
    const energy = p.k / 8;
    const potential = energy * Math.cos(phase) ** 2;
    const size = 76 + p.m * 10;
    const y = 217;
    s.grid(75, 98, 810, 251, 26);
    plate(s, 76, 272, 808, 28, '#405970', '#1d3246');
    plate(s, 113, 124, 28, 148, '#57718a', '#24384c');
    s.line([[532, 101], [532, 312]], steel, 1, [5, 5]);
    s.text('平衡位置', 532, 92, muted, 20, 'center');
    const right = x - size / 2;
    s.line([[141, y], [159, y], ...sample(q => [159 + (right - 177) * q, y + Math.sin(q * tau * 11) * 19], 176), [right, y]], pale, 3);
    plate(s, right, 179, size, 85, '#48a997', '#1e5f68', '#7ce6d4');
    s.text(f(p.m, 1) + ' kg', x, 227, pale, 22, 'center');
    const force = -model.read(p.t) * p.k;
    if (Math.abs(force) > .04) s.arrow(x, 165, x + force * 9, 165, gold, 3);
    s.text('回复力 ' + f(force) + ' N', x, 153, gold, 18, 'center');
    const split = 733 * potential / energy;
    s.panel(114, 394, 733, 24, '#142c3f', '#385368', 8);
    if (split > .3) s.panel(114, 394, split, 24, gold, 'transparent', 5);
    if (split < 732.7) s.panel(114 + split, 394, 733 - split, 24, teal, 'transparent', 5);
    s.text('弹性势能 ' + f(potential) + ' J', 114, 376, gold, 21);
    s.text('动能 ' + f(energy - potential) + ' J', 847, 376, teal, 21, 'right');
    s.text('总机械能 ' + f(energy) + ' J', 480, 464, pale, 23, 'center');
}

function collision(s, p, model) {
    const y = 279;
    const contact = 389;
    const scale = 20;
    const width = 58 + p.m * 10;
    const first = model.read(p.t);
    const second = model.second(p.t);
    const after = Math.max(0, p.t - 3);
    const frontA = contact - Math.max(0, 3 - p.t) * 3 * scale + first * after * scale;
    const backB = contact + second * after * scale;
    s.grid(50, 112, 860, 239, 32);
    plate(s, 59, y + 24, 842, 29, '#4b6579', '#223e50');
    for (let i = 0; i < 14; i++) s.line([[72 + i * 62, 333], [72 + i * 62, 348]], '#596e81', 2);
    s.line([[contact, 132], [contact, 312]], steel, 1, [6, 7]);
    s.text('碰撞位置', contact, 119, muted, 18, 'center');
    const cart = (x, w, color, base, label, speed) => {
        plate(s, x, y - 63, w, 82, base, '#162b40', color);
        s.dot(x + 17, y + 18, 8, steel);
        s.dot(x + w - 17, y + 18, 8, steel);
        s.text(label, x + w / 2, y - 17, pale, 20, 'center');
        const center = x + w / 2;
        if (Math.abs(speed) > .005) s.arrow(center - speed * 10, y - 82, center + speed * 12, y - 82, color, 3);
        s.text(f(speed) + ' m/s', center, y - 96, color, 18, 'center');
    };
    cart(frontA - width, width, teal, '#2b806e', f(p.m, 1) + ' kg', first);
    cart(backB, 96, gold, '#8c6231', '2.0 kg', second);
    if (Math.abs(p.t - 3) < .18) s.dot(contact, y - 30, 9, '#fffaff', 30);
    screen(s, 75, 393, 241, '事件', p.t < 3 ? '碰撞前' : '碰撞后');
    screen(s, 360, 393, 241, '总动量', f(3 * p.m) + ' kg·m/s');
    screen(s, 645, 393, 241, '总动能', f(.5 * p.m * first ** 2 + second ** 2) + ' J', gold);
}

function standing(s, p, model) {
    const x = i => 96 + i / 10 * 768;
    const y = value => 244 - value * 244;
    s.grid(96, 110, 768, 268, 24);
    s.line([[96, 244], [864, 244]], steel, 1);
    for (const sign of [-1, 1]) {
        s.line(sample(q => [x(10 * q), y(sign * .5 * Math.abs(Math.sin(p.n * Math.PI * q)))]), '#5a7894', 2, [6, 7]);
    }
    s.line(sample(q => [x(10 * q), y(model.read(10 * q))]), violet, 4);
    for (let i = 0; i <= p.n; i++) s.dot(x(i * 10 / p.n), 244, 6, gold, 6);
    const px = x(p.x), py = y(model.read(p.x));
    s.line([[px, 103], [px, 384]], '#68e5dc84', 1, [4, 6]);
    s.dot(px, py, 9, teal, 16);
    const distance = 10 / p.n;
    segmentLabel(s, x(0), x(distance), 398, 'λ/2');
    s.text('相邻波节 ' + f(distance) + ' m', 480, 472, gold, 21, 'center');
    s.text('观测位置 ' + f(p.x) + ' m', 96, 70, teal, 22);
    s.text('相位 ' + Math.round(p.p) + '°', 864, 70, violet, 22, 'right');
}

function beats(s, p, model) {
    const left = 124, right = 902;
    const start = clamp(p.t - 2, 0, 6);
    const at = q => start + q * 4;
    const cursor = left + (p.t - start) / 4 * (right - left);
    const channels = [
        ['源 A', '4.0 Hz', t => Math.cos(8 * Math.PI * t), violet, 102, 35],
        ['源 B', f(p.f, 1) + ' Hz', t => Math.cos(tau * p.f * t), gold, 243, 35],
        ['叠加', '差频 ' + f(Math.abs(p.f - 4), 1) + ' Hz', model.read, teal, 384, 26]
    ];
    for (const [label, frequency, read, color, y, scale] of channels) {
        s.panel(53, y - 61, 854, 122, '#0b1e2e', '#284052');
        s.grid(left, y - 54, right - left, 108, 25);
        s.text(label, 68, y + 6, color, 20);
        const curve = values => sample(q => [left + q * (right - left), y - scale * values(at(q))], 320);
        if (label === '叠加') {
            s.line(curve(model.second), '#ffd28a8b', 1.5, [5, 4]);
            s.line(curve(t => -model.second(t)), '#ffd28a8b', 1.5, [5, 4]);
        }
        s.line(curve(read), color, 2.5);
        s.line([[cursor, y - 54], [cursor, y + 54]], '#e7f4fe88', 1);
        s.dot(cursor, y - scale * read(p.t), 5, color, 8);
        s.text(frequency, 885, y - 36, pale, 18, 'right');
    }
    s.text(f(start, 1) + ' s', left, 478, muted, 18);
    s.text(f(p.t) + ' s', cursor, 501, teal, 18, 'center');
    s.text(f(start + 4, 1) + ' s', right, 478, muted, 18, 'right');
}

function wireFlow(s, points, phase, visibility = 1, count = 13) {
    const lengths = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    s.ctx.save();
    s.ctx.globalAlpha = visibility;
    for (let i = 0; i < count; i++) {
        let position = frac(phase + i / count) * total;
        let j = 0;
        while (j < lengths.length - 1 && position > lengths[j]) position -= lengths[j++];
        const q = position / lengths[j];
        const [a, b] = points[j], [x, y] = points[j + 1];
        s.dot(a + (x - a) * q, b + (y - b) * q, 3, teal, 9);
    }
    s.ctx.restore();
}

function resistorPath(x, y, length, vertical = false) {
    const zigzag = [[0, 0], ...Array.from({ length: 10 }, (_, i) => [(i + 1) * length / 11, (i % 2 ? 1 : -1) * 12]), [length, 0]];
    return zigzag.map(([u, v]) => vertical ? [x + v, y + u] : [x + u, y + v]);
}

function rc(s, p, model) {
    const charge = model.read(p.t) / p.v;
    const wires = [[120, 223], [120, 116], [274, 116], [403, 116], [550, 116], [550, 239], [550, 269], [550, 404], [120, 404], [120, 283]];
    s.panel(58, 64, 579, 390, '#0d2130', '#2d4c62');
    s.line(wires.slice(0, 3), steel, 4);
    s.line(wires.slice(3, 6), steel, 4);
    s.line(wires.slice(6), steel, 4);
    const resistor = resistorPath(274, 116, 129);
    s.line(resistor, gold, 3);
    s.text('电阻 R', 337, 88, gold, 19, 'center');
    s.line([[79, 223], [161, 223]], pale, 4);
    s.line([[94, 244], [146, 244]], pale, 4);
    s.line([[120, 244], [120, 283]], steel, 4);
    s.text('电源', 164, 239, pale, 21);
    s.text(f(p.v, 1) + ' V', 164, 264, muted, 19);
    s.line([[475, 239], [607, 239]], gold, 5);
    s.line([[475, 269], [607, 269]], violet, 5);
    s.text('电容 C', 550, 331, pale, 21, 'center');
    const phase = .8 * p.k * charge;
    wireFlow(s, [...wires.slice(0, 2), ...resistor, ...wires.slice(4, 6)], phase, (1 - charge) ** .5, 8);
    wireFlow(s, wires.slice(6), phase, (1 - charge) ** .5, 8);
    for (let i = 0; i < Math.round(charge * 10); i++) {
        s.text('+', 479 + 13 * i, 223, gold, 19);
        s.text('−', 479 + 13 * i, 298, violet, 19);
    }
    screen(s, 665, 81, 238, '电容电压', f(model.read(p.t)) + ' V');
    screen(s, 665, 177, 238, '电流 / 初始电流', f((1 - charge) * 100, 1) + '%');
    screen(s, 665, 273, 238, '电阻压降', f(p.v * (1 - charge)) + ' V', gold);
    s.text('τ = ' + f(p.k, 1) + ' s', 665, 429, muted, 21);
}

function divider(s, p, model, clock) {
    const voltage = model.read(p.x);
    const wires = [[132, 184], [132, 99], [470, 99], [470, 433], [132, 433], [132, 248]];
    s.panel(60, 63, 594, 408, '#0d2130', '#2d4c62');
    s.line(wires.slice(0, 3).concat([[470, 130]]), steel, 3.5);
    s.line([[470, 213], [470, 310]], steel, 3.5);
    s.line([[470, 393], ...wires.slice(3)], steel, 3.5);
    s.line([[92, 184], [172, 184]], pale, 4);
    s.line([[109, 207], [155, 207]], pale, 4);
    s.line([[132, 207], [132, 248]], steel, 3.5);
    s.text('5 V', 174, 205, pale, 25);
    s.text('0 V 基准', 157, 418, muted, 19);
    const upper = resistorPath(470, 130, 83, true);
    const lower = p.x ? resistorPath(470, 310, 83, true) : [[470, 310], [470, 393]];
    s.line(upper, gold, 3);
    s.line(lower, p.x ? gold : teal, 3);
    s.text('R₁  ' + f(p.r, 1) + ' kΩ', 509, 173, gold, 21);
    s.text('R₂  ' + f(p.x, 1) + ' kΩ', 509, 356, teal, 21);
    s.line([[470, 263], [287, 263], [287, 325]], teal, 2);
    s.line([[287, 396], [287, 433]], steel, 2);
    s.panel(227, 325, 120, 71, '#091c25', '#3d7d80', 24);
    s.text(f(voltage) + ' V', 287, 370, teal, 23, 'center');
    s.dot(470, 263, 5, teal, 10);
    wireFlow(s, [...wires.slice(0, 3), ...upper, ...lower, ...wires.slice(3)], clock * .18 * model.extra[1], .76);
    const mid = 395 - voltage / 5 * 285;
    s.panel(706, 110, 37, 285, '#183647', '#436174', 6);
    if (mid > 110.1) s.panel(706, 110, 37, mid - 110, '#a77943', 'transparent', 5);
    if (mid < 394.9) s.panel(706, mid, 37, 395 - mid, '#2b9a97', 'transparent', 5);
    s.text('5 V', 770, 114, pale, 21);
    s.text('0 V', 770, 409, pale, 21);
    s.line([[701, mid], [758, mid]], pale, 2);
    s.text('输出 ' + f(voltage) + ' V', 770, clamp(mid + 6, 151, 378), teal, 21);
}

function cooling(s, p, model) {
    const temperature = model.read(p.t);
    const strength = clamp((temperature - p.k) / 80);
    const color = value => 'hsl(' + (212 - 200 * value / 80) + ' 84% 62%)';
    const heat = color(temperature);
    const environment = color(p.k);
    const field = s.ctx.createRadialGradient(337, 248, 40, 337, 248, 259);
    field.addColorStop(0, heat);
    field.addColorStop(.45 + strength * .1, heat);
    field.addColorStop(1, environment);
    s.ctx.save();
    s.ctx.globalAlpha = .24;
    s.panel(62, 65, 550, 383, field, '#263d55');
    s.ctx.restore();
    s.grid(86, 87, 498, 335, 28);
    for (let i = 0; i < 12; i++) {
        const angle = tau * i / 12;
        const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
        const radius = 102 + 8 * frac(p.t * .58 + i * .4);
        s.ctx.save();
        s.ctx.globalAlpha = .24 + strength * .7;
        s.arrow(336 + dx * radius, 251 + dy * radius,
            336 + dx * (radius + 24 + 41 * strength), 251 + dy * (radius + 24 + 41 * strength), gold, 2.5);
        s.ctx.restore();
    }
    s.dot(336, 251, 78, heat, 26);
    const core = s.ctx.createRadialGradient(316, 225, 8, 336, 251, 78);
    core.addColorStop(0, '#ffedc6');
    core.addColorStop(.4, heat);
    core.addColorStop(1, '#263b5c');
    s.dot(336, 251, 77, core);
    s.text('热物体', 337, 257, '#061522', 25, 'center');
    screen(s, 644, 75, 251, '物体温度', f(temperature, 1) + ' °C', heat);
    screen(s, 644, 177, 251, '环境温度', f(p.k, 1) + ' °C', environment);
    screen(s, 644, 279, 251, '瞬时降温速率', f(model.extra[1]) + ' °C/min', gold);
    const spectrum = s.ctx.createLinearGradient(646, 0, 895, 0);
    for (let i = 0; i <= 8; i++) spectrum.addColorStop(i / 8, color(i * 10));
    s.panel(646, 387, 249, 13, spectrum, 'transparent', 6);
    s.text('0 °C', 646, 426, muted, 18);
    s.text('80 °C', 896, 426, muted, 18, 'right');
}

const reflect = (position, width) => {
    const phase = frac(position / (width * 2));
    return width * (1 - Math.abs(phase * 2 - 1));
};

function idealGas(s, p, model, clock) {
    const left = 96, top = 118, width = 540, height = 283;
    const piston = left + width * p.x / 10;
    const pressure = model.read(p.x);
    plate(s, left - 16, top - 15, width + 32, height + 30, '#42607b', '#20354b');
    s.panel(left, top, width, height, '#060f1b', '#527284', 3);
    s.panel(left, top, piston - left, height, '#0c2637', 'transparent', 3);
    const speed = Math.sqrt(p.t / 300);
    for (let i = 0; i < 100; i++) {
        const span = piston - left - 10;
        const x = left + 5 + reflect(noise(i + 10) * span * 2 + clock * speed * (25 + noise(i + 110) * 109), span);
        const y = top + 5 + reflect(noise(i + 210) * (height - 10) * 2 + clock * speed * (21 + noise(i + 310) * 93), height - 10);
        s.dot(x, y, 1.7 + noise(i + 410) * 1.6, i % 6 ? '#76d6daaa' : '#ffd292', i % 12 ? 0 : 8);
    }
    plate(s, piston + 4, top + 129, Math.max(20, 665 - piston), 24, '#879db1', '#425b6f');
    plate(s, piston - 3, top, 18, height, '#a1b7ca', '#59748d');
    s.text('活塞', piston, 98, pale, 22, 'center');
    segmentLabel(s, left, piston, 438, f(p.x, 1) + ' L', teal);
    const cx = 803, cy = 211;
    s.dot(cx, cy, 83, '#121f30');
    s.dot(cx, cy, 76, '#0a1625');
    const angleAt = q => Math.PI * (.8 + 1.4 * q);
    for (let i = 0; i <= 10; i++) {
        const angle = angleAt(i / 10);
        s.line([[cx + Math.cos(angle) * 63, cy + Math.sin(angle) * 63],
            [cx + Math.cos(angle) * 70, cy + Math.sin(angle) * 70]], muted, 2);
    }
    const angle = angleAt(clamp(pressure / 450));
    s.line([[cx, cy], [cx + 60 * Math.cos(angle), cy + 60 * Math.sin(angle)]], gold, 4);
    s.dot(cx, cy, 6, gold, 6);
    s.text('0', 749, 259, muted, 15, 'center');
    s.text('450', 857, 259, muted, 15, 'center');
    s.text('压强 ' + f(pressure, 1) + ' kPa', cx, 324, teal, 22, 'center');
    s.text('温度 ' + p.t + ' K', cx, 357, pale, 20, 'center');
}

function tank(s, x, top, width, height, clock) {
    plate(s, x - 9, top - 7, width + 18, height + 18, '#294f64', '#17344b', '#4b6b85', 6);
    plate(s, x, top, width, height, '#194c65', '#091f3c', '#386784', 2);
    for (let i = 1; i < 9; i++) {
        s.line([[x, top + height * i / 9], [x + width, top + height * i / 9]], '#6ac2d720', 1);
    }
    s.line(sample(q => [x + width * q, top + Math.sin(q * 29 - clock * 2) * 2.6]), '#9befff', 2);
}

function hydrostatic(s, p, model, clock) {
    const left = 183, top = 117, width = 397, height = 326;
    const depthY = depth => top + depth * 29;
    const x = left + width * .53, y = depthY(p.x);
    tank(s, left, top, width, height, clock);
    s.text('深度 / m', 94, 81, muted, 18, 'center');
    for (let depth = 0; depth <= 10; depth += 2) {
        const py = depthY(depth);
        s.line([[131, py], [158, py]], muted, 1.5);
        s.text(depth, 120, py + 6, pale, 19, 'right');
    }
    s.line([[149, y], [x, y]], '#a9efef9c', 1.5, [6, 5]);
    s.line([[x, 63], [x, y]], '#a3b9c6', 2);
    s.dot(x, y, 22, '#263e5a', 10);
    s.dot(x, y, 12, teal);
    const length = model.read(p.x) / 2.1;
    if (length > 3) {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const startX = x + dx * (27 + length), startY = y + dy * (27 + length);
            if (startY >= top && startY <= top + height) s.arrow(startX, startY, x + dx * 27, y + dy * 27, gold, 2);
        }
    }
    screen(s, 630, 90, 264, '测量深度', f(p.x) + ' m');
    screen(s, 630, 186, 264, '静水表压', f(model.read(p.x)) + ' kPa');
    screen(s, 630, 282, 264, '绝对压强', f(model.extra[1]) + ' kPa', gold);
    s.text('液体密度 ' + p.r + ' kg/m³', 630, 419, muted, 20);
}

function buoyancy(s, p, model, clock) {
    const top = 211, blockBottom = top + 211 * p.x, blockHeight = 105.5;
    const cx = 379, width = 235 * Math.sqrt(p.a / .1);
    tank(s, 103, top, 470, 237, clock);
    s.line([[cx, 39], [cx, blockBottom - blockHeight]], steel, 2);
    plate(s, cx - width / 2, blockBottom - blockHeight, width, blockHeight, '#e7ac68', '#5a433c', '#ffc982', 4);
    const submerged = Math.min(blockHeight, 211 * p.x);
    if (submerged > 0) {
        s.panel(cx - width / 2, blockBottom - submerged, width, submerged, '#0c9ca99e', '#81f0e488', 3);
        const arrowLength = Math.min(106, 16 + model.read(p.x) * .13);
        const center = blockBottom - submerged / 2;
        s.arrow(cx, center, cx, center - arrowLength, '#edfff9', 4);
        s.text('浮力', cx + 12, center - arrowLength + 12, pale, 19);
    }
    s.line([[103, top], [573, top]], '#a4f1ffb9', 1.5, [7, 4]);
    s.text('液面', 116, top - 13, '#a4f1ff', 18);
    screen(s, 627, 87, 266, '浸入高度', f(submerged / 211) + ' m');
    screen(s, 627, 183, 266, '排水体积', f(model.extra[1]) + ' L');
    screen(s, 627, 279, 266, '浮力', f(model.read(p.x)) + ' N', gold);
    if (p.x >= .5) s.text('完全浸没', 627, 418, pale, 22);
}

const decayThresholds = Array.from({ length: 1000 }, (_, i) => -Math.log2(Math.max(1e-8, noise(i + 602))));

function decay(s, p, model) {
    s.panel(58, 56, 585, 412, '#0b1b29', '#355568');
    const columns = 40;
    const time = p.t / p.k;
    let survivors = 0;
    for (let i = 0; i < p.n; i++) {
        const x = 79 + i % columns * 13.9, y = 77 + Math.floor(i / columns) * 15.4;
        const alive = decayThresholds[i] > time;
        const flash = time - decayThresholds[i] < .04 / p.k && !alive;
        if (alive) survivors++;
        s.dot(x, y, flash ? 4.8 : 3.2, flash ? gold : alive ? '#9feaaa' : '#274054', flash ? 14 : 0);
    }
    screen(s, 665, 70, 228, '样本实际剩余', String(survivors), '#9feaaa');
    screen(s, 665, 166, 228, '理论期望', f(model.read(p.t), 1), violet);
    screen(s, 665, 262, 228, '样本已衰变', String(p.n - survivors), gold);
    s.text('经过 ' + f(time, 1) + ' 个半衰期', 665, 421, muted, 20);
}

const renderers = {
    projectile, spring, collision, standing, beats, rc, divider, cooling,
    'ideal-gas': idealGas, hydrostatic, buoyancy, decay
};

export function drawFoundationScene(stage, lab, parameters, model, clock) {
    renderers[lab.slug](stage, parameters, model, clock);
}
