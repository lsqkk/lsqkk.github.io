const C = window.QuarkLLMConfig;
const CONTEXT_LIMIT = 15;
const AI_SEARCH_PROXY = "https://api.130923.xyz/api/stream-proxy";

let currentChatId = null;
let currentAttachments = [];
let currentPersonaId = null;
let currentAbortController = null;
let isGenerating = false;
let currentCmdIndex = -1;

// ===== Init =====

window.onload = () => { initApp(); };

function initApp() {
  setupEventListeners();
  loadSettingsIntoUI();
  loadHistoryList();
  updateHeaderBadges();
  showEmptyState();

  if (localStorage.getItem(C.STORAGE_KEYS.darkMode) === 'true') {
    document.body.classList.add('dark-mode');
  }

  setupSliders();
  renderProfilesList();
  renderPersonaList();
  renderCategoryChips();
  renderTemplatesList();
  initCommandSystem();
  initMobileSidebar();

  // Initialize Mermaid once globally
  if (typeof mermaid !== 'undefined') {
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: document.body.classList.contains('dark-mode') ? 'dark' : 'default',
        securityLevel: 'loose'
      });
    } catch (e) {}
  }
}

function setupEventListeners() {
  // Buttons
  byId('new-chat-btn').onclick = createNewChat;
  byId('sidebar-toggle').onclick = toggleSidebar;
  byId('theme-toggle').onclick = toggleTheme;
  byId('settings-btn').onclick = () => {
    toggleModal('settings-modal', true);
    updateGlobalTokenStats();
  };
  byId('close-settings').onclick = () => toggleModal('settings-modal', false);
  byId('cancel-settings').onclick = () => toggleModal('settings-modal', false);
  byId('save-settings').onclick = saveSettingsFromUI;
  byId('send-btn').onclick = sendMessage;
  byId('file-btn').onclick = () => byId('file-input').click();
  byId('file-input').onchange = handleFileSelect;
  byId('test-connection-btn').onclick = testConnection;
  byId('fetch-models-btn').onclick = fetchModels;
  byId('save-profile-btn').onclick = saveCurrentAsProfile;
  byId('load-defaults-btn').onclick = loadDefaultSettings;

  // Persona
  byId('persona-btn').onclick = openPersonaModal;
  byId('close-persona').onclick = closePersonaModal;
  byId('new-persona-btn').onclick = createNewPersona;
  byId('save-persona-btn').onclick = saveCurrentPersona;
  byId('apply-persona-btn').onclick = applyPersona;
  byId('delete-persona-btn').onclick = deletePersona;
  byId('export-persona-btn').onclick = exportPersona;
  byId('clear-persona-btn').onclick = clearPersona;
  byId('persona-import-input').onchange = importPersonaFile;

  // Settings tabs
  document.querySelectorAll('#settings-tabs .tab-btn').forEach(btn => {
    btn.onclick = () => switchSettingsTab(btn.dataset.tab);
  });

  // User input
  const userInput = byId('user-input');
  userInput.oninput = function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    handleCommandAutocomplete(this);
  };
  userInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    } else if (e.key === 'Tab') {
      const autocomplete = byId('cmd-autocomplete');
      if (autocomplete.style.display !== 'none') {
        e.preventDefault();
        selectCommandSuggestion();
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const autocomplete = byId('cmd-autocomplete');
      if (autocomplete.style.display !== 'none') {
        e.preventDefault();
        navigateCommandList(e.key === 'ArrowDown' ? 1 : -1);
      }
    } else if (e.key === 'Escape') {
      byId('cmd-autocomplete').style.display = 'none';
    }
  };

  // Provider select -> auto-fill base URL
  byId('provider-select').onchange = onProviderChange;

  // API key visibility toggle
  byId('toggle-key-visibility').onclick = toggleKeyVisibility;

  // Close modals on overlay click
  document.querySelectorAll('.modal').forEach(m => {
    m.onclick = (e) => { if (e.target === m) m.classList.remove('show'); };
  });

  // Chat title rename (double-click)
  byId('chat-title').ondblclick = startRenameChat;

  // Web search toggle -> show/hide API fields
  byId('web-search-toggle').onchange = function () {
    const visible = this.checked;
    byId('search-api-url').closest('.input-group').style.display = visible ? 'block' : 'none';
    byId('search-api-key').closest('.input-group').style.display = visible ? 'block' : 'none';
  };
  // Initial state
  if (!byId('web-search-toggle').checked) {
    byId('search-api-url').closest('.input-group').style.display = 'none';
    byId('search-api-key').closest('.input-group').style.display = 'none';
  }

  // Infinite context toggle -> show/hide context window input
  byId('infinite-context-toggle').onchange = function () {
    const visible = !this.checked;
    byId('context-window-input').closest('.input-group').style.display = visible ? 'block' : 'none';
  };
  // Initial state
  if (byId('infinite-context-toggle').checked) {
    byId('context-window-input').closest('.input-group').style.display = 'none';
  }

  // Export / Import
  byId('export-chats-btn').onclick = exportChats;
  byId('import-chats-btn').onclick = () => byId('import-chats-input').click();
  byId('import-chats-input').onchange = (e) => {
    if (e.target.files[0]) importChats(e.target.files[0]);
    e.target.value = '';
  };

  // Search
  byId('search-input').oninput = function () {
    byId('search-clear-btn').style.display = this.value ? 'flex' : 'none';
    loadHistoryList();
  };
  byId('search-clear-btn').onclick = clearSearch;

  // Stop generation
  byId('stop-btn').onclick = stopGeneration;

  // Templates
  byId('templates-btn').onclick = openTemplatesModal;
  byId('close-templates').onclick = () => toggleModal('templates-modal', false);
  byId('new-template-btn').onclick = createNewTemplate;
  byId('save-template-btn').onclick = saveCurrentTemplate;
  byId('apply-template-btn').onclick = applyTemplateFromEditor;
  byId('delete-template-btn').onclick = deleteTemplate;

  // Starred
  byId('starred-btn').onclick = openStarredModal;
  byId('close-starred').onclick = () => toggleModal('starred-modal', false);

  // Categories
  byId('manage-categories-btn').onclick = openCategoriesModal;
  byId('close-categories').onclick = () => toggleModal('categories-modal', false);
  byId('add-category-btn').onclick = addCategory;

  // Note modal
  byId('close-note-modal').onclick = () => toggleModal('note-modal', false);
  byId('save-note-btn').onclick = saveNote;

  // Template quick button
  byId('template-quick-btn').onclick = () => openTemplatesModal();
}

function byId(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }

// ===== Sidebar & Theme =====

function toggleSidebar() {
  byId('sidebar').classList.toggle('collapsed');
}

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem(C.STORAGE_KEYS.darkMode, document.body.classList.contains('dark-mode'));
}

// ===== Modal =====

function toggleModal(id, show) {
  byId(id).classList.toggle('show', show);
}

// ===== Settings Tabs =====

function switchSettingsTab(tabName) {
  qsa('#settings-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  qsa('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab-${tabName}`));
}

// ===== Sliders =====

function setupSliders() {
  ['temperature', 'top-p', 'top-k', 'presence-penalty', 'frequency-penalty'].forEach(name => {
    const input = byId(`${name}-input`);
    const display = byId(`${name}-value`);
    if (input && display) {
      input.oninput = () => { display.textContent = input.value; };
    }
  });
}

// ===== Provider =====

function onProviderChange() {
  const provider = byId('provider-select').value;
  const preset = C.PROVIDER_PRESETS[provider];
  if (preset && preset.baseUrl) {
    byId('base-url-input').value = preset.baseUrl;
  }
  if (preset && preset.models && preset.models.length > 0) {
    const datalist = byId('model-suggestions');
    datalist.innerHTML = preset.models.map(m => `<option value="${m}">`).join('');
  } else {
    byId('model-suggestions').innerHTML = '';
  }
}

function toggleKeyVisibility() {
  const input = byId('api-key-input');
  input.type = input.type === 'password' ? 'text' : 'password';
  byId('toggle-key-visibility').textContent = input.type === 'password' ? '👁' : '🙈';
}

// ===== Settings: Load & Save =====

function loadSettingsIntoUI() {
  const s = C.getSettings();
  const params = loadParams();

  byId('api-key-input').value = s.apiKey;

  // Detect provider from baseUrl
  let detectedProvider = 'custom';
  for (const [key, preset] of Object.entries(C.PROVIDER_PRESETS)) {
    if (preset.baseUrl && s.baseUrl.includes(preset.baseUrl.replace(/\/v1$/, '').replace(/^https?:\/\//, '').split('/')[0])) {
      detectedProvider = key;
      break;
    }
  }
  if (s.baseUrl.includes('deepseek')) detectedProvider = 'deepseek';
  else if (s.baseUrl.includes('openai')) detectedProvider = 'openai';
  else if (s.baseUrl.includes('openrouter')) detectedProvider = 'openrouter';
  else if (s.baseUrl.includes('groq')) detectedProvider = 'groq';

  byId('provider-select').value = detectedProvider;
  byId('base-url-input').value = s.baseUrl;
  byId('model-input').value = s.model;
  byId('context-window-input').value = params.contextWindow;
  byId('max-tokens-input').value = params.maxTokens;
  byId('temperature-input').value = params.temperature;
  byId('temp-value').textContent = params.temperature;
  byId('top-p-input').value = params.topP;
  byId('top-p-value').textContent = params.topP;
  byId('top-k-input').value = params.topK;
  byId('top-k-value').textContent = params.topK;
  byId('presence-penalty-input').value = params.presencePenalty;
  byId('presence-penalty-value').textContent = params.presencePenalty;
  byId('frequency-penalty-input').value = params.frequencyPenalty;
  byId('frequency-penalty-value').textContent = params.frequencyPenalty;
  byId('stop-input').value = (params.stop || []).join(', ');
  byId('stream-toggle').checked = params.stream !== false;
  byId('infinite-context-toggle').checked = params.infiniteContext === true;
  byId('max-model-context-input').value = params.maxModelContext || 128000;
  byId('web-search-toggle').checked = params.webSearch === true;
  byId('search-api-url').value = params.searchApiUrl || '';
  byId('search-api-key').value = params.searchApiKey || '';
  byId('web-search-toggle').dispatchEvent(new Event('change'));
}

function loadParams() {
  try {
    const raw = localStorage.getItem('quark_llm_params');
    return raw ? { ...C.DEFAULTS, ...JSON.parse(raw) } : { ...C.DEFAULTS };
  } catch {
    return { ...C.DEFAULTS };
  }
}

function saveParams(params) {
  localStorage.setItem('quark_llm_params', JSON.stringify(params));
}

function saveSettingsFromUI() {
  const apiKey = byId('api-key-input').value.trim();
  const baseUrl = byId('base-url-input').value.trim();
  const model = byId('model-input').value.trim();

  C.saveSettings({ apiKey, baseUrl, model });

  const params = {
    temperature: parseFloat(byId('temperature-input').value),
    topP: parseFloat(byId('top-p-input').value),
    topK: parseInt(byId('top-k-input').value),
    presencePenalty: parseFloat(byId('presence-penalty-input').value),
    frequencyPenalty: parseFloat(byId('frequency-penalty-input').value),
    stop: byId('stop-input').value.split(',').map(s => s.trim()).filter(Boolean),
    contextWindow: parseInt(byId('context-window-input').value) || 15,
    maxTokens: parseInt(byId('max-tokens-input').value) || 4096,
    stream: byId('stream-toggle').checked,
    infiniteContext: byId('infinite-context-toggle').checked,
    maxModelContext: parseInt(byId('max-model-context-input').value) || 128000,
    webSearch: byId('web-search-toggle').checked,
    searchApiUrl: byId('search-api-url').value.trim(),
    searchApiKey: byId('search-api-key').value.trim(),
  };
  saveParams(params);

  updateHeaderBadges();
  toggleModal('settings-modal', false);
  showToast('设置已保存');
}

function loadDefaultSettings() {
  byId('provider-select').value = 'deepseek';
  byId('base-url-input').value = C.DEFAULTS.baseUrl;
  byId('model-input').value = C.DEFAULTS.model;
  byId('context-window-input').value = C.DEFAULTS.contextWindow;
  byId('max-tokens-input').value = C.DEFAULTS.maxTokens;
  byId('temperature-input').value = C.DEFAULTS.temperature;
  byId('temp-value').textContent = C.DEFAULTS.temperature;
  byId('top-p-input').value = C.DEFAULTS.topP;
  byId('top-p-value').textContent = C.DEFAULTS.topP;
  byId('top-k-input').value = C.DEFAULTS.topK;
  byId('top-k-value').textContent = C.DEFAULTS.topK;
  byId('presence-penalty-input').value = C.DEFAULTS.presencePenalty;
  byId('presence-penalty-value').textContent = C.DEFAULTS.presencePenalty;
  byId('frequency-penalty-input').value = C.DEFAULTS.frequencyPenalty;
  byId('frequency-penalty-value').textContent = C.DEFAULTS.frequencyPenalty;
  byId('stop-input').value = '';
  byId('stream-toggle').checked = true;
  byId('infinite-context-toggle').checked = false;
  byId('max-model-context-input').value = 128000;
  byId('web-search-toggle').checked = false;
  byId('search-api-url').value = '';
  byId('search-api-key').value = '';
  byId('web-search-toggle').dispatchEvent(new Event('change'));
  showToast('已恢复默认设置');
}

// ===== Connection Test & Model Fetch =====

async function testConnection() {
  const btn = byId('test-connection-btn');
  const status = byId('connection-status');
  const apiKey = byId('api-key-input').value.trim();
  const baseUrl = byId('base-url-input').value.trim();
  const model = byId('model-input').value.trim();

  if (!apiKey) { status.textContent = '请先输入 API Key'; status.className = 'status-text error'; return; }

  btn.disabled = true;
  btn.textContent = '测试中...';
  status.textContent = '';

  const result = await C.testConnection(baseUrl, apiKey, model);
  btn.disabled = false;
  btn.textContent = '测试连接';

  if (result.ok) {
    status.textContent = `✓ 连接成功 (${result.status})`;
    status.className = 'status-text success';
  } else {
    status.textContent = `✗ ${result.error || '连接失败'}`;
    status.className = 'status-text error';
  }
}

async function fetchModels() {
  const btn = byId('fetch-models-btn');
  const apiKey = byId('api-key-input').value.trim();
  const baseUrl = byId('base-url-input').value.trim();

  if (!apiKey) { showToast('请先输入 API Key'); return; }

  btn.disabled = true;
  btn.textContent = '⏳';
  byId('model-input').placeholder = '获取中...';

  const result = await C.fetchModelList(baseUrl, apiKey);
  btn.disabled = false;
  btn.textContent = '🔄';

  if (result.ok && result.models.length > 0) {
    const datalist = byId('model-suggestions');
    datalist.innerHTML = result.models.map(m => `<option value="${m}">`).join('');
    byId('model-input').placeholder = '从下方列表选择或手动输入';
    showToast(`获取到 ${result.models.length} 个模型`);
  } else {
    byId('model-input').placeholder = 'deepseek-reasoner';
    showToast(result.error || '未能获取模型列表，请手动输入');
  }
}

// ===== Profiles =====

function renderProfilesList() {
  const container = byId('profiles-list');
  const profiles = C.getProfiles();
  const activeProfile = C.getActiveProfile();

  if (profiles.length === 0) {
    container.innerHTML = '<p class="empty-hint">暂无保存的预设。调整参数后点击"保存当前为预设"。</p>';
    return;
  }

  container.innerHTML = profiles.map(p => `
    <div class="profile-card ${activeProfile && activeProfile.id === p.id ? 'active' : ''}">
      <div class="profile-card-info">
        <div class="profile-card-name">${escHtml(p.name || '未命名')}</div>
        <div class="profile-card-meta">${escHtml(p.model || '')} · ${escHtml(p.baseUrl || '')}</div>
      </div>
      <div class="profile-card-actions">
        <button class="load-profile-btn" data-id="${p.id}">加载</button>
        <button class="delete-profile-btn danger-btn-sm" data-id="${p.id}">删除</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.load-profile-btn').forEach(btn => {
    btn.onclick = () => loadProfile(btn.dataset.id);
  });
  container.querySelectorAll('.delete-profile-btn').forEach(btn => {
    btn.onclick = () => deleteProfile(btn.dataset.id);
  });
}

