import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const destination = new URL('../assets/pages/a/oj/problems/', import.meta.url);
const spring2025 = 'https://sp25.datastructur.es/';
const source = (label, path, base = spring2025) => ({ label, url: new URL(path, base).href });
const roadmap = [];
const index = [];
const files = new Map();
const difficulties = ['入门', '简单', '中等', '困难'];
let stage;

function chapter(id, title, description, sources) {
    stage = { id, title, description, sources, problemIds: [] };
    roadmap.push(stage);
}

function problem(id, title, difficulty, tags, description, input_format, output_format, cases, options = {}) {
    assert(!index.some(item => item.id === id), `重复题号 P${id}`);
    assert(difficulties.includes(difficulty), `无效难度 P${id}`);
    assert(cases.length >= 5, `用例不足 P${id}`);
    assert.equal(new Set(cases.map(([input]) => input)).size, cases.length, `重复用例 P${id}`);
    const [[sampleInput, sampleOutput], ...tests] = cases;
    const meta = {
        id, title, difficulty, track: 'cs61b', stage: stage.id, tags, recommendedLanguage: 91,
        time_limit: options.time ?? '1000ms', memory_limit: '256MB',
    };
    const assignment = stage.sources[options.assignment ?? 0];
    const origin = options.variant ? '延伸变体' : '课程练习改编';
    index.push({ ...meta, origin });
    stage.problemIds.push(id);
    files.set(`${id}.json`, {
        ...meta, origin,
        description: `${description}\n\n${origin} · [Berkeley CS 61B ${assignment.label}](${assignment.url})`,
        input_format, output_format, sample_input: `${sampleInput}\n`, sample_output: `${sampleOutput}\n`,
        hidden_tests: tests.map(([input, output]) => ({ input: `${input}\n`, expected_output: String(output) })),
    });
}

chapter('java', 'Java 与集合热身', '先练方法、遍历与边界，再用列表和映射表达数据。', [
    source('Spring 2025 · Homework 0A: Java Syntax', 'homeworks/hw0/hw0a/'),
    source('Spring 2025 · Homework 0B: Data Structures', 'homeworks/hw0/hw0b/'),
]);

problem(6101, '三角形星号', '入门', ['Java', '循环'],
    '从一颗星开始，逐行增加一颗星，画出 n 行右对齐的三角形。',
    '一个整数 n（1 ≤ n ≤ 30）。', '输出 n 行，第 i 行先输出 n−i 个空格，再输出 i 个 `*` 字符（i 从 1 开始）。',
    [5, 1, 2, 7, 30].map(n => [n, Array.from({ length: n }, (_, i) => ' '.repeat(n - i - 1) + '*'.repeat(i + 1)).join('\n')]));

problem(6102, '数组的最大最小差', '入门', ['数组', '遍历'],
    '给定一个非空整数数组，求最大元素与最小元素的差。',
    '第一行 n（1 ≤ n ≤ 100000）。第二行 n 个整数，每个值的绝对值不超过 2000000000。',
    '输出一个整数表示极差。结果可能超出 32 位有符号整数范围。',
    [['5\n9 -4 8 -4 0', 13], ['1\n-9', 0], ['3\n7 7 7', 0], ['4\n-2 -7 -8 -3', 6],
        ['2\n-2000000000 2000000000', 4000000000]], { assignment: 1 });

function hailstone(start) {
    const sequence = [start];
    while (start !== 1) {
        start = start % 2 === 0 ? start / 2 : 3 * start + 1;
        sequence.push(start);
    }
    return sequence;
}

problem(6103, '冰雹序列', '入门', ['递归', '整数'],
    '从正整数 n 出发，若当前值为偶数就除以 2，否则乘 3 再加 1。第一次到达 1 时停止。可尝试把每一步写成递归调用。',
    '一个整数 n（1 ≤ n ≤ 10000）。', '一行输出从 n 到 1 的全部值，相邻数字用一个空格分隔。',
    [6, 1, 2, 7, 27, 9999].map(n => [n, hailstone(n).join(' ')]), { assignment: 1 });

problem(6104, '单词频数排名', '简单', ['哈希映射', '排序'],
    '统计语料中不同单词的出现次数。取频数最高的 k 个单词，频数相同按字典序升序。',
    '第一行 n k（0 ≤ n ≤ 100000，1 ≤ k ≤ 100）。接下来 n 个小写英文字母单词，单词长度 1 至 20。',
    '每行输出一个单词及其频数。不同单词不足 k 个时全部输出，语料为空时输出 `EMPTY`。',
    [['6 2\nink oak ink ash oak oak', 'oak 3\nink 2'], ['0 5', 'EMPTY'], ['1 4\nx', 'x 1'],
        ['5 2\nb a b a c', 'a 2\nb 2'], ['3 2\nab aa a', 'a 1\naa 1']], { assignment: 1, variant: true });

chapter('board', '2048 棋盘模拟', '拆解一次移动，再练习合并判定和连续状态更新。', [
    source('Spring 2025 · Project 0: 2048', 'projects/proj0/'),
]);

function squash(row) {
    const positive = row.filter(Boolean);
    const next = [];
    let score = 0;
    for (let i = 0; i < positive.length; i++) {
        if (positive[i] === positive[i + 1]) {
            const merged = positive[i] * 2;
            next.push(merged);
            score += merged;
            i++;
        } else {
            next.push(positive[i]);
        }
    }
    while (next.length < row.length) next.push(0);
    return { next, score };
}

problem(6105, '2048 单行左移', '简单', ['模拟', '数组'],
    '将一行的非零方块向左挤紧，再从左向右合并相邻且相等的一对方块。新生成的方块当次移动不能再次合并。空位补到右侧，不产生随机方块。',
    '第一行 n（1 ≤ n ≤ 1000）。第二行 n 个数，每个是 0 或不超过 2048 的 2 的正整数次幂。',
    '一行输出移动后的 n 个值，用空格分隔。',
    [[0, 2, 2, 2, 4], [0], [2, 2, 2, 2], [2, 2, 4, 4, 8, 0], [0, 0, 0], [2048, 2048]]
        .map(row => [`${row.length}\n${row.join(' ')}`, squash(row).next.join(' ')]));

