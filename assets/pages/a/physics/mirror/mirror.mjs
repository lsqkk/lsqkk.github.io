import { backdrop, colors, controlChanges, degrees, dot, experimentCanvas, get, line, number, pointerPosition, radians, simulationClock, write } from '../workbench.mjs';
import { mirrorIntersection } from '../models.mjs';

const lightColors = [colors.amber, colors.blue, colors.violet, '#f4a9ad'];
let lights, mirrors, selectedLight, selectedMirror;
let traces = [];
let travel = 0;
let drag = null;

const vector = (angle) => ({ x: Math.cos(angle), y: Math.sin(angle) });
const pointAlong = (point, direction, distance) => ({ x: point.x + direction.x * distance, y: point.y + direction.y * distance });

function boundaryDistance(point, direction, width, height) {
    const horizontal = direction.x > 0 ? (width - point.x) / direction.x : -point.x / direction.x;
    const vertical = direction.y > 0 ? (height - point.y) / direction.y : -point.y / direction.y;
    return Math.min(horizontal, vertical);
}

function directionHandle(light, width, height) {
    const direction = vector(light.angle);
    const forward = boundaryDistance(light, direction, width, height);
    const backward = boundaryDistance(light, { x: -direction.x, y: -direction.y }, width, height);
    const reversed = forward < 40 && backward > forward;
    const distance = Math.min(62, (reversed ? backward : forward) - 8);
    return {
        point: pointAlong(light, direction, reversed ? -distance : distance),
        reversed,
    };
}

function trace(light, width, height) {
    let origin = light;
    let direction = vector(light.angle);
    const path = [origin];
    const impacts = [];
    for (let bounce = 0; bounce <= 6; bounce++) {
        const edge = boundaryDistance(origin, direction, width, height);
        let hit = null;
        for (const mirror of mirrors) {
            const candidate = mirrorIntersection(origin, direction, mirror);
            if (candidate && candidate.distance < (hit?.distance ?? edge)) hit = candidate;
        }
        if (!hit) {
            path.push(pointAlong(origin, direction, edge));
            break;
        }
        path.push(hit.point);
        if (!hit.reflection || bounce === 6) break;
        impacts.push(hit);
        origin = hit.point;
        direction = hit.reflection;
    }
    return { path, impacts };
}

function reset() {
    lights = [{ x: 160, y: 94, angle: radians(42), color: lightColors[0] }];
    mirrors = [{ a: { x: 150, y: 302 }, b: { x: 562, y: 302 } }];
    selectedLight = 0;
    selectedMirror = 0;
    travel = 0;
    drag = null;
}

function drawSquare(ctx, point, size, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
}

reset();
const { canvas, paint, width, height } = experimentCanvas((ctx, w, h) => {
    backdrop(ctx, w, h);
    mirrors.forEach(({ a, b }, index) => {
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const front = vector(angle - Math.PI / 2);
        const start = pointAlong(a, front, 3);
        const end = pointAlong(b, front, 3);
        line(ctx, a.x, a.y, b.x, b.y, colors.muted, 4);
        line(ctx, start.x, start.y, end.x, end.y, colors.mint, 2);
        drawSquare(ctx, a, 12, index === selectedMirror ? colors.mint : colors.muted);
        drawSquare(ctx, b, 12, index === selectedMirror ? colors.mint : colors.muted);
    });

    lights.forEach((light, index) => {
        const { path, impacts } = traces[index] ?? trace(light, w, h);
        const selected = index === selectedLight;
        ctx.globalAlpha = selected ? 1 : .56;
        let elapsed = 0;
        let drawnParticle = false;
        for (let i = 1; i < path.length; i++) {
            const a = path[i - 1];
            const b = path[i];
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            line(ctx, a.x, a.y, b.x, b.y, light.color, selected ? 2.5 : 1.5);
            const position = (travel + 45 * index) % 160;
            const offset = (position - elapsed % 160 + 160) % 160;
            if (length > 0) {
                for (let step = offset; step < length; step += 160) {
                    const fraction = step / length;
                    dot(ctx, a.x + (b.x - a.x) * fraction, a.y + (b.y - a.y) * fraction, 4, colors.text);
                    drawnParticle = true;
                }
            }
            elapsed += length;
        }
        if (!drawnParticle) dot(ctx, light.x, light.y, 4, colors.text);
        const first = impacts[0];
        if (selected && first) {
            const { point, normal } = first;
            ctx.setLineDash([5, 6]);
            line(ctx, point.x - normal.x * 42, point.y - normal.y * 42, point.x + normal.x * 74, point.y + normal.y * 74, colors.text);
            ctx.setLineDash([]);
            dot(ctx, point.x, point.y, 4, colors.text);
        }
        const { point: handle } = directionHandle(light, w, h);
        dot(ctx, light.x, light.y, selected ? 10 : 8, light.color);
        dot(ctx, handle.x, handle.y, 7, light.color);
        dot(ctx, handle.x, handle.y, 3, colors.background);
        ctx.globalAlpha = 1;
    });
});

function angleOf(mirror) {
    return Math.atan2(mirror.b.y - mirror.a.y, mirror.b.x - mirror.a.x);
}

function updateAngles() {
    const lightAngle = Math.round(degrees(lights[selectedLight].angle));
    const mirrorAngle = Math.round(degrees(angleOf(mirrors[selectedMirror])));
    get('light-angle').value = lightAngle;
    get('mirror-angle').value = mirrorAngle;
    write('light-angle-output', lightAngle + '°');
    write('mirror-angle-output', mirrorAngle + '°');
}