function saveCurrentAsProfile() {
  const name = prompt('为当前预设命名：');
  if (!name) return;

  const s = C.getSettings();
  const params = loadParams();

  C.addProfile({
    name,
    apiKey: s.apiKey,
    baseUrl: s.baseUrl,
    model: s.model,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    topP: params.topP,
    topK: params.topK,
    presencePenalty: params.presencePenalty,
    frequencyPenalty: params.frequencyPenalty,
    stop: params.stop,
    contextWindow: params.contextWindow,
    stream: params.stream
  });

  renderProfilesList();
  showToast(`预设"${name}"已保存`);
}

function loadProfile(id) {
  const profile = C.getProfiles().find(p => p.id === id);
  if (!profile) return;

  C.setActiveProfile(id);
  C.saveSettings({
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    model: profile.model
  });

  saveParams({
    temperature: profile.temperature ?? C.DEFAULTS.temperature,
    topP: profile.topP ?? C.DEFAULTS.topP,
    topK: profile.topK ?? C.DEFAULTS.topK,
    presencePenalty: profile.presencePenalty ?? C.DEFAULTS.presencePenalty,
    frequencyPenalty: profile.frequencyPenalty ?? C.DEFAULTS.frequencyPenalty,
    stop: profile.stop || [],
    contextWindow: profile.contextWindow ?? C.DEFAULTS.contextWindow,
    maxTokens: profile.maxTokens ?? C.DEFAULTS.maxTokens,
    stream: profile.stream !== false
  });

  loadSettingsIntoUI();
  renderProfilesList();
  updateHeaderBadges();
  toggleModal('settings-modal', false);
  showToast(`已加载预设"${profile.name}"`);
}

function deleteProfile(id) {
  const profile = C.getProfiles().find(p => p.id === id);
  if (!profile) return;
  if (!confirm(`确定删除预设"${profile.name}"？`)) return;

  C.deleteProfile(id);
  renderProfilesList();
  showToast(`预设"${profile.name}"已删除`);
}

// ===== Persona Management =====

function openPersonaModal() {
  renderPersonaList();
  toggleModal('persona-modal', true);

  // Select current persona if set
  const activePersona = C.getActivePersona();
  if (activePersona) {
    selectPersonaInList(activePersona.id);
    loadPersonaIntoEditor(activePersona);
  } else {
    clearPersonaEditor();
  }
}

function closePersonaModal() {
  toggleModal('persona-modal', false);
}

function renderPersonaList() {
  const container = byId('persona-list');
  const personas = C.getPersonas();
  const activePersona = C.getActivePersona();

  if (personas.length === 0) {
    container.innerHTML = '<p class="empty-hint" style="padding:16px;text-align:center;font-size:12px;">暂无人格<br>点击 + 新建</p>';
    return;
  }

  container.innerHTML = personas.map(p => `
    <div class="persona-list-item ${activePersona && activePersona.id === p.id ? 'active' : ''}" data-id="${p.id}">
      ${escHtml(p.name)}
    </div>
  `).join('');

  container.querySelectorAll('.persona-list-item').forEach(item => {
    item.onclick = () => {
      const persona = C.getPersonas().find(p => p.id === item.dataset.id);
      if (persona) {
        selectPersonaInList(persona.id);
        loadPersonaIntoEditor(persona);
      }
    };
  });
}

function selectPersonaInList(id) {
  qsa('.persona-list-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
}

function clearPersonaEditor() {
  byId('persona-name-input').value = '';
  byId('persona-prompt-input').value = '';
  byId('persona-name-input').dataset.personaId = '';
}

function loadPersonaIntoEditor(persona) {
  byId('persona-name-input').value = persona.name;
  byId('persona-prompt-input').value = persona.systemPrompt;
  byId('persona-name-input').dataset.personaId = persona.id;
}

function createNewPersona() {
  clearPersonaEditor();
  selectPersonaInList('');
  byId('persona-name-input').focus();
}

function saveCurrentPersona() {
  const name = byId('persona-name-input').value.trim();
  const systemPrompt = byId('persona-prompt-input').value.trim();
  const existingId = byId('persona-name-input').dataset.personaId;

  if (!name) { showToast('请输入人格名称'); return; }
  if (!systemPrompt) { showToast('请输入系统提示词'); return; }

  if (existingId) {
    C.updatePersona(existingId, { name, systemPrompt });
    showToast(`人格"${name}"已更新`);
  } else {
    const newPersona = C.addPersona({ name, systemPrompt });
    byId('persona-name-input').dataset.personaId = newPersona.id;
    showToast(`人格"${name}"已创建`);
  }

  renderPersonaList();
}

function applyPersona() {
  const name = byId('persona-name-input').value.trim();
  const systemPrompt = byId('persona-prompt-input').value.trim();
  const existingId = byId('persona-name-input').dataset.personaId;

  // Auto-save if modified
  if (name && systemPrompt) {
    if (existingId) {
      C.updatePersona(existingId, { name, systemPrompt });
    } else {
      const newPersona = C.addPersona({ name, systemPrompt });
      byId('persona-name-input').dataset.personaId = newPersona.id;
    }
    renderPersonaList();
  }

  const personaId = byId('persona-name-input').dataset.personaId;
  if (personaId) {
    C.setActivePersona(personaId);
    currentPersonaId = personaId;
    updateHeaderBadges();
    showToast(`已应用人格"${name}"`);
  }
  closePersonaModal();
}

function deletePersona() {
  const existingId = byId('persona-name-input').dataset.personaId;
  if (!existingId) return;

  const persona = C.getPersonas().find(p => p.id === existingId);
  if (!persona || !confirm(`确定删除人格"${persona.name}"？`)) return;

  C.deletePersona(existingId);
  clearPersonaEditor();
  renderPersonaList();

  if (currentPersonaId === existingId) {
    currentPersonaId = null;
    updateHeaderBadges();
  }
  showToast(`人格"${persona.name}"已删除`);
}

function exportPersona() {
  const existingId = byId('persona-name-input').dataset.personaId;
  if (!existingId) { showToast('请先选择或创建一个人格'); return; }

  const persona = C.getPersonas().find(p => p.id === existingId);
  if (persona) C.exportPersona(persona);
}

function clearPersona() {
  C.setActivePersona(null);
  currentPersonaId = null;
  updateHeaderBadges();
  closePersonaModal();
  showToast('已清除人格');
}

function importPersonaFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const content = ev.target.result;
    const name = file.name.replace(/\.(txt|md)$/i, '');
    byId('persona-name-input').value = name;
    byId('persona-prompt-input').value = content;
    byId('persona-name-input').dataset.personaId = '';
    showToast(`已导入文件: ${file.name}`);
  };
  reader.readAsText(file);
  e.target.value = '';
}

function updateHeaderBadges() {
  const activePersona = C.getActivePersona();
  const personaBadge = byId('active-persona-badge');
  if (activePersona) {
    personaBadge.textContent = `🧑 ${activePersona.name}`;
    personaBadge.style.display = 'inline';
    currentPersonaId = activePersona.id;
  } else {
    personaBadge.style.display = 'none';
    currentPersonaId = null;
  }

  const activeProfile = C.getActiveProfile();
  const profileBadge = byId('active-profile-name');
  if (activeProfile) {
    profileBadge.textContent = activeProfile.name;
  } else {
    const s = C.getSettings();
    profileBadge.textContent = s.model;
  }
}

// ===== Chat =====

function showEmptyState() {
  const history = byId('chat-history');
  if (history.children.length === 0) {
    history.innerHTML = `
      <div class="empty-state">
        <h2>AI Chat</h2>
        <p>开始一段新的对话<br>在下方输入你的消息</p>
        <div class="shortcuts">
          <kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行<br>
          点击 <kbd>📎</kbd> 上传文件<br>
          左侧 <kbd>人格</kbd> 可管理系统提示词
        </div>
      </div>
    `;
  }
}

