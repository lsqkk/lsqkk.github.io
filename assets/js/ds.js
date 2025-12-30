const API_URL = 'https://api.deepseek.com/v1/chat/completions';
const CONTEXT_LIMIT = 15; 
const MAX_CONTEXT_CHARS = 8000;

let currentChatId = null;
let currentModel = "deepseek-reasoner";
let isDarkMode = false;
let currentAttachments = [];

window.onload = () => {
    initApp();
};

function initApp() {
    // 基础事件绑定
    document.getElementById('model-toggle').onclick = toggleModel;
    document.getElementById('new-chat-btn').onclick = createNewChat;
    document.getElementById('sidebar-toggle').onclick = toggleSidebar;
    document.getElementById('theme-toggle').onclick = toggleTheme;
    document.getElementById('settings-btn').onclick = () => toggleModal(true);
    document.getElementById('close-settings').onclick = () => toggleModal(false);
    document.getElementById('save-settings').onclick = saveApiKey;
    document.getElementById('send-btn').onclick = sendMessage; // 修复：按钮点击发送
    
    document.getElementById('user-input').onkeydown = (e) => {
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

// 获取上下文：确保记忆正常
function getContextMessages(newPrompt) {
    let messages = [];
    const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    
    if (currentChatId !== null && chats[currentChatId]) {
        messages = [...chats[currentChatId].messages];
    }

    // 限制历史长度
    if (messages.length > CONTEXT_LIMIT) {
        messages = messages.slice(-CONTEXT_LIMIT);
    }

    messages.push({ role: "user", content: newPrompt });
    return messages;
}

async function sendMessage() {
    const apiKey = localStorage.getItem('ds_api_key');
    if (!apiKey) { toggleModal(true); return; }

    const inputEl = document.getElementById('user-input');
    const text = inputEl.value.trim();
    if (!text && currentAttachments.length === 0) return;

    const sendBtn = document.getElementById('send-btn');
    sendBtn.disabled = true;

    // 构建完整 Prompt
    let fullPrompt = text;
    if (currentAttachments.length > 0) {
        fullPrompt = currentAttachments.map(a => `[File: ${a.name}]\n${a.content}`).join('\n') + "\n\n" + text;
    }

    appendMessage('user', text || "[File Sent]");
    inputEl.value = "";
    
    // 创建 Bot 消息框
    const chatHistory = document.getElementById('chat-history');
    const botMsgDiv = document.createElement('div');
    botMsgDiv.className = 'bot-msg';
    botMsgDiv.innerHTML = `<div class="reasoning-box" style="display:none"></div><div class="markdown-content">...</div>`;
    chatHistory.appendChild(botMsgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    const reasoningBox = botMsgDiv.querySelector('.reasoning-box');
    const contentBox = botMsgDiv.querySelector('.markdown-content');

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: currentModel,
                messages: getContextMessages(fullPrompt),
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
                        
                        // 修复：处理思维链 (reasoning_content)
                        if (delta.reasoning_content) {
                            fullReasoning += delta.reasoning_content;
                            reasoningBox.style.display = "block";
                            reasoningBox.textContent = "THOUGHT: " + fullReasoning;
                        }
                        
                        // 处理正文
                        if (delta.content) {
                            fullText += delta.content;
                            contentBox.innerHTML = marked.parse(fullText);
                        }
                        chatHistory.scrollTop = chatHistory.scrollHeight;
                    } catch (e) {}
                }
            }
        }
        
        // 渲染完成后添加复制按钮并保存
        addCopyButton(botMsgDiv, fullText);
        saveChat(fullPrompt, fullText);

    } catch (err) {
        contentBox.innerHTML = `<span style="color:red">SYSTEM ERROR: ${err.message}</span>`;
    } finally {
        sendBtn.disabled = false;
        currentAttachments = [];
        resetDropArea();
    }
}

// 修复：完善保存逻辑与重命名
function saveChat(userMsg, botMsg) {
    let chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    
    if (currentChatId === null) {
        // 新会话：自动取前10个字作为标题
        const newChat = {
            title: userMsg.substring(0, 12) + (userMsg.length > 12 ? "..." : ""),
            messages: [
                { role: "user", content: userMsg },
                { role: "assistant", content: botMsg }
            ]
        };
        chats.unshift(newChat); // 最新在最前
        currentChatId = 0;
    } else {
        chats[currentChatId].messages.push({ role: "user", content: userMsg });
        chats[currentChatId].messages.push({ role: "assistant", content: botMsg });
    }
    
    localStorage.setItem('deepseekChats', JSON.stringify(chats));
    loadHistoryList();
}

function loadHistoryList() {
    const list = document.getElementById('history-list');
    const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    list.innerHTML = "";
    
    chats.forEach((chat, index) => {
        const item = document.createElement('div');
        item.className = `history-item ${index === currentChatId ? 'active' : ''}`;
        item.innerHTML = `<span>${chat.title}</span><button onclick="deleteChat(${index}, event)">×</button>`;
        item.onclick = () => loadChat(index);
        list.appendChild(item);
    });
}

function loadChat(index) {
    currentChatId = index;
    const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    const chat = chats[index];
    const historyBox = document.getElementById('chat-history');
    historyBox.innerHTML = "";
    
    chat.messages.forEach(msg => {
        appendMessage(msg.role === 'user' ? 'user' : 'bot', msg.content);
    });
    document.getElementById('chat-title').textContent = chat.title;
    loadHistoryList();
}

function deleteChat(index, event) {
    event.stopPropagation();
    let chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    chats.splice(index, 1);
    localStorage.setItem('deepseekChats', JSON.stringify(chats));
    createNewChat();
}

// 辅助功能
function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `${role}-msg`;
    div.innerHTML = role === 'bot' ? `<div class="markdown-content">${marked.parse(text)}</div>` : text;
    document.getElementById('chat-history').appendChild(div);
    if(role === 'bot') addCopyButton(div, text);
    return div;
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

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}

function toggleTheme() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    localStorage.setItem('darkMode', isDarkMode);
}

function toggleModel() {
    const btn = document.getElementById('model-toggle');
    btn.classList.toggle('off');
    currentModel = btn.classList.contains('off') ? "deepseek-chat" : "deepseek-reasoner";
    document.querySelector('.model-info').textContent = currentModel.replace('-', ' ').toUpperCase();
}

function createNewChat() {
    currentChatId = null;
    document.getElementById('chat-history').innerHTML = "";
    document.getElementById('chat-title').textContent = "NEW CHAT";
    loadHistoryList();
}

function saveApiKey() {
    const val = document.getElementById('api-key-input').value;
    if(val) {
        localStorage.setItem('ds_api_key', val);
        toggleModal(false);
    }
}

function toggleModal(show) {
    document.getElementById('settings-modal').style.display = show ? 'flex' : 'none';
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (el) => {
        currentAttachments.push({ name: file.name, content: el.target.result });
        document.getElementById('drop-area').classList.add('active');
        document.getElementById('drop-area').textContent = "File Ready: " + file.name;
    };
    reader.readAsText(file);
}

function resetDropArea() {
    const da = document.getElementById('drop-area');
    da.classList.remove('active');
    da.textContent = "释放以上传文本文件 (.txt, .md)";
}