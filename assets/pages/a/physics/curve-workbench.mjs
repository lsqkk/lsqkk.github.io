import { experiments } from './experiments.mjs';
import { createStage } from './stage.mjs';
import { createPlot } from './physics-plot.mjs';
import { drawFoundationScene } from './foundation-scenes.mjs';
import { drawOpticsScene, opticsProbe } from './optics-scenes.mjs';
import { drawAdvancedScene } from './advanced-scenes.mjs';

const root = document.querySelector('#physics-lab');
const lab = experiments.find(item => item.slug === root.dataset.experiment);
const form = root.querySelector('form');
const sceneCanvas = root.querySelector('#simulation');
const plotCanvas = root.querySelector('#measurement-plot');
const stage = createStage(sceneCanvas);
const plot = createPlot(plotCanvas, lab);
const status = root.querySelector('#curve-status');
const clear = root.querySelector('#clear-run');
const play = root.querySelector('#play-lab');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const format = new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 5 });
const sliders = Object.fromEntries(lab.parameters.map(p => [p.id, root.querySelector('#lab-' + p.id)]));
const fields = lab.parameters.map(parameter => ({
    ...parameter, input: sliders[parameter.id], output: root.querySelector('#lab-' + parameter.id + '-output'),
    format: new Intl.NumberFormat('zh-CN', { maximumFractionDigits: String(parameter.step).split('.')[1]?.length ?? 0 }),
}));
const readX = root.querySelector('#reading-x');
const readY = root.querySelector('#reading-y');
const extra = root.querySelector('#reading-extra');
const isOptics = lab.category === 'optics';
const drawScene = isOptics ? drawOpticsScene : lab.level === 'university' ? drawAdvancedScene : drawFoundationScene;

let reference;
let parameters;
let model;
let curveKey;
let elapsed = 0;
let cursor;
let playing = !motion.matches && !lab.playback;
let lastTime;
let frameId;
let visible = true;
let view3d;
let loading3d = false;
let failed3d = false;
const threeHost = root.querySelector('#physics-three');

function write(node, value) {
    if (node.textContent !== value) node.textContent = value;
}

function paintScene() {
    if (view3d && !threeHost.hidden) {
        view3d.draw(parameters, model, elapsed);
        return;
    }
    stage.begin();
    stage.ctx.save();
    drawScene(stage, lab, parameters, model, elapsed);
    stage.ctx.restore();
}

function update() {
    parameters = Object.fromEntries(fields.map(field => {
        const value = field.id === lab.playback?.[0] && cursor !== undefined ? cursor : field.input.valueAsNumber;
        write(field.output, field.format.format(value) + field.unit);
        return [field.id, value];
    }));
    model = lab.model(parameters);
    const cursorFields = lab.curveStaticAt ?? [lab.probe ?? lab.playback?.[0]];
    curveKey = fields.filter(field => !cursorFields.includes(field.id)).map(field => parameters[field.id]).join('/');
    const y = model.read(model.at);
    const [label, value, unit] = model.extra;
    write(readX, format.format(model.at));
    write(readY, [y, ...(model.second ? [model.second(model.at)] : [])].map(v => format.format(v)).join(' / '));
    write(extra.previousElementSibling, label);
    write(extra, [typeof value === 'number' ? format.format(value) : value, unit].filter(Boolean).join(' '));
    plot.draw(model, reference, curveKey);
    paintScene();
}

function schedule() {
    if (playing && visible && !document.hidden && frameId === undefined) frameId = requestAnimationFrame(tick);
}

function tick(now) {
    frameId = undefined;
    if (!playing || !visible || document.hidden) return;
    const delta = lastTime === undefined ? 0 : Math.min((now - lastTime) / 1000, .06);
    lastTime = now;
    elapsed += delta;
    if (lab.playback) {
        const [id, speed, origin] = lab.playback;
        const slider = sliders[id];
        cursor = (cursor ?? slider.valueAsNumber) + speed * delta;
        if (cursor > Number(slider.max)) cursor = origin ?? Number(slider.min);
        slider.value = String(cursor);
        update();
    } else {
        paintScene();
    }
    schedule();
}

function setPlaying(next) {
    playing = next;
    lastTime = undefined;
    play.textContent = playing ? '暂停演示' : '播放演示';
    play.setAttribute('aria-pressed', String(playing));
    if (!playing && frameId !== undefined) {
        cancelAnimationFrame(frameId);
        frameId = undefined;
    }
    schedule();
}

play.addEventListener('click', () => setPlaying(!playing));
motion.addEventListener('change', event => {
    if (event.matches) setPlaying(false);
});
document.addEventListener('visibilitychange', () => {
    lastTime = undefined;
    schedule();
});
new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    lastTime = undefined;
    schedule();
}).observe(sceneCanvas.parentElement);

