import {
  HOME, MAX_PLACES, MAX_VERTICES, basemaps, osmCredit, osmTiles, subdomains, tiandituCredit, tileUrl,
  collection, coordinateText, distance, drivingRoute, feature, formatArea, formatDistance,
  lineDistance, meetingCenter, parsePoint, polygonArea, rankCandidates, readGeoJSON, readLegacy,
  searchPlaces, validPoint,
} from './map-data.mjs';

const $ = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
const colors = { teal: '#08736a', blue: '#235cb6', purple: '#7744a2', orange: '#a34e23' };
const cities = [
  ['北京', [39.9042, 116.4074]], ['上海', [31.2304, 121.4737]], ['广州', [23.1291, 113.2644]],
  ['深圳', [22.5431, 114.0579]], ['成都', [30.5728, 104.0668]], ['杭州', [30.2741, 120.1551]],
  ['西安', [34.3416, 108.9398]], ['重庆', [29.5630, 106.5516]],
];
const store = 'quark.map.workspace.v1';
const state = {
  pane: 'explore', layer: 'vector', saved: [], search: [], meet: [], candidates: [],
  endpoints: { start: null, end: null }, route: null, selected: null, location: null,
  pick: null, drawing: [], searchTask: null, routeTask: null, meetTask: null,
};
const initial = new URLSearchParams(location.search);
const key = () => window.TIANDITU_KEY || '';
const wrapLng = lng => ((lng + 180) % 360 + 360) % 360 - 180;
const asPoint = ({ lat, lng }) => [lat, wrapLng(lng)];
let map, baseLayer, overlay, terrain, is3D = false, terrainUnavailable = false;
let noticeTimer, dialogAction;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, callback, className, label) {
  const node = el('button', text, className);
  node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  node.addEventListener('click', callback);
  return node;
}

function notice(message) {
  clearTimeout(noticeTimer);
  $('map-notice').textContent = message;
  $('map-notice').hidden = false;
  noticeTimer = setTimeout(() => { $('map-notice').hidden = true; }, 6500);
}

function readStorage(name) {
  try {
    return JSON.parse(localStorage.getItem(name));
  } catch {
    return null;
  }
}

function saveWorkspace(next) {
  const vertices = next.reduce((total, item) => {
    const { type, coordinates } = item.geometry;
    return total + (type === 'Point' ? 1 : type === 'Polygon' ? coordinates[0].length : coordinates.length);
  }, 0);
  if (vertices > MAX_VERTICES) {
    notice('收藏中的坐标点过多，请删减图形后再保存。');
    return false;
  }
  try {
    localStorage.setItem(store, JSON.stringify(collection(next)));
  } catch {
    notice('浏览器存储空间不足或不可用，保存失败。');
    return false;
  }
  state.saved = next;
  renderLibrary();
  renderOverlays();
  return true;
}

function addFeature(item) {
  if (state.saved.length >= MAX_PLACES) {
    notice('已达到 500 个收藏图形的上限。');
    return false;
  }
  return saveWorkspace([...state.saved, item]);
}

function moveTo(point, zoom = 15) {
  const animate = !reducedMotion.matches;
  const longitude = nearestLongitude(point[1], view().point[1]);
  if (is3D) {
    terrain.globe.easeTo({ center: [longitude, point[0]], zoom: zoom - 1, duration: animate ? 450 : 0 });
  } else {
    map.setView([point[0], longitude], zoom, { animate });
  }
}

function view() {
  return is3D
    ? { point: asPoint(terrain.globe.getCenter()), zoom: terrain.globe.getZoom() + 1 }
    : { point: asPoint(map.getCenter()), zoom: map.getZoom() };
}

function nearestLongitude(lng, reference) {
  return reference + wrapLng(lng - reference);
}

function unwrapPoints(points, reference) {
  return points.map(([lat, lng]) => {
    reference = nearestLongitude(lng, reference);
    return [lat, reference];
  });
}

function fitPoints(points, ordered = false) {
  if (!points.length) return;
  if (points.length === 1) {
    moveTo(points[0]);
    return;
  }
  const reference = points[0][1];
  const visible = ordered ? unwrapPoints(points, reference) : points.map(([lat, lng]) => [lat, nearestLongitude(lng, reference)]);
  const bounds = L.latLngBounds(visible);
  const animate = !reducedMotion.matches;
  if (is3D) {
    terrain.globe.fitBounds([[bounds.getWest(), bounds.getSouth()], [bounds.getEast(), bounds.getNorth()]],
      { padding: 48, maxZoom: 15, duration: animate ? 450 : 0, pitch: terrain.globe.getPitch(), bearing: terrain.globe.getBearing() });
  } else {
    map.fitBounds(bounds, { padding: [42, 42], maxZoom: 16, animate });
  }
}

