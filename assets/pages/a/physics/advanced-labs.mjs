const slider = (id, label, min, max, step, value, unit = '') => ({
    id, label, min, max, step, value, unit, initial: value + unit
});

const electronCharge = 1.602176634e-19;
const electronMass = 9.1093837e-31;
const photonEVnm = 1239.841984;
const turn = 2 * Math.PI;

export function magneticBeam({ u, b, a }) {
    const speed = Math.sqrt(2 * electronCharge * u / electronMass);
    const angle = a * Math.PI / 180;
    const axialSpeed = speed * Math.cos(angle);
    const angularFrequency = electronCharge * b * .001 / electronMass;
    const pitch = turn * axialSpeed / angularFrequency;
    return { pitch, radius: speed * Math.sin(angle) / angularFrequency };
}

export function magneticPoint(beam, distance, azimuth = 0) {
    const phase = turn * distance / beam.pitch;
    return [
        distance,
        beam.radius * (Math.sin(phase + azimuth) - Math.sin(azimuth)),
        beam.radius * (Math.cos(azimuth) - Math.cos(phase + azimuth))
    ];
}

export function hallVoltage(current, field, concentration, thickness, polarity) {
    return 1000 * polarity * current * .001 * field /
        (electronCharge * concentration * 1e22 * thickness * .001);
}

export function photoelectricSignal(wavelength, workFunction, flux) {
    const energy = photonEVnm / wavelength;
    const stopping = Math.max(0, energy - workFunction);
    return { energy, stopping, current: voltage => stopping ? 0.1 * flux * Math.min(1, Math.max(0, 1 + voltage / stopping)) : 0 };
}

export function torsionResponse(frequency, natural, damping) {
    const ratio = frequency / natural;
    return {
        amplitude: .16 / Math.hypot(1 - ratio ** 2, 2 * damping * ratio),
        phase: Math.atan2(2 * damping * ratio, 1 - ratio ** 2)
    };
}

