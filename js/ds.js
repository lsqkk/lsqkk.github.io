const WORKER_URL = 'https://lsqkk-github-io.vercel.app/api/deepseek-proxy';
const CORRECT_PASSWORD_HASH = "fc5e038d38a57032085441e7fe7010b0";
let currentChatId = null;
let currentModel = "deepseek-reasoner";
let isDarkMode = false;
let currentAttachments = [];

// 初始化函数
window.onload = function () {
    const password = prompt("请输入密码：");
    if (password) {
        if (CryptoJS.MD5(password).toString() !== CORRECT_PASSWORD_HASH) {
            alert("密码错误！");
            disablePage();
        } else {
            initApp();
        }
    } else {
        alert("密码不能为空！");
        disablePage();
    }
};

function initApp() {
    // 初始化事件监听
    document.getElementById('model-toggle').addEventListener('click', toggleModel);
    document.getElementById('new-chat-btn').addEventListener('click', createNewChat);
    document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('user-input').addEventListener('keydown', handleKeyDown);
    document.getElementById('file-btn').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', handleFileSelect);
    document.getElementById('chat-title').addEventListener('click', renameCurrentChat);

    // 初始化拖放功能
    initDragAndDrop();

    // 加载历史记录
    loadHistoryList();

    // 检查保存的主题偏好
    if (localStorage.getItem('darkMode') === 'true') {
        toggleTheme();
    }

    // 初始化侧边栏状态
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add("collapsed");
    }
}

function disablePage() {
    document.getElementById('user-input').disabled = true;
    document.getElementById('send-btn').disabled = true;
    document.getElementById('chat-container').innerHTML += '<div class="error">密码错误，无法使用该页面。</div>';
}

function toggleTheme() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle("dark-mode", isDarkMode);
    localStorage.setItem('darkMode', isDarkMode ? 'true' : 'false');
}

function toggleModel() {
    const toggleBtn = document.getElementById('model-toggle');
    toggleBtn.classList.toggle("off");
    currentModel = toggleBtn.classList.contains("off") ? "deepseek-chat" : "deepseek-reasoner";
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle("collapsed");
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function initDragAndDrop() {
    const dropArea = document.getElementById('drop-area');
    const inputArea = document.getElementById('input-area');

    // 显示/隐藏拖放区域
    document.getElementById('user-input').addEventListener('focus', () => {
        dropArea.classList.add('active');
    });

    document.getElementById('user-input').addEventListener('blur', () => {
        dropArea.classList.remove('active');
    });

    // 拖放事件处理
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        inputArea.addEventListener(eventName, preventDefaults, false);
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        dropArea.classList.add('highlight');
    }

    function unhighlight() {
        dropArea.classList.remove('highlight');
    }

    dropArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFiles(files);
    }
}

async function handleFiles(files) {
    const validFiles = Array.from(files).filter(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        return ['png', 'jpg', 'jpeg', 'txt', 'md'].includes(ext);
    });

    if (validFiles.length === 0) {
        alert('请选择支持的文件类型(png/jpg/txt/md)');
        return;
    }

    for (const file of validFiles) {
        const ext = file.name.split('.').pop().toLowerCase();
        let contentPreview = '';

        if (['png', 'jpg', 'jpeg'].includes(ext)) {
            // 图片文件，使用OCR识别
            try {
                const { data: { text } } = await Tesseract.recognize(
                    file,
                    'chi_sim',
                    {
                        logger: m => console.log(m)
                    }
                );

                // 处理OCR结果
                contentPreview = processOCRText(text);
            } catch (err) {
                console.error('OCR识别失败:', err);
                contentPreview = '[图片识别失败]';
            }
        } else if (['txt', 'md'].includes(ext)) {
            // 文本文件，直接读取内容
            try {
                const text = await readFileAsText(file);
                contentPreview = text.substring(0, 500);
            } catch (err) {
                console.error('读取文件失败:', err);
                contentPreview = '[读取文件失败]';
            }
        }

        currentAttachments.push({
            name: file.name,
            type: ext,
            content: contentPreview
        });
    }

    // 显示提示
    const dropArea = document.getElementById('drop-area');
    dropArea.innerHTML = `<p>已添加 ${validFiles.length} 个附件</p>`;
    setTimeout(() => {
        dropArea.classList.remove('active');
    }, 2000);
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsText(file);
    });
}

