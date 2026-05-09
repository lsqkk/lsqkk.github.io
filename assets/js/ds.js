const C = window.QuarkLLMConfig;
const CONTEXT_LIMIT = 15;

let currentChatId = null;
let currentAttachments = [];
let currentPersonaId = null;

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
}

function setupEventListeners() {
  // Buttons
  byId('new-chat-btn').onclick = createNewChat;
  byId('sidebar-toggle').onclick = toggleSidebar;
  byId('theme-toggle').onclick = toggleTheme;
  byId('settings-btn').onclick = () => toggleModal('settings-modal', true);
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
  };
  userInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
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
    stream: byId('stream-toggle').checked
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
  sendBtn.disabled = true;

  let fullPrompt = text;
  if (currentAttachments.length > 0) {
    fullPrompt = currentAttachments.map(a => `[文件: ${a.name}]\n${a.content}`).join('\n\n');
    if (text) fullPrompt += `\n\n${text}`;
  }

  appendMessageUI('user', text || '[发送文件]');
  inputEl.value = '';
  inputEl.style.height = 'auto';

  // Remove empty state
  const emptyState = qs('.empty-state');
  if (emptyState) emptyState.remove();

  const historyBox = byId('chat-history');
  const botMsgDiv = document.createElement('div');
  botMsgDiv.className = 'bot-msg';
  botMsgDiv.innerHTML = `<div class="reasoning-box" style="display:none"></div><div class="markdown-content">...</div>`;
  historyBox.appendChild(botMsgDiv);
  historyBox.scrollTop = historyBox.scrollHeight;

  const reasoningBox = botMsgDiv.querySelector('.reasoning-box');
  const contentBox = botMsgDiv.querySelector('.markdown-content');

  const params = loadParams();
  const endpoint = C.buildChatEndpoint(settings.baseUrl);
  const messages = buildMessages(fullPrompt);
  const requestBody = buildRequestBody(settings.model, messages, params);

  try {
    if (params.stream !== false) {
      await doStreamRequest(endpoint, settings.apiKey, requestBody, reasoningBox, contentBox, botMsgDiv, historyBox);
    } else {
      await doNormalRequest(endpoint, settings.apiKey, requestBody, contentBox, botMsgDiv, historyBox);
    }

    const finalText = contentBox.textContent;
    // Enhance with syntax highlighting, LaTeX, Mermaid after rendering
    enhanceRenderedContent(contentBox);
    addCopyButton(botMsgDiv, finalText, contentBox);
    saveToLocalStorage(fullPrompt, finalText);
  } catch (err) {
    contentBox.innerHTML = `<span style="color:var(--danger)">错误: ${escHtml(err.message)}</span>`;
  } finally {
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

  // Add history context
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const params = loadParams();
  const contextWindow = params.contextWindow || CONTEXT_LIMIT;

  if (currentChatId !== null && chats[currentChatId]) {
    const history = chats[currentChatId].messages.slice(-contextWindow);
    messages.push(...history);
  }

  messages.push({ role: "user", content: userPrompt });
  return messages;
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

  return body;
}

async function doStreamRequest(endpoint, apiKey, body, reasoningBox, contentBox, botMsgDiv, historyBox) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok || !response.body) {
    throw new Error(await C.parseErrorResponse(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let fullReasoning = "";
  let pendingChunk = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    pendingChunk += decoder.decode(value, { stream: true });
    const lines = pendingChunk.split('\n');
    pendingChunk = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;

      try {
        const data = JSON.parse(line.substring(6));
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
  }

  // If no content was received via delta, try the final message
  if (!fullText) {
    try {
      const finalData = JSON.parse(pendingChunk.replace(/^data: /, ''));
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
    } catch {}
  }

  // Make reasoning box clickable to expand/collapse
  if (fullReasoning) {
    reasoningBox.onclick = () => reasoningBox.classList.toggle('collapsed');
  }

  // After full text is rendered, enhance with syntax highlighting etc.
  if (fullText) {
    enhanceRenderedContent(contentBox);
  }
}

async function doNormalRequest(endpoint, apiKey, body, contentBox, botMsgDiv, historyBox) {
  body.stream = false;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await C.parseErrorResponse(response));
  }

  const data = await response.json();
  const choice = data?.choices?.[0];
  const text = choice?.message?.content || '';

  if (choice?.message?.reasoning_content) {
    const reasoningBox = botMsgDiv.querySelector('.reasoning-box');
    reasoningBox.style.display = "block";
    reasoningBox.textContent = choice.message.reasoning_content;
    reasoningBox.onclick = () => reasoningBox.classList.toggle('collapsed');
  }

  contentBox.innerHTML = marked.parse(text);
  historyBox.scrollTop = historyBox.scrollHeight;

  // Enhance with syntax highlighting etc.
  if (text) enhanceRenderedContent(contentBox);
}

// ===== History =====

function getContext(newPrompt) {
  return buildMessages(newPrompt);
}

