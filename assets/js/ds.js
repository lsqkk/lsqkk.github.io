const CONTEXT_LIMIT = 15;

let currentChatId = null;
let currentModel = "deepseek-reasoner";
let isDarkMode = false;
let currentAttachments = [];

window.onload = () => {
    initApp();
};

function initApp() {
    document.getElementById('model-toggle').onclick = toggleModel;
    document.getElementById('new-chat-btn').onclick = createNewChat;
    document.getElementById('sidebar-toggle').onclick = toggleSidebar;
    document.getElementById('theme-toggle').onclick = toggleTheme;
    document.getElementById('settings-btn').onclick = () => toggleModal(true);
    document.getElementById('close-settings').onclick = () => toggleModal(false);
    document.getElementById('save-settings').onclick = saveApiSettings;
    document.getElementById('send-btn').onclick = sendMessage;

    const userInput = document.getElementById('user-input');
    userInput.oninput = function () {
        this.style.height = 'auto';
        this.style.height = `${this.scrollHeight}px`;
    };
    userInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    document.getElementById('file-btn').onclick = () => document.getElementById('file-input').click();
    document.getElementById('file-input').onchange = handleFileSelect;

    hydrateSettingsModal();
    loadHistoryList();

    if (localStorage.getItem('darkMode') === 'true') {
        toggleTheme();
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}

function toggleTheme() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    localStorage.setItem('darkMode', isDarkMode);
}

function hydrateSettingsModal() {
    const settings = window.QuarkLLMConfig.getSettings();
    currentModel = settings.model;
    document.getElementById('api-key-input').value = settings.apiKey;
    document.getElementById('base-url-input').value = settings.baseUrl;
    document.getElementById('model-input').value = settings.model;

    const toggle = document.getElementById('model-toggle');
    const isChatMode = settings.model === 'deepseek-chat';
    toggle.classList.toggle('off', isChatMode);
    updateModelInfo();
}

function updateModelInfo() {
    const isChatMode = currentModel === 'deepseek-chat';
    document.querySelector('.model-info').textContent = isChatMode ? "CHAT / 聊天" : "REASONER / 推理";
}

async function sendMessage() {
    const settings = window.QuarkLLMConfig.getSettings();
    if (!settings.apiKey) {
        alert("请先设置 API Key");
        toggleModal(true);
        return;
    }

    const inputEl = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const text = inputEl.value.trim();

    if (!text && currentAttachments.length === 0) return;
    sendBtn.disabled = true;

    let fullPrompt = text;
    if (currentAttachments.length > 0) {
        fullPrompt = currentAttachments.map(a => `[文件: ${a.name}]\n${a.content}`).join('\n\n');
        if (text) {
            fullPrompt += `\n\n${text}`;
        }
    }

    appendMessageUI('user', text || "[发送文件]");
    inputEl.value = "";
    inputEl.style.height = 'auto';

    const historyBox = document.getElementById('chat-history');
    const botMsgDiv = document.createElement('div');
    botMsgDiv.className = 'bot-msg';
    botMsgDiv.innerHTML = `<div class="reasoning-box" style="display:none"></div><div class="markdown-content">思考中...</div>`;
    historyBox.appendChild(botMsgDiv);
    historyBox.scrollTop = historyBox.scrollHeight;

    const reasoningBox = botMsgDiv.querySelector('.reasoning-box');
    const contentBox = botMsgDiv.querySelector('.markdown-content');

    try {
        const response = await fetch(window.QuarkLLMConfig.buildChatEndpoint(settings.baseUrl), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: currentModel,
                messages: getContext(fullPrompt),
                stream: true
            })
        });

        if (!response.ok || !response.body) {
            throw new Error(await window.QuarkLLMConfig.parseErrorResponse(response));
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
                if (!line.startsWith('data: ') || line === 'data: [DONE]') {
                    continue;
                }

                try {
                    const data = JSON.parse(line.substring(6));
                    const delta = data?.choices?.[0]?.delta || {};

                    if (delta.reasoning_content) {
                        fullReasoning += delta.reasoning_content;
                        reasoningBox.style.display = "block";
                        reasoningBox.textContent = fullReasoning;
                    }

                    if (delta.content) {
                        fullText += delta.content;
                        contentBox.innerHTML = marked.parse(fullText);
                    }

                    historyBox.scrollTop = historyBox.scrollHeight;
                } catch (error) {
                    console.warn('解析流式响应失败:', error);
                }
            }
        }

        addCopyButton(botMsgDiv, fullText);
        saveToLocalStorage(fullPrompt, fullText);
    } catch (err) {
        contentBox.innerHTML = `<span style="color:red">错误: ${err.message}</span>`;
    } finally {
        sendBtn.disabled = false;
        currentAttachments = [];
        document.getElementById('drop-area').classList.remove('active');
        document.getElementById('drop-area').textContent = "已就绪：等待发送文件内容...";
    }
}