function processOCRText(text) {
    // 中文标点Unicode范围
    const chinesePunctuation = '\\u3000-\\u303F\\uFF00-\\uFFEF\\u2000-\\u206F';

    // 第一步：保护换行符
    let processedText = text.replace(/\n/g, '{保护换行符}');

    // 第二步：处理汉字和标点间的空格
    processedText = processedText.replace(
        new RegExp(`([\\u4e00-\\u9fa5${chinesePunctuation}])\\s+(?=[\\u4e00-\\u9fa5${chinesePunctuation}])`, 'g'),
        '$1'
    );

    // 第三步：恢复换行符
    processedText = processedText.replace(/{保护换行符}/g, '\n');

    // 第四步：合并多余空行（保留1-2个换行作为段落分隔）
    processedText = processedText.replace(/\n{3,}/g, '\n\n');

    // 第五步：确保标点前无空格
    processedText = processedText.replace(
        new RegExp(`\\s+([${chinesePunctuation}])`, 'g'),
        '$1'
    );

    // 替换错误的中英文符号
    processedText = processedText.replace(/\s*,\s*/g, '，');
    processedText = processedText.replace(/\s*;\s*/g, '；');
    processedText = processedText.replace(/\s*:\s*/g, '：');
    processedText = processedText.replace(/\s*\?\s*/g, '？');
    processedText = processedText.replace(/\s*!\s*/g, '！');
    processedText = processedText.replace(/\s*"\s*/g, '“');
    processedText = processedText.replace(/"\s*/g, '”');

    return processedText.substring(0, 500); // 只返回前500个字符
}

function formatTime(timestamp) {
    if (!timestamp) return "未知时间";
    const now = new Date();
    const date = new Date(timestamp);
    const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return "今天";
    if (diffInDays === 1) return "昨天";
    if (diffInDays < 7) return "一周内";
    if (diffInDays < 30) return "一个月内";
    return "很久之前";
}

function groupChatsByTime(chats) {
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const groups = {
        today: [],
        yesterday: [],
        lastWeek: [],
        lastMonth: [],
        older: []
    };

    chats.forEach(chat => {
        const timestamp = chat.timestamp || chat.messages[0]?.timestamp || Date.now();
        const date = new Date(timestamp);

        if (date >= today) {
            groups.today.push({ ...chat, timestamp });
        } else if (date >= yesterday) {
            groups.yesterday.push({ ...chat, timestamp });
        } else if (date >= lastWeek) {
            groups.lastWeek.push({ ...chat, timestamp });
        } else if (date >= lastMonth) {
            groups.lastMonth.push({ ...chat, timestamp });
        } else {
            groups.older.push({ ...chat, timestamp });
        }
    });

    return groups;
}

function loadHistoryList() {
    try {
        const historyList = document.getElementById('history-list');
        const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
        const groupedChats = groupChatsByTime(chats);

        historyList.innerHTML = '';

        // 按时间分组显示
        const sections = [
            { title: "今天", key: "today", chats: groupedChats.today },
            { title: "昨天", key: "yesterday", chats: groupedChats.yesterday },
            { title: "一周内", key: "lastWeek", chats: groupedChats.lastWeek },
            { title: "一个月内", key: "lastMonth", chats: groupedChats.lastMonth },
            { title: "更早", key: "older", chats: groupedChats.older }
        ];

        sections.forEach(section => {
            if (section.chats.length === 0) return;

            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'history-section';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'section-title';
            titleDiv.textContent = section.title;
            sectionDiv.appendChild(titleDiv);

            section.chats.forEach((chat, index) => {
                const globalIndex = chats.findIndex(c => c.timestamp === chat.timestamp);
                const chatName = chat.name || "新会话";

                const itemDiv = document.createElement('div');
                itemDiv.className = 'history-item';
                if (globalIndex === currentChatId) {
                    itemDiv.classList.add("active");
                }
                itemDiv.textContent = chatName.length > 15 ? chatName.substring(0, 15) + "..." : chatName;
                itemDiv.onclick = () => loadChat(globalIndex);

                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'history-item-actions';

                const renameBtn = document.createElement('button');
                renameBtn.className = 'history-item-btn';
                renameBtn.innerHTML = '✏️';
                renameBtn.title = '重命名';
                renameBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    renameChat(globalIndex);
                };

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'history-item-btn';
                deleteBtn.innerHTML = '🗑️';
                deleteBtn.title = '删除';
                deleteBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    deleteChat(globalIndex);
                };

                actionsDiv.appendChild(renameBtn);
                actionsDiv.appendChild(deleteBtn);
                itemDiv.appendChild(actionsDiv);
                sectionDiv.appendChild(itemDiv);
            });

            historyList.appendChild(sectionDiv);
        });

        if (chats.length === 0) {
            historyList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-color);opacity:0.7">暂无历史会话</div>';
            currentChatId = null;
        }
    } catch (e) {
        console.error('加载历史记录失败:', e);
        localStorage.removeItem('deepseekChats');
        loadHistoryList();
    }
}

