import { $, params, tracks, loadProblems, loadProblem, titleText, node, link, badge, favoriteButton,
    problemUrl, languages, historyEntries, progress, saveResult, draftKey, read, write, verdicts } from './workspace.mjs';
import { evaluate, normalizeSample } from './judge.mjs';

const editor = $('oj-code');
const language = $('oj-language');
const stdin = $('oj-stdin');
const runStatus = $('oj-run-status');
const resultBox = $('oj-run-results');
let activeRun;
let richEditor;
let programmaticChange = false;

function source() { return richEditor?.getValue() ?? editor.value; }

function setSource(value) {
    programmaticChange = true;
    editor.value = value;
    if (richEditor) {
        const model = richEditor.getModel();
        window.monaco.editor.setModelLanguage(model, languages[language.value][1]);
        richEditor.setValue(value);
    }
    programmaticChange = false;
}

function enhanceEditor(onEdit, run, submit) {
    const base = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.20.0/min/vs';
    const loader = document.createElement('script');
    loader.src = `${base}/loader.min.js`;
    loader.onload = () => {
        window.require.config({ paths: { vs: base } });
        window.require(['vs/editor/editor.main'], () => {
            const host = node('div', null, 'oj-monaco');
            editor.after(host);
            richEditor = window.monaco.editor.create(host, {
                value: editor.value, language: languages[language.value][1], theme: 'vs',
                automaticLayout: true, minimap: { enabled: false }, tabSize: 4,
                fontSize: 14, scrollBeyondLastLine: false, ariaLabel: '源代码', wordWrap: 'on',
            });
            richEditor.onDidChangeModelContent(onEdit);
            const { KeyMod, KeyCode } = window.monaco;
            richEditor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, run);
            richEditor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter, submit);
            const hadFocus = document.activeElement === editor;
            editor.hidden = true;
            if (hadFocus) richEditor.focus();
        }, () => {});
    };
    document.head.append(loader);
}

function markdown(id, value) {
    const target = $(id);
    if (window.QuarkSafeMarkdown) target.innerHTML = window.QuarkSafeMarkdown(value ?? '', { bareLinks: false });
    else target.textContent = value ?? '';
    window.renderMathInElement?.(target, {
        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
        throwOnError: false,
    });
}

function showResult(label, result, test) {
    const item = node('details', null, 'oj-case');
    const summary = node('summary');
    summary.append(node('strong', label), badge(result.status), node('span',
        [result.time != null ? `${result.time} s` : '', result.memory != null ? `${result.memory} KB` : ''].filter(Boolean).join(' · '), 'oj-muted'));
    item.append(summary);
    if (test.expected !== undefined && result.status === 'WA') {
        item.append(node('h3', '预期输出'), node('pre', test.expected || '（空）'));
    }
    if (result.status !== 'CE') item.append(node('h3', '实际输出'), node('pre', result.stdout || '（空）'));
    if (result.diagnostic) item.append(node('h3', '诊断信息'), node('pre', result.diagnostic));
    item.open = label === '自测' || resultBox.children.length === 0 && result.status !== 'AC';
    resultBox.append(item);
}

