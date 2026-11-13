(() => {
    const get = (id) => document.getElementById(id);
    const cards = [...document.querySelectorAll('[data-test]')];
    const url = new URL(location.href);
    const id = url.searchParams.get('test') || new URLSearchParams(url.hash.slice(1)).get('test');
    const draftKey = (testId) => `quark:test:v2:${testId}`;
    window.addEventListener('hashchange', () => location.reload());

    function readDraft(testId) {
        try {
            return JSON.parse(localStorage.getItem(draftKey(testId)));
        } catch {
            return null;
        }
    }

    if (!id) {
        cards.forEach((card) => {
            const draft = readDraft(card.dataset.test);
            if (draft?.finished) card.querySelector('.test-card-action').textContent = '查看上次结果 →';
            else if (draft?.answers?.some(Number.isInteger)) card.querySelector('.test-card-action').textContent = '继续作答 →';
        });
        return;
    }

    const list = get('list-view');
    const view = get('test-view');
    const loading = get('test-loading');
    const run = get('test-run');
    const result = get('test-results');
    const title = get('test-title');
    const prev = get('prevBtn');
    const next = get('nextBtn');
    let test;
    let position;
    let answers;
    let confidence;
    let finished;

    const create = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (className) element.className = className;
        return element;
    };

    async function load() {
        list.hidden = true;
        view.hidden = false;
        try {
            if (!cards.some((card) => card.dataset.test === id)) {
                title.textContent = '找不到这份测试';
                loading.textContent = '请返回测试列表选择一份问卷。';
                return;
            }
            const response = await fetch(`/assets/pages/tool/test/${id}.json`);
            if (!response.ok) throw new Error('Test fetch failed');
            test = await response.json();
            const draft = readDraft(id);
            answers = test.questions.map((question, index) => {
                const saved = draft?.answers?.[index];
                return Number.isInteger(saved) && saved >= 0 && saved < question.options.length ? saved : null;
            });
            confidence = test.questions.map((_, index) => {
                const saved = draft?.confidence?.[index];
                return [50, 75, 100].includes(saved) ? saved : null;
            });
            position = Number.isInteger(draft?.position)
                ? Math.max(0, Math.min(test.questions.length - 1, draft.position))
                : 0;
            finished = draft?.finished === true && test.questions.every((_, index) => answered(index));
            title.textContent = test.title;
            get('test-description').textContent = test.description;
            loading.hidden = true;
            if (finished) showResults();
            else showQuestion(position, false);
        } catch {
            title.textContent = '暂时无法加载测试';
            loading.textContent = '请刷新页面重试。';
        }
    }

    function persist() {
        try {
            localStorage.setItem(draftKey(id), JSON.stringify({ position, answers, confidence, finished }));
        } catch {
            // The current session can still be completed without storage.
        }
    }

    function answered(index) {
        return answers[index] !== null && (test.mode !== 'evidence' || confidence[index] !== null);
    }

    function updateProgress() {
        const total = test.questions.length;
        const count = test.questions.filter((_, index) => answered(index)).length;
        const progress = get('test-progress');
        progress.max = total;
        progress.value = count;
        get('test-position').textContent = `第 ${position + 1} 题 / 共 ${total} 题`;
        get('test-progress-label').textContent = `已完成 ${count} 题`;
        get('test-map').querySelectorAll('button').forEach((button, index) => {
            if (index === position) button.setAttribute('aria-current', 'step');
            else button.removeAttribute('aria-current');
            button.dataset.done = String(answered(index));
            button.setAttribute('aria-label', `第 ${index + 1} 题，${answered(index) ? '已作答' : '待作答'}`);
        });
        prev.disabled = position === 0;
        next.disabled = !answered(position);
        next.textContent = count === total ? '查看结果' : position === total - 1 ? '回到待答题' : '下一题';
    }

    function choice(text, name, value, checked, onChange) {
        const label = create('label', undefined, 'test-option');
        const input = create('input');
        input.type = 'radio';
        input.name = name;
        input.value = String(value);
        input.checked = checked;
        input.addEventListener('change', onChange);
        label.append(input, create('span', text));
        return label;
    }

    function showQuestion(index, focus = true) {
        position = index;
        run.hidden = false;
        result.hidden = true;
        const question = test.questions[index];
        const map = get('test-map');
        if (!map.childElementCount) {
            test.questions.forEach((_, questionIndex) => {
                const button = create('button', String(questionIndex + 1));
                button.type = 'button';
                button.addEventListener('click', () => showQuestion(questionIndex));
                map.append(button);
            });
        }

        const field = create('fieldset', undefined, 'test-question');
        const legend = create('legend', question.question);
        legend.tabIndex = -1;
        field.append(legend);
        const options = create('div', undefined, 'test-options');
        const certainty = create('fieldset', undefined, 'test-confidence');
        question.options.forEach((option, optionIndex) => {
            options.append(choice(option.text, 'answer', optionIndex, answers[index] === optionIndex, () => {
                answers[index] = optionIndex;
                certainty.disabled = false;
                updateProgress();
                persist();
            }));
        });
        field.append(options);
        const container = get('question-container');
        container.replaceChildren(field);
        if (test.mode === 'evidence') {
            certainty.disabled = answers[index] === null;
            certainty.append(create('legend', '你有多大把握？'));
            const levels = create('div', undefined, 'test-confidence-options');
            [[50, '50% · 不太确定'], [75, '75% · 比较确定'], [100, '100% · 非常确定']].forEach(([value, text]) => {
                levels.append(choice(text, 'confidence', value, confidence[index] === value, () => {
                    confidence[index] = value;
                    updateProgress();
                    persist();
                }));
            });
            certainty.append(levels);
            container.append(certainty);
        }
        updateProgress();
        persist();
        if (focus) legend.focus();
    }

    function spectrum() {
        const nodes = [create('p', '比例由所选答案的计分权重计算。两端均未获得分数时，显示为暂无倾向。')];
        test.dimensions_config.forEach((pair, index) => {
            let left = 0;
            let right = 0;
            answers.forEach((answer, questionIndex) => {
                const scores = test.questions[questionIndex].options[answer].scores;
                left += scores[pair.left] ?? 0;
                right += scores[pair.right] ?? 0;
            });
            const total = left + right;
            const ratio = total ? Math.round(100 * left / total) : 50;
            const row = create('article', undefined, 'test-axis');
            row.append(create('h3', pair.name), create('p', total ? `${pair.left} ${ratio}% · ${pair.right} ${100 - ratio}%` : `${pair.left} / ${pair.right} · 暂无倾向`));
            const bar = create('div', undefined, 'test-axis-bar');
            bar.style.setProperty('--axis', `${ratio}%`);
            bar.setAttribute('aria-hidden', 'true');
            row.append(bar);
            const description = test.dimension_descriptions[index];
            if (description) row.append(create('p', description.content));
            nodes.push(row);
        });
        return nodes;
    }

    function evidence() {
        const correct = test.questions.filter((question, index) => question.correct === answers[index]).length;
        const accuracy = Math.round(100 * correct / answers.length);
        const certainty = Math.round(confidence.reduce((sum, value) => sum + value, 0) / answers.length);
        const difference = certainty - accuracy;
        return [
            create('p', `答对 ${correct} / ${answers.length} 题 · 准确率 ${accuracy}% · 平均把握 ${certainty}%`, 'test-score'),
            create('p', difference === 0 ? '这次平均把握和准确率相同。' : `这次平均把握比准确率${difference > 0 ? '高' : '低'} ${Math.abs(difference)} 个百分点。`),
            create('p', '这次只有六份材料，建议结合逐题批注看哪些判断值得复盘。')
        ];
    }

    function policy() {
        const selected = answers.map((answer, index) => test.questions[index].options[answer].track);
        return [
            create('p', '这张清单按你本次采用的修订手段汇总。', 'test-score'),
            ...test.tracks.map((track) => {
                const row = create('article', undefined, 'test-axis');
                row.append(create('h3', `${track.name} · ${selected.filter((value) => value === track.id).length} 次`), create('p', track.detail));
                return row;
            })
        ];
    }

    function review() {
        const wrapper = create('section', undefined, 'test-review');
        wrapper.append(create('h3', '逐题回顾'));
        test.questions.forEach((question, index) => {
            const choice = question.options[answers[index]];
            const detail = create('details');
            detail.append(create('summary', `${index + 1}. ${question.question}`), create('p', `你的选择 · ${choice.text}`));
            if (test.mode === 'evidence') {
                detail.append(
                    create('p', `${answers[index] === question.correct ? '判断正确' : '可再核对'} · 把握 ${confidence[index]}%`),
                    create('p', `参考判断 · ${question.options[question.correct].text}`),
                    create('p', question.explanation)
                );
            } else if (choice.feedback) detail.append(create('p', choice.feedback));
            wrapper.append(detail);
        });
        return wrapper;
    }

    function showResults() {
        finished = true;
        run.hidden = true;
        result.hidden = false;
        const heading = create('h2', '作答报告');
        heading.id = 'result-title';
        heading.tabIndex = -1;
        const sections = test.mode === 'evidence' ? evidence() : test.mode === 'policy' ? policy() : spectrum();
        const actions = create('div', undefined, 'test-navigation');
        const edit = create('button', '修改答案');
        edit.type = 'button';
        edit.addEventListener('click', () => {
            finished = false;
            showQuestion(0);
        });
        const restart = create('button', '清空并重做');
        restart.type = 'button';
        restart.addEventListener('click', () => {
            if (!window.confirm('清空这份测试的所有答案？')) return;
            answers.fill(null);
            confidence.fill(null);
            finished = false;
            showQuestion(0);
        });
        actions.append(edit, restart);
        result.replaceChildren(heading, ...sections, review(), actions);
        persist();
        heading.focus();
    }

    prev.addEventListener('click', () => showQuestion(position - 1));
    next.addEventListener('click', () => {
        if (!answered(position)) return;
        const firstUnanswered = test.questions.findIndex((_, index) => !answered(index));
        if (firstUnanswered === -1) showResults();
        else showQuestion(position < test.questions.length - 1 ? position + 1 : firstUnanswered);
    });
    load();
})();
