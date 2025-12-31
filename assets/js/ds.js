const API_URL = 'https://api.deepseek.com/v1/chat/completions';
const CONTEXT_LIMIT = 15;

let currentChatId = null;
let currentModel = "deepseek-reasoner";
let isDarkMode = false;
let currentAttachments = [];

window.onload = () => {
    initApp();
};

function initApp() {
    // 绑定基础事件
    document.getElementById('model-toggle').onclick = toggleModel;
    document.getElementById('new-chat-btn').onclick = createNewChat;
    document.getElementById('sidebar-toggle').onclick = toggleSidebar;
    document.getElementById('theme-toggle').onclick = toggleTheme;
    document.getElementById('settings-btn').onclick = () => toggleModal(true);
    document.getElementById('close-settings').onclick = () => toggleModal(false);
    document.getElementById('save-settings').onclick = saveApiKey;
    document.getElementById('send-btn').onclick = sendMessage;

    // 输入框自动高度与回车发送
    const userInput = document.getElementById('user-input');
    userInput.oninput = function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    };
    userInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    document.getElementById('file-btn').onclick = () => document.getElementById('file-input').click();
    document.getElementById('file-input').onchange = handleFileSelect;

    loadHistoryList();
    if (localStorage.getItem('darkMode') === 'true') toggleTheme();
}

// 侧边栏与主题切换
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('collapsed'); }
function toggleTheme() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    localStorage.setItem('darkMode', isDarkMode);
}

// 核心：发送消息
async function sendMessage() {
    const apiKey = localStorage.getItem('ds_api_key');
    if (!apiKey) { alert("请先设置 API Key"); toggleModal(true); return; }

    const inputEl = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const text = inputEl.value.trim();

    if (!text && currentAttachments.length === 0) return;
    sendBtn.disabled = true;

    // 构建内容
    let fullPrompt = text;
    if (currentAttachments.length > 0) {
        fullPrompt = currentAttachments.map(a => `[文件: ${a.name}]\n${a.content}`).join('\n') + "\n\n" + text;
    }

    // UI 显示用户消息
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
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: currentModel,
                messages: getContext(fullPrompt),
                stream: true
            })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let fullReasoning = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (let line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.substring(6));
                        const delta = data.choices[0].delta;

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
                    } catch (e) { }
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
    }
}

// 历史与存储逻辑
function getContext(newPrompt) {
    let chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    if (currentChatId !== null && chats[currentChatId]) {
        let history = chats[currentChatId].messages.slice(-CONTEXT_LIMIT);
        return [...history, { role: "user", content: newPrompt }];
    }
    return [{ role: "user", content: newPrompt }];
}

function saveToLocalStorage(userMsg, botMsg) {
    let chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    const msgPair = [{ role: "user", content: userMsg }, { role: "assistant", content: botMsg }];

    if (currentChatId === null) {
        const title = userMsg.substring(0, 15);
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
    chat.messages.forEach(m => appendMessageUI(m.role === 'user' ? 'user' : 'bot', m.content));
}

function deleteChat(index, e) {
    e.stopPropagation();
    let chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
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

// UI 辅助
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
        setTimeout(() => btn.textContent = 'COPY', 2000);
    };
    parent.appendChild(btn);
}

function toggleModel() {
    const btn = document.getElementById('model-toggle');
    btn.classList.toggle('off');
    currentModel = btn.classList.contains('off') ? "deepseek-chat" : "deepseek-reasoner";
    document.querySelector('.model-info').textContent = currentModel === "deepseek-chat" ? "CHAT / 聊天" : "REASONER / 推理";
}

function saveApiKey() {
    const key = document.getElementById('api-key-input').value.trim();
    if (key) { localStorage.setItem('ds_api_key', key); toggleModal(false); }
}

function toggleModal(show) { document.getElementById('settings-modal').style.display = show ? 'flex' : 'none'; }

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (arg) => {
        currentAttachments.push({ name: file.name, content: arg.target.result });
        const da = document.getElementById('drop-area');
        da.classList.add('active');
        da.textContent = "文件已就绪: " + file.name;
    };
    reader.readAsText(file);
}