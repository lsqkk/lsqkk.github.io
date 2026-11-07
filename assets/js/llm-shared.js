(() => {
  if (window.QuarkLLMConfig) return;
  const DEFAULTS = {
    apiKey: "",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-reasoner",
    maxTokens: 4096,
    temperature: 0.7,
    topP: 1,
    topK: 0,
    presencePenalty: 0,
    frequencyPenalty: 0,
    stop: [],
    contextWindow: 15,
    stream: true
  };

  const STORAGE_KEYS = {
    apiKey: "quark_llm_api_key",
    baseUrl: "quark_llm_base_url",
    model: "quark_llm_model",
    legacyApiKey: "ds_api_key",
    profiles: "quark_llm_profiles",
    activeProfile: "quark_llm_active_profile",
    personas: "quark_llm_personas",
    activePersona: "quark_llm_active_persona",
    darkMode: "darkMode"
  };

  const PROVIDER_PRESETS = {
    deepseek: {
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1",
      models: ["deepseek-reasoner", "deepseek-chat", "deepseek-coder"]
    },
    openai: {
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]
    },
    openrouter: {
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      models: []
    },
    groq: {
      name: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      models: ["llama2-70b-4096", "mixtral-8x7b-32768", "gemma-7b-it"]
    },
    custom: {
      name: "自定义",
      baseUrl: "",
      models: []
    }
  };

  function normalizeBaseUrl(baseUrl) {
    const trimmed = String(baseUrl || "").trim();
    if (!trimmed) return DEFAULTS.baseUrl;
    return trimmed.replace(/\/+$/, "") || DEFAULTS.baseUrl;
  }

  function buildChatEndpoint(baseUrl) {
    const url = providerUrl(baseUrl);
    if (!/\/chat\/completions$/i.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/, '') + '/chat/completions';
    return url.href;
  }

  function providerUrl(baseUrl) {
    let url;
    try { url = new URL(normalizeBaseUrl(baseUrl)); }
    catch { throw new Error('请输入完整的模型服务地址。'); }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
      throw new Error('模型服务需要 HTTPS，本机服务可以使用 HTTP。');
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error('模型服务地址不能包含凭据、查询参数或片段。');
    }
    if (url.origin === location.origin || ['api.130923.xyz', 'lsqkk.github.io'].includes(url.hostname)) {
      throw new Error('请填写模型提供商的地址。站点服务不接收 API 密钥。');
    }
    if (/\/v1\/messages\/?$/i.test(url.pathname) || url.hostname === 'api.anthropic.com') {
      throw new Error('请使用 OpenAI 兼容的 Chat Completions 地址。');
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url;
  }

  function providerFetch(url, apiKey, options = {}) {
    return fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${apiKey}` },
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });
  }

  function requestChat(settings, body, signal) {
    return providerFetch(buildChatEndpoint(settings.baseUrl), settings.apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function getSettings() {
    const apiKey =
      localStorage.getItem(STORAGE_KEYS.apiKey) ||
      localStorage.getItem(STORAGE_KEYS.legacyApiKey) ||
      DEFAULTS.apiKey;
    const baseUrl =
      localStorage.getItem(STORAGE_KEYS.baseUrl) || DEFAULTS.baseUrl;
    const model =
      localStorage.getItem(STORAGE_KEYS.model) || DEFAULTS.model;

    return {
      apiKey: String(apiKey || "").trim(),
      baseUrl: normalizeBaseUrl(baseUrl),
      model: String(model || DEFAULTS.model).trim() || DEFAULTS.model
    };
  }

  function saveSettings(nextSettings = {}) {
    const merged = {
      ...getSettings(),
      ...nextSettings
    };

    const apiKey = String(merged.apiKey || "").trim();
    const baseUrl = normalizeBaseUrl(merged.baseUrl);
    const model = String(merged.model || DEFAULTS.model).trim() || DEFAULTS.model;
    buildChatEndpoint(baseUrl);

    if (apiKey) {
      localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
      localStorage.setItem(STORAGE_KEYS.legacyApiKey, apiKey);
    } else {
      localStorage.removeItem(STORAGE_KEYS.apiKey);
      localStorage.removeItem(STORAGE_KEYS.legacyApiKey);
    }
    localStorage.setItem(STORAGE_KEYS.baseUrl, baseUrl);
    localStorage.setItem(STORAGE_KEYS.model, model);
    window.dispatchEvent(new Event('quark-llm-updated'));

    return { apiKey, baseUrl, model };
  }

  function maskApiKey(apiKey) {
    const key = String(apiKey || "").trim();
    if (!key) return "(未设置)";
    if (key.length <= 8) return "••••";
    return `${key.slice(0, 4)}***${key.slice(-4)}`;
  }

  function clearCredentials() {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
    localStorage.removeItem(STORAGE_KEYS.legacyApiKey);
    saveProfiles(getProfiles().map(({ apiKey, searchApiKey, ...profile }) => profile));
    for (const key of ['quark_llm_params', 'commandHistory']) {
      try {
        const value = JSON.parse(localStorage.getItem(key));
        if (key === 'quark_llm_params' && value) {
          delete value.searchApiKey;
          localStorage.setItem(key, JSON.stringify(value));
        }
        if (key === 'commandHistory' && Array.isArray(value)) {
          localStorage.setItem(key, JSON.stringify(value.filter((command) => !/^\s*!?llm-key\b/i.test(command))));
        }
      } catch {}
    }
    window.dispatchEvent(new Event('quark-llm-updated'));
  }

  async function parseErrorResponse(response, apiKey = '') {
    const text = await response.text();
    if (!text) {
      return `请求失败 (${response.status})`;
    }
    try {
      const data = JSON.parse(text);
      const message = (
        data?.error?.message ||
        data?.message ||
        data?.error ||
        `请求失败 (${response.status})`
      );
      return redactError(message, apiKey);
    } catch (error) {
      return redactError(text, apiKey);
    }
  }

  function redactError(message, apiKey) {
    const text = typeof message === 'string' ? message : '模型服务返回错误。';
    return (apiKey ? text.replaceAll(apiKey, '[已隐藏]') : text).slice(0, 500);
  }

  // ===== Profile Management =====

  function getProfiles() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.profiles)) || [];
    } catch {
      return [];
    }
  }

  function saveProfiles(profiles) {
    localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles));
  }

  function getActiveProfile() {
    const profiles = getProfiles();
    const activeId = localStorage.getItem(STORAGE_KEYS.activeProfile);
    return profiles.find(p => p.id === activeId) || null;
  }

  function setActiveProfile(profileId) {
    const profile = getProfiles().find(p => p.id === profileId);
    if (profile) {
      saveSettings({
        apiKey: profile.apiKey,
        baseUrl: profile.baseUrl,
        model: profile.model
      });
      localStorage.setItem(STORAGE_KEYS.activeProfile, profileId);
    }
  }

  function addProfile(profile) {
    const profiles = getProfiles();
    const newProfile = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      ...DEFAULTS,
      ...profile
    };
    profiles.push(newProfile);
    saveProfiles(profiles);
    return newProfile;
  }

  function updateProfile(profileId, updates) {
    const profiles = getProfiles();
    const idx = profiles.findIndex(p => p.id === profileId);
    if (idx === -1) return null;
    profiles[idx] = { ...profiles[idx], ...updates, updatedAt: new Date().toISOString() };
    saveProfiles(profiles);
    return profiles[idx];
  }

  function deleteProfile(profileId) {
    let profiles = getProfiles();
    profiles = profiles.filter(p => p.id !== profileId);
    saveProfiles(profiles);
    if (localStorage.getItem(STORAGE_KEYS.activeProfile) === profileId) {
      localStorage.removeItem(STORAGE_KEYS.activeProfile);
    }
  }

  // ===== Persona Management =====

  function getPersonas() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.personas)) || [];
    } catch {
      return [];
    }
  }

  function savePersonas(personas) {
    localStorage.setItem(STORAGE_KEYS.personas, JSON.stringify(personas));
  }

  function getActivePersona() {
    const personas = getPersonas();
    const activeId = localStorage.getItem(STORAGE_KEYS.activePersona);
    return personas.find(p => p.id === activeId) || null;
  }

  function setActivePersona(personaId) {
    if (personaId) {
      localStorage.setItem(STORAGE_KEYS.activePersona, personaId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.activePersona);
    }
  }

  function addPersona(persona) {
    const personas = getPersonas();
    const newPersona = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...persona
    };
    personas.push(newPersona);
    savePersonas(personas);
    return newPersona;
  }

  function updatePersona(personaId, updates) {
    const personas = getPersonas();
    const idx = personas.findIndex(p => p.id === personaId);
    if (idx === -1) return null;
    personas[idx] = { ...personas[idx], ...updates, updatedAt: new Date().toISOString() };
    savePersonas(personas);
    return personas[idx];
  }

  function deletePersona(personaId) {
    let personas = getPersonas();
    personas = personas.filter(p => p.id !== personaId);
    savePersonas(personas);
    if (localStorage.getItem(STORAGE_KEYS.activePersona) === personaId) {
      localStorage.removeItem(STORAGE_KEYS.activePersona);
    }
  }

  function exportPersona(persona) {
    const blob = new Blob([persona.systemPrompt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${persona.name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== API Helpers =====

  async function testConnection(baseUrl, apiKey, model) {
    const testModel = model || "deepseek-reasoner";
    try {
      const response = await requestChat({ baseUrl, apiKey }, {
          model: testModel,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
          stream: false
      }, AbortSignal.timeout(20000));
      if (response.ok) return { ok: true, status: response.status };
      const errMsg = await parseErrorResponse(response, apiKey);
      return { ok: false, status: response.status, error: errMsg };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function fetchModelList(baseUrl, apiKey) {
    try {
      const url = providerUrl(baseUrl);
      url.pathname = url.pathname.replace(/\/chat\/completions$/i, '').replace(/\/$/, '') + '/models';
      const response = await providerFetch(url, apiKey, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) {
        const errMsg = await parseErrorResponse(response, apiKey);
        return { ok: false, error: errMsg };
      }
      const data = await response.json();
      const models = (data?.data || [])
        .map(m => m.id || m)
        .filter(Boolean)
        .sort();
      return { ok: true, models };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  window.QuarkLLMConfig = {
    DEFAULTS,
    STORAGE_KEYS,
    PROVIDER_PRESETS,
    getSettings,
    saveSettings,
    clearCredentials,
    maskApiKey,
    normalizeBaseUrl,
    buildChatEndpoint,
    requestChat,
    parseErrorResponse,
    generateId,
    getProfiles,
    saveProfiles,
    getActiveProfile,
    setActiveProfile,
    addProfile,
    updateProfile,
    deleteProfile,
    getPersonas,
    savePersonas,
    getActivePersona,
    setActivePersona,
    addPersona,
    updatePersona,
    deletePersona,
    exportPersona,
    testConnection,
    fetchModelList
  };
})();
