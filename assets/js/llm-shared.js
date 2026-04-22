(() => {
  const DEFAULTS = {
    apiKey: "",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-reasoner"
  };

  const STORAGE_KEYS = {
    apiKey: "quark_llm_api_key",
    baseUrl: "quark_llm_base_url",
    model: "quark_llm_model",
    legacyApiKey: "ds_api_key"
  };

  function normalizeBaseUrl(baseUrl) {
    const trimmed = String(baseUrl || DEFAULTS.baseUrl).trim();
    return trimmed.replace(/\/+$/, "") || DEFAULTS.baseUrl;
  }

  function buildChatEndpoint(baseUrl) {
    const normalized = normalizeBaseUrl(baseUrl);
    if (/\/chat\/completions$/i.test(normalized)) {
      return normalized;
    }
    return `${normalized}/chat/completions`;
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
        `请求失败 (${response.status})`
      );
    } catch (error) {
      return text;
    }
  }

  window.QuarkLLMConfig = {
    DEFAULTS,
    STORAGE_KEYS,
    getSettings,
    saveSettings,
    maskApiKey,
    normalizeBaseUrl,
    buildChatEndpoint,
    parseErrorResponse
  };
})();
