let recognition = null;
let isRecording = false;
let finalTranscript = '';
let noSpeechTimeout = null;
let maxNoSpeechTime = 6000; // 6秒无语音后停止
let isRestarting = false; // 防止重复重启的标志

// 初始化语音识别
function initializeRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        alert("当前浏览器不支持语音识别功能，请使用最新版Chrome或Edge浏览器");
        updateStatus("浏览器不支持语音识别");
        return null;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        console.log('语音识别已开始');
        isRestarting = false; // 重置重启标志
        updateStatus("录音中... 请说话");

        // 设置无语音超时检测
        noSpeechTimeout = setTimeout(() => {
            if (isRecording) {
                console.warn('未检测到语音输入，自动停止');
                updateStatus("未检测到语音，已停止");
                stopRecognition();
            }
        }, maxNoSpeechTime);
    };

    recognition.onresult = (event) => {
        // 清除无语音超时计时器
        if (noSpeechTimeout) {
            clearTimeout(noSpeechTimeout);
            noSpeechTimeout = null;
        }

        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
                updateStatus("录音中...");
            } else {
                interimTranscript += transcript;
            }
        }
        document.getElementById('transcript').value = finalTranscript + interimTranscript;
        autoSave();

        // 重置无语音超时计时器
        if (isRecording && !noSpeechTimeout) {
            noSpeechTimeout = setTimeout(() => {
                if (isRecording) {
                    console.warn('语音输入中断，自动停止');
                    updateStatus("语音中断，已停止");
                    stopRecognition();
                }
            }, maxNoSpeechTime);
        }
    };

    recognition.onerror = (event) => {
        console.error('识别错误:', event.error);

        // 清除超时计时器
        if (noSpeechTimeout) {
            clearTimeout(noSpeechTimeout);
            noSpeechTimeout = null;
        }

        // 重置重启标志
        isRestarting = false;

        switch (event.error) {
            case 'no-speech':
                updateStatus("未检测到语音，请重试");
                // 对于no-speech错误，不自动重启
                isRecording = false;
                document.getElementById('startBtn').style.display = 'flex';
                document.getElementById('stopBtn').style.display = 'none';
                break;
            case 'audio-capture':
                updateStatus("无法访问麦克风，请检查权限");
                alert("请允许访问麦克风，并确保麦克风正常工作");
                isRecording = false;
                document.getElementById('startBtn').style.display = 'flex';
                document.getElementById('stopBtn').style.display = 'none';
                break;
            case 'not-allowed':
                updateStatus("麦克风访问被拒绝");
                alert("请允许浏览器访问麦克风");
                isRecording = false;
                document.getElementById('startBtn').style.display = 'flex';
                document.getElementById('stopBtn').style.display = 'none';
                break;
            case 'network':
                updateStatus("网络错误，请检查连接");
                isRecording = false;
                document.getElementById('startBtn').style.display = 'flex';
                document.getElementById('stopBtn').style.display = 'none';
                break;
            case 'aborted':
            case 'bad-grammar':
            case 'language-not-supported':
                // 这些错误不自动重启
                updateStatus(`识别错误: ${event.error}`);
                isRecording = false;
                document.getElementById('startBtn').style.display = 'flex';
                document.getElementById('stopBtn').style.display = 'none';
                break;
            default:
                updateStatus(`识别错误: ${event.error}`);
        }
    };

    recognition.onend = () => {
        console.log('语音识别已结束');

        // 清除超时计时器
        if (noSpeechTimeout) {
            clearTimeout(noSpeechTimeout);
            noSpeechTimeout = null;
        }

        // 只有在用户主动录音且不在重启过程中才重新启动
        if (isRecording && !isRestarting) {
            console.log('尝试重新启动识别...');
            isRestarting = true; // 设置重启标志

            // 增加延迟，避免频繁重启
            setTimeout(() => {
                if (isRecording && recognition && isRestarting) {
                    try {
                        recognition.start();
                        console.log('重新启动成功');
                    } catch (e) {
                        console.error('重新启动失败:', e);
                        isRestarting = false;
                        // 如果启动失败，停止录音
                        if (e.name === 'InvalidStateError' || e.name === 'AbortError') {
                            updateStatus("录音异常，请重新开始");
                            isRecording = false;
                            document.getElementById('startBtn').style.display = 'flex';
                            document.getElementById('stopBtn').style.display = 'none';
                        }
                    }
                } else {
                    isRestarting = false;
                }
            }, 300); // 增加延迟到300ms
        } else {
            isRestarting = false;
        }
    };

    return recognition;
}

