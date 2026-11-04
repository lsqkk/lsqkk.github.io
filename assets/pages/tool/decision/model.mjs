export const DECISION_KEY = 'quark.decision.v1';
export const MAX_OPTIONS = 5;
export const MAX_CRITERIA = 6;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const number = (value, max) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;

// Never silently coerce an invalid backup into a usable draft.
export function validateDecision(value) {
  if (value?.version !== 1 || !text(value.title, 100) || !Array.isArray(value.options) || !Array.isArray(value.criteria)) throw new Error('这不是有效的权衡备份。');
  if (value.options.length < 2 || value.options.length > MAX_OPTIONS || value.criteria.length < 1 || value.criteria.length > MAX_CRITERIA) throw new Error('需要 2–5 个方案、1–6 个因素。');
  const ids = new Set();
  for (const option of value.options) {
    if (!text(option.id, 80) || !text(option.name, 40) || ids.has(option.id)) throw new Error('方案名称或标识无效。');
    ids.add(option.id);
  }
  const criteriaIds = new Set();
  const criteria = value.criteria.map(criterion => {
    if (!text(criterion.id, 80) || criteriaIds.has(criterion.id) || !text(criterion.name, 40) || !number(criterion.weight, 10) || !Number.isInteger(criterion.weight) || !criterion.scores || typeof criterion.scores !== 'object') throw new Error('因素或重要程度无效。重要程度应为 0–10 的整数。');
    criteriaIds.add(criterion.id);
    const scores = Object.create(null);
    for (const option of value.options) {
      const score = criterion.scores[option.id];
      if (score !== null && (!number(score, 10) || !Number.isInteger(score * 2))) throw new Error('评分应为 0–10、以 0.5 递增的数字，或留空。');
      scores[option.id] = score;
    }
    return { id: criterion.id, name: criterion.name.trim(), weight: criterion.weight, scores };
  });
  return { version: 1, title: value.title.trim(), options: value.options.map(option => ({ id: option.id, name: option.name.trim() })), criteria };
}
export function evaluateDecision(state, overrideWeights) {
  const missing = state.criteria.reduce((sum, criterion) => sum + state.options.filter(option => criterion.scores[option.id] === null).length, 0);
  const weights = overrideWeights || state.criteria.map(criterion => criterion.weight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (missing || totalWeight <= 0) return { ready: false, missing, totalWeight, ranking: [], tied: [] };
  const ranking = state.options.map((option, index) => {
    const contributions = state.criteria.map((criterion, i) => criterion.scores[option.id] * weights[i] / totalWeight);
    return { ...option, index, score: contributions.reduce((sum, score) => sum + score, 0), contributions };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  return { ready: true, missing: 0, totalWeight, ranking, tied: ranking.filter(option => Math.abs(option.score - ranking[0].score) < 1e-8).map(option => option.id) };
}
// Hold other factors in their original ratio. If all are zero, use equal shares.
export function scenarioWeights(state, criterionId, share) {
  const index = state.criteria.findIndex(criterion => criterion.id === criterionId);
  if (index < 0 || !number(share, 100)) throw new Error('无效的偏好情景。');
  if (state.criteria.length === 1) return [1];
  const remainder = state.criteria.reduce((sum, criterion, i) => sum + (i === index ? 0 : criterion.weight), 0);
  return state.criteria.map((criterion, i) => i === index ? share / 100 : (1 - share / 100) * (remainder > 0 ? criterion.weight / remainder : 1 / (state.criteria.length - 1)));
}
export function sensitivity(state, criterionId) {
  if (!evaluateDecision(state).ready || state.criteria.length < 2) return null;
  const start = evaluateDecision(state, scenarioWeights(state, criterionId, 0));
  const end = evaluateDecision(state, scenarioWeights(state, criterionId, 100));
  const lines = state.options.map(option => ({ id: option.id, name: option.name, start: start.ranking.find(row => row.id === option.id).score, end: end.ranking.find(row => row.id === option.id).score }));
  const crossings = [0, 100];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i], b = lines[j];
    const slope = (a.end - a.start) - (b.end - b.start);
    if (Math.abs(slope) < 1e-10) continue;
    const crossing = (b.start - a.start) / slope * 100;
    if (crossing > 0 && crossing < 100) crossings.push(crossing);
  }
  const points = [...new Set(crossings.map(point => Math.round(point * 1e8) / 1e8))].sort((a, b) => a - b);
  const intervals = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i], to = points[i + 1];
    const winners = evaluateDecision(state, scenarioWeights(state, criterionId, (from + to) / 2)).tied;
    const previous = intervals.at(-1);
    if (previous && previous.winners.join('|') === winners.join('|')) previous.to = to;
    else intervals.push({ from, to, winners });
  }
  return { lines, intervals };
}
export function decisionMarkdown(state) {
  const escape = value => String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  const result = evaluateDecision(state);
  const total = result.totalWeight;
  const lines = [`# ${escape(state.title)}`, '', '评分 0–10，越满意分越高；重要程度按总和归一。', '', `| 因素 | 权重 | ${state.options.map(option => escape(option.name)).join(' | ')} |`, `| --- | --- | ${state.options.map(() => '---').join(' | ')} |`];
  for (const criterion of state.criteria) lines.push(`| ${escape(criterion.name)} | ${total ? (criterion.weight / total * 100).toFixed(1) + '%' : '0%'} | ${state.options.map(option => criterion.scores[option.id] ?? '未评').join(' | ')} |`);
  lines.push('', '## 当前比较', '');
  if (result.ready) result.ranking.forEach((option, index) => lines.push(`${index + 1}. ${escape(option.name)}：${option.score.toFixed(2)} / 10${result.tied.includes(option.id) ? '（当前领先组）' : ''}`));
  else lines.push(result.missing ? `还有 ${result.missing} 项评分未填，暂不排名。` : '重要程度全为零，暂不排名。');
  lines.push('', '这是基于所填偏好和评分的加权比较；未纳入的因素不会出现在结果中。', '由夸克「权衡」生成。');
  return lines.join('\n');
}