problem(6106, '2048 还可以走吗', '简单', ['棋盘', '枚举'],
    '给定棋盘。合法移动必须使某个方块位置发生变化，或合并一对方块。每次可选择上下左右之一。判断是否存在合法移动。空棋盘上无法移动。',
    '第一行 n（1 ≤ n ≤ 50）。之后 n 行，每行 n 个整数，每个是 0 或不超过 2048 的 2 的正整数次幂。',
    '输出 `YES` 或 `NO`。',
    [['2\n2 4\n8 4', 'YES'], ['1\n0', 'NO'], ['1\n2048', 'NO'], ['2\n2 4\n4 2', 'NO'],
        ['2\n0 0\n0 2', 'YES'], ['2\n0 0\n0 0', 'NO']]);

function play2048(board, commands) {
    const size = board.length;
    const coordinates = {
        L: (i, j) => [i, j], R: (i, j) => [i, size - 1 - j],
        U: (i, j) => [j, i], D: (i, j) => [size - 1 - j, i],
    };
    board = board.map(row => [...row]);
    let score = 0;
    for (const command of commands) {
        for (let i = 0; i < size; i++) {
            const cells = Array.from({ length: size }, (_, j) => coordinates[command](i, j));
            const merged = squash(cells.map(([r, c]) => board[r][c]));
            score += merged.score;
            cells.forEach(([r, c], j) => { board[r][c] = merged.next[j]; });
        }
    }
    return [...board.map(row => row.join(' ')), score].join('\n');
}

assert.equal(play2048([[2, 2], [2, 2]], 'LD'), '0 0\n8 0\n16');
problem(6107, '2048 连续移动计分', '中等', ['矩阵', '状态模拟'],
    '依次应用四方向移动。沿移动方向挤紧一条线，从靠近目标边的一端开始合并相邻同值方块，新方块在同一次移动中不再合并。每生成一个新方块，增加其数值对应的分数。初始得分为 0，过程中不生成随机方块。',
    '第一行 n（1 ≤ n ≤ 12）。接下来 n 行，每行 n 个整数，每个是 0 或不超过 2048 的 2 的正整数次幂。最后一行包含 1 至 1000 个字符 `L`、`R`、`U`、`D`，分别代表左、右、上、下。',
    '先输出移动后的棋盘，每行以空格分隔。最后一行输出总分。',
    [
        [[[2, 2], [2, 2]], 'LD'], [[[0]], 'LRUD'], [[[2, 0], [0, 2]], 'DRU'],
        [[[2, 2, 2], [4, 0, 4], [8, 8, 16]], 'RU'],
        [[[0, 4, 0], [0, 4, 0], [0, 4, 0]], 'DDU'],
        [[[2, 4, 2, 2], [0, 2, 4, 0], [4, 4, 4, 4], [0, 0, 0, 0]], 'LDRU'.repeat(250)],
    ].map(([board, commands]) => [`${board.length}\n${board.map(row => row.join(' ')).join('\n')}\n${commands}`,
        play2048(board, commands)]), { variant: true });

chapter('deque', '链表与双端队列', '先用命令验证双端队列语义，再练固定容量回绕与单调队列。', [
    source('Spring 2025 · Project 1A: LinkedListDeque61B', 'projects/proj1a/'),
    source('Spring 2025 · Project 1B: ArrayDeque61B', 'projects/proj1b/'),
]);

function dequeCase(capacity, commands) {
    const deque = [];
    const output = [];
    for (const command of commands) {
        const [op, value] = command.split(' ');
        if (op === 'push_front' || op === 'push_back') {
            if (deque.length === capacity) output.push('FULL');
            else if (op === 'push_front') deque.unshift(value);
            else deque.push(value);
        } else if (op === 'pop_front') output.push(deque.shift() ?? 'EMPTY');
        else if (op === 'pop_back') output.push(deque.pop() ?? 'EMPTY');
        else if (op === 'get') output.push(deque[Number(value)] ?? 'EMPTY');
        else output.push(deque.length);
    }
    const header = Number.isFinite(capacity) ? `${capacity} ${commands.length}` : commands.length;
    return [`${header}\n${commands.join('\n')}`, output.join('\n')];
}

const dequeCommands = '`push_front x`、`push_back x`、`pop_front`、`pop_back`、`size`。x 为绝对值不超过 1000000000 的整数。';
const dequeOutput = '每次弹出输出移除的值，空队列输出 `EMPTY`。每次 `size` 输出当前元素个数。';

problem(6108, '双端队列接口', '简单', ['双向链表', 'Deque'],
    '空双端队列可从两端插入、移除和查询位置。建议自己实现带哨兵结点的双向链表，并把位置 0 视作队首。',
    `第一行 q（1 ≤ q ≤ 100000）。接下来每行一个命令。${dequeCommands} 另有 \`get i\`（0 ≤ i ≤ 100000），查询位置 i，越界时为空。保证至少有一个产生输出的命令，\`get\` 最多出现 20 次。`,
    `${dequeOutput} 每次 \`get\` 输出元素或 \`EMPTY\`。每次输出独占一行。`,
    [
        ['push_back 7', 'push_front 3', 'get 1', 'pop_back', 'size', 'pop_front', 'pop_front'],
        ['get 0'], ['push_front 0', 'get 1', 'pop_back', 'size'],
        ['push_back -2', 'push_front -3', 'get 0', 'get 1', 'pop_front', 'pop_back'],
        ['push_back 1000000000', 'pop_back', 'push_front -1000000000', 'get 0', 'pop_back', 'pop_back'],
    ].map(commands => dequeCase(Infinity, commands)));

