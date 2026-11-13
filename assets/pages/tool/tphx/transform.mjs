function gilbert2d(width, height) {
    const coordinates = new Uint32Array(width * height);
    let index = 0;
    const visit = (x, y) => { coordinates[index++] = x + y * width; };
    if (width >= height) {
        generate2d(0, 0, width, 0, 0, height, visit);
    } else {
        generate2d(0, 0, 0, height, width, 0, visit);
    }
    return coordinates;
}

function generate2d(x, y, ax, ay, bx, by, visit) {
    const w = Math.abs(ax + ay);
    const h = Math.abs(bx + by);
    const dax = Math.sign(ax), day = Math.sign(ay);
    const dbx = Math.sign(bx), dby = Math.sign(by);

    if (h === 1) {
        for (let i = 0; i < w; i++) {
            visit(x, y);
            x += dax;
            y += day;
        }
        return;
    }

    if (w === 1) {
        for (let i = 0; i < h; i++) {
            visit(x, y);
            x += dbx;
            y += dby;
        }
        return;
    }

    let ax2 = Math.floor(ax / 2), ay2 = Math.floor(ay / 2);
    let bx2 = Math.floor(bx / 2), by2 = Math.floor(by / 2);
    const w2 = Math.abs(ax2 + ay2);
    const h2 = Math.abs(bx2 + by2);

    if (2 * w > 3 * h) {
        if ((w2 % 2) && (w > 2)) {
            ax2 += dax;
            ay2 += day;
        }
        generate2d(x, y, ax2, ay2, bx, by, visit);
        generate2d(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by, visit);
    } else {
        if ((h2 % 2) && (h > 2)) {
            bx2 += dbx;
            by2 += dby;
        }
        generate2d(x, y, bx2, by2, ax2, ay2, visit);
        generate2d(x + bx2, y + by2, ax, ay, bx - bx2, by - by2, visit);
        generate2d(x + (ax - dax) + (bx2 - dbx), y + (ay - day) + (by2 - dby),
            -bx2, -by2, -(ax - ax2), -(ay - ay2), visit);
    }
}

function shuffledOrder(length, seed) {
    let state = 2166136261;
    for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
    const order = Uint32Array.from({ length }, (_, index) => index);
    for (let i = length - 1; i > 0; i--) {
        state = (state + 0x6d2b79f5) | 0;
        let random = Math.imul(state ^ (state >>> 15), state | 1);
        random ^= random + Math.imul(random ^ (random >>> 7), random | 61);
        const j = ((random ^ (random >>> 14)) >>> 0) % (i + 1);
        const swap = order[i];
        order[i] = order[j];
        order[j] = swap;
    }
    return order;
}

export function transformPixels(buffer, width, height, { method, rounds, seed, reverse }) {
    const count = width * height;
    const source = new Uint32Array(buffer);
    const target = new Uint32Array(count);
    if (method === 'gilbert') {
        const order = gilbert2d(width, height);
        const step = Math.round((Math.sqrt(5) - 1) / 2 * count);
        const offset = (step * rounds) % count;
        for (let i = 0; i < count; i++) {
            const from = order[i];
            const to = order[(i + offset) % count];
            if (reverse) target[from] = source[to];
            else target[to] = source[from];
        }
    } else if (method === 'pixels') {
        const order = shuffledOrder(count, seed);
        for (let i = 0; i < count; i++) {
            if (reverse) target[i] = source[order[i]];
            else target[order[i]] = source[i];
        }
    } else if (method === 'lattice') {
        const rows = shuffledOrder(height, 'rows:' + seed);
        const columns = shuffledOrder(width, 'columns:' + seed);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const from = y * width + x;
                const to = rows[y] * width + columns[x];
                if (reverse) target[from] = source[to];
                else target[to] = source[from];
            }
        }
    } else {
        throw new Error('未知混淆方式');
    }
    return target.buffer;
}