async function sendMessage() {
  const settings = C.getSettings();
  if (!settings.apiKey) {
    showToast('请先设置 API Key');
    toggleModal('settings-modal', true);
    return;
  }

  const inputEl = byId('user-input');
  const sendBtn = byId('send-btn');
  const text = inputEl.value.trim();

  if (!text && currentAttachments.length === 0) return;

  // Check for commands
  if (text.startsWith('/') && currentAttachments.length === 0) {
    const handled = handleCommand(text);
    if (handled) {
      inputEl.value = '';
      inputEl.style.height = 'auto';
      byId('cmd-autocomplete').style.display = 'none';
      return;
    }
  }

  sendBtn.disabled = true;

  let fullPrompt = text;
  if (currentAttachments.length > 0) {
    fullPrompt = currentAttachments.map(a => `[文件: ${a.name}]\n${a.content}`).join('\n\n');
    if (text) fullPrompt += `\n\n${text}`;
  }

  appendMessageUI('user', text || '[发送文件]');
  inputEl.value = '';
  inputEl.style.height = 'auto';

  // Hide command autocomplete
  byId('cmd-autocomplete').style.display = 'none';

  // Remove empty state
  const emptyState = qs('.empty-state');
  if (emptyState) emptyState.remove();

  const historyBox = byId('chat-history');
  const botMsgDiv = document.createElement('div');
  botMsgDiv.className = 'bot-msg';
  botMsgDiv.innerHTML = `<div class="reasoning-box" style="display:none"></div><div class="markdown-content"><span class="generating-indicator"></span>生成中...</div>`;
  historyBox.appendChild(botMsgDiv);
  historyBox.scrollTop = historyBox.scrollHeight;

  const reasoningBox = botMsgDiv.querySelector('.reasoning-box');
  const contentBox = botMsgDiv.querySelector('.markdown-content');

  const params = loadParams();
  const usingWebSearch = params.webSearch && params.searchApiUrl;
  const endpoint = usingWebSearch
    ? AI_SEARCH_PROXY + '?target=' + encodeURIComponent(buildSearchEndpoint(params.searchApiUrl))
    : C.buildChatEndpoint(settings.baseUrl);
  const effectiveKey = usingWebSearch && params.searchApiKey ? params.searchApiKey : settings.apiKey;
  let messages = buildMessages(fullPrompt);

  const requestBody = buildRequestBody(settings.model, messages, params);

  // Setup abort controller for stop generation
  currentAbortController = new AbortController();
  isGenerating = true;
  showStopButton();

  try {
    let result;
    if (params.stream !== false) {
      result = await doStreamRequest(endpoint, effectiveKey, requestBody, reasoningBox, contentBox, botMsgDiv, historyBox, currentAbortController.signal);
    } else {
      result = await doNormalRequest(endpoint, effectiveKey, requestBody, contentBox, botMsgDiv, historyBox, currentAbortController.signal);
    }

    // Save raw markdown and reasoning (not rendered plain text)
    const rawText = result.text || '';
    const rawReasoning = result.reasoning || '';
    const usage = result.usage || null;

    addCopyButton(botMsgDiv, rawText, contentBox);
    addStarButton(botMsgDiv, rawText);

    const wasNewChat = currentChatId === null;
    saveToLocalStorage(fullPrompt, rawText, rawReasoning);

    // Track token usage
    if (usage) trackTokenUsage(currentChatId, usage);

    // Show context warning if approaching limit
    showContextWarning();

    // Data attributes for controls after save (indices now known)
    const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    if (chats[currentChatId]) {
      const msgCount = chats[currentChatId].messages.length;
      const allUserMsgs = qsa('#chat-history .user-msg');
      if (allUserMsgs.length > 0) {
        allUserMsgs[allUserMsgs.length - 1].dataset.chatIndex = currentChatId;
        allUserMsgs[allUserMsgs.length - 1].dataset.msgIndex = msgCount - 2;
      }
      botMsgDiv.dataset.chatIndex = currentChatId;
      botMsgDiv.dataset.msgIndex = msgCount - 1;
      addMessageControls();
    }

    // Auto-generate title for new conversations
    if (wasNewChat) generateTitle(fullPrompt, rawText);
  } catch (err) {
    if (err.name === 'AbortError') {
      // User stopped generation - keep what we have
      const partialText = contentBox.textContent || '';
      const partialRaw = extractRawText(contentBox);
      if (partialRaw) {
        addCopyButton(botMsgDiv, partialRaw, contentBox);
        addStarButton(botMsgDiv, partialRaw);
        const wasNewChat = currentChatId === null;
        saveToLocalStorage(fullPrompt, partialRaw, '');
        if (wasNewChat) generateTitle(fullPrompt, partialRaw);
      }
      showToast('已中断输出');
    } else {
      contentBox.innerHTML = `<span style="color:var(--danger)">错误: ${escHtml(err.message)}</span>`;
    }
  } finally {
    isGenerating = false;
    currentAbortController = null;
    hideStopButton();
    sendBtn.disabled = false;
    currentAttachments = [];
    byId('drop-area').classList.remove('active');
    byId('drop-area').textContent = '已就绪：等待发送文件内容...';
  }
}

function buildMessages(userPrompt) {
  const messages = [];

  // Add system prompt if persona is active
  const activePersona = C.getActivePersona();
  if (activePersona && activePersona.systemPrompt) {
    messages.push({ role: "system", content: activePersona.systemPrompt });
  }

  // Add history context (infinite or limited)
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const params = loadParams();

  if (currentChatId !== null && chats[currentChatId]) {
    let history;
    if (params.infiniteContext) {
      history = chats[currentChatId].messages;
    } else {
      const contextWindow = params.contextWindow || CONTEXT_LIMIT;
      history = chats[currentChatId].messages.slice(-contextWindow);
    }
    messages.push(...history);
  }

  messages.push({ role: "user", content: userPrompt });
  return messages;
}

function buildSearchEndpoint(searchApiUrl) {
  let url = (searchApiUrl || '').replace(/\/+$/, '');
  if (!url) return '';
  if (!url.includes('/ai_search/') && !/\/chat\/completions$/i.test(url)) {
    url = url + '/ai_search/chat/completions';
  }
  return url;
}

function buildRequestBody(model, messages, params) {
  const body = {
    model: model,
    messages: messages,
    temperature: params.temperature,
    max_tokens: params.maxTokens,
    top_p: params.topP,
    stream: params.stream !== false
  };

  if (params.topK > 0) body.top_k = params.topK;
  if (params.presencePenalty !== 0) body.presence_penalty = params.presencePenalty;
  if (params.frequencyPenalty !== 0) body.frequency_penalty = params.frequencyPenalty;
  if (params.stop && params.stop.length > 0) body.stop = params.stop;
  if (params.webSearch && params.searchApiUrl) body.search_source = params.search_source || "baidu_search_v2";

  return body;
}

async function doStreamRequest(endpoint, apiKey, body, reasoningBox, contentBox, botMsgDiv, historyBox, signal) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal: signal || null
  });

  if (!response.ok || !response.body) {
    throw new Error(await C.parseErrorResponse(response));
  }

  const contentType = response.headers.get('content-type') || '';

  // Handle non-SSE responses (e.g., JSON from proxy when upstream doesn't support streaming)
  if (!contentType.includes('text/event-stream')) {
    const data = await response.json();
    const choice = data?.choices?.[0];
    const text = choice?.message?.content || '';
    const reasoning = choice?.message?.reasoning_content || '';
    const usage = data?.usage || null;

    if (text) {
      contentBox.innerHTML = marked.parse(text);
      enhanceRenderedContent(contentBox);
    }
    if (reasoning) {
      reasoningBox.style.display = "block";
      reasoningBox.textContent = reasoning;
      reasoningBox.onclick = () => reasoningBox.classList.toggle('collapsed');
    }
    return { text, reasoning, usage };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let fullReasoning = "";
  let pendingChunk = "";
  let rawBuffer = "";       // accumulate ALL raw text for fallback parsing
  let streamError = null;   // upstream API error embedded in SSE
  let debugLogged = false;  // log raw data only once

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunkText = decoder.decode(value, { stream: true });
    rawBuffer += chunkText;
    pendingChunk += chunkText;

    const lines = pendingChunk.split('\n');
    pendingChunk = lines.pop() || "";

    for (const line of lines) {
      // Accept SSE lines with or without space after "data:"
      // Also accept bare JSON lines (some APIs omit the "data: " prefix)
      let jsonStr = null;
      if (line.startsWith('data: ')) {
        jsonStr = line.substring(6);
      } else if (line.startsWith('data:')) {
        jsonStr = line.substring(5);
      } else if (line.trimStart().startsWith('{')) {
        jsonStr = line;
      }

      if (!jsonStr) continue;
      const trimmed = jsonStr.trim();
      if (trimmed === '[DONE]') continue;

      try {
        const data = JSON.parse(trimmed);

        // Detect upstream API error embedded in SSE events
        if (data?.code && data?.message) {
          streamError = `[${data.code}] ${data.message}`;
          break;
        }

        const delta = data?.choices?.[0]?.delta || {};

        if (delta.reasoning_content) {
          fullReasoning += delta.reasoning_content;
          reasoningBox.style.display = "block";
          reasoningBox.className = 'reasoning-box';
          reasoningBox.textContent = fullReasoning;
        }

        if (delta.content) {
          fullText += delta.content;
          contentBox.innerHTML = marked.parse(fullText);
        }

        historyBox.scrollTop = historyBox.scrollHeight;
      } catch (err) {
        console.warn('SSE parse error:', err);
      }
    }
    if (streamError) break;
  }

  // Throw upstream API error if detected in SSE stream
  if (streamError) {
    throw new Error(streamError);
  }

  // Fallback: if no content from delta, try full raw response as JSON
  if (!fullText) {
    // Log raw response for debugging (first 1KB)
    if (rawBuffer.length > 0) {
      console.log('[SSE debug] Raw response start:', rawBuffer.substring(0, 1000));
    }

    // Strategy 1: try parsing pendingChunk (last incomplete line) as JSON
    const tryParse = (str) => {
      try {
        return JSON.parse(str.trim());
      } catch { return null; }
    };

    // Strategy 2: try the entire raw buffer
    let finalData = null;
    const cleanAll = rawBuffer
      .split('\n')
      .map(l => l.replace(/^data:\s*/, '').trim())
      .filter(l => l && l !== '[DONE]')
      .join('\n');

    finalData = tryParse(pendingChunk.replace(/^data:\s*/, '').trim())
      || tryParse(cleanAll)
      || tryParse(rawBuffer.replace(/^data:\s*/m, '').trim());

    if (finalData) {
      const choice = finalData?.choices?.[0];
      if (choice?.message?.content) {
        fullText = choice.message.content;
        contentBox.innerHTML = marked.parse(fullText);
      }
      if (choice?.message?.reasoning_content) {
        fullReasoning = choice.message.reasoning_content;
        reasoningBox.style.display = "block";
        reasoningBox.textContent = fullReasoning;
      }
      if (!fullText) {
        // Different structure — log it
        console.log('[SSE debug] Parsed JSON keys:', Object.keys(finalData));
        console.log('[SSE debug] Full parsed data:', finalData);
      }
    } else {
      console.log('[SSE debug] Raw full response:', rawBuffer);
    }
  }

  // Try to extract usage from final chunk
  let usage = null;
  try {
    const finalStr = pendingChunk.replace(/^data:\s*/, '').trim();
    if (finalStr) {
      const finalData = JSON.parse(finalStr);
      if (finalData?.usage) usage = finalData.usage;
    }
  } catch {}

  // Make reasoning box clickable to expand/collapse
  if (fullReasoning) {
    reasoningBox.onclick = () => reasoningBox.classList.toggle('collapsed');
  }

  // After full text is rendered, enhance with syntax highlighting etc.
  if (fullText) {
    enhanceRenderedContent(contentBox);
  }

  return { text: fullText, reasoning: fullReasoning, usage };
}

async function doNormalRequest(endpoint, apiKey, body, contentBox, botMsgDiv, historyBox, signal) {
  body.stream = false;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal: signal || null
  });

  if (!response.ok) {
    throw new Error(await C.parseErrorResponse(response));
  }

  const data = await response.json();
  const choice = data?.choices?.[0];
  const text = choice?.message?.content || '';
  const reasoning = choice?.message?.reasoning_content || '';
  const usage = data?.usage || null;

  if (reasoning) {
    const reasoningBox = botMsgDiv.querySelector('.reasoning-box');
    reasoningBox.style.display = "block";
    reasoningBox.textContent = reasoning;
    reasoningBox.onclick = () => reasoningBox.classList.toggle('collapsed');
  }

  contentBox.innerHTML = marked.parse(text);
  historyBox.scrollTop = historyBox.scrollHeight;

  // Enhance with syntax highlighting etc.
  if (text) enhanceRenderedContent(contentBox);

  return { text, reasoning, usage };
}

// ===== Token Tracking =====

function trackTokenUsage(chatIndex, usage) {
  if (!usage || chatIndex === null) return;
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const chat = chats[chatIndex];
  if (!chat) return;

  if (!chat.tokenUsage) chat.tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  chat.tokenUsage.promptTokens += usage.prompt_tokens || 0;
  chat.tokenUsage.completionTokens += usage.completion_tokens || 0;
  chat.tokenUsage.totalTokens += usage.total_tokens || 0;
  localStorage.setItem('deepseekChats', JSON.stringify(chats));

  let global = { totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0 };
  try { global = JSON.parse(localStorage.getItem('quark_llm_token_usage')) || global; } catch {}
  global.totalPromptTokens += usage.prompt_tokens || 0;
  global.totalCompletionTokens += usage.completion_tokens || 0;
  global.totalTokens += usage.total_tokens || 0;
  localStorage.setItem('quark_llm_token_usage', JSON.stringify(global));

  updateTokenDisplay();
  updateContextDisplay();
}