problem(6109, '固定容量的循环双端队列', '简单', ['循环数组', 'Deque'],
    '在容量 c 固定的队列中反复进行两端操作。队列已满时，插入命令只报告 `FULL`，队列保持原状。建议用数组保存数据，通过下标取模复用空间。',
    `第一行 c q（1 ≤ c ≤ 100000，1 ≤ q ≤ 100000）。接下来每行一个命令。${dequeCommands} 保证至少一次命令会产生输出。`,
    `${dequeOutput} 插入成功不输出，插入失败输出一行 \`FULL\`。`,
    [
        [2, ['push_back 1', 'push_back 2', 'pop_front', 'push_back 3', 'push_front 4', 'pop_front', 'pop_back']],
        [1, ['push_front 3', 'push_back 2', 'size', 'pop_back', 'pop_front']],
        [3, ['push_front 3', 'push_front 2', 'push_front 1', 'pop_back', 'push_front 0', 'pop_front', 'pop_back', 'size']],
        [4, ['pop_front', 'pop_back', 'size']],
        [2, ['push_back -1', 'push_back 0', 'pop_front', 'push_back -2', 'pop_front', 'push_back -3', 'pop_front', 'pop_front']],
    ].map(([capacity, commands]) => dequeCase(capacity, commands)), { assignment: 1, variant: true });

problem(6110, '窗口里最大的数', '中等', ['单调队列', '滑动窗口'],
    '一个窗口从左到右覆盖连续的 k 个元素，每次向右移动一格。对每个完整窗口求最大值。',
    '第一行 n k（1 ≤ k ≤ n ≤ 200000）。第二行 n 个整数，每个值的绝对值不超过 1000000000。',
    '一行输出 n−k+1 个窗口最大值，用空格分隔。',
    [
        [[2, 6, 6, -4, 8, 2], 3], [[-7], 1], [[-3, -1, -4], 1], [[3, 2, 1], 3],
        [[7, 7, 6, 5, 3, 3], 2],
        [Array.from({ length: 16000 }, (_, i) => -i), 15500],
    ].map(([values, k]) => {
        const maxima = [];
        for (let i = 0; i <= values.length - k; i++) maxima.push(Math.max(...values.slice(i, i + k)));
        return [`${values.length} ${k}\n${values.join(' ')}`, maxima.join(' ')];
    }), { assignment: 1, variant: true });

chapter('disjoint-sets', '并查集与渗流', '掌握连通性和加权合并，再区分从顶部可达与已经渗透。', [
    source('Spring 2025 · Homework 2: Percolation', 'homeworks/hw2/'),
    source('Spring 2024 · Lab 05: Disjoint Sets', 'labs/lab05/', 'https://sp24.datastructur.es/'),
]);

function connectivityCase(n, commands) {
    // Relabel components directly to compute expected answers without union-find.
    let labels = Array.from({ length: n }, (_, i) => i);
    const output = [];
    for (const command of commands) {
        const [op, u, v] = command.split(' ');
        if (op === 'join' && labels[u] !== labels[v]) {
            const before = labels[v];
            const after = labels[u];
            labels = labels.map(label => label === before ? after : label);
        }
        if (op === 'same') output.push(labels[u] === labels[v] ? 'YES' : 'NO');
        if (op === 'size') output.push(labels.filter(label => label === labels[u]).length);
    }
    return [`${n} ${commands.length}\n${commands.join('\n')}`, output.join('\n')];
}

problem(6111, '维护连通分组', '简单', ['并查集', '数据结构'],
    '开始时每个人各在自己的组里。合并两个人所在的整个组，并回答两个人是否同组或某个组的大小。可以边合并边维护根结点的分组规模。',
    '第一行 n q（1 ≤ n, q ≤ 100000）。接下来 q 行命令，人员编号 0 至 n−1。`join u v` 合并组，`same u v` 查询同组，`size u` 查询组大小。保证至少有一条查询。',
    '按顺序输出查询结果，每行一个。`same` 使用 `YES` 或 `NO`，`size` 使用整数。',
    [
        [5, ['same 0 1', 'join 0 1', 'join 2 1', 'same 0 2', 'size 1', 'size 4']],
        [1, ['join 0 0', 'same 0 0', 'size 0']], [3, ['size 0', 'size 1', 'size 2']],
        [4, ['join 0 1', 'join 2 3', 'same 0 2', 'join 1 3', 'size 0', 'join 2 1', 'size 2']],
        [100000, ['same 99999 0', 'join 99999 0', 'size 99999', 'same 0 99999']],
        [2000, [...Array.from({ length: 1999 }, (_, i) => `join ${i} ${i + 1}`), 'same 0 1999', 'size 1']],
    ].map(([n, commands]) => connectivityCase(n, commands)), { assignment: 1 });

function cellsFromTop(n, open) {
    const seen = new Set();
    const visit = [];
    function enqueue(row, col) {
        if (row < 0 || row >= n || col < 0 || col >= n) return;
        const key = row * n + col;
        if (!open.has(key) || seen.has(key)) return;
        seen.add(key);
        visit.push([row, col]);
    }
    for (let col = 0; col < n; col++) enqueue(0, col);
    for (const [row, col] of visit) {
        enqueue(row - 1, col);
        enqueue(row + 1, col);
        enqueue(row, col - 1);
        enqueue(row, col + 1);
    }
    return seen;
}

function firstPercolation(n, openings) {
    const open = new Set();
    const through = openings.findIndex(([row, col]) => {
        open.add(row * n + col);
        return [...cellsFromTop(n, open)].some(key => key >= n * (n - 1));
    });
    return [`${n} ${openings.length}\n${openings.map(pair => pair.join(' ')).join('\n')}`.trimEnd(), through < 0 ? -1 : through + 1];
}

problem(6112, '何时首次渗透', '中等', ['并查集', '网格连通'],
    '正方形网格初始全关闭。按顺序开放格子，开放格可通过上下左右的开放邻居连通。当顶部任一开放格可以走到底部任一开放格时，网格发生渗透。',
    '第一行 n m（1 ≤ n ≤ 500，0 ≤ m ≤ 250000）。接下来 m 行各为开放格子的行和列，均从 0 编号。格子可能重复开放。',
    '输出首次渗透发生在第几条开放命令（从 1 开始），始终未渗透则输出 `-1`。',
    [
        [3, [[0, 1], [1, 1], [2, 0], [1, 0]]], [1, []], [1, [[0, 0], [0, 0]]],
        [3, [[0, 0], [1, 1], [2, 2]]], [2, [[0, 0], [0, 0], [1, 0], [1, 1]]],
        [300, Array.from({ length: 300 }, (_, row) => [row, 299])],
    ].map(([n, openings]) => firstPercolation(n, openings)));

