(() => {
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
    anthropic: {
      name: "Anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      models: ["claude-opus-4-20250509", "claude-sonnet-4-20250509"]
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
    const normalized = normalizeBaseUrl(baseUrl);
    if (/\/chat\/completions$/i.test(normalized)) {
      return normalized;
    }
    if (/\/v1\/messages$/i.test(normalized)) {
      return normalized;
    }
    return `${normalized}/chat/completions`;
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

    if (apiKey) {
      localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
      localStorage.setItem(STORAGE_KEYS.legacyApiKey, apiKey);
    } else {
      localStorage.removeItem(STORAGE_KEYS.apiKey);
      localStorage.removeItem(STORAGE_KEYS.legacyApiKey);
    }
    localStorage.setItem(STORAGE_KEYS.baseUrl, baseUrl);
    localStorage.setItem(STORAGE_KEYS.model, model);

    return { apiKey, baseUrl, model };
  }

  function maskApiKey(apiKey) {
    const key = String(apiKey || "").trim();
    if (!key) return "(未设置)";
    if (key.length <= 8) return `${key.slice(0, 2)}***${key.slice(-2)}`;
    return `${key.slice(0, 4)}***${key.slice(-4)}`;
  }

  async function parseErrorResponse(response) {
    const text = await response.text();
    if (!text) {
      return `请求失败 (${response.status})`;
    }
    try {
      const data = JSON.parse(text);
      return (
        data?.error?.message ||
        data?.message ||
        data?.error ||
        `请求失败 (${response.status})`
      );
    } catch (error) {
      return text || `请求失败 (${response.status})`;
    }
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
    localStorage.setItem(STORAGE_KEYS.activeProfile, profileId);
    const profile = getProfiles().find(p => p.id === profileId);
    if (profile) {
      saveSettings({
        apiKey: profile.apiKey,
        baseUrl: profile.baseUrl,
        model: profile.model
      });
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
    const url = buildChatEndpoint(baseUrl);
    const testModel = model || "deepseek-reasoner";
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
          stream: false
        })
      });
      if (response.ok) return { ok: true, status: response.status };
      const errMsg = await parseErrorResponse(response);
      return { ok: false, status: response.status, error: errMsg };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function fetchModelList(baseUrl, apiKey) {
    const normalized = normalizeBaseUrl(baseUrl);
    const modelsUrl = normalized.includes('/v1/')
      ? `${normalized}/models`
      : `${normalized}/models`;

    try {
      const response = await fetch(modelsUrl, {
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });
      if (!response.ok) {
        const errMsg = await parseErrorResponse(response);
        return { ok: false, error: errMsg };
      }
      const data = await response.json();
      const models = (data?.data || [])
        .map(m => m.id || m)
        .filter(Boolean)
        .sort();
      return { ok: true, models };
    } catch (err) {
      const fallbackUrl = normalized.replace(/\/v1$/, '') + '/models';
      try {
        const response = await fetch(fallbackUrl, {
          headers: { "Authorization": `Bearer ${apiKey}` }
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        const models = (data?.data || [])
          .map(m => m.id || m)
          .filter(Boolean)
          .sort();
        return { ok: true, models };
      } catch {
        return { ok: false, error: err.message };
      }
    }
  }

  window.QuarkLLMConfig = {
    DEFAULTS,
    STORAGE_KEYS,
    PROVIDER_PRESETS,
    getSettings,
    saveSettings,
    maskApiKey,
    normalizeBaseUrl,
    buildChatEndpoint,
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
