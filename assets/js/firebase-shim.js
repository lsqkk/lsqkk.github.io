// Firebase RTDB shim -> /api/db (non-realtime proxy)
// Provides a minimal subset of firebase.database() used by the site.
(function () {
  if (window.firebase && window.firebase.database) return;

  const API_BASE = '__API_BASE__';
  const POLL_INTERVAL = 15000;

  class Snapshot {
    constructor(value, key = null) {
      this._value = value;
      this.key = key;
    }
    val() {
      return this._value;
    }
    forEach(cb) {
      const value = this._value;
      if (!value || typeof value !== 'object') return false;
      return Object.keys(value).some((k) => cb(new Snapshot(value[k], k)) === true);
    }
  }

  class Ref {
    constructor(path, query = {}) {
      this._path = path.replace(/^\/+/, '');
      this._query = query;
      this._listeners = [];
    }
    child(sub) {
      const next = `${this._path}/${String(sub).replace(/^\/+/, '')}`;
      return new Ref(next, this._query);
    }
    orderByChild(key) {
      return new Ref(this._path, { ...this._query, orderByChild: key });
    }
    limitToLast(count) {
      return new Ref(this._path, { ...this._query, limitToLast: String(count) });
    }
    limitToFirst(count) {
      return new Ref(this._path, { ...this._query, limitToFirst: String(count) });
    }
    equalTo(value) {
      return new Ref(this._path, { ...this._query, equalTo: value });
    }
    startAt(value) {
      return new Ref(this._path, { ...this._query, startAt: value });
    }
    endAt(value) {
      return new Ref(this._path, { ...this._query, endAt: value });
    }
    async once() {
      const data = await fetchDb('get', this._path, { query: this._query });
      return new Snapshot(data, this._path.split('/').pop() || null);
    }
    async set(value) {
      await fetchDb('set', this._path, { value });
    }
    async update(value) {
      await fetchDb('update', this._path, { value });
    }
    async remove() {
      await fetchDb('remove', this._path, {});
    }
    push(value) {
      return fetchDb('push', this._path, { value }).then((payload) => {
        const key = payload && payload.key ? payload.key : '';
        return new Ref(`${this._path}/${key}`, this._query);
      });
    }
    async transaction(updater) {
      if (typeof updater !== 'function') return;
      const snap = await this.once();
      const current = snap.val();
      const next = updater(current);
      if (typeof next === 'undefined') return;
      await this.set(next);
    }
    on(event, callback) {
      if (event !== 'value' || typeof callback !== 'function') return;
      let stopped = false;
      const tick = async () => {
        if (stopped) return;
        try {
          const snap = await this.once();
          callback(snap);
        } catch {
          // ignore
        }
        if (!stopped) {
          window.setTimeout(tick, POLL_INTERVAL);
        }
      };
      const stop = () => { stopped = true; };
      this._listeners.push({ callback, stop });
      void tick();
      return callback;
    }
    off(event, callback) {
      if (event && event !== 'value') return;
      this._listeners = this._listeners.filter((item) => {
        if (callback && item.callback !== callback) return true;
        item.stop();
        return false;
      });
    }
  }

  async function fetchDb(op, path, payload = {}) {
    if (op === 'get') {
      const params = new URLSearchParams({ path });
      const query = payload.query || {};
      Object.keys(query).forEach((key) => {
        const value = query[key];
        if (typeof value !== 'undefined' && value !== null && value !== '') {
          params.set(key, String(value));
        }
      });
      const resp = await fetch(`${API_BASE}/api/db?${params.toString()}`, { credentials: 'omit' });
      if (!resp.ok) throw new Error(`DB GET ${resp.status}`);
      const data = await resp.json();
      return data && data.data ? data.data : null;
    }
    const resp = await fetch(`${API_BASE}/api/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ op, path, ...payload })
    });
    if (!resp.ok) throw new Error(`DB ${op} ${resp.status}`);
    const data = await resp.json();
    return data || {};
  }

  window.firebase = {
    apps: [],
    initializeApp(config) {
      if (!this.apps.length) {
        this.apps.push({ options: config || {} });
      }
      return this.apps[0];
    },
    database() {
      return {
        ref(path) {
          return new Ref(path);
        }
      };
    }
  };
})();