function percolationQueries(n, commands) {
    const open = new Set();
    const output = [];
    for (const command of commands) {
        const [operation, row, col] = command.split(' ');
        const key = Number(row) * n + Number(col);
        if (operation === 'open') open.add(key);
        if (operation === 'wet') output.push(cellsFromTop(n, open).has(key) ? 'YES' : 'NO');
        if (operation === 'flow') {
            const flows = [...cellsFromTop(n, open)].some(cell => cell >= n * (n - 1));
            output.push(flows ? 'YES' : 'NO');
        }
    }
    return [`${n} ${commands.length}\n${commands.join('\n')}`, output.join('\n')];
}

problem(6113, '渗透与反洗', '中等', ['并查集', '虚拟结点'],
    '水只从第一行的开放格流入，沿上下左右的开放格移动。要同时查询某个格子是否已被水到达，以及水是否能到最后一行。即使系统已经渗透，孤立的底部开放格仍然是干的。',
    '第一行 n q（1 ≤ n ≤ 500，1 ≤ q ≤ 250000）。接下来 q 行命令。`open r c` 开放格子，`wet r c` 查询该格，`flow` 查询是否渗透。坐标从 0 开始，允许重复开放。保证至少有一个查询。',
    '每次查询输出一行 `YES` 或 `NO`。',
    [
        [3, ['open 0 0', 'open 1 0', 'open 2 0', 'flow', 'open 2 2', 'wet 2 2', 'wet 2 0']],
        [1, ['flow', 'wet 0 0', 'open 0 0', 'flow', 'wet 0 0']],
        [2, ['open 0 0', 'open 1 1', 'wet 1 1', 'flow', 'open 0 1', 'wet 1 1', 'flow']],
        [4, ['open 1 1', 'wet 1 1', 'open 0 1', 'open 0 1', 'wet 1 1', 'flow']],
        [500, ['open 499 499', 'wet 499 499', 'open 0 499', 'wet 0 499', 'flow']],
    ].map(([n, commands]) => percolationQueries(n, commands)), { variant: true });

chapter('maps', '有序映射、平衡树与哈希', '用相同的键值语义比较树和哈希，再处理冲突、范围和回收策略。', [
    source('Spring 2025 · Lab 06: BSTMap', 'labs/lab06/'),
    source('Spring 2025 · Lab 07: Hashmaps', 'labs/lab07/'),
    source('Spring 2025 · Lab 08: LLRBs', 'labs/lab08/'),
]);

function bstDepths(keys) {
    const root = { key: keys[0] };
    const depths = [0];
    for (const key of keys.slice(1)) {
        let node = root;
        let depth = 1;
        for (;;) {
            const side = key < node.key ? 'left' : 'right';
            if (!node[side]) {
                node[side] = { key };
                depths.push(depth);
                break;
            }
            node = node[side];
            depth++;
        }
    }
    return [`${keys.length}\n${keys.join(' ')}`, depths.join(' ')];
}

problem(6114, 'BST 的插入深度', '简单', ['二叉搜索树', '树高'],
    '把互不相同的键依次插入一棵空二叉搜索树，不进行旋转。每个键插入到沿搜索路径遇到的第一个空位置。',
    '第一行 n（1 ≤ n ≤ 3000）。第二行 n 个互不相同且绝对值不超过 1000000000 的整数。',
    '一行输出每个键刚插入时的深度，根深度为 0。',
    [[5, 1, 9, 3, 2, 8], [0], [4, 3, 2, 1, -1], [1, 2, 3, 4, 5], [5, 3, 7, 2, 4, 6, 8],
        Array.from({ length: 3000 }, (_, i) => i)].map(bstDepths));

function mapCase(commands) {
    const store = new Map();
    const output = [];
    for (const command of commands) {
        const [op, keyToken, valueToken] = command.split(' ');
        const key = Number(keyToken);
        const value = Number(valueToken);
        if (op === 'put') store.set(key, value);
        if (op === 'get') output.push(store.get(key) ?? 'NONE');
        if (op === 'keys') {
            const keys = [...store.keys()].filter(k => k >= key && k <= value).sort((a, b) => a - b);
            output.push(keys.join(' ') || 'NONE');
        }
        if (op === 'drop') store.delete(key);
    }
    return [`${commands.length}\n${commands.join('\n')}`, output.join('\n')];
}

problem(6115, '有序映射的区间键', '中等', ['有序映射', 'BST'],
    '维护一个从整数键到整数值的映射。除了读写和删除，还能列出闭区间内现有的键。可先用有序集合写基准版本，再尝试用搜索树剪去整棵不相关的子树。',
    '第一行 q（1 ≤ q ≤ 100000）。接下来 q 行命令：`put x y` 写入或覆盖，`get x` 查值，`drop x` 删除（不存在时忽略），`keys l r` 查询 l ≤ x ≤ r。所有数的绝对值不超过 1000000000。保证至少一次查询，输出键的总数不超过 100000。',
    '每次查询占一行。`get` 输出对应值或 `NONE`。`keys` 输出按数值升序排列的键，用空格相隔，无匹配时输出 `NONE`。',
    [
        ['put 3 30', 'put -2 20', 'put 1 10', 'keys -2 2', 'put 1 99', 'get 1', 'drop -2', 'keys -2 -2'],
        ['get 1', 'keys 1 1', 'drop 8', 'get 8'], ['put 0 0', 'get 0', 'keys 0 0'],
        ['put 5 1', 'put 6 6', 'put 4 4', 'drop 5', 'keys 4 6', 'get 5'],
        ['put 10 -1', 'put 2 10', 'put -10 0', 'keys -1000000000 1000000000', 'keys 3 9'],
    ].map(mapCase), { variant: true });

