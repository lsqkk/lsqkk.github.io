export const HOME = [39.9042, 116.4074];
export const MAX_PLACES = 500;
export const MAX_VERTICES = 50000;
const EARTH_RADIUS = 6371008.8;
const RAD = Math.PI / 180;

export const basemaps = {
  vector: { name: '标准地图', layers: ['vec', 'cva'] },
  satellite: { name: '卫星影像', layers: ['img', 'cia'] },
  terrain: { name: '地形底图', layers: ['ter', 'cta'] },
  osm: { name: '开放地图' },
};
export const osmTiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const elevationTiles = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const tiandituCredit = '<a href="https://www.tianditu.gov.cn/">天地图</a>';
export const osmCredit = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const terrainCredit = '<a href="https://registry.opendata.aws/terrain-tiles/">Mapzen 高程</a>';
export const subdomains = '01234567';

export function tileUrl(layer, key, row = '{y}', col = '{x}') {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW=${row}&TILECOL=${col}&FORMAT=tiles&tk=${encodeURIComponent(key)}`;
}

export function validPoint(point) {
  return Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) &&
    Number.isFinite(point[1]) && Math.abs(point[0]) <= 85.051129 && Math.abs(point[1]) <= 180;
}

export function parsePoint(text, longitudeFirst = false) {
  const fields = text.trim().split(/\s*[,，]\s*|\s+/);
  if (fields.length !== 2 || fields.some(value => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))) return null;
  const point = fields.map(Number);
  if (longitudeFirst) point.reverse();
  return validPoint(point) ? point : null;
}

export function coordinateText(point, digits = 5) {
  return point.map(value => value.toFixed(digits)).join(', ');
}

function vector([lat, lng]) {
  return [Math.cos(lat * RAD) * Math.cos(lng * RAD), Math.cos(lat * RAD) * Math.sin(lng * RAD), Math.sin(lat * RAD)];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function angle(a, b) {
  return Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));
}

export function distance(a, b) {
  return EARTH_RADIUS * angle(vector(a), vector(b));
}

export function lineDistance(points) {
  return points.slice(1).reduce((total, point, index) => total + distance(points[index], point), 0);
}

export function polygonArea(points) {
  if (points.length < 3) return 0;
  const [first, ...vertices] = points.map(vector);
  const steradians = vertices.slice(1).reduce((area, next, index) => {
    const current = vertices[index];
    const numerator = dot(first, cross(current, next));
    const denominator = 1 + dot(first, current) + dot(current, next) + dot(next, first);
    return area + 2 * Math.atan2(numerator, denominator);
  }, 0);
  const normalized = Math.abs(steradians) % (4 * Math.PI);
  return Math.min(normalized, 4 * Math.PI - normalized) * EARTH_RADIUS ** 2;
}

export function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1)} 公里` : `${Math.round(meters)} 米`;
}

export function formatArea(area) {
  return area >= 1e6 ? `${(area / 1e6).toFixed(2)} 平方公里` : `${Math.round(area).toLocaleString('zh-CN')} 平方米`;
}

export function rankCandidates(origins, places) {
  return places.map(place => {
    const distances = origins.map(origin => distance(origin.point, place.point));
    return { ...place, distances, farthest: Math.max(...distances), total: distances.reduce((a, b) => a + b, 0) };
  }).sort((a, b) => a.farthest - b.farthest || a.total - b.total);
}