function saveToLocalStorage(userMsg, botMsg) {
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  const msgPair = [
    { role: "user", content: userMsg },
    { role: "assistant", content: botMsg }
  ];

  if (currentChatId === null) {
    const title = userMsg.substring(0, 30) || "新会话";
    chats.unshift({ title, messages: msgPair });
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
  list.innerHTML = "";

  chats.forEach((chat, i) => {
    const div = document.createElement('div');
    div.className = `history-item ${i === currentChatId ? 'active' : ''}`;
    div.innerHTML = `
      <span class="history-title">${escHtml(chat.title || '新会话')}</span>
      <button onclick="deleteChat(${i}, event)">×</button>
    `;
    div.onclick = () => { switchChat(i); };
    list.appendChild(div);
  });
}

function switchChat(index) {
  const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
  if (!chats[index]) return;
  currentChatId = index;
  renderChat(chats[index]);
  loadHistoryList();
}

function renderChat(chat) {
  const historyBox = byId('chat-history');
  historyBox.innerHTML = "";
  byId('chat-title').textContent = chat.title;

  chat.messages.forEach((msg) => {
    if (msg.role === 'user') {
      appendMessageUI('user', msg.content);
    } else if (msg.role === 'assistant') {
      appendMessageUI('bot', msg.content);
    } else if (msg.role === 'system') {
      // Skip system messages in display
    }
  });

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
}

// ===== UI Helpers =====

function appendMessageUI(role, text) {
  const div = document.createElement('div');
  div.className = `${role}-msg`;
  if (role === 'bot') {
    div.innerHTML = `<div class="markdown-content">${marked.parse(text)}</div>`;
  } else {
    div.textContent = text;
  }
  byId('chat-history').appendChild(div);
  if (role === 'bot') {
    enhanceRenderedContent(div.querySelector('.markdown-content'));
    addCopyButton(div, text, div.querySelector('.markdown-content'));
  }
  byId('chat-history').scrollTop = byId('chat-history').scrollHeight;
}

function addCopyButton(parent, text, contentEl) {
  const wrapper = document.createElement('div');
  wrapper.className = 'copy-btn-wrapper';

  const mainBtn = document.createElement('button');
  mainBtn.className = 'copy-btn-main';
  mainBtn.textContent = '复制';
  mainBtn.onclick = () => {
    navigator.clipboard.writeText(text).then(() => {
      mainBtn.textContent = '已复制 ✓';
      setTimeout(() => { mainBtn.textContent = '复制'; }, 2000);
    });
  };

  const dropdownBtn = document.createElement('button');
  dropdownBtn.className = 'copy-btn-dropdown';
  dropdownBtn.textContent = '▼';
  dropdownBtn.onclick = (e) => {
    e.stopPropagation();
    menu.classList.toggle('show');
  };

  const menu = document.createElement('div');
  menu.className = 'copy-menu';
  menu.innerHTML = `
    <button data-format="markdown">复制 Markdown</button>
    <button data-format="html">复制 HTML</button>
    <button data-format="text">复制纯文本</button>
  `;
  menu.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      const format = btn.dataset.format;
      let copyText = text;
      if (format === 'html' && contentEl) {
        copyText = contentEl.innerHTML;
      } else if (format === 'text') {
        const temp = document.createElement('div');
        temp.innerHTML = marked.parse(text);
        copyText = temp.textContent || '';
      }
      navigator.clipboard.writeText(copyText).then(() => {
        btn.textContent = '✓ 已复制';
        setTimeout(() => {
          btn.textContent = btn.textContent.includes('Markdown') ? '复制 Markdown' :
                           btn.textContent.includes('HTML') ? '复制 HTML' : '复制纯文本';
        }, 1500);
      });
      menu.classList.remove('show');
    };
  });

  wrapper.appendChild(mainBtn);
  wrapper.appendChild(dropdownBtn);
  wrapper.appendChild(menu);
  parent.appendChild(wrapper);

  // Close menu on outside click
  document.addEventListener('click', () => menu.classList.remove('show'));
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

  // 1. Syntax highlighting with highlight.js
  highlightCodeBlocks(container);

  // 2. Add code block headers (language labels + copy buttons)
  addCodeHeaders(container);

  // 3. Render LaTeX with KaTeX
  renderLatex(container);

  // 4. Render Mermaid diagrams
  renderMermaid(container);
}

function highlightCodeBlocks(container) {
  if (typeof hljs === 'undefined') return;
  container.querySelectorAll('pre code').forEach(block => {
    // Skip if already highlighted
    if (block.classList.contains('hljs')) return;
    try {
      hljs.highlightElement(block);
    } catch (e) {
      // Language not available, add plaintext
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

function renderMermaid(container) {
  if (typeof mermaid === 'undefined') return;
  const mermaidBlocks = container.querySelectorAll('pre code.language-mermaid');
  if (mermaidBlocks.length === 0) return;

  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: document.body.classList.contains('dark-mode') ? 'dark' : 'default',
      securityLevel: 'sandbox'
    });
  } catch (e) {
    return;
  }

  mermaidBlocks.forEach((codeBlock, index) => {
    const pre = codeBlock.closest('pre');
    if (!pre) return;
    const source = codeBlock.textContent || '';

    // Create a unique ID for the mermaid SVG
    const id = `mermaid-${Date.now()}-${index}`;
    const div = document.createElement('div');
    div.className = 'mermaid-container';
    div.id = id;
    pre.replaceWith(div);

    try {
      mermaid.render(id, source).then(({ svg }) => {
        div.innerHTML = svg;
      }).catch(() => {
        div.innerHTML = `<pre class="mermaid-fallback"><code>${escHtml(source)}</code></pre>`;
      });
    } catch {
      div.innerHTML = `<pre class="mermaid-fallback"><code>${escHtml(source)}</code></pre>`;
    }
  });
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
