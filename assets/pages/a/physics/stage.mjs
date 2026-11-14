export const stageWidth = 960;
export const stageHeight = 520;

export function createStage(canvas) {
    const ctx = canvas.getContext('2d');
    const w = stageWidth;
    const h = stageHeight;

    function begin() {
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.round(w * scale);
        const height = Math.round(h * scale);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        ctx.setTransform(width / w, 0, 0, height / h, 0, 0);
        const dark = ctx.createLinearGradient(0, 0, w, h);
        dark.addColorStop(0, '#132439');
        dark.addColorStop(.62, '#0b1726');
        dark.addColorStop(1, '#09111b');
        ctx.fillStyle = dark;
        ctx.fillRect(0, 0, w, h);
    }

    function line(points, color = '#385165', width = 2, dash = []) {
        ctx.beginPath();
        points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function dot(x, y, r, color, glow = 0) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = glow;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    }

    function text(label, x, y, color = '#b8cbd9', size = 17, align = 'left') {
        ctx.font = size + 'px system-ui, sans-serif';
        ctx.textAlign = align;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = color;
        ctx.fillText(String(label), x, y);
    }

    function panel(x, y, width, height, fill = '#101e2e', stroke = '#30485e', radius = 13) {
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, radius);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    function arrow(x1, y1, x2, y2, color, width = 2) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        line([[x1, y1], [x2, y2]], color, width);
        line([
            [x2 - 10 * Math.cos(angle - .46), y2 - 10 * Math.sin(angle - .46)],
            [x2, y2],
            [x2 - 10 * Math.cos(angle + .46), y2 - 10 * Math.sin(angle + .46)],
        ], color, width);
    }

    function grid(x, y, width, height, step = 24) {
        for (let dx = 0; dx <= width; dx += step) line([[x + dx, y], [x + dx, y + height]], '#8fb8e217', 1);
        for (let dy = 0; dy <= height; dy += step) line([[x, y + dy], [x + width, y + dy]], '#8fb8e217', 1);
    }

    return { ctx, w, h, begin, line, dot, text, panel, arrow, grid };
}
