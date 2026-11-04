import { DECISION_KEY, MAX_OPTIONS, MAX_CRITERIA, validateDecision, evaluateDecision, scenarioWeights, sensitivity, decisionMarkdown } from './model.mjs';

const app = document.querySelector('[data-decision-app]');
const $ = selector => document.querySelector(selector);
const presets = JSON.parse($('#decision-presets').textContent);
const clone = value => JSON.parse(JSON.stringify(value));
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
};
const button = (label, text) => { const element = node('button', '', text); element.type = 'button'; element.setAttribute('aria-label', label); return element; };
const titleInput = $('#decision-title');
const notice = $('[data-notice]');
const saveState = $('[data-save-state]');
const dialog = $('.decision-confirm');
const scenarioCriterion = $('#scenario-criterion');
const shareInput = $('#scenario-share');
let state = validateDecision(clone(presets[0].state));
let previous = null;
let pendingReplacement = null;
let returnFocus = null;
let lastRaw = null;
let blocked = false;
let scenarioId = state.criteria[0].id;
let scenarioShare = 40;
let currentAnalysis = null;
let editorInView = false;
let resultInView = false;
const dock = $('[data-mobile-dock]');
const syncDock = () => { dock.hidden = !editorInView || resultInView; };
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.target.matches('.decision-editor')) editorInView = entry.isIntersecting;
      else resultInView = entry.isIntersecting;
    }
    syncDock();
  }, { rootMargin: '-75px 0px -90px 0px' });
  observer.observe($('.decision-editor')); observer.observe($('.decision-result'));
}
dock.querySelector('a').addEventListener('click', event => {
  event.preventDefault(); $('#result-title').focus(); $('#result-title').scrollIntoView({ block: 'start' });
});

function say(message) { notice.replaceChildren(node('span', '', message)); }
function saveLabel(message, failed = false) {
  saveState.textContent = message;
  saveState.parentElement.toggleAttribute('data-failed', failed);
}
try {
  lastRaw = localStorage.getItem(DECISION_KEY);
  if (lastRaw) { state = validateDecision(JSON.parse(lastRaw)); saveLabel('已恢复本地草稿'); $('[data-preset-hint]').textContent = '接着上次的思考。草稿保存在此浏览器。'; }
  else saveLabel('正在体验示例 · 修改后保存');
} catch {
  blocked = true;
  saveLabel('存储无法读取 · 暂未保存', true);
  say('已有草稿无法读取，未覆盖原数据。你可以继续体验，并用 JSON 备份本次内容。');
}
function revealingFactor(draft) {
  return draft.criteria.reduce((best, criterion) => (sensitivity(draft, criterion.id)?.intervals.length || 0) > (sensitivity(draft, best.id)?.intervals.length || 0) ? criterion : best).id;
}
scenarioId = revealingFactor(state);

