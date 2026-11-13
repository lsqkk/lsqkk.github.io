const prefix = '/assets/pages/a/oj/problems';
const historyKey = 'quark_oj_history_v2';
const legacyKey = 'quark_oj_submissions';

export const tracks = [
    ['basics', '程序设计基础', '顺序、分支与循环，适合第一次刷题。', p => p.id <= 1055],
    ['arrays', '数组与字符串', '练习遍历、计数、双指针和字符串处理。', p => /^(数组|字符串) - /.test(p.title)],
    ['structures', '函数与结构体', '拆分程序逻辑，练习组织和处理结构化数据。', p => /^(函数|结构体|函数与结构体) - /.test(p.title)],
    ['simulation', '模拟与高精度', '从规则模拟到大整数四则运算。', p => p.title.startsWith('模拟与高精度 - ')],
    ['sorting', '排序', '练习比较规则、常用排序与顺序统计。', p => p.title.startsWith('排序 - ')],
    ['search', '枚举与搜索', '通过枚举、回溯和状态搜索解决问题。', p => p.title.startsWith('暴力枚举 - ')],
];

export const verdicts = {
    AC: '通过', WA: '答案错误', TLE: '超时', CE: '编译错误', RTE: '运行错误',
    MLE: '内存超限', SYS_ERR: '评测异常', OK: '运行完成',
};
export const languages = {
    105: ['C++ · GCC 14', 'cpp', '#include <iostream>\nusing namespace std;\n\nint main() {\n    // 从标准输入读取数据\n    return 0;\n}\n'],
    103: ['C · GCC 14', 'c', '#include <stdio.h>\n\nint main(void) {\n    return 0;\n}\n'],
    109: ['Python 3.13', 'python', '# 从标准输入读取数据\n'],
    91: ['Java 17', 'java', 'public class Main {\n    public static void main(String[] args) {\n        // 从标准输入读取数据\n    }\n}\n'],
    102: ['JavaScript · Node.js 22', 'javascript', "const fs = require('node:fs');\nconst input = fs.readFileSync(0, 'utf8');\n"],
    108: ['Rust 1.85', 'rust', 'fn main() {\n    // 从标准输入读取数据\n}\n'],
    107: ['Go 1.23', 'go', 'package main\n\nfunc main() {\n    // 从标准输入读取数据\n}\n'],
    54: ['C++ · GCC 9（旧版）', 'cpp', '#include <iostream>\n\nint main() {\n    return 0;\n}\n'],
    71: ['Python 3.8（旧版）', 'python', '# 从标准输入读取数据\n'],
    62: ['Java 13（旧版）', 'java', 'public class Main {\n    public static void main(String[] args) {}\n}\n'],
};

export const $ = id => document.getElementById(id);
export const params = new URLSearchParams(location.search);
export const titleText = title => title.replaceAll('$', '').replaceAll('\\dots', '…');
export function node(tag, content, className) {
    const element = document.createElement(tag);
    if (content != null) element.textContent = content;
    if (className) element.className = className;
    return element;
}

export function link(label, href, className) {
    const element = node('a', label, className);
    element.href = href;
    return element;
}

export async function loadProblems() {
    const response = await fetch(`${prefix}/index.json`);
    if (!response.ok) throw new Error('题库加载失败，请刷新重试。');
    const index = await response.json();
    return [...new Map(index.map(problem => [problem.id, problem])).values()].sort((a, b) => a.id - b.id);
}

export async function loadProblem(id) {
    const response = await fetch(`${prefix}/${id}.json`);
    if (!response.ok) throw new Error('题面加载失败，请刷新重试。');
    return response.json();
}

export function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
}

export function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
}

export function historyEntries() {
    const old = Object.entries(read(legacyKey, {})).map(([id, entry]) => ({
        ...entry, id: `old-${id}`, problemId: Number(id),
    }));
    const stored = read(historyKey, []);
    return [...(Array.isArray(stored) ? stored : []), ...old].sort((a, b) => b.timestamp - a.timestamp);
}

export function saveResult(entry) {
    const entries = read(historyKey, []);
    return write(historyKey, [entry, ...entries]);
}

export function progress(entries = historyEntries()) {
    const states = new Map();
    for (const entry of entries) {
        if (entry.status === 'AC' || !states.has(entry.problemId)) states.set(entry.problemId, entry.status);
    }
    return states;
}

export function favorites() { return new Set(read('quark_oj_favorites', [])); }
export function toggleFavorite(id) {
    const ids = favorites();
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    return write('quark_oj_favorites', [...ids]);
}

export const draftKey = (id, languageId) => `quark_oj_draft_${id}_${languageId}`;
export const problemUrl = (id, options = {}) => window.buildOjUrl('train', { p: id, ...options });

export function badge(status) {
    const text = status ? verdicts[status] || status : '未尝试';
    return node('span', text, `oj-badge ${status === 'AC' || status === 'OK' ? 'is-good' : status ? 'is-warn' : ''}`);
}

export function randomProblem(problems) {
    if (problems.length) location.assign(problemUrl(problems[Math.floor(Math.random() * problems.length)].id));
}

export function favoriteButton(problem, onToggle) {
    const button = node('button', '', 'oj-icon-button');
    button.type = 'button';
    function refresh() {
        const selected = favorites().has(problem.id);
        const title = `${selected ? '取消收藏' : '收藏'} ${titleText(problem.title)}`;
        button.textContent = selected ? '★' : '☆';
        button.setAttribute('aria-pressed', String(selected));
        button.setAttribute('aria-label', title);
        button.title = title;
    }
    button.addEventListener('click', () => {
        if (toggleFavorite(problem.id)) {
            refresh();
            onToggle?.();
        } else {
            $('oj-feedback').textContent = '浏览器存储不可用，收藏未保存。';
        }
    });
    refresh();
    return button;
}

export function dateLabel(timestamp) {
    return timestamp ? new Date(timestamp).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }) : '—';
}
