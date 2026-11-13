import { $, tracks, loadProblems, historyEntries, progress, favorites, titleText, node, link, badge, dateLabel, problemUrl, randomProblem, read } from './workspace.mjs';

async function showDashboard() {
    const problems = await loadProblems();
    const byId = new Map(problems.map(problem => [problem.id, problem]));
    const entries = historyEntries().filter(entry => byId.has(entry.problemId));
    const states = progress(entries);
    const remaining = problems.filter(problem => states.get(problem.id) !== 'AC');
    const resume = byId.get(read('quark_oj_last_problem', null));
    const next = resume && states.get(resume.id) !== 'AC' ? resume : remaining[0];
    const solved = problems.length - remaining.length;
    $('oj-solved').textContent = solved;
    $('oj-total').textContent = `/ ${problems.length} 道题通过`;
    $('oj-progress').max = problems.length;
    $('oj-progress').value = solved;
    $('oj-attempted').textContent = states.size;
    $('oj-submitted').textContent = entries.length;
    const saved = favorites();
    $('oj-saved').textContent = problems.filter(problem => saved.has(problem.id)).length;
    if (next) {
        $('oj-continue').textContent = resume ? '继续练习' : '开始练习';
        $('oj-continue').href = problemUrl(next.id);
        $('oj-continue-note').textContent = `P${next.id} · ${titleText(next.title)}`;
        $('oj-random').disabled = false;
        $('oj-random').onclick = () => randomProblem(remaining);
    } else {
        $('oj-continue').textContent = '复习已通过题';
        $('oj-continue').href = window.buildOjUrl('list', { state: 'solved' });
    }

    $('oj-tracks').replaceChildren(...tracks.map(([key, label, description, matches]) => {
        const group = problems.filter(matches);
        const done = group.filter(problem => states.get(problem.id) === 'AC').length;
        const card = link(null, window.buildOjUrl('list', { topic: key }), 'oj-card oj-track');
        const heading = node('div', null, 'oj-section-head');
        heading.append(node('h3', label), node('span', '↗'));
        const bar = node('progress');
        bar.max = group.length || 1;
        bar.value = done;
        bar.setAttribute('aria-label', `${label}通过进度`);
        card.append(heading, node('p', description), bar, node('small', `${done} / ${group.length} 已通过`));
        return card;
    }));

    const recent = $('oj-recent');
    if (!entries.length) recent.append(node('p', '完成一次评测后，这里会显示你的提交。', 'oj-empty'));
    for (const entry of entries.slice(0, 4)) {
        const row = link(null, window.buildOjUrl('record', { entry: entry.id }), 'oj-feed-row');
        row.append(node('strong', titleText(byId.get(entry.problemId).title)), badge(entry.status), node('time', dateLabel(entry.timestamp)));
        recent.append(row);
    }
}

showDashboard().catch(() => { $('oj-tracks').textContent = '题库暂时无法加载，请刷新重试。'; });
