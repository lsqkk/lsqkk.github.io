// Only catalogue paths are persisted. Names and destinations come from the built manifest.
export const POCKET_KEY = 'quark.pocket.v1';
export const PIN_LIMIT = 8;
export function readPocket(storage, valid) {
  const raw = storage.getItem(POCKET_KEY);
  if (!raw) return { version: 1, pins: [], recent: [], view: 'grid' };
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.pins) || !Array.isArray(value.recent)) throw new Error('随行架数据无法读取，请先导出或检查浏览器存储。');
  const paths = list => [...new Set(list.filter(item => typeof item === 'string' && valid.has(item)))].slice(0, PIN_LIMIT);
  return { version: 1, pins: paths(value.pins), recent: paths(value.recent), view: value.view === 'list' ? 'list' : 'grid' };
}
export function changePocket(state, action) {
  if (action.type === 'pin') {
    const exists = state.pins.includes(action.path);
    if (!exists && state.pins.length >= PIN_LIMIT) throw new Error('随行架最多放 8 项，先移除一个暂时不用的入口吧。');
    return { ...state, pins: exists ? state.pins.filter(path => path !== action.path) : [...state.pins, action.path] };
  }
  if (action.type === 'visit') return { ...state, recent: [action.path, ...state.recent.filter(path => path !== action.path)].slice(0, PIN_LIMIT) };
  if (action.type === 'clear-recent') return { ...state, recent: [] };
  if (action.type === 'view') return { ...state, view: action.view === 'list' ? 'list' : 'grid' };
  return state;
}
