const range = (id, label, min, max, step, value, unit) => ({
    id, label, min, max, step, value, unit, initial: value + unit,
});
const wavelength = range('lambda', '波长', 420, 680, 1, 532, ' nm');
const sinc = x => Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x;
const rad = Math.PI / 180;
const relative = '归一化光强';
const reflected = phase => Math.sin(Math.PI * phase) ** 2;

export const opticsLabs = [
    {
        category: 'optics', slug: 'single-slit', name: '单缝衍射',
        topics: '夫琅禾费衍射 · sinc² · 孔径',
        description: '从狭缝上的连续次波源出发，在光屏上寻找暗纹，用中央亮纹反推缝宽。',
        sceneTitle: '狭缝与远场探测屏',
        sceneCaption: '左侧展示次波叠加的慢动作，右侧为归一化光强的屏幕像。屏上游标对应曲线读数，实验台几何为示意比例。',
        parameters: [wavelength, range('a', '缝宽', 15, 100, 1, 40, ' μm'),
            range('L', '到屏距离', .6, 2, .05, 1.2, ' m'), range('x', '屏上采样位置', -65, 65, .1, 16, ' mm')],
        axes: ['屏上位置 (mm)', relative],
        formula: 'I/I₀ = (sin β/β)²，β = πa sin θ/λ，θ = arctan(x/L)。第一暗纹满足 a sin θ₁ = λ。',
        question: '把缝宽减半，分别读取左右第一暗纹的位置。两者相距多远？用两次测量检验中央亮纹宽度是否与缝宽成反比。',
        notes: ['先把探头对准中央极大，再沿屏幕向两侧找出第一对暗纹。远场条件要求传播距离远大于 a²/λ。'],
        presets: [{ label: '减半缝宽', values: { a: 20 } }, { label: '红光', values: { lambda: 650 } }],
        playback: ['x', 22],
        model({ lambda, a, L, x }) {
            const theta1 = Math.asin(lambda / (a * 1000));
            return { start: -65, end: 65, at: x, bounds: [0, 1],
                read: s => sinc(Math.PI * a * 1000 / lambda * Math.sin(Math.atan(s / (L * 1000)))) ** 2,
                extra: ['中央亮纹宽度', 2 * L * 1000 * Math.tan(theta1), 'mm'] };
        },
    },
    {
        category: 'optics', slug: 'diffraction-grating', name: '衍射光栅',
        topics: '多缝干涉 · 缺级 · 分辨本领',
        description: '在测角仪上分离衍射级次，改变参与干涉的缝数，观察主峰变窄与缺级。',
        sceneTitle: '有限缝数光栅测角仪',
        sceneCaption: '扇面标出传播级次以及探头朝向，右侧沿角度展开光谱。色条的显示亮度压缩了动态范围。',
        parameters: [wavelength, range('d', '刻线密度', 250, 1000, 1, 500, ' 线/mm'),
            range('N', '参与干涉的缝数', 2, 20, 1, 8, ' 条'), range('f', '透光占空比 a/d', .1, .8, .01, .35, ''),
            range('x', '测角仪读数', -75, 75, .1, 15.4, '°')],
        axes: ['衍射角 (°)', relative], series: ['多缝光强', '单缝包络'],
        formula: 'I/I₀ = sinc²(fβ)[sin(Nβ)/(N sin β)]²，β = πd sin θ/λ，f = a/d。主极大满足 d sin θₘ = mλ，理想分辨本领 R = |m|N。',
        question: '把占空比设为 0.50，检查 ±2 级是否落入单缝包络的零点。然后固定占空比增加缝数，观察哪些读数会变化。',
        notes: ['从曲线读出主峰位置和宽度，再对照相同角度上的单缝包络。分辨本领公式采用瑞利判据，假定均匀照明且忽略像差。'],
        presets: [{ label: '±2 级缺失', values: { d: 500, f: .5, x: 32.1 } }, { label: '20 缝高分辨', values: { N: 20 } }],
        playback: ['x', 23],
        model({ lambda, d, N, f, x }) {
            const ratio = 1e6 / (lambda * d);
            const phase = angle => Math.PI * ratio * Math.sin(angle * rad);
            const envelope = angle => sinc(f * phase(angle)) ** 2;
            return { start: -75, end: 75, at: x, bounds: [0, 1], second: envelope,
                read(angle) {
                    const beta = phase(angle);
                    const delta = beta - Math.round(beta / Math.PI) * Math.PI;
                    return envelope(angle) * (sinc(N * delta) / sinc(delta)) ** 2;
                },
                extra: ['一级衍射角', Math.asin(1 / ratio) / rad, '°'] };
        },
    },
    {
        category: 'optics', slug: 'equal-thickness', name: '等厚干涉 · 劈尖',
        topics: '空气劈尖 · 反射相变 · 测薄',
        description: '观察空气劈尖上的直纹，用相邻暗纹间距测量薄片厚度。',
        sceneTitle: '空气劈尖与显微镜视野',
        sceneCaption: '俯视条纹沿等厚线延伸。剖面夸大了楔角，黄色标线指示实际取样位置。',
        parameters: [wavelength, range('a', '楔角', .04, .64, .01, .18, ' mrad'),
            range('g', '接触端间隙', 0, 600, 1, 0, ' nm'), range('x', '离左端距离', 0, 10, .01, 4, ' mm')],
        axes: ['离左端距离 (mm)', relative],
        formula: 't = t₀ + x tan α，I/Iₘₐₓ = sin²(2πt/λ)。反射光有一次 π 相变，相邻暗纹间距 Δx = λ/(2 tan α)。',
        question: '切换楔角后测出多个相邻暗纹。若两玻璃板长 10 mm，如何利用条纹间距求出右端间隙与左端间隙的差？',
        notes: ['用数条暗纹之间的总距离除以间隔数，比只测一个间隔更稳定。模型采用近法向入射与双束反射，忽略多次内反射。'],
        probe: 'x',
        presets: [{ label: '接触暗纹', values: { g: 0, x: 0 } }, { label: '半波位移', values: { g: 266 } }],
        playback: ['g', 42],
        model({ lambda, a, g, x }) {
            const slope = Math.tan(a / 1000) * 1e6;
            return { end: 10, at: x, bounds: [0, 1], thickness: s => g + slope * s,
                read: s => reflected(2 * (g + slope * s) / lambda), extra: ['暗纹间距', lambda / (2 * slope), 'mm'] };
        },
    },
    {
        category: 'optics', slug: 'equal-inclination', name: '等倾干涉 · 迈克耳孙',
        topics: '光程差 · 等倾圆纹 · 微位移测量',
        description: '调整两臂长度差，观察等倾圆纹向外扩张或向中心收缩，并用过环数测位移。',
        sceneTitle: '迈克耳孙干涉仪与焦平面',
        sceneCaption: '两臂光束经过分光镜后沿同一方向出射。圆形视野为透镜焦平面取样，仪器几何为示意比例。',
        parameters: [wavelength, range('d', '两臂单程长度差', 5, 180, .001, 132.82, ' μm'),
            range('f', '成像透镜焦距', 25, 65, 1, 38, ' mm'), range('x', '焦平面半径', 0, 12, .01, 6, ' mm')],
        axes: ['焦平面半径 (mm)', relative],
        formula: 'Δ = 2d cos θ，θ = arctan(r/f)，I/Iₘₐₓ = cos²(πΔ/λ)。镜面每移动 λ/2，有一条亮纹通过中心。',
        question: '缓慢改变臂长差，记录连续两次中心变亮的 d 值。从 d 的差值反推 λ，并观察增大焦距对条纹半径的影响。',
        notes: ['先把探头移到中心，再从中心明纹预设微调动镜。两臂等效反射面保持平行，两路光等强，固定相位偏移取零。'],
        probe: 'x',
        presets: [{ label: '中心明纹', values: { lambda: 532, d: 133, x: 0 } },
            { label: '中心暗纹', values: { lambda: 532, d: 133.133, x: 0 } }],
        playback: ['d', .42, 131],
        model({ lambda, d, f, x }) {
            const order = 2000 * d / lambda;
            return { end: 12, at: x, bounds: [0, 1],
                read: s => Math.cos(Math.PI * order * Math.cos(Math.atan(s / f))) ** 2,
                extra: ['中心光程差 / λ', order, ''] };
        },
    },
    {
        category: 'optics', slug: 'newton-rings', name: '牛顿环',
        topics: '等厚干涉 · 反射暗环 · 曲率半径',
        description: '对照三维透镜装置与反射条纹，测量暗环半径，并检验半径平方与级次的关系。',
        sceneTitle: '平凸透镜与牛顿环',
        sceneCaption: '剖面示意放大了空气膜。显微镜像中的游标沿半径取样，几何接触且单次反射相变时中心为暗斑。',
        three: true,
        parameters: [wavelength, range('R', '透镜曲率半径', .4, 2.5, .01, 1, ' m'),
            range('g', '轴上空气隙', 0, 450, 1, 0, ' nm'), range('x', '径向采样位置', 0, 3.6, .01, 1.46, ' mm')],
        axes: ['半径 (mm)', relative],
        formula: 't ≈ t₀ + r²/(2R)，I/Iₘₐₓ = sin²(2πt/λ)。接触时，第 m 条暗环满足 rₘ² = mλR。',
        question: '把轴上间隙设为 0，沿半径记录第 2 与第 6 个暗环（中心为 0 级）。用两者的半径平方差估算 R。',
        notes: ['实验只显示反射图样。使用近轴曲率近似和双束模型，忽略玻璃板两外表面的杂散反射。'],
        presets: [{ label: '空气膜接触', values: { g: 0 } }, { label: '中心变亮', values: { lambda: 532, g: 133 } }],
        playback: ['x', .55],
        model({ lambda, R, g, x }) {
            const thickness = s => g + 500 * s ** 2 / R;
            return { end: 3.6, at: x, bounds: [0, 1], thickness,
                read: s => reflected(2 * thickness(s) / lambda), extra: ['采样点膜厚', thickness(x), 'nm'] };
        },
    },
];