function chainedHashCase(m, commandsToRun) {
    const slots = Array.from({ length: m }, () => new Map());
    const output = [];
    for (const command of commandsToRun) {
        const [op, keyToken, value] = command.split(' ');
        const key = Number(keyToken);
        if (op === 'load') {
            output.push(slots[key].size);
            continue;
        }
        const slot = slots[((key % m) + m) % m];
        if (op === 'put') slot.set(key, value);
        if (op === 'get') output.push(slot.get(key) ?? 'NONE');
        if (op === 'drop') slot.delete(key);
    }
    return [`${m} ${commandsToRun.length}\n${commandsToRun.join('\n')}`, output.join('\n')];
}

problem(6116, '桶内冲突与更新', '简单', ['哈希表', '链地址法'],
    '哈希表有 m 个固定的桶，键 x 对应的下标是除以 m 得到的非负余数。实现键值映射和每个桶的键数量查询。相同键更新时只替换值，不增加数量。',
    '第一行 m q（1 ≤ m, q ≤ 100000）。接下来 q 行命令：`put x y` 插入，`get x` 取值，`drop x` 删除且允许键不存在，`load j` 查询编号 j 的桶（0 ≤ j < m）。x、y 的绝对值不超过 1000000000。保证至少一条查询。',
    '每条 `get` 输出值或 `NONE`，每条 `load` 输出桶内键数。每次输出独占一行。',
    [
        [3, ['put -1 7', 'put 2 4', 'load 2', 'put -1 6', 'get -1', 'drop 2', 'load 2']],
        [1, ['load 0', 'put 0 0', 'put 1 1', 'put -1 -1', 'load 0', 'get -1']],
        [2, ['get 0', 'drop 0', 'load 0', 'put -2 6', 'get 0']],
        [7, ['put -1000000000 -1000000000', 'get -1000000000', 'load 0']],
        [100000, ['put -1 19', 'put 99999 20', 'load 99999', 'load 1']],
    ].map(([m, commandsToRun]) => chainedHashCase(m, commandsToRun)), { assignment: 1 });

function lruCase(capacity, commands) {
    const values = new Map();
    const output = [];
    for (const command of commands) {
        const [op, key, value] = command.split(' ');
        if (op === 'put') {
            values.delete(key);
            values.set(key, value);
            if (values.size > capacity) values.delete(values.keys().next().value);
        } else if (values.has(key)) {
            const stored = values.get(key);
            output.push(stored);
            values.delete(key);
            values.set(key, stored);
        } else {
            output.push('MISS');
        }
    }
    return [`${capacity} ${commands.length}\n${commands.join('\n')}`, output.join('\n')];
}

problem(6117, '最近最少使用缓存', '中等', ['哈希映射', '双向链表'],
    '缓存最多保存 c 个不同键。写入或者成功读取都会把该键标成最近使用。插入后超过容量时，移除上次使用时间最早的键。建议让每次命令只修改受影响的结点。',
    '第一行 c q（1 ≤ c, q ≤ 100000）。随后 q 行 `put x y` 或 `get x`。键值均为绝对值不超过 1000000000 的整数。至少有一次读取。',
    '每次读取输出一行该键的值，缓存中没有这个键时输出 `MISS`。',
    [
        [2, ['put 1 5', 'put 2 6', 'get 1', 'put 3 7', 'get 2', 'get 1', 'get 3']],
        [1, ['get 0', 'put 0 0', 'put 0 2', 'get 0', 'put -1 -4', 'get 0', 'get -1']],
        [3, ['put 1 3', 'put 2 6', 'put 3 9', 'put 1 30', 'put 4 12', 'get 2', 'get 1']],
        [3, ['get -1', 'get 1', 'get -1000000000']],
        [2, ['put 0 1', 'put 2 3', 'get 0', 'get 99', 'put 4 5', 'get 2', 'get 0']],
    ].map(([capacity, commands]) => lruCase(capacity, commands)), { assignment: 1, variant: true });

function checkLLRB(nodes) {
    function blackHeight(id, lo, hi, parentRed) {
        if (id === 0) return 1;
        const [key, left, right, color] = nodes[id - 1];
        const red = color === 'R';
        if (key <= lo || key >= hi || (red && parentRed) || (right && nodes[right - 1][3] === 'R')) return -1;
        const leftHeight = blackHeight(left, lo, key, red);
        const rightHeight = blackHeight(right, key, hi, red);
        if (leftHeight !== rightHeight || leftHeight < 0) return -1;
        return leftHeight + Number(!red);
    }
    const valid = !nodes.length || nodes[0][3] === 'B' && blackHeight(1, -Infinity, Infinity, false) >= 0;
    return [[nodes.length, ...nodes.map(row => row.join(' '))].join('\n'), valid ? 'YES' : 'NO'];
}

problem(6118, '检查左倾红黑树', '中等', ['红黑树', '树遍历'],
    '检验一棵带颜色的二叉树是否满足左倾红黑树规则。键必须满足严格的二叉搜索树顺序，根与空结点为黑色，每条红链接必须向左，红结点没有红色子结点。从任一结点到其所有后代空结点的路径包含相同数量的黑结点。红链接指向红色子结点。',
    '第一行 n（0 ≤ n ≤ 100000）。第 i 个结点占一行，依次给出键、左孩子编号、右孩子编号、颜色 `R` 或 `B`。键的绝对值不超过 1000000000。编号 0 代表空结点，n > 0 时根编号为 1。保证给出的结构是一棵二叉树。',
    '输出 `YES` 或 `NO`。空树满足规则。',
    [
        [[3, 2, 0, 'B'], [1, 0, 0, 'R']], [], [[0, 0, 0, 'R']],
        [[3, 0, 2, 'B'], [5, 0, 0, 'R']], [[3, 2, 0, 'B'], [2, 3, 0, 'R'], [1, 0, 0, 'R']],
        [[3, 2, 3, 'B'], [1, 0, 0, 'B'], [5, 0, 0, 'B']],
        [[3, 2, 0, 'B'], [1, 0, 0, 'B']], [[3, 2, 0, 'B'], [3, 0, 0, 'R']],
    ].map(checkLLRB), { assignment: 2, variant: true });