function updateTokenDisplay() {
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const chat = currentChatId !== null ? chats[currentChatId] : null;
  const el = byId('token-display');
  if (!el) return;
  if (chat && chat.tokenUsage && chat.tokenUsage.totalTokens > 0) {
    el.textContent = `${chat.tokenUsage.totalTokens} tokens`;
    el.style.display = 'inline';
  } else {
    el.style.display = 'none';
  }
}

function getGlobalTokenStats() {
  try { return JSON.parse(localStorage.getItem('quark_llm_token_usage')) || { totalTokens: 0 }; }
  catch { return { totalTokens: 0 }; }
}

function updateGlobalTokenStats() {
  const stats = getGlobalTokenStats();
  const el = byId('global-token-stats');
  if (!el) return;
  const t = stats.totalTokens || 0;
  const p = stats.totalPromptTokens || 0;
  const c = stats.totalCompletionTokens || 0;
  el.innerHTML = `
    <strong>总计：</strong>${t.toLocaleString()} tokens<br>
    <span style="font-size:12px;color:var(--text-muted)">提示: ${p.toLocaleString()} · 生成: ${c.toLocaleString()}</span>
  `;
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 2);
}

function estimateContextTokens(chat) {
  if (!chat || !chat.messages) return 0;
  let total = 0;
  for (const m of chat.messages) {
    total += estimateTokens(m.content || '');
    if (m.reasoning) total += estimateTokens(m.reasoning);
  }
  return total;
}

function updateContextDisplay() {
  const bar = byId('context-bar');
  const fill = byId('context-bar-fill');
  const text = byId('context-bar-text');
  if (!bar || !fill || !text) return;

  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const chat = currentChatId !== null ? chats[currentChatId] : null;
  if (!chat) { bar.style.display = 'none'; return; }

  const params = loadParams();
  const modelMax = params.maxModelContext || 128000;
  const estimated = estimateContextTokens(chat);
  const pct = Math.min(100, Math.round((estimated / modelMax) * 100));

  if (estimated === 0) { bar.style.display = 'none'; return; }

  bar.style.display = 'block';
  fill.style.width = pct + '%';
  fill.className = 'context-bar-fill' + (pct > 85 ? ' danger' : pct > 65 ? ' warn' : '');
  text.textContent = `${estimated.toLocaleString()} / ${modelMax.toLocaleString()} (${pct}%)`;
}

function showContextWarning() {
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const chat = currentChatId !== null ? chats[currentChatId] : null;
  if (!chat) return;

  const params = loadParams();
  if (params.infiniteContext) return;

  const contextWindow = params.contextWindow || CONTEXT_LIMIT;
  const estimated = estimateContextTokens(chat);
  const limit = contextWindow * 200; // rough token estimate per message
  const pct = Math.round((estimated / limit) * 100);

  if (pct > 70 && pct <= 90) {
    const existing = qs('.context-toast');
    if (!existing) {
      showToast(`上下文使用约 ${pct}%，接近限制。建议在设置中启用「无限上下文模式」。`);
    }
  } else if (pct > 90) {
    showToast(`⚠️ 上下文使用已达 ${pct}%，请启用「无限上下文模式」以避免截断！`);
  }
}

// ===== History =====

function getContext(newPrompt) {
  return buildMessages(newPrompt);
}

function saveToLocalStorage(userMsg, botMsg, botReasoning) {
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const assistantMsg = { role: "assistant", content: botMsg };
  if (botReasoning) assistantMsg.reasoning = botReasoning;
  const msgPair = [
    { role: "user", content: userMsg },
    assistantMsg
  ];

  if (currentChatId === null) {
    const title = userMsg.substring(0, 30) || "新会话";
    chats.unshift({ title, messages: msgPair, createdAt: new Date().toISOString() });
    currentChatId = 0;
  } else {
    chats[currentChatId].messages.push(...msgPair);
  }
  localStorage.setItem('deepseekChats', JSON.stringify(chats));
  loadHistoryList();
}

function loadHistoryList() {
  const list = byId('history-list');
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');

  // Migration: assign createdAt to existing chats that don't have it
  let needsMigrate = false;
  const now = Date.now();
  chats.forEach((chat, i) => {
    if (!chat.createdAt) {
      // Distribute over past year based on position (index 0 = newest)
      const estDays = Math.round((i / Math.max(chats.length, 1)) * 180);
      chat.createdAt = new Date(now - estDays * 86400000).toISOString();
      needsMigrate = true;
    }
  });
  if (needsMigrate) localStorage.setItem('deepseekChats', JSON.stringify(chats));

  const query = byId('search-input').value.trim().toLowerCase();

  // Filter by search
  let filtered = chats;
  if (query) {
    filtered = chats.filter(chat => {
      if ((chat.title || '').toLowerCase().includes(query)) return true;
      return (chat.messages || []).some(m => (m.content || '').toLowerCase().includes(query));
    });
  }

  // Filter by category
  const activeCat = localStorage.getItem('quark_llm_active_category') || 'all';
  if (activeCat !== 'all') {
    filtered = filtered.filter(chat => chat.categoryId === activeCat);
  }

  // Group by date
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart - 86400000);
  const weekStart = new Date(todayStart - 7 * 86400000);
  const monthStart = new Date(todayStart - 30 * 86400000);

  const groups = { '今天': [], '昨天': [], '最近7天': [], '最近30天': [], '更早': [] };
  const keys = ['今天', '昨天', '最近7天', '最近30天', '更早'];

  filtered.forEach(chat => {
    const date = chat.createdAt ? new Date(chat.createdAt) : null;
    let key = '更早';
    if (date) {
      if (date >= todayStart) key = '今天';
      else if (date >= yesterdayStart) key = '昨天';
      else if (date >= weekStart) key = '最近7天';
      else if (date >= monthStart) key = '最近30天';
    }
    groups[key].push(chat);
  });

  // Render
  list.innerHTML = '';
  let hasAny = false;

  keys.forEach(key => {
    const items = groups[key];
    if (items.length === 0) return;
    hasAny = true;

    const header = document.createElement('div');
    header.className = 'history-group-header';
    header.textContent = key;
    list.appendChild(header);

    items.forEach(chat => {
      const i = chats.indexOf(chat);
      const div = document.createElement('div');
      div.className = `history-item ${i === currentChatId ? 'active' : ''}`;
      div.draggable = true;
      div.dataset.chatIndex = i;
      div.innerHTML = `
        <span class="history-title">${escHtml(chat.title || '新会话')}</span>
        <button onclick="deleteChat(${i}, event)">×</button>
      `;
      div.onclick = () => { switchChat(i); };
      // Drag and drop for categories
      div.ondragstart = (e) => {
        e.dataTransfer.setData('text/plain', i);
        div.classList.add('dragging');
      };
      div.ondragend = () => div.classList.remove('dragging');
      list.appendChild(div);
    });
  });

  if (!hasAny) {
    if (query) {
      list.innerHTML = `<p class="empty-hint" style="padding:16px;text-align:center;font-size:12px;">未找到匹配"${escHtml(query)}"的对话</p>`;
    } else {
      list.innerHTML = '<p class="empty-hint" style="padding:16px;text-align:center;font-size:12px;">暂无对话</p>';
    }
  }
}

function clearSearch() {
  byId('search-input').value = '';
  byId('search-clear-btn').style.display = 'none';
  loadHistoryList();
}

function switchChat(index) {
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  if (!chats[index]) return;
  currentChatId = index;
  renderChat(chats[index]);
  loadHistoryList();
  updateTokenDisplay();
  updateContextDisplay();
}

function renderChat(chat) {
  const historyBox = byId('chat-history');
  historyBox.innerHTML = "";
  byId('chat-title').textContent = chat.title;

  chat.messages.forEach((msg, i) => {
    if (msg.role === 'user') {
      appendMessageUI('user', msg.content, null, currentChatId, i);
    } else if (msg.role === 'assistant') {
      appendMessageUI('bot', msg.content, msg.reasoning, currentChatId, i);
    } else if (msg.role === 'system') {
      // Skip system messages in display
    }
  });

  // Add edit/regenerate controls after all messages
  if (currentChatId !== null) addMessageControls();
  historyBox.scrollTop = historyBox.scrollHeight;
}

function deleteChat(index, e) {
  e.stopPropagation();
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  chats.splice(index, 1);
  localStorage.setItem('deepseekChats', JSON.stringify(chats));

  if (index === currentChatId) {
    createNewChat();
  } else if (index < currentChatId) {
    currentChatId--;
  }
  loadHistoryList();
}

function createNewChat() {
  currentChatId = null;
  byId('chat-history').innerHTML = "";
  byId('chat-title').textContent = "新会话";
  loadHistoryList();
  showEmptyState();
  updateTokenDisplay();
  updateContextDisplay();
}

// ===== UI Helpers =====

function appendMessageUI(role, text, reasoning, chatIndex, msgIndex) {
  const div = document.createElement('div');
  div.className = `${role}-msg`;
  if (chatIndex !== undefined) div.dataset.chatIndex = chatIndex;
  if (msgIndex !== undefined) div.dataset.msgIndex = msgIndex;
  if (role === 'bot') {
    const reasoningHtml = reasoning
      ? `<div class="reasoning-box">${escHtml(reasoning)}</div>`
      : '';
    div.innerHTML = `${reasoningHtml}<div class="markdown-content">${marked.parse(text)}</div>`;
  } else {
    div.textContent = text;
  }
  byId('chat-history').appendChild(div);
  if (role === 'bot') {
    const contentBox = div.querySelector('.markdown-content');
    const reasoningBox = div.querySelector('.reasoning-box');
    if (reasoningBox) {
      reasoningBox.onclick = () => reasoningBox.classList.toggle('collapsed');
    }
    if (contentBox) {
      enhanceRenderedContent(contentBox);
    }
    addCopyButton(div, text, contentBox);
    addStarButton(div, text);
  }
  byId('chat-history').scrollTop = byId('chat-history').scrollHeight;
}

function addCopyButton(parent, text, contentEl) {
  const group = document.createElement('div');
  group.className = 'msg-btn-group';

  // === Copy button group ===
  const copyGroup = document.createElement('div');
  copyGroup.className = 'btn-group';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'msg-btn';
  copyBtn.textContent = '复制';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = '已复制 ✓';
      setTimeout(() => { copyBtn.textContent = '复制'; }, 2000);
    });
  };

  const copyDropdownBtn = document.createElement('button');
  copyDropdownBtn.className = 'msg-btn-dropdown';
  copyDropdownBtn.textContent = '▼';
  const copyMenu = document.createElement('div');
  copyMenu.className = 'dropdown-menu';

  const copyFormats = [
    { key: 'markdown', label: '复制 Markdown' },
    { key: 'html', label: '复制 HTML' },
    { key: 'text', label: '复制纯文本' }
  ];
  copyFormats.forEach(f => {
    const btn = document.createElement('button');
    btn.textContent = f.label;
    btn.onclick = () => {
      let copyText = text;
      if (f.key === 'html' && contentEl) {
        copyText = contentEl.innerHTML;
      } else if (f.key === 'text') {
        const temp = document.createElement('div');
        temp.innerHTML = marked.parse(text);
        copyText = temp.textContent || '';
      }
      navigator.clipboard.writeText(copyText).then(() => {
        btn.textContent = '✓ 已复制';
        setTimeout(() => { btn.textContent = f.label; }, 1500);
      });
      copyMenu.classList.remove('show');
    };
    copyMenu.appendChild(btn);
  });

  copyDropdownBtn.onclick = (e) => { e.stopPropagation(); copyMenu.classList.toggle('show'); };
  copyGroup.appendChild(copyBtn);
  copyGroup.appendChild(copyDropdownBtn);
  copyGroup.appendChild(copyMenu);

  // === Download button group ===
  const dloadGroup = document.createElement('div');
  dloadGroup.className = 'btn-group';

  const dloadBtn = document.createElement('button');
  dloadBtn.className = 'msg-btn';
  dloadBtn.textContent = '下载';
  dloadBtn.onclick = () => triggerDownload('markdown');

  const dloadDropdownBtn = document.createElement('button');
  dloadDropdownBtn.className = 'msg-btn-dropdown';
  dloadDropdownBtn.textContent = '▼';
  const dloadMenu = document.createElement('div');
  dloadMenu.className = 'dropdown-menu';

  const dloadFormats = [
    { key: 'markdown', label: '下载 Markdown (.md)' },
    { key: 'html', label: '下载 HTML (.html)' },
    { key: 'text', label: '下载 纯文本 (.txt)' },
    { key: 'word', label: '下载 Word (.doc)' }
  ];
  dloadFormats.forEach(f => {
    const btn = document.createElement('button');
    btn.textContent = f.label;
    btn.onclick = () => { triggerDownload(f.key); dloadMenu.classList.remove('show'); };
    dloadMenu.appendChild(btn);
  });

  dloadDropdownBtn.onclick = (e) => { e.stopPropagation(); dloadMenu.classList.toggle('show'); };
  dloadGroup.appendChild(dloadBtn);
  dloadGroup.appendChild(dloadDropdownBtn);
  dloadGroup.appendChild(dloadMenu);

  // === Close menus on outside click ===
  document.addEventListener('click', () => { copyMenu.classList.remove('show'); dloadMenu.classList.remove('show'); });

  group.appendChild(copyGroup);
  group.appendChild(dloadGroup);
  parent.appendChild(group);

  function triggerDownload(format) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    let content, filename, mimeType;

    switch (format) {
      case 'markdown':
        content = text;
        filename = `chat-${dateStr}.md`;
        mimeType = 'text/markdown;charset=utf-8';
        break;
      case 'html':
        content = (contentEl ? contentEl.innerHTML : marked.parse(text));
        content = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Chat Export</title></head><body style="font-family:system-ui,sans-serif;line-height:1.7;padding:20px;max-width:800px;margin:0 auto">${content}</body></html>`;
        filename = `chat-${dateStr}.html`;
        mimeType = 'text/html;charset=utf-8';
        break;
      case 'text':
        const t = document.createElement('div');
        t.innerHTML = marked.parse(text);
        content = t.textContent || '';
        filename = `chat-${dateStr}.txt`;
        mimeType = 'text/plain;charset=utf-8';
        break;
      case 'word':
        const h = (contentEl ? contentEl.innerHTML : marked.parse(text));
        content = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8"><title>Chat Export</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]--><style>body{font-family:system-ui,-apple-system,sans-serif;font-size:12pt;line-height:1.6;padding:40px}</style></head><body>${h}</body></html>`;
        filename = `chat-${dateStr}.doc`;
        mimeType = 'application/msword';
        break;
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (!files.length) return;

  const dropArea = byId('drop-area');
  const fileNames = [];

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (arg) => {
      currentAttachments.push({ name: file.name, content: arg.target.result });
      fileNames.push(file.name);
      dropArea.classList.add('active');
      dropArea.textContent = `文件已就绪: ${fileNames.join(', ')}`;
    };
    reader.readAsText(file);
  });

  e.target.value = '';
}