form.addEventListener('input', event => {
    if (event.target === sliders[lab.playback?.[0]] || (lab.playback && event.target === sliders[lab.probe])) {
        if (event.target === sliders[lab.playback[0]]) cursor = undefined;
        setPlaying(false);
    }
    update();
});
form.addEventListener('reset', () => requestAnimationFrame(() => {
    cursor = undefined;
    elapsed = 0;
    setPlaying(!motion.matches && !lab.playback);
    update();
}));
root.querySelector('#pin-run').addEventListener('click', () => {
    reference = model;
    clear.disabled = false;
    write(status, '已保存当前主曲线。虚线会保留本次参数的结果。');
    update();
});
clear.addEventListener('click', () => {
    reference = undefined;
    clear.disabled = true;
    write(status, '已移除对照曲线。');
    update();
});
root.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    const preset = lab.presets[Number(button.dataset.preset)];
    for (const [id, value] of Object.entries(preset.values)) sliders[id].value = String(value);
    cursor = undefined;
    write(status, '已应用「' + preset.label + '」。');
    update();
}));

const probe = sliders[lab.probe ?? lab.playback?.[0]];
if (probe) {
    plotCanvas.classList.add('physics-plot-probe');
    function moveProbe(event) {
        const x = plot.position(event);
        probe.value = String(lab.probeScale ? lab.probeScale(x, model) : x);
        probe.dispatchEvent(new Event('input', { bubbles: true }));
    }
    plotCanvas.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        plotCanvas.setPointerCapture(event.pointerId);
        moveProbe(event);
    });
    plotCanvas.addEventListener('pointermove', event => {
        if (plotCanvas.hasPointerCapture(event.pointerId)) moveProbe(event);
    });
    if (isOptics) {
        sceneCanvas.classList.add('physics-plot-probe');
        function positionDetector(event, dragging) {
            const { left, top, width, height } = sceneCanvas.getBoundingClientRect();
            const x = (event.clientX - left) / width * stage.w;
            const y = (event.clientY - top) / height * stage.h;
            const value = opticsProbe(lab.slug, model, x, y, dragging);
            if (value === undefined) return;
            if (!dragging) sceneCanvas.setPointerCapture(event.pointerId);
            probe.value = String(value);
            probe.dispatchEvent(new Event('input', { bubbles: true }));
        }
        sceneCanvas.addEventListener('pointerdown', event => {
            if (event.button === 0) positionDetector(event, false);
        });
        sceneCanvas.addEventListener('pointermove', event => {
            if (sceneCanvas.hasPointerCapture(event.pointerId)) positionDetector(event, true);
        });
    }
}

if (threeHost) {
    const toggle = root.querySelector('#switch-view');
    const rotate = root.querySelector('#rotate-view');
    const home = root.querySelector('#home-view');
    async function mount() {
        for (const file of ['three.min.js', 'OrbitControls.js']) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = '/assets/js/' + file;
                script.onload = resolve;
                script.onerror = reject;
                document.head.append(script);
            });
        }
        const create = isOptics
            ? (await import('./optics-3d.mjs')).mountOptics3D
            : (await import('./magnetic-3d.mjs')).mountMagnetic3D;
        view3d = create(threeHost, lab.slug);
    }
    toggle.addEventListener('click', async () => {
        if (loading3d || failed3d) return;
        if (!threeHost.hidden) {
            threeHost.hidden = rotate.hidden = home.hidden = true;
            sceneCanvas.hidden = false;
            toggle.textContent = '打开三维视角';
            toggle.setAttribute('aria-pressed', 'false');
            paintScene();
            return;
        }
        loading3d = true;
        toggle.disabled = true;
        toggle.textContent = '正在打开三维视角…';
        try {
            threeHost.hidden = false;
            if (!view3d) await mount();
            sceneCanvas.hidden = true;
            rotate.hidden = home.hidden = false;
            toggle.textContent = '返回二维示意';
            toggle.setAttribute('aria-pressed', 'true');
            paintScene();
        } catch (error) {
            console.warn('Physics 3D view unavailable', error);
            threeHost.hidden = true;
            sceneCanvas.hidden = false;
            failed3d = true;
            toggle.textContent = '三维视角不可用';
            write(status, '当前设备无法打开 WebGL 视角。可以继续使用二维演示和曲线。');
        } finally {
            loading3d = false;
            toggle.disabled = failed3d;
        }
    });
    rotate.addEventListener('click', () => { view3d.rotate(); paintScene(); });
    home.addEventListener('click', () => { view3d.home(); paintScene(); });
}

update();
setPlaying(playing);
