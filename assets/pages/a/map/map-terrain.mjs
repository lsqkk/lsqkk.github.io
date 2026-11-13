import { basemaps, elevationTiles, osmCredit, osmTiles, terrainCredit, tiandituCredit, tileUrl } from './map-data.mjs';

const CDN = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.1/dist/';
let loading;

function loadLibrary() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  loading ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = CDN + 'maplibre-gl.css';
    const script = document.createElement('script');
    script.src = CDN + 'maplibre-gl.js';
    const timeout = setTimeout(() => fail(), 12000);
    function fail() {
      clearTimeout(timeout);
      script.remove();
      css.remove();
      loading = undefined;
      reject(new Error('三维组件加载失败，请稍后重试。'));
    }
    const ready = () => {
      if (window.maplibregl && css.sheet) {
        clearTimeout(timeout);
        resolve(window.maplibregl);
      }
    };
    script.onload = css.onload = ready;
    script.onerror = css.onerror = fail;
    document.head.append(css, script);
  });
  return loading;
}

export async function terrainViewer(container, view, onMove, onError) {
  const lib = await loadLibrary();
  if (!lib.supported?.() && lib.supported) throw new Error('当前浏览器的 WebGL 无法使用。');
  const { point, zoom } = view;
  const globe = new lib.Map({
    container,
    style: { version: 8, sources: {}, layers: [] },
    center: [point[1], point[0]],
    zoom: zoom - 1,
    minZoom: 0,
    maxZoom: 18,
    pitch: 58,
    maxPitch: 75,
    attributionControl: false,
    renderWorldCopies: false,
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error('三维地图启动超时。')), 10000);
      const loaded = () => finish();
      const failed = () => finish(new Error('当前设备无法启动三维地图。'));
      function finish(error) {
        clearTimeout(timeout);
        globe.off('load', loaded);
        globe.off('error', failed);
        if (error) reject(error);
        else resolve();
      }
      globe.once('load', loaded);
      globe.once('error', failed);
    });
  } catch (error) {
    globe.remove();
    throw error;
  }
  globe.addSource('elevation', {
    type: 'raster-dem', tiles: [elevationTiles], encoding: 'terrarium', tileSize: 256, maxzoom: 15,
  });
  globe.addSource('drawings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  globe.addLayer({ id: 'areas', type: 'fill', source: 'drawings', filter: ['==', '$type', 'Polygon'],
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.24 } });
  globe.addLayer({ id: 'lines', type: 'line', source: 'drawings',
    paint: { 'line-color': ['get', 'color'], 'line-width': 4 },
    layout: { 'line-join': 'round', 'line-cap': 'round' } });
  globe.setTerrain({ source: 'elevation', exaggeration: 1.2 });
  globe.on('move', onMove);
  globe.on('error', event => onError(event.sourceId));
  globe.getCanvas().addEventListener('webglcontextlost', () => onError('webgl'));
  let markers = [];

  return {
    globe,
    setBasemap(id, key) {
      const ids = basemaps[id].layers ?? ['osm'];
      for (let i = 0; i < 2; i++) {
        if (globe.getLayer(`tiles-${i}`)) globe.removeLayer(`tiles-${i}`);
        if (globe.getSource(`tiles-${i}`)) globe.removeSource(`tiles-${i}`);
      }
      ids.forEach((layer, index) => {
        const name = `tiles-${index}`;
        const tiles = layer === 'osm' ? [osmTiles] : [0, 1, 2, 3].map(server => tileUrl(layer, key).replace('{s}', String(server)));
        globe.addSource(name, { type: 'raster', tiles, tileSize: 256, maxzoom: layer === 'osm' ? 19 : 18 });
        globe.addLayer({ id: name, type: 'raster', source: name }, 'areas');
      });
      return `${id === 'osm' ? osmCredit : tiandituCredit} · ${terrainCredit}`;
    },
    setOverlays(data, pins) {
      globe.getSource('drawings').setData(data);
      markers.forEach(marker => marker.remove());
      markers = pins.map(pin => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'map-marker-3d';
        el.textContent = pin.label;
        el.title = pin.name;
        el.style.setProperty('--pin-color', pin.color);
        el.onclick = event => {
          event.stopPropagation();
          pin.action?.();
        };
        return new lib.Marker({ element: el }).setLngLat([pin.point[1], pin.point[0]]).addTo(globe);
      });
    },
  };
}
