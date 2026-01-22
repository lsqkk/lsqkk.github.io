let recognition = null;
let isRecording = false;
let finalTranscript = '';

// 初始化语音识别
function initializeRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        alert("当前浏览器不支持语音识别功能，请使用最新版Chrome浏览器");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';

    recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }
        document.getElementById('transcript').value = finalTranscript + interimTranscript;
        autoSave();
    };

    recognition.onerror = (event) => {
        console.error('识别错误:', event.error);
        updateStatus(`错误: ${event.error}`);
    };

    recognition.onend = () => {
        if (isRecording) {
            recognition.start(); // 自动重新开始
        }
    };
}

function startRecognition() {
    if (!recognition) initializeRecognition();

    recognition.start();
    isRecording = true;
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'flex';
    updateStatus("录音中...");
    loadSavedText();
}

function stopRecognition() {
    recognition.stop();
    isRecording = false;
    document.getElementById('startBtn').style.display = 'flex';
    document.getElementById('stopBtn').style.display = 'none';
    updateStatus("已停止");
}

function updateStatus(text) {
    document.getElementById('status').textContent = text;
}

// 自动保存到localStorage
function autoSave() {
    localStorage.setItem('voiceTranscript', document.getElementById('transcript').value);
}

// 加载保存的内容
function loadSavedText() {
    const saved = localStorage.getItem('voiceTranscript');
    if (saved) {
        document.getElementById('transcript').value = saved;
        finalTranscript = saved;
    }
}

// 复制到剪贴板
function copyToClipboard() {
    const transcript = document.getElementById('transcript');
    transcript.select();
    document.execCommand('copy');

    // 显示复制成功提示
    const copySuccess = document.getElementById('copySuccess');
    copySuccess.textContent = '内容已复制！';
    copySuccess.classList.add('show');
    setTimeout(() => {
        copySuccess.classList.remove('show');
    }, 2000);
}

// 复制当前页面URL
function copyCurrentUrl() {
    const url = window.location.href;
    const tempInput = document.createElement('input');
    document.body.appendChild(tempInput);
    tempInput.value = url;
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);

    const copySuccess = document.getElementById('copySuccess');
    copySuccess.textContent = '链接已复制！';
    copySuccess.classList.add('show');
    setTimeout(() => {
        copySuccess.classList.remove('show');
    }, 2000);
}

// 初始化加载保存内容
window.onload = loadSavedText;

// 文本框内容变化时保存
document.getElementById('transcript').addEventListener('input', autoSave);
document.addEventListener('DOMContentLoaded', function () {
    const features = document.querySelectorAll('.feature-line');
    let current = 0;

    function cycleFeatures() {
        // 移除所有active类
        features.forEach(f => f.classList.remove('active'));

        // 添加当前active类
        features[current].classList.add('active');

        // 更新索引
        current = (current + 1) % features.length;
    }

    // 初始显示第一个
    cycleFeatures();

    // 每3秒切换一次
    setInterval(cycleFeatures, 3000);
});