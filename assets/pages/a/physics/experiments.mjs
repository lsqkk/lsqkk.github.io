const slider = (id, label, min, max, step, value, unit = '') => ({
    id, label, min, max, step, value, unit, initial: value + unit
});

const time = slider('t', '读数时间', 0, 10, .05, 2, ' s');
const distance = slider('x', '读数位置', 0, 10, .05, 2, ' m');
const tau = slider('k', '时间常数', .5, 5, .1, 2, ' s');
const temperature = slider('k', '环境温度', 0, 40, 1, 20, ' °C');

export const experiments = [
    {
        category: 'mechanics', slug: 'projectile', name: '斜抛运动', topics: '轨迹 · 射程',
        description: '改变初速度和仰角，测量无空气阻力时的轨迹与落点。',
        parameters: [slider('v', '初速度', 5, 25, .5, 15, ' m/s'), slider('a', '发射角', 10, 80, 1, 45, '°'), slider('t', '飞行进度', 0, 100, 1, 50, '%')],
        formula: 'y = x tan θ − gx² / (2v₀² cos² θ)', question: '分别用 30°、45° 与 60° 发射，哪些角度的射程相同？',
        axes: ['水平距离 (m)', '高度 (m)'],
        model({ v, a, t }) {
            const theta = a * Math.PI / 180, vx = v * Math.cos(theta), vy = v * Math.sin(theta);
            const duration = 2 * vy / 9.81, range = vx * duration;
            return { end: range, at: range * t / 100, read: (x) => x * vy / vx - 4.905 * (x / vx) ** 2,
                extra: ['射程', range, 'm'] };
        }
    },
    {
        category: 'mechanics', slug: 'spring', name: '弹簧振子', topics: '胡克定律 · 简谐振动',
        description: '调节质量和劲度系数，比较振动周期与位移。',
        parameters: [slider('m', '质量', .5, 4, .1, 1, ' kg'), slider('k', '劲度系数', 1, 20, .5, 5, ' N/m'), time],
        formula: 'x(t) = A cos(√(k/m)t)，A = 0.5 m。', question: '质量增为四倍时，周期变为原来的多少倍？',
        axes: ['时间 (s)', '位移 (m)'],
        model: ({ m, k, t }) => ({ end: 10, at: t, read: x => .5 * Math.cos(Math.sqrt(k / m) * x), extra: ['周期', 2 * Math.PI * Math.sqrt(m / k), 's'] })
    },
    {
        category: 'mechanics', slug: 'collision', name: '一维碰撞', topics: '动量守恒 · 恢复系数',
        description: '观察两物体在碰撞前后的速度，比较弹性与完全非弹性碰撞。',
        parameters: [slider('m', '撞块质量', .5, 4, .1, 1, ' kg'), slider('e', '恢复系数', 0, 1, .05, .8), time],
        formula: 'm₁u₁ = m₁v₁ + m₂v₂，v₂ − v₁ = eu₁。靶块为 2 kg，撞块初速 3 m/s，t = 3 s 时发生碰撞。',
        question: '把恢复系数调到 0，两物体为什么在碰后拥有相同速度？',
        axes: ['时间 (s)', '速度 (m/s)'], series: ['撞块', '靶块'], breaks: [3],
        model: ({ m, e, t }) => ({ end: 10, at: t, read: x => x < 3 ? 3 : 3 * (m - 2 * e) / (m + 2),
            second: x => x < 3 ? 0 : 3 * m * (1 + e) / (m + 2), extra: ['总动量', 3 * m, 'kg·m/s'] })
    },
    {
        category: 'waves', slug: 'standing', name: '弦上的驻波', topics: '谐波 · 波节',
        description: '切换谐波阶数，通过位移分布定位波节和波腹。',
        parameters: [slider('n', '谐波阶数', 1, 6, 1, 2), slider('p', '相位', 0, 360, 1, 0, '°'), distance],
        formula: 'y(x) = A sin(nπx/L) cos φ，L = 10 m，A = 0.5 m。', question: '相位改变时，哪些位置的位移始终为零？',
        axes: ['位置 (m)', '位移 (m)'],
        model: ({ n, p, x }) => ({ end: 10, at: x, read: s => .5 * Math.sin(n * Math.PI * s / 10) * Math.cos(p * Math.PI / 180),
            extra: ['波长', 20 / n, 'm'], bounds: [-.5, .5] })
    },
    {
        category: 'waves', slug: 'beats', name: '拍频', topics: '叠加 · 振幅包络',
        description: '让两个频率接近的波叠加，观察振幅的周期性起伏。',
        parameters: [slider('f', '第二个波的频率', 4, 6, .1, 4.5, ' Hz'), time],
        formula: 'y = cos(2πf₁t) + cos(2πf₂t)，f₁ = 4 Hz。', question: '第二个波的频率接近 4 Hz 时，两次振幅峰值间隔如何变化？',
        axes: ['时间 (s)', '相对振幅'], series: ['合成波', '上包络'],
        model: ({ f, t }) => ({ end: 10, at: t, read: x => Math.cos(8 * Math.PI * x) + Math.cos(2 * Math.PI * f * x),
            second: x => 2 * Math.abs(Math.cos(Math.PI * (f - 4) * x)), extra: ['拍频', Math.abs(f - 4), 'Hz'] })
    },
    {
        category: 'electricity', slug: 'rc', name: 'RC 充电', topics: '电容 · 时间常数',
        description: '改变电源电压和时间常数，测量电容两端电压。',
        parameters: [slider('v', '电源电压', 1, 12, .5, 5, ' V'), tau, time],
        formula: 'V(t) = V₀(1 − e^(−t/RC))，τ = RC。', question: '在 t = τ 时，电容电压达到电源电压的百分之几？',
        axes: ['时间 (s)', '电压 (V)'],
        model: ({ v, k, t }) => ({ end: 10, at: t, read: x => v * -Math.expm1(-x / k), extra: ['充电比例', 100 * -Math.expm1(-t / k), '%'] })
    },
    {
        category: 'electricity', slug: 'divider', name: '电阻分压', topics: '串联电路 · 欧姆定律',
        description: '改变上下两只电阻的阻值，观察输出电压和串联电流。',
        parameters: [slider('r', '上臂电阻', 1, 10, .1, 3, ' kΩ'), slider('x', '下臂电阻', 0, 10, .1, 3, ' kΩ')],
        formula: 'Vout = 5R₂/(R₁ + R₂)。假定输出端无外接负载。', question: '当上下臂电阻相等时，改变它们的共同阻值会怎样影响电压和电流？',
        axes: ['下臂电阻 (kΩ)', '输出电压 (V)'],
        model: ({ r, x }) => ({ end: 10, at: x, read: s => 5 * s / (r + s), extra: ['串联电流', 5 / (r + x), 'mA'] })
    },
    {
        category: 'thermal', slug: 'cooling', name: '牛顿冷却', topics: '传热 · 指数衰减',
        description: '比较不同环境温度下物体的冷却曲线。',
        parameters: [temperature, slider('r', '冷却时间常数', 1, 8, .1, 4, ' min'), slider('t', '读数时间', 0, 10, .05, 2, ' min')],
        formula: 'T(t) = Tₐ + (80 − Tₐ)e^(−t/τ)。物体初始温度为 80 °C。', question: '环境升温后，初始冷却速率会变快还是变慢？',
        axes: ['时间 (min)', '温度 (°C)'], series: ['物体温度', '环境温度'],
        model: ({ k, r, t }) => ({ end: 10, at: t, read: x => k + (80 - k) * Math.exp(-x / r),
            second: () => k, extra: ['当前降温速率', (80 - k) * Math.exp(-t / r) / r, '°C/min'] })
    },
    {
        category: 'thermal', slug: 'ideal-gas', name: '理想气体等温压缩', topics: '状态方程 · 压强',
        description: '拖动体积读数并改变温度，比较不同温度下的等温线。',
        parameters: [slider('t', '绝对温度', 240, 500, 5, 300, ' K'), slider('x', '体积', 1, 10, .1, 5, ' L')],
        formula: 'PV = nRT，取 n = 0.1 mol。', question: '温度固定时，体积减半会怎样影响压强？',
        axes: ['体积 (L)', '压强 (kPa)'],
        model: ({ t, x }) => ({ start: 1, end: 10, at: x, read: s => .1 * 8.314 * t / s, extra: ['PV', .1 * 8.314 * t, 'J'] })
    },
    {
        category: 'fluids', slug: 'hydrostatic', name: '液体静压', topics: '深度 · 液体密度',
        description: '模拟下潜，比较水与高密度液体中的表压。',
        parameters: [slider('r', '液体密度', 700, 1400, 10, 1000, ' kg/m³'), slider('x', '深度', 0, 10, .05, 2, ' m')],
        formula: '表压 p = ρgh，绝对压强为大气压与表压之和。', question: '在两种密度不同的液体中，如何调节深度以得到相同表压？',
        axes: ['深度 (m)', '表压 (kPa)'],
        model: ({ r, x }) => ({ end: 10, at: x, read: s => r * 9.81 * s / 1000, extra: ['绝对压强', 101.325 + r * 9.81 * x / 1000, 'kPa'] })
    },
    {
        category: 'fluids', slug: 'buoyancy', name: '浸没与浮力', topics: '阿基米德原理 · 排水体积',
        description: '将棱柱逐步浸入液体，对照浸入深度与浮力。',
        parameters: [slider('a', '棱柱横截面积', .01, .1, .005, .04, ' m²'), slider('r', '液体密度', 700, 1400, 10, 1000, ' kg/m³'),
            slider('x', '向下移动距离', 0, 1, .01, .25, ' m')],
        formula: 'F = ρgA min(h, H)，棱柱高 H = 0.5 m，从底面接触液面开始测量。', question: '继续往下压时，为什么曲线会在完全浸没之后变平？',
        axes: ['向下移动距离 (m)', '浮力 (N)'],
        model: ({ a, r, x }) => ({ end: 1, at: x, read: s => a * r * 9.81 * Math.min(.5, s),
            extra: ['排开液体体积', 1000 * a * Math.min(.5, x), 'L'] })
    },
    {
        category: 'modern', slug: 'decay', name: '放射性衰变', topics: '半衰期 · 期望值',
        description: '比较不同半衰期的样本在同一时间尺度上的剩余核数期望值。',
        parameters: [slider('n', '初始核数', 100, 1000, 10, 600), slider('k', '半衰期', .5, 5, .1, 2, ' h'),
            slider('t', '读数时间', 0, 10, .05, 2, ' h')],
        formula: 'N(t) = N₀ 2^(−t/T½)。曲线表示相同初始条件下的统计期望。', question: '经过两个半衰期后，还剩下初始样本的几分之几？',
        axes: ['时间 (h)', '剩余核数期望值'],
        model: ({ n, k, t }) => ({ end: 10, at: t, read: x => n * 2 ** (-x / k), extra: ['剩余比例', 100 * 2 ** (-t / k), '%'] })
    }
];

export const categories = {
    optics: '光学', waves: '波动', mechanics: '力学', electricity: '电学',
    thermal: '热学', fluids: '流体', modern: '近代物理'
};

export function sampleCurve(experiment, model, read, count = 600) {
    const start = model.start ?? 0;
    const points = Array.from({ length: count + 1 }, (_, i) => start + (model.end - start) * i / count);
    for (const point of experiment.breaks ?? []) points.push(point - 1e-8, point);
    return points.sort((a, b) => a - b).map(x => [x, read(x)]);
}

export function previewCurve(experiment) {
    const model = experiment.model(Object.fromEntries(experiment.parameters.map(p => [p.id, p.value])));
    const points = sampleCurve(experiment, model, model.read, 120);
    const low = Math.min(0, ...points.map(p => p[1]));
    const high = Math.max(...points.map(p => p[1]));
    return points.map(([x, y], i) => (i ? 'L' : 'M') + [
        8 + 144 * (x - points[0][0]) / (model.end - points[0][0]), 83 - 70 * (y - low) / (high - low || 1)
    ].map(n => n.toFixed(1)).join(' ')).join(' ');
}