function renameChat(index) {
    const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    if (index >= 0 && index < chats.length) {
        const currentName = chats[index].name || "新会话";
        const newName = prompt("请输入新的会话名称：", currentName);
        if (newName !== null && newName.trim() !== "") {
            chats[index].name = newName.trim();
            localStorage.setItem('deepseekChats', JSON.stringify(chats));
            loadHistoryList();

            // 如果是当前会话，更新标题
            if (index === currentChatId) {
                document.getElementById('chat-title').textContent = newName.trim();
            }
        }
    }
}

function renameCurrentChat() {
    if (currentChatId !== null) {
        renameChat(currentChatId);
    } else {
        const newName = prompt("请输入会话名称：", "新会话");
        if (newName !== null && newName.trim() !== "") {
            document.getElementById('chat-title').textContent = newName.trim();
            saveCurrentChat(); // 保存时会自动创建新会话
        }
    }
}

function deleteChat(index) {
    if (confirm('确定要删除此会话吗？此操作不可撤销。')) {
        const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
        if (index >= 0 && index < chats.length) {
            chats.splice(index, 1);
            localStorage.setItem('deepseekChats', JSON.stringify(chats));

            if (currentChatId === index) {
                currentChatId = null;
                document.getElementById('chat-history').innerHTML = '<div class="bot-msg">你好！我是 DeepSeek，请问有什么可以帮您？</div>';
                document.getElementById('chat-title').textContent = "新会话";
            } else if (currentChatId > index) {
                currentChatId--;
            }
            loadHistoryList();
        }
    }
}

function createNewChat() {
    saveCurrentChat();
    currentChatId = null;
    currentAttachments = [];
    const chatHistory = document.getElementById('chat-history');
    chatHistory.innerHTML = '<div class="bot-msg">你好！我是 DeepSeek，请问有什么可以帮您？</div>';
    document.getElementById('chat-title').textContent = "新会话";
    document.getElementById('drop-area').innerHTML = '<p>拖放文件到这里或点击下方按钮选择</p><p>支持图片(png/jpg)、文本(txt/md)文件</p>';
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function saveCurrentChat() {
    const chatHistory = document.getElementById('chat-history');
    const messages = [];

    chatHistory.querySelectorAll('.user-msg, .bot-msg').forEach(msg => {
        if (msg.classList.contains("error") || msg.classList.contains("loading")) return;

        const timestamp = Date.now();

        if (msg.classList.contains("user-msg")) {
            messages.push({
                role: "user",
                content: msg.textContent.trim(),
                timestamp: timestamp
            });
        } else if (msg.classList.contains("bot-msg")) {
            messages.push({
                role: "assistant",
                content: msg.querySelector('.markdown-content')?.textContent.trim() || msg.textContent.trim(),
                timestamp: timestamp
            });
        }
    });

    if (messages.length > 0) {
        let chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
        const chatName = document.getElementById('chat-title').textContent;

        if (currentChatId !== null && chats[currentChatId]) {
            chats[currentChatId].messages = messages;
            chats[currentChatId].timestamp = messages[0].timestamp;
            chats[currentChatId].name = chatName;
        } else {
            chats.push({
                messages,
                timestamp: messages[0].timestamp,
                name: chatName
            });
            currentChatId = chats.length - 1;
        }

        localStorage.setItem('deepseekChats', JSON.stringify(chats));
        loadHistoryList();
    }
}

function loadChat(index) {
    const chats = JSON.parse(localStorage.getItem('deepseekChats') || '[]');
    if (index >= 0 && index < chats.length) {
        currentChatId = index;
        currentAttachments = [];
        const chatHistory = document.getElementById('chat-history');
        chatHistory.innerHTML = "";
        const messages = chats[index].messages;

        // 更新标题
        document.getElementById('chat-title').textContent = chats[index].name || "新会话";

        messages.forEach(msg => {
            if (msg.role === "user") {
                const msgDiv = document.createElement("div");
                msgDiv.className = "user-msg";
                msgDiv.textContent = msg.content;
                chatHistory.appendChild(msgDiv);
            } else {
                const msgDiv = document.createElement("div");
                msgDiv.className = "bot-msg";
                msgDiv.innerHTML = '<div class="markdown-content"></div>';
                msgDiv.querySelector('.markdown-content').innerHTML = marked.parse(msg.content);

                const copyBtn = document.createElement("button");
                copyBtn.className = "copy-btn";
                copyBtn.innerText = "复制";
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(msg.content);
                    copyBtn.innerText = "已复制";
                    setTimeout(() => copyBtn.innerText = "复制", 2000);
                };
                msgDiv.appendChild(copyBtn);

                chatHistory.appendChild(msgDiv);
            }
        });

        chatHistory.scrollTop = chatHistory.scrollHeight;
        document.getElementById('drop-area').innerHTML = '<p>拖放文件到这里或点击下方按钮选择</p><p>支持图片(png/jpg)、文本(txt/md)文件</p>';
    }
}

