export const colors = {
    background: '#111c2a',
    grid: '#263a4d',
    muted: '#9bb1c8',
    text: '#edf5fb',
    mint: '#80e5db',
    amber: '#ffca81',
    blue: '#90bfff',
    violet: '#c9a9ff',
};

export const tau = Math.PI * 2;
export const radians = (degrees) => degrees * Math.PI / 180;
export const degrees = (angle) => angle * 180 / Math.PI;
export const get = (id) => document.getElementById(id);
export const number = (id) => get(id).valueAsNumber;

export function write(id, value) {
    const element = get(id);
    if (element.textContent !== value) element.textContent = value;
}

export function line(ctx, x1, y1, x2, y2, stroke = colors.grid, width = 1) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
}

export function dot(ctx, x, y, radius, fill) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, tau);
    ctx.fillStyle = fill;
    ctx.fill();
}

export function arrow(ctx, x1, y1, x2, y2, stroke = colors.mint, width = 2) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    line(ctx, x1, y1, x2, y2, stroke, width);
    line(ctx, x2, y2, x2 - 9 * Math.cos(angle - .55), y2 - 9 * Math.sin(angle - .55), stroke, width);
    line(ctx, x2, y2, x2 - 9 * Math.cos(angle + .55), y2 - 9 * Math.sin(angle + .55), stroke, width);
}

export function label(ctx, text, x, y, fill = colors.text, align = 'left') {
    ctx.fillStyle = fill;
    const scale = ctx.canvas.clientWidth / 720;
    const size = Math.max(17, 10 / Math.max(scale, .35));
    ctx.font = size + 'px system-ui, sans-serif';
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
}

export function backdrop(ctx, width, height, grid = true) {
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);
    if (!grid) return;
    for (let x = 0; x < width; x += 24) line(ctx, x + .5, 0, x + .5, height);
    for (let y = 0; y < height; y += 24) line(ctx, 0, y + .5, width, y + .5);
}

export function experimentCanvas(draw) {
    const canvas = get('simulation');
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d');

    function paint() {
        draw(ctx, width, height);
    }

    function resize() {
        const scale = canvas.clientWidth / width * Math.min(devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
        paint();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return { canvas, paint, width, height };
}

export function pointerPosition(canvas, event, width, height) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * width / rect.width,
        y: (event.clientY - rect.top) * height / rect.height,
    };
}

export function controlChanges(render) {
    const form = get('experiment-form');
    if (render) {
        form.addEventListener('input', render);
        form.addEventListener('reset', () => requestAnimationFrame(render));
    }
    form.addEventListener('submit', (event) => event.preventDefault());
}

export function simulationClock(render, advance) {
    const toggle = get('toggle-animation');
    let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    let available = true;
    let lastTime = null;
    let frame = null;

    function updateButton() {
        toggle.disabled = !available;
        toggle.textContent = playing ? '暂停' : '播放';
        toggle.setAttribute('aria-label', playing ? '暂停动画' : '播放动画');
    }

    function tick(now) {
        if (lastTime !== null) advance(Math.min((now - lastTime) / 1000, .05));
        lastTime = now;
        render();
        frame = requestAnimationFrame(tick);
    }

    function schedule() {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        lastTime = null;
        if (playing && available && !document.hidden) frame = requestAnimationFrame(tick);
        updateButton();
    }

    toggle.addEventListener('click', () => {
        playing = !playing;
        schedule();
    });
    document.addEventListener('visibilitychange', schedule);
    schedule();
    return {
        pause() {
            playing = false;
            schedule();
        },
        setAvailable(next) {
            if (next === available) return;
            available = next;
            schedule();
        },
    };
}