export function meetingCenter(origins) {
  if (origins.length < 2) return null;
  const vectors = origins.map(origin => vector(origin.point));
  const candidates = origins.map(origin => ({ point: origin.point }));
  // A smallest enclosing spherical cap is supported by up to three boundary points.
  function addCandidate(v) {
    if (Math.hypot(...v) < 1e-12) return;
    const [x, y, z] = v;
    const point = [Math.atan2(z, Math.hypot(x, y)) / RAD, Math.atan2(y, x) / RAD];
    point[0] = Math.max(-85.051129, Math.min(85.051129, point[0]));
    candidates.push({ point });
  }
  for (const [i, a] of vectors.entries()) {
    for (const [j, b] of vectors.entries()) {
      if (j <= i) continue;
      const sum = a.map((value, axis) => value + b[axis]);
      addCandidate(sum);
      addCandidate(sum.map(value => -value));
      if (Math.hypot(...sum) < 1e-12) {
        const perpendicular = cross(a, Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
        addCandidate(perpendicular);
        addCandidate(perpendicular.map(value => -value));
      }
      for (const c of vectors.slice(j + 1)) {
        const normal = cross(a.map((value, axis) => value - b[axis]), a.map((value, axis) => value - c[axis]));
        addCandidate(normal);
        addCandidate(normal.map(value => -value));
      }
    }
  }
  return rankCandidates(origins, candidates)[0];
}

const reverse = ([lat, lng]) => [lng, lat];
const cleanLabel = (value, fallback) => typeof value === 'string' ? value.trim().slice(0, 100) || fallback : fallback;

export function feature(type, points, name, note = '') {
  const coords = points.map(reverse);
  const geometry = { type, coordinates: coords };
  if (type === 'Point') geometry.coordinates = coords[0];
  if (type === 'Polygon') geometry.coordinates = [[...coords, coords[0]]];
  return { type: 'Feature', geometry, properties: { name, note } };
}

export function collection(features) {
  return { type: 'FeatureCollection', features };
}

export function readGeoJSON(raw) {
  const items = raw?.type === 'FeatureCollection' ? raw.features : [raw];
  if (!Array.isArray(items) || items.length > MAX_PLACES) throw new Error('最多可导入 500 个图形。');
  let skipped = 0;
  let vertices = 0;
  const features = [];
  for (const item of items) {
    const { geometry, properties } = item?.type === 'Feature' ? item : { geometry: item };
    const { type, coordinates } = geometry ?? {};
    const min = { Point: 1, LineString: 2, Polygon: 4 }[type];
    const coords = type === 'Point' ? [coordinates] : type === 'Polygon' && coordinates?.length === 1 ? coordinates[0] : coordinates;
    const valid = Number.isInteger(min) && Array.isArray(coords) && coords.length >= min &&
      (type !== 'Polygon' || coordinates.length === 1) && coords.every(coord => Array.isArray(coord) && validPoint(reverse(coord)));
    if (!valid || (type === 'Polygon' && coords[0].slice(0, 2).some((value, index) => value !== coords.at(-1)[index]))) {
      skipped++;
      continue;
    }
    vertices += coords.length;
    if (vertices > MAX_VERTICES) throw new Error('文件中的坐标点过多。');
    const points = (type === 'Polygon' ? coords.slice(0, -1) : coords).map(reverse);
    const fallback = { Point: '导入地点', LineString: '导入路线', Polygon: '导入区域' }[type];
    features.push(feature(type, points, cleanLabel(properties?.name, fallback), cleanLabel(properties?.note, '')));
  }
  return { features, skipped };
}

export function readLegacy(markers, routes) {
  const points = (Array.isArray(markers) ? markers : []).filter(item => validPoint(item?.latlng))
    .map(item => feature('Point', [item.latlng], cleanLabel(item.name, '收藏地点')));
  const lines = (Array.isArray(routes) ? routes : []).flatMap((item, index) => {
    const path = item?.latlngs ?? item?.points;
    const name = cleanLabel(item?.name, `路线 ${index + 1}`);
    if (Array.isArray(path) && path.length >= 2 && path.every(validPoint)) return [feature('LineString', path, name)];
    return validPoint(item?.center) ? [feature('Point', [item.center], name, '旧版路线中心')] : [];
  });
  return [...points, ...lines].slice(0, MAX_PLACES);
}

async function request(path, type, params, key, signal) {
  if (!key) throw new Error('天地图服务尚未连接，请刷新后重试。');
  const query = new URLSearchParams({ type, postStr: JSON.stringify(params), tk: key });
  try {
    const signals = [AbortSignal.timeout(12000)];
    if (signal) signals.push(signal);
    const response = await fetch(`https://api.tianditu.gov.cn/${path}?${query}`, { signal: AbortSignal.any(signals) });
    if (!response.ok) throw new Error();
    return await response.text();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('天地图服务暂时不可用，请稍后重试。');
  }
}

export async function searchPlaces(key, keyword, { center, radius = 3000, signal } = {}) {
  const params = { keyWord: keyword, level: center ? 14 : 12, start: 0, count: 15 };
  Object.assign(params, center
    ? { queryType: 3, queryRadius: radius, pointLonlat: reverse(center).join(',') }
    : { queryType: 1, mapBound: '-180,-85,180,85' });
  const body = await request('v2/search', 'query', params, key, signal);
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error('天地图返回了无法读取的检索结果。');
  }
  if (Number(payload?.status?.infocode) !== 1000) throw new Error('天地图检索失败，请稍后重试。');
  const records = Array.isArray(payload.pois) ? payload.pois : [];
  const suggestions = (Array.isArray(payload.prompt) ? payload.prompt : []).flatMap(item => item.admins ?? [])
    .map(item => item?.adminName).filter(name => typeof name === 'string' && name);
  const places = records.flatMap(item => {
    const point = typeof item?.lonlat === 'string' && parsePoint(item.lonlat, true);
    return point && item.name ? [{ point, name: cleanLabel(item.name, '地点'), note: cleanLabel(item.address, '') }] : [];
  });
  return { places, suggestions: [...new Set(suggestions)].slice(0, 6) };
}

export async function drivingRoute(key, start, end, signal) {
  const xml = await request('drive', 'search', { orig: reverse(start).join(','), dest: reverse(end).join(','), style: '0' }, key, signal);
  const root = new DOMParser().parseFromString(xml, 'text/xml');
  const value = selector => root.querySelector(selector)?.textContent?.trim();
  const points = (value('routelatlon') ?? '').split(';').map(point => parsePoint(point, true)).filter(Boolean);
  if (points.length < 2) throw new Error('未找到驾车路线，请尝试调整起终点。');
  const steps = [...root.querySelectorAll('routes > item > strguide')].map(node => node.textContent.trim()).filter(Boolean);
  return { points, meters: Number(value('distance')) * 1000 || lineDistance(points), seconds: Number(value('duration')) || 0, steps };
}