async function sendMessage() {
    const userInput = document.getElementById('user-input');
    const chatHistory = document.getElementById('chat-history');
    const sendBtn = document.getElementById('send-btn');

    if (sendBtn.disabled) return;
    sendBtn.disabled = true;

    if (userInput.value.trim() || currentAttachments.length > 0) {
        let message = userInput.value.trim();

        // 添加附件信息
        if (currentAttachments.length > 0) {
            const attachmentsText = currentAttachments.map(att => {
                return `【附件】${att.name} 内容为: ${att.content}`;
            }).join('\n\n');

            message = message ? `${message} - ${attachmentsText}` : attachmentsText;
        }

        const userMsgDiv = document.createElement("div");
        userMsgDiv.className = "user-msg";
        userMsgDiv.textContent = userInput.value.trim() || "[发送了附件]";
        chatHistory.appendChild(userMsgDiv);

        const loadingDiv = document.createElement("div");
        loadingDiv.className = "loading";
        loadingDiv.textContent = "思考中...";
        chatHistory.appendChild(loadingDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        try {
            const requestData = {
                model: currentModel,
                messages: [{ role: "user", content: message }],
                stream: true
            };

            const response = await fetch(WORKER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`请求失败: ${response.status}`);
            }

            const reader = await response.body.getReader();
            const decoder = new TextDecoder();
            let botResponse = "";

            const botMsgDiv = document.createElement("div");
            botMsgDiv.className = "bot-msg";
            botMsgDiv.innerHTML = '<div class="markdown-content"></div>';
            chatHistory.appendChild(botMsgDiv);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.trim() === "data: [DONE]") continue;

                    if (line.startsWith("data:")) {
                        try {
                            const data = JSON.parse(line.slice(5));
                            const content = data.choices[0].delta.content || "";

                            if (content) {
                                botResponse += content;
                                botMsgDiv.querySelector('.markdown-content').innerHTML = marked.parse(botResponse);
                                chatHistory.scrollTop = chatHistory.scrollHeight;
                            }
                        } catch (e) {
                            console.error("JSON解析错误:", e);
                        }
                    }
                }
            }

            loadingDiv.remove();

            const copyBtn = document.createElement("button");
            copyBtn.className = "copy-btn";
            copyBtn.innerText = "复制";
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(botResponse);
                copyBtn.innerText = "已复制";
                setTimeout(() => copyBtn.innerText = "复制", 2000);
            };
            botMsgDiv.appendChild(copyBtn);
        } catch (error) {
            document.querySelector('.loading')?.remove();
            const errorDiv = document.createElement("div");
            errorDiv.className = "error";
            errorDiv.textContent = `错误：${error.message}`;
            chatHistory.appendChild(errorDiv);
        } finally {
            userInput.value = "";
            sendBtn.disabled = false;
            chatHistory.scrollTop = chatHistory.scrollHeight;
            currentAttachments = [];
            document.getElementById('drop-area').innerHTML = '<p>拖放文件到这里或点击下方按钮选择</p><p>支持图片(png/jpg)、文本(txt/md)文件</p>';
            saveCurrentChat();
        }
    } else {
        sendBtn.disabled = false;
    }
}

// 优化窗口大小变化时的侧边栏行为
let resizeTimer;
window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const sidebar = document.getElementById('sidebar');

        if (window.innerWidth <= 768) {
            if (!sidebar.classList.contains("collapsed")) {
                sidebar.classList.add("collapsed");
            }
        } else {
            // 在窗口放大时恢复侧边栏状态
            sidebar.classList.remove("collapsed");
        }
    }, 200);
});

// 自动调整输入框高度
document.getElementById('user-input').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});