// ===== Enhanced Rendering (highlight.js + KaTeX + Mermaid) =====

function enhanceRenderedContent(container) {
  if (!container) return;

  // Mermaid MUST come first — it replaces pre>code.language-mermaid with SVG,
  // so highlight.js and addCodeHeaders never see those blocks.
  renderMermaid(container);

  // Syntax highlighting with highlight.js (skips mermaid blocks internally)
  highlightCodeBlocks(container);

  // Add code block headers (skips mermaid blocks internally)
  addCodeHeaders(container);

  // Render LaTeX with KaTeX
  renderLatex(container);
}

function highlightCodeBlocks(container) {
  if (typeof hljs === 'undefined') return;
  container.querySelectorAll('pre code').forEach(block => {
    // Skip if already highlighted, or if it's a mermaid block
    if (block.classList.contains('hljs')) return;
    if (block.classList.contains('language-mermaid')) return;
    try {
      hljs.highlightElement(block);
    } catch (e) {
      // Language not available, skip
    }
  });
}

const LANG_NAMES = {
  python: 'Python', javascript: 'JavaScript', js: 'JavaScript',
  typescript: 'TypeScript', ts: 'TypeScript',
  html: 'HTML', css: 'CSS', java: 'Java', c: 'C',
  cpp: 'C++', csharp: 'C#', cs: 'C#', go: 'Go',
  rust: 'Rust', php: 'PHP', bash: 'Bash', shell: 'Shell',
  sh: 'Shell', sql: 'SQL', json: 'JSON', yaml: 'YAML',
  yml: 'YAML', markdown: 'Markdown', md: 'Markdown',
  text: 'Text', plaintext: 'Text', xml: 'XML',
  ruby: 'Ruby', rb: 'Ruby', swift: 'Swift',
  kotlin: 'Kotlin', kt: 'Kotlin', scala: 'Scala',
  r: 'R', dart: 'Dart', lua: 'Lua', perl: 'Perl',
  diff: 'Diff', dockerfile: 'Dockerfile', docker: 'Dockerfile',
  makefile: 'Makefile', make: 'Makefile',
  mermaid: 'Mermaid'
};

function getLangName(lang) {
  return LANG_NAMES[lang] || (lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : 'Text');
}

function addCodeHeaders(container) {
  container.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.code-header')) return;
    if (pre.querySelector('code.language-mermaid')) return;

    const code = pre.querySelector('code');
    if (!code) return;

    // Get language from class
    let lang = 'text';
    for (const cls of code.classList) {
      if (cls.startsWith('language-')) {
        lang = cls.replace('language-', '').toLowerCase();
        break;
      }
    }

    // Determine dot color based on language
    const dotColors = {
      python: '#3572A5', javascript: '#f0db4f', js: '#f0db4f',
      typescript: '#3178c6', ts: '#3178c6',
      html: '#e34c26', css: '#563d7c', java: '#b07219',
      cpp: '#f34b7d', c: '#555555', csharp: '#178600',
      go: '#00ADD8', rust: '#dea584', php: '#4F5D95',
      bash: '#89e051', shell: '#89e051', sql: '#e38c00',
      json: '#d4d4d4', yaml: '#cb171e', markdown: '#083fa1',
      mermaid: '#00a8b5'
    };

    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `
      <span class="code-lang-label">
        <span class="code-lang-dot" style="background:${dotColors[lang] || '#888'}"></span>
        ${escHtml(getLangName(lang))}
      </span>
      <button class="code-copy-btn">复制代码</button>
    `;

    const copyBtn = header.querySelector('.code-copy-btn');
    copyBtn.onclick = () => {
      const text = code.textContent || '';
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = '已复制 ✓';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = '复制代码';
          copyBtn.classList.remove('copied');
        }, 2000);
      });
    };

    pre.classList.add('code-block-enhanced');
    pre.prepend(header);
  });
}

function renderLatex(container) {
  if (typeof renderMathInElement === 'undefined') return;
  try {
    renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false
    });
  } catch (e) {
    // KaTeX auto-render failed silently
  }
}

async function renderMermaid(container) {
  if (typeof mermaid === 'undefined') return;
  const blocks = container.querySelectorAll('pre code.language-mermaid');
  if (blocks.length === 0) return;

  const currentTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'default';

  // Re-initialize with current theme before rendering
  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: currentTheme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose'
    });
  } catch (e) {}

  for (const code of blocks) {
    const pre = code.closest('pre');
    if (!pre || pre.dataset.mermaidProcessed) continue;
    pre.dataset.mermaidProcessed = '1';

    const source = (code.textContent || '').trim();
    if (!source) { pre.outerHTML = `<pre class="mermaid-fallback"><code></code></pre>`; continue; }

    try {
      const id = 'm-' + Math.random().toString(36).slice(2, 10);
      const { svg } = await mermaid.render(id, source);
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-container';
      wrapper.style.cssText = `background:${currentTheme === 'dark' ? '#2d2d2d' : 'white'};border-radius:8px;padding:16px;margin:16px 0;overflow-x:auto;text-align:center;`;
      wrapper.innerHTML = svg;
      pre.replaceWith(wrapper);
    } catch (e) {
      pre.outerHTML = `<pre class="mermaid-fallback"><code>${escHtml(source)}</code></pre>`;
    }
  }
}

// ===== Auto Title Generation =====

async function generateTitle(userMsg, aiMsg) {
  const settings = C.getSettings();
  if (!settings.apiKey || currentChatId !== 0) return;

  const endpoint = C.buildChatEndpoint(settings.baseUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: "user", content: `为以下对话生成一个15字以内的标题，不要标点符号，只返回标题本身：\n用户：${(userMsg || '').substring(0, 100)}\nAI：${(aiMsg || '').substring(0, 200)}` }
        ],
        max_tokens: 30,
        temperature: 0.3,
        stream: false
      })
    });
    if (!response.ok) return;
    const data = await response.json();
    const raw = (data?.choices?.[0]?.message?.content || '').trim();
    const title = raw.replace(/[。，、！？：；""''「」『』【】《》（）—…··.,!?;:'"]/g, '').substring(0, 15);
    if (!title) return;

    const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    if (chats[0]) {
      chats[0].title = title;
      localStorage.setItem('deepseekChats', JSON.stringify(chats));
      byId('chat-title').textContent = title;
      loadHistoryList();
    }
  } catch (e) {
    // Silently fail — title generation is non-critical
  }
}

// ===== Export / Import =====

function exportChats() {
  const data = localStorage.getItem('deepseekChats');
  if (!data) { showToast('没有可导出的对话'); return; }
  try {
    const parsed = JSON.parse(data);
    if (!parsed.length) { showToast('没有可导出的对话'); return; }
    const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ds-chats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${parsed.length} 个对话`);
  } catch {
    showToast('导出失败');
  }
}

function importChats(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error('格式错误');
      // Basic validation
      imported.forEach((chat, i) => {
        if (!chat.title || !Array.isArray(chat.messages)) throw new Error(`第 ${i + 1} 个对话格式无效`);
      });
      const existing = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
      const merged = [...imported, ...existing];
      localStorage.setItem('deepseekChats', JSON.stringify(merged));
      createNewChat();
      loadHistoryList();
      showToast(`已导入 ${imported.length} 个对话（共 ${merged.length} 个）`);
    } catch (err) {
      showToast(`导入失败: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

// ===== Conversation Rename =====

function startRenameChat() {
  const titleEl = byId('chat-title');
  const currentName = titleEl.textContent;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = currentName;
  input.maxLength = 50;

  titleEl.replaceWith(input);
  input.focus();
  input.select();

  function finishRename(save) {
    const newName = save ? input.value.trim() || currentName : currentName;
    const titleEl = document.createElement('h1');
    titleEl.id = 'chat-title';
    titleEl.textContent = newName;
    titleEl.ondblclick = startRenameChat;
    input.replaceWith(titleEl);

    if (save && newName !== currentName && currentChatId !== null) {
      const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
      if (chats[currentChatId]) {
        chats[currentChatId].title = newName;
        localStorage.setItem('deepseekChats', JSON.stringify(chats));
        loadHistoryList();
      }
    }
  }

  input.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finishRename(true); }
    if (e.key === 'Escape') { finishRename(false); }
  };
  input.onblur = () => finishRename(true);
}

// ===== Message Controls (Edit / Regenerate / Version Nav) =====