chapter('ngordnet', 'Ngordnet：词频与语义图', '先练区间统计，再从语义图中提取可达词、交集和排名。', [
    source('Spring 2025 · Project 2A: Ngordnet (NGrams)', 'projects/proj2a/'),
    source('Spring 2025 · Project 2B: Ngordnet (WordNet)', 'projects/proj2b/'),
]);

function wordHistoryCase(records, queries, globalCounts) {
    const output = [];
    for (const [word, start, end] of queries) {
        const observed = records.filter(([token, year]) => token === word && year >= start && year <= end);
        if (globalCounts) {
            const totals = new Map(globalCounts);
            const ratios = observed.sort((a, b) => a[1] - b[1])
                .map(([, year, count]) => `${year}:${Math.floor(10000 * count / totals.get(year))}`);
            output.push(ratios.join(' ') || 'NONE');
        } else {
            output.push(observed.reduce((total, entry) => total + entry[2], 0));
        }
    }
    const lines = [`${records.length} ${queries.length}`];
    if (globalCounts) lines.push(String(globalCounts.length), ...globalCounts.map(row => row.join(' ')));
    lines.push(...records.map(row => row.join(' ')), ...queries.map(row => row.join(' ')));
    return [lines.join('\n'), output.join('\n')];
}

problem(6119, '指定年代的词频总量', '中等', ['前缀和', '二分查找', '时间序列'],
    '语料统计给出若干单词、年份和次数的记录，可能乱序或重复。对每个查询，求指定单词在闭区间内的总出现次数。',
    '第一行 m q（0 ≤ m ≤ 100000，1 ≤ q ≤ 100000）。接下来 m 行为 `单词 年份 次数`。随后 q 行为 `单词 起始年 结束年`，起始年不超过结束年。年份 1 至 9999，次数 1 至 1000000000。单词长度 1 至 20，仅含小写英文字母。',
    '每个查询输出一行总次数；没有匹配时输出 0。结果可能超出 32 位有符号整数范围。',
    [
        [[['ink', 2002, 5], ['oak', 2001, 7], ['ink', 2000, 3], ['ink', 2002, 2]], [['ink', 2000, 2002], ['ink', 2001, 2001], ['oak', 2001, 2001]]],
        [[], [['ash', 1, 9999]]], [[['a', 2, 10]], [['a', 2, 2], ['b', 2, 2]]],
        [[['x', 1, 1000000000], ['x', 1, 1000000000], ['x', 9999, 1000000000]], [['x', 1, 9999], ['x', 2, 9998]]],
        [[['a', 3, 3], ['a', 2, 2], ['a', 1, 1], ['b', 2, 100]], [['a', 2, 2], ['a', 3, 4], ['a', 1, 2]]],
    ].map(([records, queries]) => wordHistoryCase(records, queries)));

problem(6120, '归一化年度词频', '中等', ['时间序列', '整数运算'],
    '比较不同年份的出现比例时，应考虑各年语料量不相同。某年相对词频用以万为单位的整数表示，即单词出现次数乘以 10000，再除以该年总词数并向下取整。',
    '第一行 m q（0 ≤ m ≤ 100000，1 ≤ q ≤ 100000）。第二行 t（1 ≤ t ≤ 9999），接下来 t 行为 `年份 总词数`，年份各异。随后 m 行为 `单词 年份 次数`，每种单词与年份的组合至多一次，年份都有总词数，0 < 次数 ≤ 总词数 ≤ 1000000000。最后 q 行为 `单词 起始年 结束年`，起始年不超过结束年。年份 1 至 9999，单词由 1 至 20 个小写英文字母组成。匹配记录总数不超过 100000。',
    '每个查询输出一行，按年份升序列出匹配的 `年份:相对词频`，用空格分隔。无匹配输出 `NONE`，保留结果为 0 的记录。',
    [
        [[['a', 2001, 1], ['a', 2000, 1], ['b', 2001, 2]], [['a', 2000, 2001], ['b', 2000, 2000]], [[2000, 3], [2001, 4]]],
        [[], [['a', 1, 1]], [[1, 1]]], [[['a', 1, 1]], [['a', 1, 2]], [[1, 1000000000]]],
        [[['a', 2010, 999999999]], [['a', 2010, 2010], ['a', 2011, 2011]], [[2010, 1000000000]]],
        [[['a', 9999, 100], ['a', 1, 1]], [['a', 1, 9999], ['a', 1, 1]], [[9999, 100], [1, 1]]],
    ].map(([records, queries, totals]) => wordHistoryCase(records, queries, totals)), { variant: true });

function descendants(edges, seed) {
    const seen = new Set([seed]);
    for (const u of seen) for (const [from, to] of edges) if (from === u) seen.add(to);
    return seen;
}

function semanticsCase(names, edges, queries) {
    const input = [`${names.length} ${edges.length} ${queries.length}`, ...names.map(row => row.join(' ')),
        ...edges.map(row => row.join(' ')), ...queries.map(row => row.join(' '))];
    const output = queries.map(roots => {
        const sets = roots.map(word => {
            const results = new Set();
            names.forEach((group, groupId) => {
                if (group.includes(word)) {
                    for (const reachable of descendants(edges, groupId)) {
                        for (const name of names[reachable]) results.add(name);
                    }
                }
            });
            return results;
        });
        const answer = [...sets[0]].filter(word => sets.every(set => set.has(word))).sort();
        return answer.join(' ') || 'NONE';
    });
    return [input.join('\n'), output.join('\n')];
}

const semanticInput = '第一行 n m q（1 ≤ n ≤ 1000，0 ≤ m ≤ 5000，1 ≤ q ≤ 300）。接下来 n 行各为一个词义组的全部单词（1 至 5 个），按 0 至 n−1 的编号顺序给出。随后 m 行各给出一条有向边的两个词义组编号。允许重边和自环。每个单词仅含 1 至 12 个小写英文字母。';