export const advancedLabs = [
    {
        category: 'electricity', slug: 'magnetic-focus', name: '电子束磁聚焦', topics: '洛伦兹力 · 电子比荷 · 螺旋运动',
        description: '用轴向磁场把发散的电子束收回轴心，测量相邻焦点间距。',
        sceneTitle: '螺线管内的电子束', sceneCaption: '青色为不同出射方位的电子。右窗显示探测屏上的横截面，三维视图可旋转。',
        three: true, probe: 'x', playback: ['x', 7],
        parameters: [
            slider('u', '加速电压', 100, 1000, 10, 400, ' V'),
            slider('b', '轴向磁感应强度', .7, 4, .01, 1.67, ' mT'),
            slider('a', '出射张角', 2, 20, 1, 10, '°'),
            slider('x', '探测屏距', 0, 60, .1, 25, ' cm')
        ],
        presets: [{ label: '一阶焦点', values: { u: 400, b: 1.67, a: 10, x: 25 } }, { label: '二阶焦点', values: { u: 400, b: 3.34, a: 10, x: 25 } }],
        notes: ['固定加速电压与出射张角，沿轴拖动探测屏，找出相邻束斑半径极小值。', '提高磁场并保存对照，检验焦点间距与 B 的倒数关系。三维视图采用各轴相同尺度，二维侧视的横向位移经过放大。'],
        formula: 'ωc = eB/mₑ，rL = v⊥/ωc，焦点间距 L = 2πv∥/ωc。忽略边缘磁场和电子间相互作用，电子以相同极角、不同方位角射出。',
        question: '将屏保持在 25 cm，调节磁场找出前两个焦点。用 L、B 和加速电压反推 e/mₑ，出射角较大时应如何修正？',
        axes: ['轴向距离 (cm)', '束斑半径 (mm)'],
        model(p) {
            const beam = magneticBeam(p);
            return { end: 60, at: p.x, read: x => 2000 * beam.radius * Math.abs(Math.sin(Math.PI * x * .01 / beam.pitch)),
                extra: ['相邻焦点间距', beam.pitch * 100, 'cm'], beam };
        }
    },
    {
        category: 'electricity', slug: 'hall-effect', probe: 'b', name: '霍尔效应', topics: '横向电压 · 载流子极性 · 霍尔系数',
        description: '在通电薄片上施加垂直磁场，用横向电压辨别载流子的正负。',
        sceneTitle: '霍尔薄片与横向电压表', sceneCaption: '青色粒子表示载流子漂移，点和叉表示磁场出入屏面。亮起的两侧边缘标示电荷积累。',
        parameters: [
            slider('i', '纵向电流', 0, 30, .5, 18, ' mA'),
            slider('b', '垂直磁场', -1, 1, .01, .65, ' T'),
            slider('n', '载流子浓度', .5, 8, .1, 1.5, ' ×10²² m⁻³'),
            slider('d', '样品厚度', .05, .6, .01, .15, ' mm'),
            slider('q', '载流子电荷符号', -1, 1, 2, -1)
        ],
        presets: [{ label: 'n 型', values: { q: -1 } }, { label: 'p 型', values: { q: 1 } }, { label: '反转磁场', values: { b: -.65 } }],
        notes: ['从 B = 0 开始，向正负两侧扫描并记录 Uₕ。交换 n 型和 p 型，测量斜率变号。', '在浓度不变时改变样品厚度，检验 Uₕ 对厚度的反比关系。粒子速度与电荷标记用于示意。'],
        formula: '定义 Uₕ = V下 − V上。常规电流向右、正磁场朝屏外时，Uₕ = IB/(nqd)。假定单一载流子类型且磁场均匀。',
        question: '分别反转磁场与载流子符号，记录电压变化。在 I 与 d 已知时，如何用 Uₕ–B 曲线的斜率求 n？',
        axes: ['磁感应强度 (T)', '霍尔电压 (mV)'],
        model: ({ i, b, n, d, q }) => ({ start: -1, end: 1, at: b, read: field => hallVoltage(i, field, n, d, q),
            extra: ['霍尔系数', q / (electronCharge * n * 1e22) * 1e3, '×10⁻³ m³/C'] })
    },
    {
        category: 'modern', slug: 'photoelectric', probe: 'v', playback: ['v', .75], name: '光电效应', topics: '遏止电压 · 逸出功 · 爱因斯坦方程',
        description: '用单色光照射光阴极，扫描管压测量遏止电压，比较光强和光子能量的作用。',
        sceneTitle: '真空光电管', sceneCaption: '光子从左侧打到阴极。青色为光电子，反向电场会让轴向动能不足的电子返回阴极。',
        parameters: [
            slider('l', '入射波长', 220, 720, 1, 365, ' nm'),
            slider('w', '阴极逸出功', 1.6, 4.5, .05, 2.2, ' eV'),
            slider('f', '相对光子通量', 10, 100, 1, 65, '%'),
            slider('v', '阳极相对阴极电压', -4.5, 2, .01, -.5, ' V')
        ],
        presets: [{ label: '测量遏止电压', values: { l: 365, w: 2.2, v: -1.2 } }, { label: '低于阈频', values: { l: 650, w: 2.2, v: 1 } }],
        notes: ['逐渐调低阳极电压，读取电流首次降为零时的电压。在同一波长下提高通量，重复测量。', '改变波长并记录遏止电压。测量时使用短于截止波长的光，示意动画按比例放慢电子运动。'],
        formula: 'Kₘₐₓ = hc/λ − W，eUₛ = Kₘₐₓ。演示设轴向动能在 0 至 Kₘₐₓ 间均匀分布，电流为理想化收集曲线。',
        question: '保持波长不变，改变通量并对照两条伏安曲线。再用三个不同波长测 Uₛ，能否由 Uₛ–ν 图线估算 h？',
        axes: ['阳极电压 (V)', '光电流 (μA)'],
        model({ l, w, f, v }) {
            const signal = photoelectricSignal(l, w, f);
            return { start: -4.5, end: 2, at: v, read: signal.current, bounds: [0, 10],
                extra: signal.stopping ? ['遏止电压（大小）', signal.stopping, 'V'] : ['截止波长', photonEVnm / w, 'nm'], signal };
        }
    },
    {
        category: 'mechanics', slug: 'pohl-resonance', probe: 'f', name: '波尔共振（受迫扭摆）', topics: '共振曲线 · 相位滞后 · 涡流阻尼',
        description: '旋转偏心轮驱动波尔摆，观测不同频率和阻尼下的稳态振幅及相位差。',
        sceneTitle: '波尔摆与偏心轮驱动', sceneCaption: '琥珀色偏心轮给出驱动相位，青色示针表示摆轮角位移。动画显示稳态响应。',
        parameters: [
            slider('f', '驱动频率', .2, 2.2, .01, .97, ' Hz'),
            slider('n', '固有频率', .65, 1.4, .01, 1, ' Hz'),
            slider('z', '阻尼比', .08, .55, .01, .18)
        ],
        presets: [{ label: '低于共振', values: { f: .5, n: 1, z: .18 } }, { label: '接近共振', values: { f: .97, n: 1, z: .18 } }, { label: '强阻尼', values: { z: .48 } }],
        notes: ['固定固有频率，扫描驱动频率，分别记下稳态振幅最大和相位滞后 90° 的位置。', '增加阻尼并比较两组读数。稳态示波图用各自的显示增益比较相位，实际振幅使用共振曲线及数据读数。'],
        formula: 'θ″ + 2ζω₀θ′ + ω₀²θ = τ₀ cos(ωt)/J。稳态幅值 A = (τ₀/Jω₀²)/√[(1 − r²)² + (2ζr)²]，r = ω/ω₀。固定静态偏转 τ₀/Jω₀² = 0.16 rad。',
        question: '保存低阻尼曲线，再增大阻尼。记录峰值位置并与 f₀√(1 − 2ζ²) 对照，找出相位差恰为 90° 的频率。',
        axes: ['驱动频率 (Hz)', '稳态振幅 (°)'],
        model: ({ f, n, z }) => ({ start: .2, end: 2.2, at: f, read: frequency => torsionResponse(frequency, n, z).amplitude * 180 / Math.PI,
            extra: ['相位滞后', torsionResponse(f, n, z).phase * 180 / Math.PI, '°'] })
    }
];