function addMessageControls() {
  if (currentChatId === null) return;
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const chat = chats[currentChatId];
  if (!chat) return;

  // User messages: edit button + version nav
  document.querySelectorAll('#chat-history .user-msg').forEach(div => {
    if (div.querySelector('.msg-actions')) return;
    const ci = parseInt(div.dataset.chatIndex);
    const mi = parseInt(div.dataset.msgIndex);
    if (isNaN(ci) || isNaN(mi)) return;
    const msg = chat.messages[mi];
    if (!msg || msg.role !== 'user') return;

    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    // Version nav for edits
    const editCount = (msg._edits ? msg._edits.length : 0) + 1;
    if (editCount > 1) {
      const v = document.createElement('span');
      v.className = 'version-nav';
      let curEdit = parseInt(div.dataset.displayEdit);
      if (isNaN(curEdit)) curEdit = editCount - 1;
      v.innerHTML = `<button class="nav-btn" data-action="prev-edit" title="上一个版本">&#8249;</button><span class="version-idx">${curEdit + 1}/${editCount}</span><button class="nav-btn" data-action="next-edit" title="下一个版本">&#8250;</button>`;
      v.querySelector('[data-action="prev-edit"]').onclick = () => navigateUserEdit(ci, mi, -1);
      v.querySelector('[data-action="next-edit"]').onclick = () => navigateUserEdit(ci, mi, 1);
      actions.appendChild(v);
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'msg-action-btn edit-msg-btn';
    editBtn.textContent = '编辑';
    editBtn.onclick = () => startEditMessage(div, ci, mi);
    actions.appendChild(editBtn);
    div.appendChild(actions);
  });

  // Assistant messages: regenerate button + version nav
  document.querySelectorAll('#chat-history .bot-msg').forEach(div => {
    if (div.querySelector('.msg-actions')) return;
    const ci = parseInt(div.dataset.chatIndex);
    const mi = parseInt(div.dataset.msgIndex);
    if (isNaN(ci) || isNaN(mi)) return;
    const msg = chat.messages[mi];
    if (!msg || msg.role !== 'assistant') return;

    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    // Version nav for regenerations
    const verCount = (msg._versions ? msg._versions.length : 0) + 1;
    if (verCount > 1) {
      const v = document.createElement('span');
      v.className = 'version-nav';
      let curVer = parseInt(div.dataset.displayVersion);
      if (isNaN(curVer)) curVer = verCount - 1;
      v.innerHTML = `<button class="nav-btn" data-action="prev-version" title="上一个版本">&#8249;</button><span class="version-idx">${curVer + 1}/${verCount}</span><button class="nav-btn" data-action="next-version" title="下一个版本">&#8250;</button>`;
      v.querySelector('[data-action="prev-version"]').onclick = () => navigateAIVersion(ci, mi, -1);
      v.querySelector('[data-action="next-version"]').onclick = () => navigateAIVersion(ci, mi, 1);
      actions.appendChild(v);
    }

    const regenBtn = document.createElement('button');
    regenBtn.className = 'msg-action-btn regen-msg-btn';
    regenBtn.innerHTML = '&#x21bb; 重新生成';
    regenBtn.onclick = () => regenerateResponse(ci, mi);
    actions.appendChild(regenBtn);
    div.appendChild(actions);
  });
}

function startEditMessage(div, chatIndex, msgIndex) {
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const chat = chats[chatIndex];
  if (!chat) return;
  const msg = chat.messages[msgIndex];
  if (!msg || msg.role !== 'user') return;

  const currentText = msg.content;
  div.textContent = '';

  const textarea = document.createElement('textarea');
  textarea.className = 'edit-textarea';
  textarea.value = currentText;
  div.appendChild(textarea);

  const btnRow = document.createElement('div');
  btnRow.className = 'edit-actions';
  btnRow.innerHTML = `<button class="primary-btn" id="edit-save-btn">保存并重新生成</button><button class="secondary-btn" id="edit-cancel-btn">取消</button>`;
  div.appendChild(btnRow);

  textarea.focus();
  const len = textarea.value.length;
  textarea.setSelectionRange(len, len);

  byId('edit-save-btn').onclick = async () => {
    const newText = textarea.value.trim();
    if (!newText) { showToast('内容不能为空'); return; }

    if (!msg._edits) msg._edits = [];
    if (msg.content !== newText) msg._edits.push(msg.content);
    msg.content = newText;

    // Truncate everything after this message
    chat.messages = chat.messages.slice(0, msgIndex + 1);
    localStorage.setItem('deepseekChats', JSON.stringify(chats));

    currentChatId = chatIndex;
    renderChat(chat);
    continueFromMessage(chatIndex, msgIndex);
  };

  byId('edit-cancel-btn').onclick = () => { renderChat(chat); };
}

async function continueFromMessage(chatIndex, userMsgIndex) {
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const chat = chats[chatIndex];
  if (!chat) return;

  const settings = C.getSettings();
  if (!settings.apiKey) { showToast('请先设置 API Key'); return; }

  const params = loadParams();
  const usingWebSearch = params.webSearch && params.searchApiUrl;
  const endpoint = usingWebSearch
    ? AI_SEARCH_PROXY + '?target=' + encodeURIComponent(buildSearchEndpoint(params.searchApiUrl))
    : C.buildChatEndpoint(settings.baseUrl);
  const effectiveKey = usingWebSearch && params.searchApiKey ? params.searchApiKey : settings.apiKey;

  // Build API messages from context up to and including userMsgIndex
  const activePersona = C.getActivePersona();
  const apiMessages = [];
  if (activePersona && activePersona.systemPrompt) {
    apiMessages.push({ role: "system", content: activePersona.systemPrompt });
  }
  const contextWindow = params.contextWindow || CONTEXT_LIMIT;
  const startIdx = Math.max(0, userMsgIndex - contextWindow + 1);
  for (let i = startIdx; i <= userMsgIndex; i++) {
    const m = chat.messages[i];
    if (m) apiMessages.push({ role: m.role, content: m.content });
  }

  const requestBody = buildRequestBody(settings.model, apiMessages, params);
  const historyBox = byId('chat-history');

  const botMsgDiv = document.createElement('div');
  botMsgDiv.className = 'bot-msg';
  botMsgDiv.innerHTML = `<div class="reasoning-box" style="display:none"></div><div class="markdown-content">...</div>`;
  historyBox.appendChild(botMsgDiv);
  historyBox.scrollTop = historyBox.scrollHeight;

  const reasoningBox = botMsgDiv.querySelector('.reasoning-box');
  const contentBox = botMsgDiv.querySelector('.markdown-content');

  try {
    let result;
    currentChatId = chatIndex;
    if (params.stream !== false) {
      result = await doStreamRequest(endpoint, effectiveKey, requestBody, reasoningBox, contentBox, botMsgDiv, historyBox);
    } else {
      result = await doNormalRequest(endpoint, effectiveKey, requestBody, contentBox, botMsgDiv, historyBox);
    }

    const rawText = result.text || '';
    const rawReasoning = result.reasoning || '';

    // Append to localStorage
    const assistantMsg = { role: "assistant", content: rawText };
    if (rawReasoning) assistantMsg.reasoning = rawReasoning;
    chat.messages.push(assistantMsg);
    localStorage.setItem('deepseekChats', JSON.stringify(chats));

    const newIdx = chat.messages.length - 1;
    botMsgDiv.dataset.chatIndex = chatIndex;
    botMsgDiv.dataset.msgIndex = newIdx;
    addCopyButton(botMsgDiv, rawText, contentBox);
    addStarButton(botMsgDiv, rawText);
    addMessageControls();
    historyBox.scrollTop = historyBox.scrollHeight;
  } catch (err) {
    contentBox.innerHTML = `<span style="color:var(--danger)">错误: ${escHtml(err.message)}</span>`;
  }
}

async function regenerateResponse(chatIndex, msgIndex) {
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const chat = chats[chatIndex];
  if (!chat) return;
  const msg = chat.messages[msgIndex];
  if (!msg || msg.role !== 'assistant') return;

  // Save current version
  if (!msg._versions) msg._versions = [];
  msg._versions.push({ content: msg.content || '', reasoning: msg.reasoning || '' });

  const userMsgIndex = msgIndex - 1;
  if (userMsgIndex < 0) return;

  // Find existing bot-msg DOM element
  const botMsgDiv = document.querySelector(`#chat-history .bot-msg[data-chat-index="${chatIndex}"][data-msg-index="${msgIndex}"]`);
  if (!botMsgDiv) return;

  const contentBox = botMsgDiv.querySelector('.markdown-content');
  const reasoningBox = botMsgDiv.querySelector('.reasoning-box');
  if (contentBox) contentBox.innerHTML = '...';
  if (reasoningBox) { reasoningBox.style.display = 'none'; reasoningBox.textContent = ''; }

  // Remove existing controls
  const oldActions = botMsgDiv.querySelector('.msg-actions');
  if (oldActions) oldActions.remove();

  const settings = C.getSettings();
  if (!settings.apiKey) { showToast('请先设置 API Key'); return; }

  const params = loadParams();
  const usingWebSearch = params.webSearch && params.searchApiUrl;
  const endpoint = usingWebSearch
    ? AI_SEARCH_PROXY + '?target=' + encodeURIComponent(buildSearchEndpoint(params.searchApiUrl))
    : C.buildChatEndpoint(settings.baseUrl);
  const effectiveKey = usingWebSearch && params.searchApiKey ? params.searchApiKey : settings.apiKey;

  // Build messages (same context as before but without the old response)
  const activePersona = C.getActivePersona();
  const apiMessages = [];
  if (activePersona && activePersona.systemPrompt) {
    apiMessages.push({ role: "system", content: activePersona.systemPrompt });
  }
  const contextWindow = params.contextWindow || CONTEXT_LIMIT;
  const startIdx = Math.max(0, userMsgIndex - contextWindow + 1);
  for (let i = startIdx; i <= userMsgIndex; i++) {
    const m = chat.messages[i];
    if (m) apiMessages.push({ role: m.role, content: m.content });
  }

  const requestBody = buildRequestBody(settings.model, apiMessages, params);
  const historyBox = byId('chat-history');

  try {
    let result;
    currentChatId = chatIndex;
    if (params.stream !== false) {
      result = await doStreamRequest(endpoint, effectiveKey, requestBody, reasoningBox, contentBox, botMsgDiv, historyBox);
    } else {
      result = await doNormalRequest(endpoint, effectiveKey, requestBody, contentBox, botMsgDiv, historyBox);
    }

    const rawText = result.text || '';
    const rawReasoning = result.reasoning || '';

    // Update localStorage (replace current content)
    msg.content = rawText;
    msg.reasoning = rawReasoning;
    localStorage.setItem('deepseekChats', JSON.stringify(chats));

    // Reset display to latest version
    botMsgDiv.dataset.displayVersion = msg._versions.length;
    // Remove any duplicate copy button wrappers
    const wrappers = botMsgDiv.querySelectorAll('.copy-btn-wrapper');
    for (let w = 1; w < wrappers.length; w++) wrappers[w].remove();
    addCopyButton(botMsgDiv, rawText, contentBox);
    addStarButton(botMsgDiv, rawText);
    addMessageControls();
    historyBox.scrollTop = historyBox.scrollHeight;
  } catch (err) {
    if (contentBox) contentBox.innerHTML = `<span style="color:var(--danger)">错误: ${escHtml(err.message)}</span>`;
  }
}

function navigateUserEdit(chatIndex, msgIndex, direction) {
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const chat = chats[chatIndex];
  if (!chat) return;
  const msg = chat.messages[msgIndex];
  if (!msg || !msg._edits) return;

  const div = document.querySelector(`#chat-history .user-msg[data-chat-index="${chatIndex}"][data-msg-index="${msgIndex}"]`);
  if (!div) return;

  const total = msg._edits.length + 1;
  let idx = parseInt(div.dataset.displayEdit) || msg._edits.length;
  idx = (idx + direction + total) % total;
  div.dataset.displayEdit = idx;

  // Update displayed text
  if (idx < msg._edits.length) {
    div.childNodes.forEach(c => { if (c.nodeType === 3) c.remove(); });
    div.insertBefore(document.createTextNode(msg._edits[idx]), div.firstChild);
  } else {
    div.childNodes.forEach(c => { if (c.nodeType === 3) c.remove(); });
    div.insertBefore(document.createTextNode(msg.content), div.firstChild);
  }

  const idxSpan = div.querySelector('.version-idx');
  if (idxSpan) idxSpan.textContent = `${idx + 1}/${total}`;
}

function navigateAIVersion(chatIndex, msgIndex, direction) {
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const chat = chats[chatIndex];
  if (!chat) return;
  const msg = chat.messages[msgIndex];
  if (!msg || !msg._versions) return;

  const div = document.querySelector(`#chat-history .bot-msg[data-chat-index="${chatIndex}"][data-msg-index="${msgIndex}"]`);
  if (!div) return;

  const total = msg._versions.length + 1;
  let idx = parseInt(div.dataset.displayVersion) || msg._versions.length;
  idx = (idx + direction + total) % total;
  div.dataset.displayVersion = idx;

  let verContent, verReasoning;
  if (idx < msg._versions.length) {
    verContent = msg._versions[idx].content || '';
    verReasoning = msg._versions[idx].reasoning || '';
  } else {
    verContent = msg.content || '';
    verReasoning = msg.reasoning || '';
  }

  const contentBox = div.querySelector('.markdown-content');
  const reasoningBox = div.querySelector('.reasoning-box');

  if (contentBox) {
    contentBox.innerHTML = marked.parse(verContent);
    enhanceRenderedContent(contentBox);
  }
  if (reasoningBox) {
    if (verReasoning) {
      reasoningBox.style.display = 'block';
      reasoningBox.textContent = verReasoning;
      reasoningBox.onclick = () => reasoningBox.classList.toggle('collapsed');
    } else {
      reasoningBox.style.display = 'none';
    }
  }

  const idxSpan = div.querySelector('.version-idx');
  if (idxSpan) idxSpan.textContent = `${idx + 1}/${total}`;
}

// ===== Toast =====

let toastTimer = null;

function showToast(msg) {
  let toast = byId('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
      background: var(--text-main); color: var(--bg-main);
      padding: 10px 24px; border-radius: 8px; font-size: 13px;
      z-index: 9999; opacity: 0; transition: opacity 0.3s;
      pointer-events: none; max-width: 80vw; text-align: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.style.opacity = '1';

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
  }, 2500);
}

// ===== Utilities =====

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Expose for inline onclick handlers
window.deleteChat = deleteChat;

// ===== 1. STOP GENERATION =====