async function start() {
    const id = Number(params.get('p') ?? 1001);
    const index = await loadProblems();
    const problem = index.find(item => item.id === id);
    if (!problem) throw new Error('没有找到这道题，请从题库重新选择。');
    const data = await loadProblem(id);
    const savedEntries = historyEntries().filter(entry => entry.problemId === id);
    const imported = savedEntries.find(entry => entry.id === params.get('from') && typeof entry.code === 'string');
    const recent = imported || savedEntries[0];
    const resumeLanguage = imported?.languageId ?? read(`quark_oj_language_${id}`, recent?.languageId ?? read('quark_oj_language', '105'));
    const track = tracks.find(([key, , , match]) => key === params.get('topic') && match(problem));
    const neighbors = track ? index.filter(track[3]) : index;
    const position = neighbors.indexOf(problem);
    const nav = $('oj-problem-nav');
    if (neighbors[position - 1]) nav.append(link('← 上一题', problemUrl(neighbors[position - 1].id, { topic: track?.[0] })));
    if (neighbors[position + 1]) nav.append(link('下一题 →', problemUrl(neighbors[position + 1].id, { topic: track?.[0] })));
    if (track) document.querySelector('.oj-workbar a').href = window.buildOjUrl('list', { topic: track[0] });

    document.title = `P${id} ${titleText(data.title)} · QuarkOJ`;
    $('oj-problem-title').textContent = titleText(data.title);
    $('oj-favorite').append(favoriteButton(problem));
    const meta = $('oj-meta');
    let status = badge(progress(savedEntries).get(id));
    meta.append(node('span', `P${id}`), node('span', problem.difficulty === '未知' ? '未评级' : problem.difficulty),
        node('span', data.time_limit), node('span', data.memory_limit), status);
    markdown('oj-description', data.description);
    markdown('oj-input-format', data.input_format);
    markdown('oj-output-format', data.output_format);
    const sampleInput = normalizeSample(data.sample_input || '');
    const sampleOutput = normalizeSample(data.sample_output || '');
    $('oj-sample-input').textContent = sampleInput;
    $('oj-sample-output').textContent = sampleOutput;
    $('oj-related').append(link('本题提交 ↗', window.buildOjUrl('record', { p: id })),
        link('本题讨论 ↗', window.buildOjUrl('discussion', { p: id })));
    $('oj-statement').hidden = false;
    $('oj-feedback').textContent = track ? track[1] : '';
    write('quark_oj_last_problem', id);

    for (const lang of ['105', '103', '109', '91', '102', '108', '107', '54', '71', '62']) {
        language.add(new Option(languages[lang][0], lang));
    }
    language.value = languages[resumeLanguage] ? String(resumeLanguage) : '105';
    const restore = () => setSource(read(draftKey(id, language.value), languages[language.value][2]));
    let importedCode = Boolean(imported);
    if (imported) setSource(imported.code);
    else setSource(read(draftKey(id, language.value), String(recent?.languageId) === language.value && typeof recent.code === 'string'
        ? recent.code : languages[language.value][2]));

    const draftStatus = $('oj-draft-status');
    draftStatus.textContent = imported ? '已载入记录，编辑后保存' : '';
    function persistDraft() {
        if (programmaticChange) return;
        importedCode = false;
        const saved = write(draftKey(id, language.value), source());
        draftStatus.textContent = saved ? '草稿已保存' : '草稿未能保存';
    }

    editor.addEventListener('input', persistDraft);
    language.onchange = () => {
        importedCode = false;
        write('quark_oj_language', language.value);
        write(`quark_oj_language_${id}`, language.value);
        restore();
        draftStatus.textContent = '';
    };
    $('oj-reset-code').onclick = () => $('oj-template-dialog').showModal();
    $('oj-template-dialog').addEventListener('close', event => {
        if (event.target.returnValue === 'reset') {
            setSource(languages[language.value][2]);
            persistDraft();
        }
        event.target.returnValue = '';
    });
    $('oj-use-sample').onclick = () => {
        stdin.value = sampleInput;
        stdin.focus();
    };
    $('oj-clear-input').onclick = () => { stdin.value = ''; stdin.focus(); };
    $('oj-cancel').onclick = () => activeRun?.abort();

    function setBusy(busy) {
        for (const key of ['oj-run', 'oj-submit']) $(key).disabled = busy;
        $('oj-cancel').hidden = !busy;
    }

    async function run(submit) {
        if (activeRun) return;
        const code = source();
        if (!code.trim()) {
            runStatus.textContent = '请先输入源代码。';
            return;
        }
        if (!importedCode) persistDraft();
        const languageId = language.value;
        const tests = submit ? data.hidden_tests.map(test => ({ input: test.input, expected: test.expected_output })) :
            [{ input: stdin.value, expected: stdin.value === sampleInput ? sampleOutput : undefined }];
        const controller = new AbortController();
        activeRun = controller;
        setBusy(true);
        resultBox.replaceChildren();
        runStatus.textContent = '正在连接评测服务…';
        const cases = [];
        try {
            if (!tests.length) throw new Error('这道题暂缺评测用例。');
            for (const [i, test] of tests.entries()) {
                const label = submit ? `用例 ${i + 1}` : '自测';
                const onPhase = phase => { runStatus.textContent = `${label}${submit ? ` / ${tests.length}` : ''} · ${phase}`; };
                onPhase('提交中');
                const result = await evaluate({
                    ...test, code, languageId, cpu: parseFloat(data.time_limit) / 1000,
                    memory: parseFloat(data.memory_limit) * 1024,
                    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(75000)]), onPhase,
                });
                showResult(label, result, test);
                cases.push({ status: result.status, time: result.time, memory: result.memory });
                if (['CE', 'SYS_ERR'].includes(result.status)) break;
            }
            const passed = cases.filter(test => test.status === 'AC').length;
            const outcome = cases.find(test => test.status === 'SYS_ERR')?.status ??
                cases.find(test => !['AC', 'OK'].includes(test.status))?.status ?? cases[0].status;
            const message = submit ? `${verdicts[outcome]} · ${passed} / ${tests.length} 个用例通过` : verdicts[outcome];
            runStatus.textContent = message;
            if (submit && outcome !== 'SYS_ERR') {
                const peak = key => {
                    const values = cases.map(test => test[key]).filter(value => value != null).map(Number);
                    return values.length ? Math.max(...values) : null;
                };
                const saved = saveResult({
                    id: crypto.randomUUID(), problemId: id, languageId, code, status: outcome,
                    timestamp: Date.now(), time: peak('time'), memory: peak('memory'), cases, totalCases: tests.length,
                });
                if (!saved) runStatus.textContent = `${message}。浏览器存储不可用，记录未保存。`;
                else {
                    const updated = badge(progress().get(id));
                    status.replaceWith(updated);
                    status = updated;
                }
            }
        } catch (error) {
            runStatus.textContent = controller.signal.aborted ? '已停止等待，远端已提交的任务可能仍会运行。' :
                error.name === 'TimeoutError' ? '等待评测结果超时，请稍后重试。' :
                    error instanceof TypeError ? '无法连接评测服务，请检查网络后重试。' : error.message;
        } finally {
            activeRun = undefined;
            setBusy(false);
        }
    }

    for (const key of ['oj-run', 'oj-submit', 'oj-language', 'oj-code', 'oj-reset-code', 'oj-clear-input']) $(key).disabled = false;
    $('oj-run').onclick = () => run(false);
    $('oj-submit').onclick = () => run(true);
    document.addEventListener('keydown', event => {
        if (event.target !== editor && event.target !== stdin) return;
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            run(event.shiftKey);
        }
    });
    enhanceEditor(() => { editor.value = source(); persistDraft(); }, () => run(false), () => run(true));
}

start().catch(error => { $('oj-feedback').textContent = error.message; });