problem(6121, '语义图中的下位词', '中等', ['有向图', '多源遍历'],
    '每个词义组是一批同义词，同一个单词可以属于多个组。边由上位词义指向下位词义。查询单词的每个起始组以及从它们沿边可到达的所有组，收集其中的单词并去重。起始组自身也算可达。',
    `${semanticInput} 最后 q 行，每行给出一个查询单词。`,
    '每个查询占一行，按字典序输出所有匹配单词，用空格分隔。没有匹配时输出 `NONE`。',
    [
        [[['plant', 'flora'], ['oak'], ['plant', 'factory'], ['mill']], [[0, 1], [2, 3]], [['plant'], ['flora'], ['unknown']]],
        [[['a']], [], [['a'], ['b']]], [[['a'], ['b'], ['c']], [[0, 1], [1, 2], [2, 0], [0, 1]], [['b']]],
        [[['a', 'b'], ['b', 'c'], ['d']], [[0, 1], [1, 2], [0, 2]], [['a'], ['c']]],
        [[['a'], ['b'], ['c']], [[0, 0], [1, 0]], [['a'], ['c']]],
    ].map(([names, edges, queries]) => semanticsCase(names, edges, queries)), { assignment: 1 });

problem(6122, '多个词的共同下位词', '中等', ['图遍历', '集合交集'],
    '先分别计算每个查询词对应的下位词集合，包含其起始词义组中的单词。返回出现在每个集合里的单词。同一个词可能通过不同的词义组进入不同的集合，因此应按单词取交集。',
    `${semanticInput} 最后 q 行，每行 1 至 8 个查询词，空格分隔。`,
    '每个查询占一行，按字典序输出所有共同单词，用空格分隔。交集为空输出 `NONE`。',
    [
        [[['plant'], ['tree'], ['oak'], ['tree', 'wood']], [[0, 1], [1, 2], [3, 2]], [['plant', 'wood'], ['plant', 'tree'], ['oak', 'missing']]],
        [[['a', 'x'], ['b', 'x']], [], [['a', 'b'], ['x', 'x'], ['b', 'y']]],
        [[['a'], ['b'], ['c'], ['d']], [[0, 1], [1, 2], [2, 1], [3, 2]], [['a', 'b', 'd'], ['a'], ['z']]],
        [[['dog'], ['cat']], [], [['dog', 'cat']]],
        [[['remote', 'far']], [[0, 0]], [['remote', 'far', 'remote']]],
    ].map(([names, edges, queries]) => semanticsCase(names, edges, queries)), { assignment: 1, variant: true });

chapter('graphs', '世界地图与图算法', '把地图变成隐式图，练习可达性、最短路与连接成本。', [
    source('Spring 2025 · Project 3: Build Your Own World', 'projects/proj3/'),
    source('Spring 2025 · Project 3A: World Generation', 'projects/proj3/proj3a/'),
    source('Spring 2025 · Discussion 09: Shortest Paths, MSTs', 'assets/discussions/examlevel09.pdf'),
]);

function gridDistance(board, wrap) {
    const height = board.length;
    const width = board[0].length;
    const startRow = board.findIndex(row => row.includes('S'));
    const startCol = board[startRow].indexOf('S');
    const queue = [[startRow, startCol, 0]];
    const visited = new Set([startRow * width + startCol]);
    for (const [row, col, distance] of queue) {
        if (board[row][col] === 'E') return distance;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let r = row + dr;
            let c = col + dc;
            if (wrap) { r = (r + height) % height; c = (c + width) % width; }
            const key = r * width + c;
            if (board[r]?.[c] && board[r][c] !== '#' && !visited.has(key)) {
                visited.add(key);
                queue.push([r, c, distance + 1]);
            }
        }
    }
    return -1;
}

const gridInput = '第一行 h w（1 ≤ h, w ≤ 500，h × w ≥ 2）。接下来 h 行每行 w 个字符，仅含 `#`、`.`、`S`、`E`。`#` 是墙，`.` 可走，`S` 与 `E` 各出现一次。';
const gridCases = (boards, wrap) => boards.map(board => [`${board.length} ${board[0].length}\n${board.join('\n')}`, gridDistance(board, wrap)]);

problem(6123, '走廊中的最短路线', '简单', ['BFS', '网格'],
    '地图中的每次移动只能去相邻的上、下、左或右的格子。给定起点与出口，求需要的最少步数。', gridInput,
    '输出最少步数，出口不可达时输出 `-1`。',
    gridCases([['S.#.', '#...', '..#E'], ['SE'], ['S#E'], ['S', '.', '#', 'E'], ['S...', '.##.', '...E'], ['S#E', '###', '...']], false),
    { assignment: 1 });

problem(6124, '环形世界的最短路线', '简单', ['BFS', '坐标取模'],
    '地图的左右边缘相接，上下边缘也相接。一步离开边缘时会进入相对的边缘格，进入墙格始终禁止。求从起点到出口的最少步数。', gridInput,
    '输出最少步数，出口不可达时输出 `-1`。',
    gridCases([['S##E', '####'], ['SE'], ['S', '#', 'E'], ['###', '#S#', '###', '#E#', '###'],
        ['S..', '###', '.E.'], ['#.S', 'E##', '...']], true), { variant: true });

function weightedGraphCase(n, edges, expected, header = `${n} ${edges.length}`) {
    return [[header, ...edges.map(edge => edge.join(' '))].join('\n'), expected];
}