function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort();
  }
}

function showStopButton() {
  byId('send-btn').style.display = 'none';
  byId('stop-btn').style.display = 'flex';
}

function hideStopButton() {
  byId('send-btn').style.display = 'flex';
  byId('stop-btn').style.display = 'none';
}

function extractRawText(contentBox) {
  if (!contentBox) return '';
  // Try to get the original content from rendered markdown
  return contentBox.textContent || '';
}

// ===== 2. COMMAND SYSTEM =====

const COMMANDS = {
  '/new': { description: '新建对话', handler: () => { createNewChat(); showToast('已创建新对话'); } },
  '/clear': { description: '清空当前对话', handler: () => { if (confirm('确定清空当前对话？')) createNewChat(); } },
  '/settings': { description: '打开设置', handler: () => toggleModal('settings-modal', true) },
  '/persona': { description: '打开人格管理', handler: () => openPersonaModal() },
  '/templates': { description: '打开提示词模板', handler: () => openTemplatesModal() },
  '/export': { description: '导出所有对话', handler: () => exportChats() },
  '/summarize': { description: '总结当前对话', handler: summarizeChat },
  '/translate': { description: '翻译模式（可接文本）', handler: (args) => translateMode(args) },
  '/starred': { description: '查看星标消息', handler: () => openStarredModal() },
  '/help': { description: '显示所有可用命令', handler: showHelpCommands }
};

function initCommandSystem() {
  // Command system initialized via event listeners
}

function handleCommand(text) {
  const parts = text.split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  const command = COMMANDS[cmd];
  if (command) {
    command.handler(args);
    return true;
  }

  // Check if it's a template invocation
  if (cmd.startsWith('/')) {
    const templateName = cmd.slice(1);
    const templates = getTemplates();
    const template = templates.find(t => t.name.toLowerCase() === templateName.toLowerCase());
    if (template) {
      applyTemplateToChat(template, args);
      return true;
    }
    showToast(`未知命令: ${cmd}。输入 /help 查看可用命令`);
    return true;
  }

  return false;
}

function handleCommandAutocomplete(input) {
  const text = input.value;
  const autocomplete = byId('cmd-autocomplete');

  if (!text.startsWith('/') || text.includes(' ')) {
    autocomplete.style.display = 'none';
    return;
  }

  const query = text.toLowerCase();
  const matches = Object.entries(COMMANDS).filter(([cmd]) => cmd.startsWith(query));

  // Also match templates
  const templates = getTemplates();
  templates.forEach(t => {
    const cmdName = '/' + t.name.toLowerCase();
    if (cmdName.startsWith(query) && !matches.find(([c]) => c === cmdName)) {
      matches.push([cmdName, { description: '📄 ' + (t.tags || ''), handler: null }]);
    }
  });

  if (matches.length === 0 || text === '/') {
    // Show all commands when just /
    const allCommands = Object.entries(COMMANDS);
    const allTemplates = templates.map(t => ['/' + t.name.toLowerCase(), { description: '📄 ' + (t.tags || ''), handler: null }]);
    const all = [...allCommands, ...allTemplates];
    renderCommandList(all, autocomplete);
    if (all.length > 0) {
      autocomplete.style.display = 'block';
    } else {
      autocomplete.style.display = 'none';
    }
    return;
  }

  renderCommandList(matches, autocomplete);
  autocomplete.style.display = 'block';
  currentCmdIndex = -1;
}

function renderCommandList(matches, container) {
  container.innerHTML = matches.slice(0, 8).map(([cmd, info], i) =>
    `<div class="cmd-autocomplete-item" data-index="${i}">
      <span class="cmd-name">${escHtml(cmd)}</span>
      <span class="cmd-desc">${escHtml(info.description || '')}</span>
    </div>`
  ).join('');

  container.querySelectorAll('.cmd-autocomplete-item').forEach(el => {
    el.onclick = () => {
      const cmd = matches[parseInt(el.dataset.index)][0];
      byId('user-input').value = cmd + ' ';
      container.style.display = 'none';
      byId('user-input').focus();
    };
  });
}

function navigateCommandList(dir) {
  const items = qsa('.cmd-autocomplete-item');
  if (items.length === 0) return;

  // Remove current selection
  items.forEach(el => el.classList.remove('selected'));

  if (currentCmdIndex === -1) {
    currentCmdIndex = dir > 0 ? 0 : items.length - 1;
  } else {
    currentCmdIndex = (currentCmdIndex + dir + items.length) % items.length;
  }

  items[currentCmdIndex].classList.add('selected');
  items[currentCmdIndex].scrollIntoView({ block: 'nearest' });
}

function selectCommandSuggestion() {
  const selected = qs('.cmd-autocomplete-item.selected');
  if (selected) {
    selected.click();
  } else {
    const first = qs('.cmd-autocomplete-item');
    if (first) first.click();
  }
}

function showHelpCommands() {
  const list = Object.entries(COMMANDS).map(([cmd, info]) =>
    `<div class="starred-item" style="cursor:default">
      <div class="starred-item-header">
        <span class="starred-item-chat">${escHtml(cmd)}</span>
      </div>
      <div class="starred-item-content" style="-webkit-line-clamp:2">${escHtml(info.description)}</div>
    </div>`
  ).join('');

  const chatHistory = byId('chat-history');
  chatHistory.innerHTML = `
    <div class="empty-state">
      <h2>可用命令</h2>
      <div style="text-align:left;max-width:400px;margin-top:16px">${list}</div>
      <p style="margin-top:16px;font-size:12px;color:var(--text-muted)">提示词模板也可作为命令使用：/<span style="font-family:var(--font-mono)">模板名称</span></p>
    </div>
  `;
}

function summarizeChat() {
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  if (currentChatId === null || !chats[currentChatId]) {
    showToast('没有当前对话可总结');
    return;
  }

  const chat = chats[currentChatId];
  const messages = chat.messages || [];
  if (messages.length < 2) {
    showToast('对话太短，无需总结');
    return;
  }

  // Build a summary prompt
  const conversationText = messages.map(m =>
    `${m.role === 'user' ? '用户' : 'AI'}: ${(m.content || '').substring(0, 500)}`
  ).join('\n\n');

  byId('user-input').value = `/summarize\n请用3-5点总结以下对话的核心内容：\n\n${conversationText}`;
  byId('user-input').dispatchEvent(new Event('input'));
  sendMessage();
}

function translateMode(args) {
  if (args) {
    byId('user-input').value = `请将以下内容翻译成中文：\n\n${args}`;
    byId('user-input').dispatchEvent(new Event('input'));
    sendMessage();
  } else {
    byId('user-input').value = '/translate ';
    byId('user-input').focus();
    showToast('在 /translate 后输入要翻译的文本');
  }
}

// ===== 3. CATEGORY SYSTEM =====

function getCategories() {
  try {
    return JSON.parse(localStorage.getItem('quark_llm_categories')) || [];
  } catch { return []; }
}

function saveCategories(cats) {
  localStorage.setItem('quark_llm_categories', JSON.stringify(cats));
}

function getDefaultCategory() {
  const cats = getCategories();
  if (cats.length > 0) return cats[0].id;
  return null;
}

function renderCategoryChips() {
  const container = byId('category-list');
  if (!container) return;
  const cats = getCategories();
  const activeCat = localStorage.getItem('quark_llm_active_category') || 'all';

  let html = '<div class="category-chip ' + (activeCat === 'all' ? 'active' : '') + '" data-cat="all">全部</div>';
  cats.forEach(c => {
    html += '<div class="category-chip ' + (activeCat === c.id ? 'active' : '') + '" data-cat="' + c.id + '">' + escHtml(c.name) + '</div>';
  });

  container.innerHTML = html;

  // Click handler
  container.querySelectorAll('.category-chip').forEach(chip => {
    chip.onclick = () => {
      localStorage.setItem('quark_llm_active_category', chip.dataset.cat);
      renderCategoryChips();
      loadHistoryList();
    };

    // Drop handler for drag & drop
    chip.ondragover = (e) => {
      e.preventDefault();
      chip.classList.add('drag-over');
    };
    chip.ondragleave = () => chip.classList.remove('drag-over');
    chip.ondrop = (e) => {
      e.preventDefault();
      chip.classList.remove('drag-over');
      const catId = chip.dataset.cat;
      const chatIndex = parseInt(e.dataTransfer.getData('text/plain'));
      if (!isNaN(chatIndex)) {
        moveChatToCategory(chatIndex, catId);
      }
    };
  });
}

function moveChatToCategory(chatIndex, catId) {
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  if (!chats[chatIndex]) return;
  chats[chatIndex].categoryId = catId === 'all' ? undefined : catId;
  localStorage.setItem('deepseekChats', JSON.stringify(chats));
  loadHistoryList();
  showToast('已移动对话');
}

function openCategoriesModal() {
  renderCategoriesManageList();
  toggleModal('categories-modal', true);
}

function renderCategoriesManageList() {
  const container = byId('categories-manage-list');
  const cats = getCategories();

  container.innerHTML = cats.map((c, i) =>
    '<div class="category-manage-item">' +
      '<span class="cat-color" style="background:' + (c.color || '#10a37f') + '"></span>' +
      '<input class="cat-name" value="' + escHtml(c.name) + '" data-id="' + c.id + '" data-index="' + i + '">' +
      '<button class="icon-btn delete-cat-btn" data-id="' + c.id + '" title="删除分类">✕</button>' +
    '</div>'
  ).join('');

  container.querySelectorAll('.cat-name').forEach(input => {
    input.onchange = () => {
      const cats = getCategories();
      const idx = parseInt(input.dataset.index);
      if (cats[idx]) {
        cats[idx].name = input.value.trim() || cats[idx].name;
        saveCategories(cats);
        renderCategoryChips();
        showToast('分类已重命名');
      }
    };
  });

  container.querySelectorAll('.delete-cat-btn').forEach(btn => {
    btn.onclick = () => {
      const cats = getCategories();
      const newCats = cats.filter(c => c.id !== btn.dataset.id);
      saveCategories(newCats);
      renderCategoriesManageList();
      renderCategoryChips();
      loadHistoryList();
      showToast('分类已删除');
    };
  });
}

function addCategory() {
  const name = prompt('输入新分类名称：');
  if (!name || !name.trim()) return;
  const cats = getCategories();
  const newCat = {
    id: 'cat_' + Date.now().toString(36),
    name: name.trim(),
    color: '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'),
    createdAt: new Date().toISOString()
  };
  cats.push(newCat);
  saveCategories(cats);
  renderCategoriesManageList();
  renderCategoryChips();
  showToast('分类"' + name.trim() + '"已创建');
}

// ===== 4. STAR / NOTE SYSTEM =====

function getStarredMessages() {
  try {
    return JSON.parse(localStorage.getItem('quark_llm_starred')) || [];
  } catch { return []; }
}

function saveStarredMessages(msgs) {
  localStorage.setItem('quark_llm_starred', JSON.stringify(msgs));
}

function addStarButton(parent, text) {
  if (!parent || !text) return;

  const starBtn = document.createElement('button');
  starBtn.className = 'star-btn';
  starBtn.innerHTML = '☆';
  starBtn.title = '星标这条消息';
  starBtn.style.cssText = 'position:absolute;bottom:8px;left:12px;z-index:10;';

  // Check if already starred
  const starred = getStarredMessages();
  const chatTitle = byId('chat-title').textContent;
  const isStarred = starred.some(s => s.chatId === currentChatId && s.text === text);
  if (isStarred) {
    starBtn.classList.add('starred');
    starBtn.innerHTML = '★';
  }

  starBtn.onclick = (e) => {
    e.stopPropagation();
    toggleStar(currentChatId, text, chatTitle, starBtn);
  };

  const noteBtn = document.createElement('button');
  noteBtn.className = 'note-btn';
  noteBtn.innerHTML = '📝';
  noteBtn.title = '添加备注';
  noteBtn.style.cssText = 'position:absolute;bottom:8px;left:44px;z-index:10;';

  const hasNote = starred.some(s => s.chatId === currentChatId && s.text === text && s.note);
  if (hasNote) noteBtn.classList.add('has-note');

  noteBtn.onclick = (e) => {
    e.stopPropagation();
    openNoteModal(currentChatId, text, chatTitle);
  };

  parent.appendChild(starBtn);
  parent.appendChild(noteBtn);
}

function toggleStar(chatId, text, chatTitle, btn) {
  const starred = getStarredMessages();
  const idx = starred.findIndex(s => s.chatId === chatId && s.text === text);

  if (idx >= 0) {
    starred.splice(idx, 1);
    btn.classList.remove('starred');
    btn.innerHTML = '☆ 星标';
    showToast('已取消星标');
  } else {
    starred.push({
      chatId: chatId,
      text: text,
      chatTitle: chatTitle || '未知对话',
      timestamp: new Date().toISOString(),
      note: ''
    });
    btn.classList.add('starred');
    btn.innerHTML = '★ 星标';
    showToast('已添加星标');
  }

  saveStarredMessages(starred);
}

