import { $, loadCs61bRoadmap, loadProblems, progress, node, link, badge, problemUrl, titleText } from './workspace.mjs';
import { account } from './active-account.mjs';

async function start() {
    const [roadmap, catalog] = await Promise.all([loadCs61bRoadmap(), loadProblems()]);
    const problems = new Map(catalog.filter(problem => problem.track === 'cs61b').map(problem => [problem.id, problem]));
    function render() {
        const states = progress(account.entries());
        const done = [...problems.keys()].filter(id => states.get(id) === 'AC').length;
        $('oj-cs-status').textContent = `${roadmap.length} 个阶段 · ${done} / ${problems.size} 道站内练习已通过`;
        const next = roadmap.flatMap(stage => stage.problemIds).find(id => states.get(id) !== 'AC' && problems.has(id));
        $('oj-cs-next').href = next ? problemUrl(next, { topic: 'cs61b' }) : '/a/oj/problem-list?topic=cs61b';
        $('oj-cs-next').textContent = next ? `继续练习 · P${next}` : '复习题单';
        $('oj-roadmap').replaceChildren(...roadmap.map((stage, i) => {
            const card = node('section', null, 'oj-card oj-stage');
            card.append(node('h2', `${i + 1}. ${stage.title}`), node('p', stage.description, 'oj-muted'));
            const sources = node('div', null, 'oj-actions oj-stage-sources');
            sources.append(node('strong', '课程资料'));
            for (const { label, url } of stage.sources) {
                if (url.startsWith('https://')) sources.append(link(`${label} ↗`, url, 'oj-button'));
            }
            card.append(sources);
            const list = node('ul', null, 'oj-stage-problems');
            for (const id of stage.problemIds) {
                const problem = problems.get(id);
                if (!problem) continue;
                const item = node('li');
                item.append(link(`P${id} · ${titleText(problem.title)}`, problemUrl(id, { topic: 'cs61b' })),
                    node('span', `${problem.difficulty} · ${problem.origin}`, 'oj-muted'), badge(states.get(id)));
                list.append(item);
            }
            card.append(node('h3', '站内评测练习'), list);
            return card;
        }));
    }
    render();
    account.addEventListener('change', render);
}

start().catch(() => { $('oj-cs-status').textContent = '课程路线加载失败，请刷新重试。'; });