problem(6125, '有向路网的到达成本', '中等', ['Dijkstra', '优先队列'],
    '求从指定起点到有向图中每个结点的最小费用。边允许零费用，也可以有两条成本不同的边连向同一终点。',
    '第一行 n m s（1 ≤ n ≤ 50000，0 ≤ m ≤ 100000，0 ≤ s < n）。随后 m 行 `u v w` 表示从 u 到 v 费用为 w 的有向边。编号从 0 到 n−1，0 ≤ w ≤ 1000000000。',
    '按结点编号顺序在同一行输出最小总费用，用空格分隔。起点费用为 0，不可达结点为 `-1`。费用结果可能超出 32 位有符号整数范围。',
    [
        [5, 0, [[0, 1, 6], [0, 2, 1], [2, 1, 2], [1, 3, 0], [2, 3, 9]], '0 3 1 3 -1'],
        [1, 0, [], '0'], [3, 2, [[0, 1, 0], [0, 2, 1]], '-1 -1 0'],
        [4, 0, [[0, 1, 1000000000], [1, 2, 1000000000], [2, 3, 1000000000]], '0 1000000000 2000000000 3000000000'],
        [3, 1, [[1, 0, 5], [1, 0, 1], [0, 2, 0], [2, 2, 0], [2, 1, 0]], '1 0 1'],
    ].map(([n, s, edges, expected]) => weightedGraphCase(n, edges, expected, `${n} ${edges.length} ${s}`)),
    { assignment: 2, variant: true });

problem(6126, '最少铺设多少通道', '中等', ['最小生成树', '并查集'],
    '建造若干条无向通道，使所有房间相互连通。通道有各自的建造价格。只从给定的候选通道中选择，求连通所有房间所需的最小总价。',
    '第一行 n m（1 ≤ n ≤ 50000，0 ≤ m ≤ 100000）。随后 m 行给出两个房间编号及费用，编号从 0 到 n−1，费用为 0 至 1000000000。可以有自环和重边。',
    '输出最小总价，无法建成时输出 `-1`。总价可能超出 32 位有符号整数范围。',
    [
        [4, [[0, 1, 9], [0, 2, 3], [1, 2, 4], [1, 3, 6], [2, 3, 2]], 9],
        [1, [], 0], [3, [[0, 1, 4], [2, 2, 0]], -1],
        [3, [[0, 1, 3], [0, 1, 0], [1, 2, 1], [0, 2, 1]], 1],
        [4, [[0, 1, 1000000000], [1, 2, 1000000000], [2, 3, 1000000000], [0, 0, 0]], 3000000000],
    ].map(([n, edges, expected]) => weightedGraphCase(n, edges, expected)), { assignment: 2, variant: true });

chapter('sorting', '比较排序与优先队列', '观察稳定排序保留的顺序，并用堆处理多路合并。', [
    source('Spring 2025 · Lab 11: Comparison-Based Sorts', 'labs/lab11/'),
    source('Spring 2025 · Course Schedule', ''),
]);

problem(6127, '稳定整理报名表', '简单', ['稳定排序', '比较器'],
    '报名表中的每行有队伍代号和积分。按积分升序重排。积分相同时维持在原表中的先后顺序。',
    '第一行 n（1 ≤ n ≤ 100000）。随后 n 行，每行 `代号 积分`，代号互不相同，长度 1 至 20，仅含小写英文字母。积分绝对值不超过 1000000000。',
    '按排序结果逐行输出代号。',
    [
        [['f', 2], ['k', 1], ['a', 2], ['b', 1]], [['a', 0]], [['c', 0], ['a', 0], ['b', 0]],
        [['hello', -1000000000], ['world', 1000000000], ['javascript', -1000000000]],
        [['z', 5], ['y', 4], ['x', 3], ['w', 2], ['v', 1]],
    ].map(rows => [`${rows.length}\n${rows.map(row => row.join(' ')).join('\n')}`,
        [...rows].sort((a, b) => a[1] - b[1]).map(([name]) => name).join('\n')]), { variant: true });

problem(6128, '严格逆序对', '中等', ['归并排序', '分治'],
    '给定一个数组，统计有多少对下标满足 i < j 且第 i 个值严格大于第 j 个值。试着在归并两个有序子数组时一次统计一批逆序对。',
    '第一行 n（1 ≤ n ≤ 100000）。第二行 n 个整数，每个值的绝对值不超过 1000000000。',
    '输出逆序对数量。结果可能超出 32 位有符号整数范围。',
    [
        [[3, 1, 1, 2], 3], [[0], 0], [[1, 1, 1, 1], 0], [[-1, -2, -3, -4, -5], 10],
        [[0, -3, -1, 2, -2], 5], [[-2, 0, 1, 4, 7], 0],
        [Array.from({ length: 93000 }, (_, i) => i < 46500 ? 1 : 0), 46500 ** 2],
    ].map(([values, expected]) => [`${values.length}\n${values.join(' ')}`, expected]), { variant: true });

problem(6129, '合并多份有序日志', '中等', ['多路归并', '优先队列'],
    '每份日志包含一串已经按升序排列的时间戳。把它们合成一串升序时间戳，保留重复项。',
    '第一行 k（1 ≤ k ≤ 10000）。接下来 k 行，每行先给出该日志长度 n，然后给出 n 个按非递减顺序排列的整数。时间戳的绝对值不超过 1000000000。总长度在 1 到 100000 之间，允许某份日志为空。',
    '在一行输出合并后的时间戳，用空格分隔。',
    [
        [[-3, 0, 4], [0, 2, 9], [-1, 2]], [[0]], [[], [1, 1, 1], []],
        [[-2, -2], [], [-3, 0], [-4, 6]], [[-1000000000, 1000000000], [-1000000000], [], [1000000000]],
    ].map(logs => [[logs.length, ...logs.map(log => [log.length, ...log].join(' '))].join('\n'),
        logs.flat().sort((a, b) => a - b).join(' ')]), { assignment: 1, variant: true });

files.set('cs61b-index.json', index);
files.set('cs61b-roadmap.json', roadmap);
const verify = process.argv.includes('--check');
for (const [name, value] of files) {
    const target = new URL(name, destination);
    const contents = `${JSON.stringify(value, null, 2)}\n`;
    if (verify) assert.equal(await readFile(target, 'utf8'), contents, `题库内容与生成器不一致：${name}`);
    else await writeFile(target, contents);
}
console.log(`${verify ? 'Verified' : 'Generated'} ${index.length} CS61B problems in ${roadmap.length} modules.`);