function openNoteModal(chatId, text, chatTitle) {
  const starred = getStarredMessages();
  const existing = starred.find(s => s.chatId === chatId && s.text === text);

  // Ensure the message is starred
  if (!existing) {
    starred.push({
      chatId, text,
      chatTitle: chatTitle || '未知对话',
      timestamp: new Date().toISOString(),
      note: ''
    });
    saveStarredMessages(starred);
  }

  byId('note-input').value = existing ? (existing.note || '') : '';
  byId('note-input').dataset.chatId = chatId;
  byId('note-input').dataset.text = text;
  byId('note-input').dataset.chatTitle = chatTitle || '';
  toggleModal('note-modal', true);
  byId('note-input').focus();
}

function saveNote() {
  const note = byId('note-input').value.trim();
  const chatId = byId('note-input').dataset.chatId;
  const text = byId('note-input').dataset.text;
  const chatTitle = byId('note-input').dataset.chatTitle;

  const starred = getStarredMessages();
  const existing = starred.find(s => s.chatId === chatId && s.text === text);

  if (existing) {
    existing.note = note;
  } else {
    starred.push({
      chatId: chatId, text, chatTitle,
      timestamp: new Date().toISOString(),
      note
    });
  }

  saveStarredMessages(starred);
  toggleModal('note-modal', false);
  showToast('备注已保存');
}

function openStarredModal() {
  const container = byId('starred-list');
  const starred = getStarredMessages();

  if (starred.length === 0) {
    container.innerHTML = '<p class="empty-hint">暂无星标消息</p>';
    toggleModal('starred-modal', true);
    return;
  }

  container.innerHTML = starred.map((s, i) =>
    '<div class="starred-item" data-index="' + i + '">' +
      '<div class="starred-item-header">' +
        '<span class="starred-item-chat">' + escHtml(s.chatTitle || '未知对话') + '</span>' +
        '<span>' + new Date(s.timestamp).toLocaleString() + '</span>' +
      '</div>' +
      '<div class="starred-item-content">' + escHtml((s.text || '').substring(0, 200)) + '</div>' +
      (s.note ? '<div class="starred-item-note">📝 ' + escHtml(s.note) + '</div>' : '') +
      '<div class="starred-item-actions">' +
        '<button class="goto-starred-btn" data-index="' + i + '">跳转</button>' +
        '<button class="unstar-btn" data-index="' + i + '">取消星标</button>' +
      '</div>' +
    '</div>'
  ).join('');

  // Jump to the chat
  container.querySelectorAll('.goto-starred-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.index);
      const s = starred[idx];
      if (s && s.chatId !== null) {
        toggleModal('starred-modal', false);
        switchChat(parseInt(s.chatId));
      } else {
        showToast('该对话可能已被删除');
      }
    };
  });

  container.querySelectorAll('.unstar-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.index);
      const s = starred[idx];
      const chatTitle = byId('chat-title').textContent;
      starred.splice(idx, 1);
      saveStarredMessages(starred);
      openStarredModal(); // Re-render
      // Also update button state if visible
      const btns = qsa('.star-btn.starred');
      btns.forEach(b => {
        if (b.closest('.bot-msg')) {
          b.classList.remove('starred');
          b.innerHTML = '☆ 星标';
        }
      });
      showToast('已取消星标');
    };
  });

  toggleModal('starred-modal', true);
}

// ===== 5. TEMPLATE SYSTEM =====

function getTemplates() {
  try {
    return JSON.parse(localStorage.getItem('quark_llm_templates')) || [];
  } catch { return []; }
}

function saveTemplates(templates) {
  localStorage.setItem('quark_llm_templates', JSON.stringify(templates));
}

function renderTemplatesList() {
  const container = byId('templates-list');
  if (!container) return;
  const templates = getTemplates();

  if (templates.length === 0) {
    container.innerHTML = '<p class="empty-hint" style="padding:16px;text-align:center;font-size:12px;">暂无模板<br>点击 + 新建</p>';
    return;
  }

  container.innerHTML = templates.map(t =>
    '<div class="template-list-item" data-id="' + t.id + '">' +
      escHtml(t.name) +
      (t.tags ? '<div class="template-tags">' + escHtml(t.tags) + '</div>' : '') +
    '</div>'
  ).join('');

  container.querySelectorAll('.template-list-item').forEach(item => {
    item.onclick = () => {
      const template = getTemplates().find(t => t.id === item.dataset.id);
      if (template) {
        selectTemplateInList(template.id);
        loadTemplateIntoEditor(template);
      }
    };
  });
}

function selectTemplateInList(id) {
  qsa('.template-list-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
}

function clearTemplateEditor() {
  byId('template-name-input').value = '';
  byId('template-tags-input').value = '';
  byId('template-prompt-input').value = '';
  byId('template-prefix-input').value = '';
  byId('template-name-input').dataset.templateId = '';
}

function loadTemplateIntoEditor(template) {
  byId('template-name-input').value = template.name || '';
  byId('template-tags-input').value = (template.tags || '').split(',').map(s => s.trim()).join(', ');
  byId('template-prompt-input').value = template.systemPrompt || '';
  byId('template-prefix-input').value = template.userPrefix || '';
  byId('template-name-input').dataset.templateId = template.id;
}

function openTemplatesModal() {
  renderTemplatesList();
  toggleModal('templates-modal', true);
  clearTemplateEditor();
}

function createNewTemplate() {
  clearTemplateEditor();
  selectTemplateInList('');
  byId('template-name-input').focus();
  showToast('填写信息后点击"保存"');
}

function saveCurrentTemplate() {
  const name = byId('template-name-input').value.trim();
  const tags = byId('template-tags-input').value.trim();
  const systemPrompt = byId('template-prompt-input').value.trim();
  const userPrefix = byId('template-prefix-input').value.trim();
  const existingId = byId('template-name-input').dataset.templateId;

  if (!name) { showToast('请输入模板名称'); return; }

  if (existingId) {
    const templates = getTemplates();
    const idx = templates.findIndex(t => t.id === existingId);
    if (idx >= 0) {
      templates[idx] = { ...templates[idx], name, tags, systemPrompt, userPrefix, updatedAt: new Date().toISOString() };
      saveTemplates(templates);
      showToast('模板已更新');
    }
  } else {
    const templates = getTemplates();
    const newTemplate = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name, tags, systemPrompt, userPrefix,
      createdAt: new Date().toISOString()
    };
    templates.push(newTemplate);
    saveTemplates(templates);
    byId('template-name-input').dataset.templateId = newTemplate.id;
    showToast('模板已创建');
  }

  renderTemplatesList();
}

function applyTemplateFromEditor() {
  const name = byId('template-name-input').value.trim();
  const systemPrompt = byId('template-prompt-input').value.trim();
  const userPrefix = byId('template-prefix-input').value.trim();

  // Auto-save if modified
  const existingId = byId('template-name-input').dataset.templateId;
  if (name && (systemPrompt || userPrefix)) {
    if (existingId) {
      const templates = getTemplates();
      const idx = templates.findIndex(t => t.id === existingId);
      if (idx >= 0) {
        templates[idx] = { ...templates[idx], name, systemPrompt, userPrefix, updatedAt: new Date().toISOString() };
        saveTemplates(templates);
      }
    } else {
      const templates = getTemplates();
      templates.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name, tags: byId('template-tags-input').value.trim(), systemPrompt, userPrefix,
        createdAt: new Date().toISOString()
      });
      saveTemplates(templates);
    }
    renderTemplatesList();
  }

  if (systemPrompt || userPrefix) {
    applyTemplateToChat({ name, systemPrompt, userPrefix }, '');
  }
}

function applyTemplateToChat(template, args) {
  if (!template) return;

  // Insert system prompt as first message or set as persona
  if (template.systemPrompt) {
    // Use the system prompt as a temporary persona for this message
    const existingPersona = C.getActivePersona();
    if (existingPersona && existingPersona.systemPrompt === template.systemPrompt) {
      // Same system prompt already active
    } else {
      // Store template system prompt temporarily
      C.saveSettings({ ...C.getSettings() }); // ensure settings exist
      // We'll prepend system prompt via buildMessages mock
      // Actually, we can just insert the system prompt into the user message
    }
  }

  // Insert user prefix into the input
  const input = byId('user-input');
  let prefix = template.userPrefix || '';
  if (args) {
    prefix += ' ' + args;
  }
  if (prefix) {
    input.value = prefix;
    input.dispatchEvent(new Event('input'));
    input.focus();
  }

  // If there's a system prompt, prepend it to input as an instruction
  if (template.systemPrompt) {
    const notes = '请遵循以下系统指令：' + template.systemPrompt;
    if (input.value) {
      input.value = notes + '\n\n' + input.value;
    } else {
      input.value = notes + '\n\n';
    }
    input.dispatchEvent(new Event('input'));
  }

  toggleModal('templates-modal', false);
  showToast('已应用模板: ' + template.name);
}

function deleteTemplate() {
  const existingId = byId('template-name-input').dataset.templateId;
  if (!existingId) { showToast('请先选择要删除的模板'); return; }

  const templates = getTemplates();
  const template = templates.find(t => t.id === existingId);
  if (!template) return;
  if (!confirm('确定删除模板"' + template.name + '"？')) return;

  const newTemplates = templates.filter(t => t.id !== existingId);
  saveTemplates(newTemplates);
  clearTemplateEditor();
  renderTemplatesList();
  showToast('模板已删除');
}

// ===== 6. MOBILE SIDEBAR IMPROVEMENTS =====

function initMobileSidebar() {
  const sidebar = byId('sidebar');
  const sidebarCloseBtn = byId('sidebar-close-mobile');
  const sidebarToggle = byId('sidebar-toggle');
  const chatContainer = byId('chat-container');

  // Close button in sidebar (mobile)
  if (sidebarCloseBtn) {
    sidebarCloseBtn.onclick = () => {
      sidebar.classList.add('collapsed');
      updateSidebarToggleIcon();
    };
  }

  // Sidebar toggle button in header
  sidebarToggle.onclick = () => {
    sidebar.classList.toggle('collapsed');
    updateSidebarToggleIcon();
  };

  // Click outside sidebar to close (mobile only)
  if (chatContainer) {
    chatContainer.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && !sidebar.classList.contains('collapsed')) {
        // Don't collapse if clicking on something inside the sidebar
        const target = e.target;
        if (!sidebar.contains(target) && target !== sidebarToggle && !sidebarToggle.contains(target)) {
          // But don't close if clicking the sidebar toggle
          sidebar.classList.add('collapsed');
          updateSidebarToggleIcon();
        }
      }
    });
  }

  // Touch swipe to close sidebar (mobile)
  let sidebarTouchStartX = 0;

  sidebar.addEventListener('touchstart', (e) => {
    sidebarTouchStartX = e.touches[0].clientX;
  }, { passive: true });

  sidebar.addEventListener('touchend', (e) => {
    if (window.innerWidth <= 768) {
      const deltaX = sidebarTouchStartX - e.changedTouches[0].clientX;
      if (deltaX > 80) {
        sidebar.classList.add('collapsed');
        updateSidebarToggleIcon();
      }
    }
  }, { passive: true });

  // Swipe right on main area to open sidebar
  let mainTouchStartX = 0;

  chatContainer.addEventListener('touchstart', (e) => {
    mainTouchStartX = e.touches[0].clientX;
  }, { passive: true });

  chatContainer.addEventListener('touchend', (e) => {
    if (window.innerWidth <= 768 && sidebar.classList.contains('collapsed')) {
      const deltaX = e.changedTouches[0].clientX - mainTouchStartX;
      if (deltaX > 80 && mainTouchStartX < 30) {
        sidebar.classList.remove('collapsed');
        updateSidebarToggleIcon();
      }
    }
  }, { passive: true });

  // Initialize sidebar state for mobile
  if (window.innerWidth <= 768) {
    sidebar.classList.add('collapsed');
  }

  // Handle resize
  window.addEventListener('resize', () => {
    if (window.innerWidth <= 768) {
      if (!sidebar.classList.contains('collapsed')) {
        // Keep as is
      }
    } else {
      sidebar.classList.remove('collapsed');
    }
  });
}

function updateSidebarToggleIcon() {
  const sidebar = byId('sidebar');
  const toggle = byId('sidebar-toggle');
  if (!toggle) return;
  // Toggle button appearance is handled by CSS transition
}
