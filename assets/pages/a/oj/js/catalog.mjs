import { $, tracks, loadProblems, progress, favorites, titleText, node, link, badge, problemUrl, randomProblem, favoriteButton } from './workspace.mjs';

const filters = { search: $('oj-search'), topic: $('oj-topic'), difficulty: $('oj-difficulty'), state: $('oj-state'), size: $('oj-size') };
let page = 1;
let matching = [];
const fields = Object.entries(filters);

function readUrl() {
    const query = new URLSearchParams(location.search);
    for (const [key, input] of fields) {
        const value = query.get(key);
        input.value = input.tagName === 'INPUT' ? value ?? '' :
            [...input.options].some(option => option.value === value) ? value : input.options[0].value;
    }
    page = Math.max(1, Number.parseInt(query.get('page'), 10) || 1);
}

function saveUrl() {
    const query = new URLSearchParams();
    for (const [key, input] of fields) {
        if (input.value && (key !== 'size' || input.value !== '20')) query.set(key, input.value);
    }
    if (page > 1) query.set('page', page);
    history.replaceState(null, '', query.size ? `?${query}` : location.pathname);
}

async function start() {
    const problems = await loadProblems();
    for (const [key, label] of tracks) filters.topic.add(new Option(label, key));
    for (const difficulty of ['入门', '简单', '中等', '困难', '极难', '未知']) {
        filters.difficulty.add(new Option(difficulty === '未知' ? '未评级' : difficulty, difficulty));
    }
    readUrl();

    function render() {
        const states = progress();
        const saved = favorites();
        const search = filters.search.value.trim().toLowerCase().replace(/^p(?=\d)/, '');
        const topic = tracks.find(([key]) => key === filters.topic.value);
        const state = filters.state.value;
        matching = problems.filter(problem => {
            const status = states.get(problem.id);
            return (!search || String(problem.id).includes(search) || titleText(problem.title).toLowerCase().includes(search)) &&
                (!topic || topic[3](problem)) &&
                (!filters.difficulty.value || problem.difficulty === filters.difficulty.value) &&
                (state !== 'saved' || saved.has(problem.id)) &&
                (state !== 'solved' || status === 'AC') &&
                (state !== 'unsolved' || status !== 'AC') &&
                (state !== 'untouched' || !status);
        });
        const size = Number(filters.size.value);
        const pages = Math.max(1, Math.ceil(matching.length / size));
        page = Math.min(page, pages);
        $('oj-page').textContent = `${page} / ${pages}`;
        $('oj-prev').disabled = page === 1;
        $('oj-next').disabled = page >= pages;
        $('oj-random').disabled = !matching.length;
        $('oj-feedback').textContent = `找到 ${matching.length} 道题`;
        const rows = matching.slice((page - 1) * size, page * size).map(problem => {
            const row = node('tr');
            const title = link(null, problemUrl(problem.id, { topic: topic?.[0] }), 'oj-problem-link');
            title.append(node('small', `P${problem.id}`), node('strong', titleText(problem.title)));
            const difficulty = problem.difficulty === '未知' ? '未评级' : problem.difficulty;
            const level = node('span', difficulty, 'oj-badge oj-level');
            level.dataset.level = difficulty;
            for (const item of [title, level, badge(states.get(problem.id)), favoriteButton(problem, state === 'saved' ? render : undefined)]) {
                row.appendChild(node('td')).append(item);
            }
            return row;
        });
        if (!rows.length) {
            const empty = node('td', '没有匹配的题目。', 'oj-empty');
            empty.colSpan = 4;
            rows.push(node('tr'));
            rows[0].append(empty);
        }
        $('oj-problems').replaceChildren(...rows);
        saveUrl();
    }

    for (const [, input] of fields) {
        input.addEventListener(input.type === 'search' ? 'input' : 'change', () => { page = 1; render(); });
    }
    $('oj-clear').onclick = () => {
        for (const [, input] of fields) input.value = input.tagName === 'SELECT' ? input.options[0].value : '';
        page = 1;
        render();
        filters.search.focus();
    };
    $('oj-prev').onclick = () => { page--; render(); };
    $('oj-next').onclick = () => { page++; render(); };
    $('oj-random').onclick = () => randomProblem(matching);
    window.addEventListener('popstate', () => { readUrl(); render(); });
    render();
}

start().catch(() => { $('oj-feedback').textContent = '题库加载失败，请刷新重试。'; });