function updateReadout() {
  const { point, zoom } = view();
  $('map-coordinates').textContent = coordinateText(point, 4);
  const perPixel = 40075017 * Math.cos(point[0] * Math.PI / 180) / (256 * 2 ** zoom);
  const power = 10 ** Math.floor(Math.log10(perPixel * 88));
  const scale = [1, 2, 5].map(value => value * power).filter(value => value <= perPixel * 88).at(-1) ?? power;
  $('map-scale').hidden = is3D;
  $('map-scale').style.width = `${scale / perPixel}px`;
  $('map-scale').textContent = formatDistance(scale);
}

function setLayer(id) {
  const configured = Boolean(key());
  const requested = id;
  if (!Object.hasOwn(basemaps, id) || (!configured && id !== 'osm')) id = configured ? 'vector' : 'osm';
  if (requested !== id && requested !== 'vector') notice('天地图底图暂不可用，已显示开放地图。');
  state.layer = id;
  $('layer-name').textContent = basemaps[id].name;
  $('layers').open = false;
  all('[data-layer]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.layer === id)));
  if (is3D) {
    $('map-credit').innerHTML = terrain.setBasemap(id, key());
    return;
  }
  if (baseLayer) map.removeLayer(baseLayer);
  const ids = basemaps[id].layers;
  const layers = ids
    ? ids.map(layer => L.tileLayer(tileUrl(layer, key()), { subdomains, maxNativeZoom: 18, maxZoom: 19, keepBuffer: 1 }))
    : [L.tileLayer(osmTiles, { maxNativeZoom: 19, maxZoom: 19, keepBuffer: 1 })];
  let loaded = false;
  let failures = 0;
  layers[0].on('tileload', () => { loaded = true; failures = 0; });
  layers[0].on('loading', () => { loaded = false; failures = 0; });
  layers[0].on('tileerror', () => {
    if (loaded || ++failures !== 3 || id !== state.layer || is3D) return;
    if (id !== 'osm') {
      setLayer('osm');
      notice('天地图瓦片暂不可用，已切换到开放地图。');
    } else {
      notice('开放地图瓦片加载失败，请检查网络或切换底图。');
    }
  });
  baseLayer = L.layerGroup(layers).addTo(map);
  $('map-credit').innerHTML = ids ? tiandituCredit : osmCredit;
}

function togglePanel(expand = $('workspace').hidden) {
  $('workspace').hidden = !expand;
  $('map-app').classList.toggle('is-collapsed', !expand);
  const control = $('panel-toggle');
  control.setAttribute('aria-expanded', String(expand));
  control.setAttribute('aria-label', expand ? '收起工作区' : '展开工作区');
  control.textContent = expand ? '‹' : '›';
}

function openPane(name, { preservePick = false } = {}) {
  if (state.pane !== name && !preservePick) cancelPick();
  state.pane = name;
  all('[data-pane]').forEach(control => {
    const active = control.dataset.pane === name;
    control.setAttribute('aria-pressed', String(active));
    $(control.getAttribute('aria-controls')).hidden = !active;
  });
  togglePanel(true);
  document.querySelector('.map-pane-scroll').scrollTop = 0;
  renderOverlays();
}

function rowFor(title, detail, activate) {
  const item = el('li');
  const heading = el('div', null, 'map-row');
  heading.append(activate ? button(title, activate, 'map-row-title') : el('strong', title, 'map-row-title'));
  item.append(heading);
  if (detail) item.append(el('p', detail, 'map-muted'));
  return { item, heading };
}

function placeActions(place) {
  const actions = el('div', null, 'map-actions');
  actions.append(
    button('收藏', () => savePlace(place)),
    button('设为起点', () => setEndpoint('start', place)),
    button('设为终点', () => setEndpoint('end', place)),
    button('加为碰面出发点', () => addMeet(place)),
  );
  return actions;
}

function showPlace(place, { zoom = true } = {}) {
  state.selected = place;
  if (zoom) moveTo(place.point, Math.max(15, view().zoom));
  renderOverlays();
  if (is3D) {
    const card = el('div');
    card.append(el('strong', place.name), el('p', coordinateText(place.point), 'map-muted'), placeActions(place));
    const popup = document.createElement('div');
    popup.className = 'map-3d-popup';
    popup.append(card, button('关闭', () => popup.remove(), 'map-quiet'));
    document.querySelector('.map-3d-popup')?.remove();
    $('map-3d').append(popup);
    return;
  }
  const content = el('div');
  content.append(el('strong', place.name), el('p', place.note || coordinateText(place.point), 'map-muted'), placeActions(place));
  const point = [place.point[0], nearestLongitude(place.point[1], map.getCenter().lng)];
  L.popup({ maxWidth: 280, autoPan: false }).setLatLng(point).setContent(content).openOn(map);
}

function nameDialog(title, value, callback) {
  $('map-dialog-title').textContent = title;
  $('map-dialog-label').textContent = '名称';
  $('map-dialog-description').hidden = true;
  $('map-dialog-value').value = value;
  $('map-dialog-value').readOnly = false;
  $('map-dialog-submit').hidden = false;
  dialogAction = callback;
  $('map-dialog').showModal();
  $('map-dialog-value').select();
}

function savePlace(place) {
  nameDialog('收藏地点', place.name, name => {
    if (!addFeature(feature('Point', [place.point], name, place.note))) return false;
    openPane('library');
    notice('地点已收藏。');
    return true;
  });
}

async function search(keyword, center) {
  if (!keyword) return;
  $('query').value = keyword;
  state.searchTask?.abort();
  const controller = new AbortController();
  state.searchTask = controller;
  state.search = [];
  openPane('explore');
  $('explore-home').hidden = true;
  $('search-results').hidden = false;
  $('search-count').textContent = '';
  $('result-list').replaceChildren();
  $('search-feedback').textContent = center ? '正在搜索地图中心周边 3 公里…' : '正在查找地点…';
  try {
    const point = parsePoint(keyword) ?? parsePoint(keyword, true);
    const { places, suggestions } = point && !center
      ? { places: [{ point, name: '坐标位置', note: coordinateText(point) }], suggestions: [] }
      : await searchPlaces(key(), keyword, { center, signal: controller.signal });
    if (controller.signal.aborted) return;
    state.search = places;
    $('search-count').textContent = places.length ? `${places.length} 个地点` : '';
    $('search-feedback').textContent = places.length ? (center ? '搜索范围为地图中心周边 3 公里。' : '') : '未找到地点。试试添加城市名或换个关键词。';
    places.forEach((place, index) => {
      const { item } = rowFor(`${index + 1}. ${place.name}`, place.note || coordinateText(place.point), () => showPlace(place));
      if (center) item.append(el('p', `直线距离 ${formatDistance(distance(center, place.point))}`, 'map-muted'));
      item.append(placeActions(place));
      $('result-list').append(item);
    });
    if (!places.length && suggestions.length) {
      const item = el('li');
      const actions = el('div', null, 'map-actions');
      actions.append(...suggestions.map(name => button(name, () => search(`${name} ${keyword}`))));
      item.append(el('p', '按地区缩小范围', 'map-muted'), actions);
      $('result-list').append(item);
    }
    if (state.pane === 'explore') {
      if (places.length === 1) showPlace(places[0]);
      else fitPoints(places.map(place => place.point));
      renderOverlays();
    }
  } catch (error) {
    if (!controller.signal.aborted) $('search-feedback').textContent = error.message || '搜索失败，请稍后重试。';
  }
}

function clearSearch() {
  state.searchTask?.abort();
  state.search = [];
  $('query').value = '';
  $('search-count').textContent = '';
  $('explore-home').hidden = false;
  $('search-results').hidden = true;
  renderOverlays();
}

function clearRoute() {
  state.routeTask?.abort();
  state.route = null;
  $('route-result').replaceChildren();
}

function updateRouteControls() {
  const { start, end } = state.endpoints;
  $('route-start').lastElementChild.textContent = start?.name ?? '选取起点';
  $('route-end').lastElementChild.textContent = end?.name ?? '选取终点';
  $('plan-route').disabled = !start || !end;
  renderOverlays();
}

function setEndpoint(which, place) {
  clearRoute();
  state.endpoints[which] = place;
  openPane('directions');
  updateRouteControls();
  if (!state.endpoints.end && which === 'start') beginPick('end');
}

async function planRoute() {
  const { start, end } = state.endpoints;
  if (!start || !end) return;
  clearRoute();
  const controller = new AbortController();
  state.routeTask = controller;
  $('plan-route').disabled = true;
  const result = $('route-result');
  result.append(el('p', '正在查询驾车路线…', 'map-metric'));
  renderOverlays();
  try {
    const route = await drivingRoute(key(), start.point, end.point, controller.signal);
    if (controller.signal.aborted) return;
    state.route = route;
    const summary = el('p', null, 'map-metric');
    const minutes = Math.max(1, Math.round(route.seconds / 60));
    const duration = minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`;
    summary.append(el('strong', formatDistance(route.meters)), route.seconds > 0 ? ` · 约 ${duration}` : '');
    const actions = el('div', null, 'map-actions');
    actions.append(
      button('查看全程', () => fitPoints(route.points, true)),
      button('收藏路线', () => nameDialog('收藏驾车路线', `${start.name} → ${end.name}`.slice(0, 100), name => {
        if (!addFeature(feature('LineString', route.points, name, summary.textContent))) return false;
        notice('驾车路线已收藏。');
        return true;
      })),
    );
    result.replaceChildren(summary, actions);
    if (route.steps.length) {
      const details = el('details', null, 'map-steps');
      const steps = el('ol');
      steps.append(...route.steps.map(step => el('li', step, 'map-muted')));
      details.append(el('summary', `查看 ${route.steps.length} 条行驶指引`), steps);
      result.append(details);
    }
    if (state.pane === 'directions') fitPoints(route.points, true);
  } catch (error) {
    if (!controller.signal.aborted) result.replaceChildren(el('p', error.message, 'map-metric'));
  } finally {
    if (!controller.signal.aborted) updateRouteControls();
  }
}
function refreshMeet() {
  state.meetTask?.abort();
  state.candidates = [];
  $('meet-results').replaceChildren();
  $('meet-feedback').textContent = '';
  $('meet-origins').replaceChildren(...state.meet.map((place, index) => {
    const { item, heading } = rowFor(`${index + 1}. ${place.name}`, coordinateText(place.point), () => moveTo(place.point));
    heading.append(button('移除', () => { state.meet.splice(index, 1); refreshMeet(); }, 'map-quiet', `移除${place.name}`));
    return item;
  }));
  const center = meetingCenter(state.meet);
  const result = $('meet-result');
  $('meet-categories').hidden = !center;
  result.replaceChildren();
  if (center) {
    const summary = el('p', null, 'map-metric');
    summary.append(el('strong', '建议碰面中心'), el('br'), `最远一方 ${formatDistance(center.farthest)} · 直线距离`);
    const actions = el('div', null, 'map-actions');
    const place = { ...center, name: '碰面中心', note: '按最远直线距离计算' };
    actions.append(
      button('查看中心', () => showPlace(place)),
      button('查看所有出发点', () => fitPoints(state.meet.map(place => place.point))),
      button('分享方案', () => shareView(true)),
    );
    result.append(summary, actions);
  }
  renderOverlays();
}

function addMeet(place, keepPicking = false) {
  if (state.meet.some(origin => distance(origin.point, place.point) < 2)) {
    notice('这个出发点已加入。');
    return;
  }
  if (state.meet.length >= 8) {
    notice('最多添加 8 个出发点。');
    return;
  }
  state.meet.push(place);
  openPane('meet', { preservePick: keepPicking });
  refreshMeet();
  if (state.meet.length === 8) cancelPick();
}

async function findMeetingPlaces(keyword) {
  const center = meetingCenter(state.meet);
  if (!center) return;
  state.meetTask?.abort();
  const controller = new AbortController();
  state.meetTask = controller;
  state.candidates = [];
  renderOverlays();
  $('meet-results').replaceChildren();
  $('meet-feedback').textContent = `正在搜索中心周边的${keyword}…`;
  const radius = Math.round(Math.min(5000, Math.max(1000, center.farthest / 3)));
  try {
    const { places } = await searchPlaces(key(), keyword, { center: center.point, radius, signal: controller.signal });
    if (controller.signal.aborted) return;
    state.candidates = rankCandidates(state.meet, places).slice(0, 5);
    $('meet-feedback').textContent = state.candidates.length
      ? `周边 ${formatDistance(radius)} 内的候选，按最远直线距离排序。`
      : '周边没有找到候选，试试其他类别。';
    state.candidates.forEach((place, index) => {
      const { item } = rowFor(`${index + 1}. ${place.name}`, place.note, () => showPlace(place));
      item.append(el('p', `最远 ${formatDistance(place.farthest)} · 合计 ${formatDistance(place.total)}`, 'map-muted'));
      const details = el('details', null, 'map-steps');
      details.append(el('summary', '各出发点距离'));
      place.distances.forEach((meters, index) => details.append(el('p', `${state.meet[index].name} · ${formatDistance(meters)}`, 'map-muted')));
      item.append(details, placeActions(place));
      $('meet-results').append(item);
    });
    if (state.pane === 'meet' && state.candidates.length) fitPoints([center.point, ...state.candidates.map(place => place.point)]);
    renderOverlays();
  } catch (error) {
    if (!controller.signal.aborted) $('meet-feedback').textContent = error.message;
  }
}

function pointsOf(item) {
  const { type, coordinates } = item.geometry;
  const coords = type === 'Point' ? [coordinates] : type === 'Polygon' ? coordinates[0].slice(0, -1) : coordinates;
  return coords.map(([lng, lat]) => [lat, lng]);
}

function renderLibrary() {
  $('library-count').textContent = `${state.saved.length} 个图形`;
  $('export-map').disabled = !state.saved.length;
  $('library-list').replaceChildren(...state.saved.map((item, index) => {
    const { type } = item.geometry;
    const { name, note } = item.properties;
    const points = pointsOf(item);
    const measure = type === 'Point' ? coordinateText(points[0]) : type === 'Polygon' ? formatArea(polygonArea(points)) : formatDistance(lineDistance(points));
    const { item: row } = rowFor(name, note || measure, () => {
      if (type === 'Point') showPlace({ name, note, point: points[0] });
      else fitPoints(points, true);
    });
    const actions = el('div', null, 'map-actions');
    actions.append(
      button('重命名', () => nameDialog('重命名图形', name, next => saveWorkspace(state.saved.map((entry, i) =>
        i === index ? { ...entry, properties: { ...entry.properties, name: next } } : entry)))),
      button('删除', () => {
        if (saveWorkspace(state.saved.filter((_, i) => i !== index))) notice('图形已删除。');
      }, undefined, `删除${name}`),
    );
    row.append(actions);
    return row;
  }));
  if (!state.saved.length) $('library-list').append(el('li', '收藏搜索结果，或在地图上选点。', 'map-muted'));
}

function exportWorkspace() {
  const blob = new Blob([JSON.stringify(collection(state.saved), null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = '夸克地图.geojson';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importWorkspace(file) {
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('请选择 5 MB 以内的 GeoJSON 文件。');
    let raw;
    try {
      raw = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('无法读取文件，请检查 GeoJSON 格式。');
    }
    const { features, skipped } = readGeoJSON(raw);
    if (!features.length) throw new Error('文件没有可导入的点、线或无孔多边形。');
    const known = new Set(state.saved.map(item => JSON.stringify(item)));
    const unique = features.filter(item => {
      const serialized = JSON.stringify(item);
      if (known.has(serialized)) return false;
      known.add(serialized);
      return true;
    });
    if (!unique.length) {
      notice('这些图形已在收藏中。');
      return;
    }
    if (state.saved.length + unique.length > MAX_PLACES) throw new Error('导入后将超过 500 个图形，请先删减收藏或文件。');
    if (saveWorkspace([...state.saved, ...unique])) {
      const points = unique.flatMap(pointsOf);
      fitPoints(points, unique.length === 1);
      notice(`已导入 ${unique.length} 个图形${skipped ? `，跳过 ${skipped} 个不支持的图形` : ''}。`);
    }
  } catch (error) {
    notice(error.message);
  }
}

const pickHints = {
  start: '点击地图设置起点', end: '点击地图设置终点', meet: '点击地图添加出发点',
  bookmark: '点击地图选择收藏位置', line: '逐点绘制路线', distance: '逐点测量距离', area: '沿区域边缘依次选点',
};
const drawingModes = ['line', 'distance', 'area'];

function beginPick(mode) {
  if (state.pick === mode) {
    cancelPick();
    return;
  }
  if (is3D && drawingModes.includes(mode)) exit3D();
  state.drawing = [];
  state.pick = mode;
  map.closePopup();
  document.querySelector('.map-3d-popup')?.remove();
  updatePick();
}

function cancelPick() {
  if (!state.pick) return;
  state.pick = null;
  state.drawing = [];
  updatePick();
}

function updatePick() {
  const { pick, drawing } = state;
  $('pick-bar').hidden = !pick;
  $('pick-hint').textContent = pickHints[pick] ?? '';
  document.querySelector('.map-stage').classList.toggle('is-picking', Boolean(pick));
  all('[data-draw]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.draw === pick)));
  ['start', 'end'].forEach(which => $(`route-${which}`).setAttribute('aria-pressed', String(which === pick)));
  const drawingActive = drawingModes.includes(pick);
  const valid = drawing.length >= (pick === 'area' ? 3 : 2);
  $('undo-point').disabled = !drawing.length;
  $('finish-drawing').disabled = !valid;
  $('cancel-drawing').disabled = !drawingActive;
  const metric = pick === 'area' && drawing.length >= 3
    ? formatArea(polygonArea(drawing))
    : formatDistance(lineDistance(drawing));
  $('drawing-summary').textContent = drawingActive ? `${drawing.length} 个点 · ${metric}` : '选择一种绘制工具';
  renderOverlays();
}

function mapClick(point) {
  if (!validPoint(point)) return;
  const place = { name: '地图选点', point, note: coordinateText(point) };
  const { pick, drawing } = state;
  if (pick === 'start' || pick === 'end') {
    cancelPick();
    setEndpoint(pick, { ...place, name: coordinateText(point, 4) });
  } else if (pick === 'bookmark') {
    cancelPick();
    savePlace(place);
  } else if (pick === 'meet') {
    addMeet({ ...place, name: coordinateText(point, 4) }, true);
  } else if (drawingModes.includes(pick)) {
    if (drawing.length >= 2000) {
      notice('单个绘制图形最多可记录 2,000 个点。');
      return;
    }
    if (drawing.some(vertex => distance(vertex, point) < 0.1)) return;
    drawing.push(point);
    updatePick();
  } else {
    showPlace(place, { zoom: false });
  }
}

function finishDrawing() {
  const { pick, drawing } = state;
  const names = { line: '自绘路线', distance: '测距路线', area: '测量区域' };
  nameDialog('保存图形', names[pick], name => {
    const note = pick === 'area' ? formatArea(polygonArea(drawing)) : formatDistance(lineDistance(drawing));
    if (!addFeature(feature(pick === 'area' ? 'Polygon' : 'LineString', drawing, name, note))) return false;
    cancelPick();
    openPane('library');
    notice('图形已保存。');
    return true;
  });
}

function mapOverlays() {
  const shapes = [];
  const pins = [];
  function pin(place, label, color, action = () => showPlace(place)) {
    pins.push({ ...place, label, color, action });
  }
  for (const item of state.saved) {
    if (item.geometry.type === 'Point') pin({ ...item.properties, point: pointsOf(item)[0] }, '★', colors.teal);
    else shapes.push({ item, color: colors.teal });
  }
  if (state.location) pin(state.location, '●', colors.blue);
  if (state.selected) pin(state.selected, '•', colors.orange);
  if (state.pane === 'explore') state.search.forEach((place, index) => pin(place, String(index + 1), colors.blue));
  if (state.pane === 'directions') {
    if (state.endpoints.start) pin(state.endpoints.start, '起', colors.teal);
    if (state.endpoints.end) pin(state.endpoints.end, '终', '#9a3a2f');
    if (state.route) shapes.push({ item: feature('LineString', state.route.points, ''), color: colors.blue });
  }
  if (state.pane === 'meet') {
    state.meet.forEach((place, index) => pin(place, String(index + 1), colors.purple));
    const center = meetingCenter(state.meet);
    if (center) {
      pin({ name: '碰面中心', point: center.point }, '◎', colors.teal);
      state.meet.forEach(place => shapes.push({ item: feature('LineString', [center.point, place.point], ''), color: colors.purple, dash: true }));
    }
    state.candidates.forEach((place, index) => pin(place, String(index + 1), colors.orange));
  }
  if (state.drawing.length > 1) {
    const type = state.pick === 'area' && state.drawing.length >= 3 ? 'Polygon' : 'LineString';
    shapes.push({ item: feature(type, state.drawing, ''), color: colors.purple });
  }
  return { shapes, pins };
}

function renderOverlays() {
  if (!map) return;
  const { shapes, pins } = mapOverlays();
  if (is3D) {
    terrain.setOverlays(collection(shapes.map(({ item, color }) => ({ ...item, properties: { color } }))), pins);
    return;
  }
  const reference = map.getCenter().lng;
  overlay.clearLayers();
  for (const { item, color, dash } of shapes) {
    const points = unwrapPoints(pointsOf(item), reference);
    const options = { color, weight: dash ? 2 : 4, dashArray: dash ? '6 6' : null, fillOpacity: 0.24, interactive: false };
    const layer = item.geometry.type === 'Polygon' ? L.polygon(points, options) : L.polyline(points, options);
    layer.addTo(overlay);
  }
  const picking = Boolean(state.pick);
  for (const { point, label, name, color, action } of pins) {
    const content = el('span', label);
    const icon = L.divIcon({ className: 'map-marker', html: content, iconSize: [26, 26], iconAnchor: [13, 13] });
    const position = [point[0], nearestLongitude(point[1], reference)];
    const marker = L.marker(position, { icon, title: name, alt: name, interactive: !picking, keyboard: !picking }).addTo(overlay);
    marker.getElement().style.setProperty('--pin-color', color);
    if (!picking) marker.on('click', action);
  }
  for (const point of state.drawing) {
    L.circleMarker([point[0], nearestLongitude(point[1], reference)], { radius: 5, color: '#fff', weight: 2, fillColor: colors.purple,
      fillOpacity: 1, interactive: false }).addTo(overlay);
  }
}

async function shareView(includeMeet = false) {
  const { point, zoom } = view();
  const url = new URL(location.href);
  url.search = new URLSearchParams({ at: coordinateText(point, 6).replace(' ', ''), z: String(Math.round(zoom)), layer: state.layer }).toString();
  url.hash = '';
  if (includeMeet) url.searchParams.set('meet', state.meet.map(place => coordinateText(place.point, 6).replace(' ', '')).join(';'));
  try {
    await navigator.clipboard.writeText(url.href);
    notice(includeMeet ? '碰面方案链接已复制。' : '地图视图链接已复制。');
  } catch {
    $('map-dialog-title').textContent = includeMeet ? '分享碰面方案' : '分享地图视图';
    $('map-dialog-label').textContent = '复制链接';
    $('map-dialog-description').hidden = !includeMeet;
    $('map-dialog-description').textContent = '链接包含各出发点的经纬度。';
    $('map-dialog-value').value = url.href;
    $('map-dialog-value').readOnly = true;
    $('map-dialog-submit').hidden = true;
    dialogAction = null;
    $('map-dialog').showModal();
    $('map-dialog-value').select();
  }
}

function locate() {
  if (!navigator.geolocation) {
    notice('此浏览器无法获取地理位置。');
    return;
  }
  $('locate').disabled = true;
  notice('正在定位…');
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    $('locate').disabled = false;
    const point = [coords.latitude, coords.longitude];
    if (!validPoint(point)) {
      notice('当前位置超出底图覆盖范围。');
      return;
    }
    state.location = { point, name: '我的位置', note: `定位精度约 ${formatDistance(coords.accuracy)}` };
    if (state.pick) {
      moveTo(point, 16);
      mapClick(point);
    } else {
      showPlace(state.location);
    }
    notice(state.location.note);
  }, error => {
    $('locate').disabled = false;
    notice(error.code === 1 ? '位置权限未开启，可用搜索或地图选点。' : '定位暂不可用，可用搜索或地图选点。');
  }, { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true });
}
function exit3D() {
  const current = view();
  is3D = false;
  terrain.globe.remove();
  terrain = null;
  $('map-3d').hidden = true;
  $('map-3d').replaceChildren();
  $('map').hidden = false;
  $('toggle-3d').setAttribute('aria-pressed', 'false');
  $('toggle-3d').lastElementChild.textContent = '3D';
  map.invalidateSize({ pan: false });
  map.setView(current.point, Math.round(current.zoom), { animate: false });
  setLayer(state.layer);
  updateReadout();
  renderOverlays();
}

async function toggle3D() {
  if (is3D) {
    exit3D();
    return;
  }
  if (state.drawing.length) {
    notice('请先保存或取消当前绘制，再进入三维地形。');
    return;
  }
  const control = $('toggle-3d');
  control.disabled = true;
  control.lastElementChild.textContent = '载入中';
  terrainUnavailable = false;
  try {
    const { terrainViewer } = await import('./map-terrain.mjs');
    const container = $('map-3d');
    container.hidden = false;
    terrain = await terrainViewer(container, view(), updateReadout, source => {
      if (!is3D) return;
      if (source === 'webgl') {
        exit3D();
        notice('三维渲染已中断，已返回二维地图。');
      } else if (source === 'elevation' && !terrainUnavailable) {
        terrainUnavailable = true;
        notice('部分高程瓦片不可用，地形可能显示为平面。');
      } else if (source === 'tiles-0') {
        notice('部分三维底图加载失败，可切换底图或返回二维。');
      }
    });
    if (drawingModes.includes(state.pick)) {
      terrain.globe.remove();
      terrain = null;
      container.hidden = true;
      return;
    }
    terrain.globe.on('click', event => mapClick(asPoint(event.lngLat)));
    is3D = true;
    map.closePopup();
    $('map').hidden = true;
    terrain.globe.resize();
    setLayer(state.layer);
    updateReadout();
    renderOverlays();
    control.setAttribute('aria-pressed', 'true');
    notice('已进入三维地形。拖动浏览，右键拖动可旋转和倾斜。');
  } catch (error) {
    if (is3D) exit3D();
    $('map-3d').hidden = true;
    $('map-3d').replaceChildren();
    notice(error.message || '三维地形暂不可用。');
  } finally {
    control.lastElementChild.textContent = is3D ? '2D' : '3D';
    control.disabled = false;
  }
}

function zoomBy(delta) {
  if (is3D) terrain.globe.zoomTo(terrain.globe.getZoom() + delta, { duration: reducedMotion.matches ? 0 : 250 });
  else map.setZoom(map.getZoom() + delta);
}

function bind() {
  const on = (id, action) => $(id).addEventListener('click', action);
  on('panel-toggle', () => togglePanel());
  on('toggle-3d', toggle3D);
  on('share-view', () => shareView());
  on('locate', locate);
  on('zoom-in', () => zoomBy(1));
  on('zoom-out', () => zoomBy(-1));
  on('clear-search', clearSearch);
  on('route-start', () => beginPick('start'));
  on('route-end', () => beginPick('end'));
  on('swap-route', () => {
    cancelPick();
    clearRoute();
    const { start, end } = state.endpoints;
    state.endpoints = { start: end, end: start };
    updateRouteControls();
  });
  on('clear-route', () => {
    cancelPick();
    clearRoute();
    state.endpoints = { start: null, end: null };
    updateRouteControls();
  });
  on('plan-route', planRoute);
  on('pick-meet', () => beginPick('meet'));
  on('meet-center', () => {
    const point = view().point;
    addMeet({ name: coordinateText(point, 4), point }, true);
  });
  on('clear-meet', () => { cancelPick(); state.meet = []; refreshMeet(); });
  on('pick-bookmark', () => beginPick('bookmark'));
  on('import-map', () => $('import-file').click());
  on('export-map', exportWorkspace);
  on('finish-drawing', finishDrawing);
  on('undo-point', () => { state.drawing.pop(); updatePick(); });
  on('cancel-pick', cancelPick);
  on('cancel-drawing', cancelPick);
  on('map-dialog-cancel', () => $('map-dialog').close());

  for (const [selector, action] of [
    ['pane', openPane], ['open', openPane], ['layer', setLayer], ['draw', beginPick],
    ['nearby', name => search(name, view().point)], ['meet-nearby', findMeetingPlaces],
  ]) {
    all(`[data-${selector}]`).forEach(control => control.addEventListener('click', () => action(control.getAttribute(`data-${selector}`))));
  }
  $('search-form').addEventListener('submit', event => {
    event.preventDefault();
    search($('query').value.trim());
  });
  $('import-file').addEventListener('change', event => {
    importWorkspace(event.target.files[0]);
    event.target.value = '';
  });
  $('map-dialog-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('map-dialog-value').value.trim();
    if (name && dialogAction && dialogAction(name)) $('map-dialog').close();
  });
  document.addEventListener('keydown', event => {
    if ($('map-dialog').open) return;
    if (event.key === 'Escape') {
      cancelPick();
      $('layers').open = false;
      document.querySelector('.map-3d-popup')?.remove();
    }
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input, textarea, [contenteditable]')) {
      event.preventDefault();
      openPane('explore');
      $('query').focus();
    }
  });
  document.addEventListener('click', event => {
    if (!$('layers').contains(event.target)) $('layers').open = false;
  });
  map.on('click', event => mapClick(asPoint(event.latlng)));
  map.on('move', updateReadout);
  map.on('moveend', renderOverlays);
  new ResizeObserver(() => {
    if (is3D) terrain.globe.resize();
    else map.invalidateSize({ pan: false });
  }).observe(document.querySelector('.map-stage'));
}

function startMap() {
  const initialPoint = parsePoint(initial.get('at') ?? '') ?? HOME;
  const initialZoom = Math.max(2, Math.min(19, Number(initial.get('z')) || 11));
  map = L.map('map', { zoomControl: false, attributionControl: false, minZoom: 2, maxZoom: 19 })
    .setView(initialPoint, initialZoom);
  overlay = L.layerGroup().addTo(map);

  const stored = readStorage(store);
  if (stored) {
    try {
      state.saved = readGeoJSON(stored).features;
    } catch {
      notice('浏览器中的收藏数据无法读取。');
    }
  } else {
    state.saved = readLegacy(readStorage('savedMarkers'), readStorage('savedRoutes'));
  }
  $('city-list').append(...cities.map(([name, point]) => button(name, () => moveTo(point, 11))));
  bind();
  const initialLayer = initial.get('layer') ?? 'vector';
  setLayer(initialLayer);
  updateReadout();
  renderLibrary();
  const meet = (initial.get('meet') ?? '').split(';').slice(0, 8).map(value => parsePoint(value)).filter(Boolean);
  if (meet.length >= 2) {
    state.meet = meet.map(point => ({ point, name: coordinateText(point, 4) }));
    openPane('meet');
    refreshMeet();
  }
  renderOverlays();
  $('map-loading').hidden = true;
}

function initialize() {
  if (!window.L) {
    $('map-loading').textContent = '地图组件加载失败，请检查网络后刷新。';
    return;
  }
  startMap();
}

// Classic deferred dependencies can finish after the module graph.
if (document.readyState === 'complete') initialize();
else document.addEventListener('DOMContentLoaded', initialize, { once: true });