function updateOptions() {
    for (const [id, objects, selected, name] of [
        ['selected-light', lights, selectedLight, '光源'],
        ['selected-mirror', mirrors, selectedMirror, '镜面'],
    ]) {
        const select = get(id);
        select.replaceChildren(...objects.map((_, index) => new Option(name + ' ' + (index + 1), String(index))));
        select.value = selected;
    }
    get('add-light').disabled = lights.length >= lightColors.length;
    get('add-mirror').disabled = mirrors.length >= 4;
    get('remove-light').disabled = lights.length <= 1;
    get('remove-mirror').disabled = mirrors.length <= 1;
    updateAngles();
}

function render() {
    traces = lights.map((light) => trace(light, width, height));
    const { impacts } = traces[selectedLight];
    const angle = impacts.length ? degrees(impacts[0].incidence).toFixed(1) + '°' : '—';
    write('incident', angle);
    write('reflected', angle);
    write('bounces', String(impacts.length));
    paint();
}

function update() {
    updateOptions();
    render();
}

function moveHandle(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointerPosition(canvas, event, width, height);
    point.x = Math.max(14, Math.min(width - 14, point.x));
    point.y = Math.max(14, Math.min(height - 14, point.y));
    if (drag.type === 'light') {
        const light = lights[selectedLight];
        if (drag.key === 'source') Object.assign(light, point);
        else if (Math.hypot(point.x - light.x, point.y - light.y) > 6) {
            const sign = drag.reversed ? -1 : 1;
            light.angle = Math.atan2(sign * (point.y - light.y), sign * (point.x - light.x));
        }
    } else {
        const mirror = mirrors[selectedMirror];
        const other = mirror[drag.key === 'a' ? 'b' : 'a'];
        const a = drag.key === 'a' ? point : other;
        const b = drag.key === 'b' ? point : other;
        if (Math.hypot(b.x - a.x, b.y - a.y) > 25) mirror[drag.key] = point;
    }
    updateAngles();
    render();
}

canvas.classList.add('physics-drag-surface');
canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag) return;
    const point = pointerPosition(canvas, event, width, height);
    const handles = [
        ...lights.flatMap((light, index) => [
            { point: light, type: 'light', key: 'source', index },
            { ...directionHandle(light, width, height), type: 'light', key: 'direction', index },
        ]),
        ...mirrors.flatMap((mirror, index) => ['a', 'b'].map((key) => ({ point: mirror[key], type: 'mirror', key, index }))),
    ];
    const distance = (handle) => Math.hypot(handle.point.x - point.x, handle.point.y - point.y);
    const closest = handles.sort((a, b) => distance(a) - distance(b))[0];
    if (distance(closest) > Math.max(18, width / canvas.clientWidth * 15)) return;
    drag = { ...closest, pointerId: event.pointerId };
    if (drag.type === 'light') selectedLight = drag.index;
    else selectedMirror = drag.index;
    canvas.setPointerCapture(event.pointerId);
    update();
});
canvas.addEventListener('pointermove', moveHandle);
canvas.addEventListener('lostpointercapture', () => { drag = null; });

get('add-light').addEventListener('click', () => {
    selectedLight = lights.length;
    lights.push({ x: 160 + 96 * selectedLight, y: 94 - selectedLight * 14, angle: radians(58), color: lightColors.find((color) => lights.every((light) => light.color !== color)) });
    update();
});
get('remove-light').addEventListener('click', () => {
    lights.splice(selectedLight, 1);
    selectedLight = Math.min(selectedLight, lights.length - 1);
    update();
});
get('add-mirror').addEventListener('click', () => {
    selectedMirror = mirrors.length;
    const y = 145 + selectedMirror * 49;
    mirrors.push({ a: { x: 450, y: y + 52 }, b: { x: 595, y } });
    update();
});
get('remove-mirror').addEventListener('click', () => {
    mirrors.splice(selectedMirror, 1);
    selectedMirror = Math.min(selectedMirror, mirrors.length - 1);
    update();
});

for (const [id, select] of [
    ['selected-light', () => { selectedLight = Number(get('selected-light').value); }],
    ['selected-mirror', () => { selectedMirror = Number(get('selected-mirror').value); }],
]) {
    get(id).addEventListener('input', () => {
        select();
        updateAngles();
        render();
    });
}

get('light-angle').addEventListener('input', () => {
    lights[selectedLight].angle = radians(number('light-angle'));
    updateAngles();
    render();
});

get('mirror-angle').addEventListener('input', () => {
    const mirror = mirrors[selectedMirror];
    const center = { x: (mirror.a.x + mirror.b.x) / 2, y: (mirror.a.y + mirror.b.y) / 2 };
    const angle = vector(radians(number('mirror-angle')));
    const length = Math.min(Math.hypot(mirror.b.x - mirror.a.x, mirror.b.y - mirror.a.y) / 2,
        boundaryDistance(center, angle, width, height) - 12, boundaryDistance(center, { x: -angle.x, y: -angle.y }, width, height) - 12);
    mirror.a = pointAlong(center, angle, -length);
    mirror.b = pointAlong(center, angle, length);
    write('mirror-angle-output', number('mirror-angle') + '°');
    render();
});

controlChanges();
get('experiment-form').addEventListener('reset', () => {
    reset();
    traces = [];
    requestAnimationFrame(update);
});
simulationClock(paint, (dt) => { travel += dt * 125; });
update();