function persist() {
  if (blocked) { saveLabel('本次修改未保存 · 请导出备份', true); return; }
  try {
    if (localStorage.getItem(DECISION_KEY) !== lastRaw) { conflict(); return; }
    const raw = JSON.stringify(state);
    localStorage.setItem(DECISION_KEY, raw); lastRaw = raw;
    saveLabel('已保存在此浏览器');
  } catch { saveLabel('未能保存 · 请导出备份', true); say('浏览器存储不可用或空间不足。本次修改仍在页面中，请导出 JSON 备份。'); }
}
function commit(change, { rebuild = false, resetScenario = true } = {}) {
  previous = clone(state);
  change(state);
  persist();
  $('[data-undo]').disabled = false;
  if (rebuild) renderEditor();
  refresh(resetScenario);
}
function textField(value, label, maximum, onChange) {
  const input = node('input'); input.type = 'text'; input.value = value; input.maxLength = maximum; input.required = true; input.setAttribute('aria-label', label);
  input.addEventListener('change', () => {
    if (!input.value.trim()) { input.value = value; say('名称不能为空，已保留原名称。'); return; }
    value = input.value.trim(); input.value = value; onChange(value);
  });
  return input;
}
function renderEditor() {
  titleInput.value = state.title;
  $('[data-options]').replaceChildren(...state.options.map((option, index) => {
    const wrapper = node('div', 'decision-option');
    const input = textField(option.name, `方案 ${index + 1} 名称`, 40, name => commit(draft => { draft.options.find(item => item.id === option.id).name = name; renderMatrixLabels(); }));
    input.dataset.optionName = option.id;
    const remove = button('移除方案' + option.name, '×'); remove.className = 'decision-remove'; remove.disabled = state.options.length <= 2;
    remove.addEventListener('click', () => {
      commit(draft => { draft.options = draft.options.filter(item => item.id !== option.id); draft.criteria.forEach(item => { delete item.scores[option.id]; }); }, { rebuild: true });
      $('[data-add-option]').focus(); say('已移除方案，可撤销一步恢复。');
    });
    wrapper.append(node('span', '', String.fromCharCode(65 + index)), input, remove); return wrapper;
  }));
  renderMatrixLabels();
  $('[data-matrix]').replaceChildren(...state.criteria.map(criterion => {
    const row = node('tr');
    const head = node('th'); head.scope = 'row';
    const naming = node('div', 'decision-factor-name');
    const input = textField(criterion.name, '因素名称', 40, name => commit(draft => { draft.criteria.find(item => item.id === criterion.id).name = name; renderMatrixLabels(); }));
    input.dataset.criterionName = criterion.id;
    const remove = button('移除因素' + criterion.name, '×'); remove.className = 'decision-remove'; remove.disabled = state.criteria.length <= 1;
    remove.addEventListener('click', () => { commit(draft => { draft.criteria = draft.criteria.filter(item => item.id !== criterion.id); }, { rebuild: true }); $('[data-add-criterion]').focus(); say('已移除因素，可撤销一步恢复。'); });
    naming.append(input, remove);
    const weighting = node('div', 'decision-factor-weight');
    const range = node('input'); range.type = 'range'; range.min = '0'; range.max = '10'; range.step = '1'; range.value = criterion.weight; range.dataset.weight = criterion.id;
    range.setAttribute('aria-label', criterion.name + '的重要程度');
    const output = node('output'); output.dataset.weightShare = criterion.id;
    range.addEventListener('input', () => commit(draft => { draft.criteria.find(item => item.id === criterion.id).weight = Number(range.value); }));
    weighting.append(range, output); head.append(naming, weighting); row.append(head);
    for (const option of state.options) {
      const cell = node('td');
      const label = node('label');
      const mobileName = node('span', 'decision-score-label', option.name); mobileName.dataset.scoreName = option.id;
      const score = node('input'); score.type = 'number'; score.min = '0'; score.max = '10'; score.step = '0.5'; score.placeholder = '—'; score.inputMode = 'decimal'; score.value = criterion.scores[option.id] ?? '';
      score.dataset.scoreOption = option.id; score.dataset.scoreCriterion = criterion.id;
      score.setAttribute('aria-label', `${option.name} · ${criterion.name}评分`);
      score.addEventListener('input', () => {
        if (!score.validity.valid) { renderResults(); say('评分需为 0–10 之间、以 0.5 递增的数字。修正后将自动更新比较。'); return; }
        commit(draft => { draft.criteria.find(item => item.id === criterion.id).scores[option.id] = score.value === '' ? null : Number(score.value); });
        if (notice.textContent.startsWith('评分需')) notice.replaceChildren();
      });
      label.append(mobileName, score); cell.append(label); row.append(cell);
    }
    return row;
  }));
  $('[data-add-option]').disabled = state.options.length >= MAX_OPTIONS;
  $('[data-add-criterion]').disabled = state.criteria.length >= MAX_CRITERIA;
}
function renderMatrixLabels() {
  const row = node('tr'); const first = node('th', '', '因素 / 重要程度'); first.scope = 'col'; row.append(first);
  for (const option of state.options) { const head = node('th', '', option.name); head.scope = 'col'; row.append(head); }
  $('[data-matrix-head]').replaceChildren(row);
  for (const label of document.querySelectorAll('[data-score-name]')) label.textContent = state.options.find(option => option.id === label.dataset.scoreName)?.name || '';
  for (const score of document.querySelectorAll('[data-score-option]')) score.setAttribute('aria-label', `${state.options.find(option => option.id === score.dataset.scoreOption)?.name} · ${state.criteria.find(criterion => criterion.id === score.dataset.scoreCriterion)?.name}评分`);
  for (const range of document.querySelectorAll('[data-weight]')) range.setAttribute('aria-label', state.criteria.find(criterion => criterion.id === range.dataset.weight)?.name + '的重要程度');
}
function refresh(resetScenario = true) {
  const total = state.criteria.reduce((sum, item) => sum + item.weight, 0);
  for (const output of document.querySelectorAll('[data-weight-share]')) {
    const criterion = state.criteria.find(item => item.id === output.dataset.weightShare);
    output.textContent = total ? Math.round(criterion.weight / total * 100) + '%' : '0%';
  }
  if (!state.criteria.some(item => item.id === scenarioId)) scenarioId = state.criteria[0].id;
  scenarioCriterion.replaceChildren(...state.criteria.map(criterion => { const option = node('option', '', criterion.name); option.value = criterion.id; return option; }));
  scenarioCriterion.value = scenarioId;
  if (resetScenario) scenarioShare = total ? Math.round(state.criteria.find(item => item.id === scenarioId).weight / total * 100) : 0;
  renderResults();
}
function renderResults() {
  const invalid = !!document.querySelector('.decision-matrix input:invalid');
  const result = evaluateDecision(state);
  $('[data-mobile-dock-label]').textContent = result.ready && !invalid ? result.tied.length > 1 ? '当前并列领先' : '当前领先' : '等待完整评分';
  $('[data-mobile-dock-value]').textContent = invalid ? '有评分需要修正' : result.ready ? result.ranking.filter(item => result.tied.includes(item.id)).map(item => item.name).join(' / ') : result.missing ? `还有 ${result.missing} 项未评分` : '请设置重要程度';
  const verdict = $('[data-verdict]'); const ranking = $('[data-ranking]'); const legend = $('[data-legend]');
  verdict.replaceChildren(); ranking.replaceChildren(); legend.replaceChildren();
  $('[data-scenario-body]').hidden = invalid || !result.ready || state.criteria.length < 2;
  $('[data-scenario-empty]').hidden = !$('[data-scenario-body]').hidden;
  if (invalid || !result.ready) {
    verdict.append(node('span', '', '先留一点空白'), node('h3', '', invalid ? '先检查输入' : result.missing ? `还有 ${result.missing} 项未评分` : '给因素一点分量'), node('p', '', invalid ? '修正评分后，比较会自动恢复。' : result.missing ? '没有把握时可以先留空。填完之后，再一起看取舍。' : '目前所有重要程度都是 0。至少给一个因素分配重要程度。'));
    return;
  }
  const leader = result.ranking[0];
  const gap = leader.score - result.ranking[1].score;
  const tied = result.tied.length > 1;
  verdict.append(node('span', '', tied ? '按当前偏好 · 并列领先' : '按当前偏好 · 暂时领先'), node('h3', '', tied ? result.ranking.filter(item => result.tied.includes(item.id)).map(item => item.name).join(' / ') : leader.name), node('p', '', tied ? '这些方案的加权得分相同。试着改变一个因素的分量，看看差异在哪里。' : `比下一方案高 ${gap < .005 ? '不足 0.01' : gap.toFixed(2)} 分。${gap < .5 ? '差距不大，值得到下面的沙盘再试一试。' : '到下面的沙盘，看看改变偏好后是否依然领先。'}`));
  ranking.replaceChildren(...result.ranking.map((option, index) => {
    const row = node('div', 'decision-rank');
    const label = node('div', 'decision-rank-label'); const score = node('output', '', option.score.toFixed(2));
    label.append(node('span', '', tied && result.tied.includes(option.id) ? '＝' : String(index + 1).padStart(2, '0')), node('strong', '', option.name), score);
    const bar = node('div', 'decision-bar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', state.criteria.map((criterion, i) => `${criterion.name}贡献 ${option.contributions[i].toFixed(2)} 分`).join('，'));
    option.contributions.forEach((value, i) => { const segment = node('span'); segment.dataset.color = i; segment.style.width = `${value * 10}%`; segment.title = `${state.criteria[i].name}：${value.toFixed(2)} 分`; bar.append(segment); });
    row.append(label, bar); return row;
  }));
  legend.replaceChildren(...state.criteria.map((criterion, index) => { const item = node('span', '', criterion.name); const dot = node('i'); dot.dataset.color = index; dot.setAttribute('aria-hidden', 'true'); item.prepend(dot); return item; }));
  currentAnalysis = sensitivity(state, scenarioId);
  if (currentAnalysis) renderScenario();
}
function svgNode(tag, attributes = {}, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (text !== undefined) element.textContent = text;
  return element;
}
const plot = { x: 30, y: 15, w: 460, h: 180 };
function renderScenario() {
  if (!currentAnalysis) return;
  shareInput.value = String(scenarioShare);
  $('[data-scenario-share]').textContent = scenarioShare + '%';
  const result = evaluateDecision(state, scenarioWeights(state, scenarioId, scenarioShare));
  const winners = result.ranking.filter(item => result.tied.includes(item.id));
  $('[data-scenario-verdict]').textContent = `${scenarioShare}% 时，${winners.map(item => item.name).join(' / ')}${winners.length > 1 ? '并列领先' : '领先'}，得分 ${result.ranking[0].score.toFixed(2)}。`;
  const othersZero = state.criteria.filter(item => item.id !== scenarioId).every(item => item.weight === 0);
  $('[data-scenario-note]').textContent = othersZero ? '沙盘不会修改草稿。其他因素原重要程度均为零，此处将剩余占比平均分给它们。' : '沙盘不会修改草稿。其余因素按原比例分配剩余权重。';
  const svg = svgNode('svg', { class: 'decision-chart', viewBox: '0 0 510 225', role: 'img', 'aria-label': '偏好变化与总分的关系。下方文字列出各个领先区间。' });
  svg.append(svgNode('title', {}, '所选因素的占比变化时，各方案的加权得分'));
  for (const value of [0, 5, 10]) {
    const y = plot.y + plot.h * (1 - value / 10);
    svg.append(svgNode('line', { x1: plot.x, x2: plot.x + plot.w, y1: y, y2: y, class: 'chart-grid' }), svgNode('text', { x: plot.x - 10, y: y + 4, 'text-anchor': 'end' }, value));
  }
  for (const value of [0, 25, 50, 75, 100]) {
    const x = plot.x + plot.w * value / 100;
    svg.append(svgNode('text', { x, y: plot.y + plot.h + 22, 'text-anchor': 'middle' }, `${value}%`));
  }
  const x = plot.x + plot.w * scenarioShare / 100;
  svg.append(svgNode('line', { x1: x, x2: x, y1: plot.y, y2: plot.y + plot.h, class: 'chart-marker' }));
  currentAnalysis.lines.forEach((line, index) => {
    const y = value => plot.y + plot.h * (1 - value / 10);
    const attrs = { 'data-color': index, class: 'chart-line', x1: plot.x, x2: plot.x + plot.w, y1: y(line.start), y2: y(line.end) };
    if (index > 0) attrs['stroke-dasharray'] = ['','7 3','2 3','10 3 2 3','12 4'][index];
    svg.append(svgNode('line', attrs), svgNode('circle', { 'data-color': index, cx: x, cy: y(line.start + (line.end - line.start) * scenarioShare / 100), r: 4 }));
  });
  $('[data-scenario-chart]').replaceChildren(svg);
  $('[data-scenario-key]').replaceChildren(...state.options.map((option, index) => {
    const item = node('span', '', `${String.fromCharCode(65 + index)} · ${option.name}`); const dot = node('i'); dot.dataset.color = index; dot.setAttribute('aria-hidden', 'true'); item.prepend(dot); return item;
  }));
  $('[data-scenario-intervals]').replaceChildren(...currentAnalysis.intervals.map(interval => {
    const row = node('div', 'decision-interval'); row.classList.toggle('is-current', scenarioShare >= interval.from && scenarioShare <= interval.to);
    const round = value => Number(value.toFixed(1));
    row.append(node('span', '', `${round(interval.from)}–${round(interval.to)}%`), node('span', '', interval.winners.map(id => state.options.find(item => item.id === id).name).join(' / ') + '领先')); return row;
  }));
}
function replaceWith(next, hint) {
  previous = clone(state); state = validateDecision(next); scenarioId = revealingFactor(state);
  persist(); renderEditor(); refresh(); $('[data-undo]').disabled = false;
  $('[data-preset-hint]').textContent = hint; titleInput.focus();
}
function requestReplacement(next, hint, trigger) {
  pendingReplacement = { next, hint }; returnFocus = trigger;
  $('[data-confirm-message]').textContent = `将打开“${next.title}”。当前草稿会被替换。`;
  dialog.returnValue = ''; dialog.showModal();
}
dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'replace' && pendingReplacement) replaceWith(pendingReplacement.next, pendingReplacement.hint);
  else returnFocus?.focus();
  pendingReplacement = null;
});
titleInput.addEventListener('change', () => {
  const value = titleInput.value.trim();
  if (!value) { titleInput.value = state.title; say('标题不能为空，已保留原标题。'); return; }
  commit(draft => { draft.title = value; });
});
for (const trigger of document.querySelectorAll('[data-preset]')) trigger.addEventListener('click', () => {
  const preset = presets[Number(trigger.dataset.preset)]; requestReplacement(clone(preset.state), preset.hint, trigger);
});
$('[data-add-option]').addEventListener('click', () => {
  if (state.options.length >= MAX_OPTIONS) return;
  const id = crypto.randomUUID();
  commit(draft => { draft.options.push({ id, name: '新方案' }); draft.criteria.forEach(item => { item.scores[id] = null; }); }, { rebuild: true });
  const input = [...document.querySelectorAll('[data-option-name]')].at(-1); input.focus(); input.select();
});
$('[data-add-criterion]').addEventListener('click', () => {
  if (state.criteria.length >= MAX_CRITERIA) return;
  commit(draft => { draft.criteria.push({ id: crypto.randomUUID(), name: '新因素', weight: 3, scores: Object.fromEntries(draft.options.map(item => [item.id, null])) }); }, { rebuild: true });
  const input = [...document.querySelectorAll('[data-criterion-name]')].at(-1); input.focus(); input.select();
});
$('[data-undo]').addEventListener('click', () => {
  if (!previous) return;
  state = validateDecision(previous); previous = null; persist(); renderEditor(); refresh(); $('[data-undo]').disabled = true; titleInput.focus(); say('已撤销上一步修改。');
});
scenarioCriterion.addEventListener('change', () => { scenarioId = scenarioCriterion.value; refresh(); });
shareInput.addEventListener('input', () => { scenarioShare = Number(shareInput.value); renderScenario(); });
$('[data-scenario-reset]').addEventListener('click', () => refresh());
function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type })); const link = node('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
for (const trigger of document.querySelectorAll('[data-export]')) trigger.addEventListener('click', () => {
  if (document.querySelector('.decision-matrix input:invalid')) { say('请先修正无效的评分再导出，避免导出旧评分。'); return; }
  const json = trigger.dataset.export === 'json';
  const filename = state.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 60);
  download(json ? JSON.stringify(state, null, 2) : decisionMarkdown(state), filename + (json ? '.json' : '.md'), json ? 'application/json' : 'text/markdown;charset=utf-8'); say(json ? 'JSON 备份已导出，可在其他浏览器导入。' : '比较记录已导出为 Markdown。');
});
$('#decision-import').addEventListener('change', async event => {
  const input = event.target; const file = input.files[0]; if (!file) return;
  try {
    if (file.size > 100000) throw new Error('备份文件过大，请选择小于 100 KB 的 JSON。');
    const next = validateDecision(JSON.parse(await file.text()));
    requestReplacement(next, '已导入备份，继续这次思考。', input);
  } catch (error) { say(`导入失败，原草稿保持完整。${error instanceof Error ? error.message : '文件无法读取。'}`); }
  finally { input.value = ''; }
});
function conflict() {
  blocked = true; saveLabel('其他标签页已修改 · 本页暂停保存', true);
  say('另一标签页更改了草稿。本页内容暂存于页面，可先导出备份，再载入最新草稿。');
  const load = button('载入其他标签页的最新草稿', '载入最新草稿');
  load.addEventListener('click', () => {
    try {
      const raw = localStorage.getItem(DECISION_KEY);
      const latest = raw ? validateDecision(JSON.parse(raw)) : validateDecision(clone(presets.at(-1).state));
      previous = clone(state); state = latest; lastRaw = raw; blocked = false;
      renderEditor(); refresh(); $('[data-undo]').disabled = false;
      saveLabel(raw ? '已载入最新本地草稿' : '其他标签页已清除草稿'); say('已载入最新草稿。原页面内容可撤销一步恢复。'); titleInput.focus();
    } catch { say('最新草稿无法读取。为保护数据，继续暂停保存；请先导出此页面的 JSON。'); }
  });
  notice.append(' ', load);
}
window.addEventListener('storage', event => { if (event.key === DECISION_KEY || event.key === null) { if (event.newValue !== lastRaw || event.key === null) conflict(); } });
renderEditor(); refresh(); app.hidden = false;