function getContext(newPrompt) {
    const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    if (currentChatId !== null && chats[currentChatId]) {
        const history = chats[currentChatId].messages.slice(-CONTEXT_LIMIT);
        return [...history, { role: "user", content: newPrompt }];
    }
    return [{ role: "user", content: newPrompt }];
}

function saveToLocalStorage(userMsg, botMsg) {
    const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    const msgPair = [{ role: "user", content: userMsg }, { role: "assistant", content: botMsg }];

    if (currentChatId === null) {
        const title = userMsg.substring(0, 15) || "新会话";
        chats.unshift({ title, messages: msgPair });
        currentChatId = 0;
    } else {
        chats[currentChatId].messages.push(...msgPair);
    }
    localStorage.setItem('deepseekChats', JSON.stringify(chats));
    loadHistoryList();
}

function loadHistoryList() {
    const list = document.getElementById('history-list');
    const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    list.innerHTML = "";

    chats.forEach((chat, i) => {
        const div = document.createElement('div');
        div.className = `history-item ${i === currentChatId ? 'active' : ''}`;
        div.innerHTML = `<span>${chat.title}</span><button onclick="deleteChat(${i}, event)">×</button>`;
        div.onclick = () => {
            currentChatId = i;
            renderChat(chat);
            loadHistoryList();
        };
        list.appendChild(div);
    });
}

function renderChat(chat) {
    const historyBox = document.getElementById('chat-history');
    historyBox.innerHTML = "";
    document.getElementById('chat-title').textContent = chat.title;
    chat.messages.forEach((message) => appendMessageUI(message.role === 'user' ? 'user' : 'bot', message.content));
}

function deleteChat(index, e) {
    e.stopPropagation();
    const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    chats.splice(index, 1);
    localStorage.setItem('deepseekChats', JSON.stringify(chats));
    createNewChat();
}

function createNewChat() {
    currentChatId = null;
    document.getElementById('chat-history').innerHTML = "";
    document.getElementById('chat-title').textContent = "新会话";
    loadHistoryList();
}

function appendMessageUI(role, text) {
    const div = document.createElement('div');
    div.className = `${role}-msg`;
    div.innerHTML = role === 'bot' ? `<div class="markdown-content">${marked.parse(text)}</div>` : text;
    document.getElementById('chat-history').appendChild(div);
    if (role === 'bot') addCopyButton(div, text);
    document.getElementById('chat-history').scrollTop = document.getElementById('chat-history').scrollHeight;
}

function addCopyButton(parent, text) {
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'COPY';
    btn.onclick = () => {
        navigator.clipboard.writeText(text);
        btn.textContent = 'DONE';
        setTimeout(() => {
            btn.textContent = 'COPY';
        }, 2000);
    };
    parent.appendChild(btn);
}

function toggleModel() {
    const btn = document.getElementById('model-toggle');
    btn.classList.toggle('off');
    currentModel = btn.classList.contains('off') ? "deepseek-chat" : "deepseek-reasoner";
    document.getElementById('model-input').value = currentModel;
    updateModelInfo();
}

function saveApiSettings() {
    const settings = window.QuarkLLMConfig.saveSettings({
        apiKey: document.getElementById('api-key-input').value.trim(),
        baseUrl: document.getElementById('base-url-input').value.trim(),
        model: document.getElementById('model-input').value.trim() || currentModel
    });

    currentModel = settings.model;
    const toggle = document.getElementById('model-toggle');
    toggle.classList.toggle('off', currentModel === 'deepseek-chat');
    document.getElementById('model-input').value = currentModel;
    updateModelInfo();
    toggleModal(false);
}

function toggleModal(show) {
    document.getElementById('settings-modal').style.display = show ? 'flex' : 'none';
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (arg) => {
        currentAttachments.push({ name: file.name, content: arg.target.result });
        const dropArea = document.getElementById('drop-area');
        dropArea.classList.add('active');
        dropArea.textContent = `文件已就绪: ${file.name}`;
    };
    reader.readAsText(file);
}