function startRecognition() {
    // 如果已经在录音中，直接返回
    if (isRecording) {
        return;
    }

    // 重置标志
    isRestarting = false;

    // 请求麦克风权限
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(() => {
                // 麦克风权限已授予
                if (!recognition) {
                    recognition = initializeRecognition();
                    if (!recognition) return;
                }

                try {
                    // 停止可能存在的旧实例
                    try { recognition.stop(); } catch (e) { }

                    // 重置转录内容（可选）
                    // finalTranscript = '';

                    isRecording = true;
                    recognition.start();

                    document.getElementById('startBtn').style.display = 'none';
                    document.getElementById('stopBtn').style.display = 'flex';
                    updateStatus("正在启动...");
                    loadSavedText();
                } catch (e) {
                    console.error('启动失败:', e);
                    updateStatus("启动失败，请刷新页面重试");
                    isRecording = false;
                    document.getElementById('startBtn').style.display = 'flex';
                    document.getElementById('stopBtn').style.display = 'none';
                }
            })
            .catch((err) => {
                console.error('麦克风权限被拒绝:', err);
                updateStatus("麦克风访问被拒绝");
                alert("请允许访问麦克风以使用语音转文字功能");
                document.getElementById('startBtn').style.display = 'flex';
                document.getElementById('stopBtn').style.display = 'none';
            });
    } else {
        // 不支持getUserMedia的浏览器
        if (!recognition) {
            recognition = initializeRecognition();
            if (!recognition) return;
        }

        try {
            isRecording = true;
            recognition.start();
            document.getElementById('startBtn').style.display = 'none';
            document.getElementById('stopBtn').style.display = 'flex';
            updateStatus("正在启动...");
            loadSavedText();
        } catch (e) {
            console.error('启动失败:', e);
            updateStatus("启动失败");
            isRecording = false;
            document.getElementById('startBtn').style.display = 'flex';
            document.getElementById('stopBtn').style.display = 'none';
        }
    }
}

function stopRecognition() {
    if (!recognition) return;

    // 重置标志
    isRecording = false;
    isRestarting = false;

    // 清除超时计时器
    if (noSpeechTimeout) {
        clearTimeout(noSpeechTimeout);
        noSpeechTimeout = null;
    }

    try {
        recognition.stop();
    } catch (e) {
        console.error('停止时出错:', e);
    }

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

    // 现代剪贴板API
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(transcript.value)
            .then(() => {
                showCopySuccess('内容已复制！');
            })
            .catch(err => {
                console.error('复制失败:', err);
                // 回退到传统方法
                fallbackCopy(transcript);
            });
    } else {
        // 传统方法
        fallbackCopy(transcript);
    }
}

// 传统复制方法
function fallbackCopy(element) {
    element.select();
    element.setSelectionRange(0, 99999);

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showCopySuccess('内容已复制！');
        } else {
            showCopySuccess('复制失败，请手动选择复制');
        }
    } catch (err) {
        console.error('复制失败:', err);
        showCopySuccess('复制失败');
    }
}

// 复制当前页面URL
function copyCurrentUrl() {
    const url = window.location.href;

    // 现代剪贴板API
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url)
            .then(() => {
                showCopySuccess('链接已复制！');
            })
            .catch(err => {
                console.error('复制失败:', err);
                fallbackCopyUrl(url);
            });
    } else {
        // 传统方法
        fallbackCopyUrl(url);
    }
}

function fallbackCopyUrl(url) {
    const tempInput = document.createElement('input');
    document.body.appendChild(tempInput);
    tempInput.value = url;
    tempInput.select();
    tempInput.setSelectionRange(0, 99999);

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showCopySuccess('链接已复制！');
        } else {
            showCopySuccess('复制失败，请手动复制链接');
        }
    } catch (err) {
        console.error('复制失败:', err);
        showCopySuccess('复制失败');
    } finally {
        document.body.removeChild(tempInput);
    }
}

// 显示复制成功提示
function showCopySuccess(message) {
    const copySuccess = document.getElementById('copySuccess');
    copySuccess.textContent = message;
    copySuccess.classList.add('show');
    setTimeout(() => {
        copySuccess.classList.remove('show');
    }, 2000);
}

// 清理资源
window.addEventListener('beforeunload', () => {
    if (noSpeechTimeout) {
        clearTimeout(noSpeechTimeout);
    }
    if (isRecording && recognition) {
        stopRecognition();
    }
});

// 初始化加载保存内容
window.onload = loadSavedText;

// 文本框内容变化时保存
document.getElementById('transcript').addEventListener('input', autoSave);

// 特征滚动功能
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