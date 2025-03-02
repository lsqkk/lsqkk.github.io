let isMidiPlayback = false; // 新增标志
let activeSources = new Set(); // 存储活动的音频源
let activeKeys = new Set();
let isPlaying = false;
let currentSchedule = [];
let audioContext; // 在全局作用域中定义
const audioCache = new Map(); // 在全局作用域中定义
	const noteColors = {
        0: 0,    // C
        1: 30,   // C#
        2: 60,   // D
        3: 90,   // D#
        4: 120,  // E
        5: 150,  // F
        6: 180,  // F#
        7: 210,  // G
        8: 240,  // G#
        9: 270,  // A
        10: 300, // A#
        11: 330  // B
    };

// 加载音乐列表
async function loadMusicList() {
    const response = await fetch('music_list.json');
    const list = await response.json();
    const select = document.getElementById('musicSelect');
    list.forEach(music => {
        const option = document.createElement('option');
        option.value = music.file;
        option.textContent = music.name;
        select.appendChild(option);
    });
}

// 加载并解析MIDI文件
async function loadMIDI(filename) {
    const response = await fetch(`music/${filename}`);
    const arrayBuffer = await response.arrayBuffer();
    const midi = await new Midi(arrayBuffer);
    return midi;
}

// 播放MIDI音符
function scheduleNotes(tracks) {
    console.log('开始调度音符:', tracks); // 调试信息
    const startTime = audioContext.currentTime; // 使用全局 audioContext
    currentSchedule = []; // 清空之前的调度计划
isMidiPlayback = true; // 标记为MIDI播放状态

    tracks.forEach(track => {
        track.notes.forEach(note => {
            const pianoNote = note.midi - 24; // 将MIDI编号转换为0-87范围
            if (pianoNote < 0 || pianoNote > 87) return;

            const event = {
                time: note.time,
                duration: note.duration, // 减一个微小的时间值
                note: pianoNote,
                timeoutId: null, // 添加 timeoutId 属性
                source: null // 添加 source 属性
            };
            currentSchedule.push(event);
        });
    });

    console.log('调度的事件:', currentSchedule); // 调试信息

    currentSchedule.forEach(event => {
        const triggerTime = startTime + event.time;
        const source = audioContext.createBufferSource(); // 使用全局 audioContext
        source.buffer = audioCache.get(event.note); // 使用全局 audioCache
        source.connect(audioContext.destination); // 使用全局 audioContext
        source.start(triggerTime, 0, event.duration);


    event.timeoutId = setTimeout(() => {
            activateKey(event.note, true); // 新增参数表示是MIDI触发的
            setTimeout(() => deactivateKey(event.note), event.duration * 1000);
        }, event.time * 1000);

        event.source = source;
    });

}
async function playNote(note) {
    if (note > 87) return;

    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    try {
        const audioBuffer = await loadAudio(note);
        
        // 创建新的音频源实例
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start(0); // 立即开始播放

        // 将音频源加入活动集合
        activeSources.add(source);

        // 监听播放结束事件，清理资源
        source.addEventListener('ended', () => {
            source.disconnect(); // 断开连接
            activeSources.delete(source); // 从集合中移除
        });
    } catch (error) {
        console.error('播放失败:', error);
    }
}

async function loadAudio(note) {
    // 确保 audioContext 已初始化
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log("音频上下文初始化完成");
    }

    if (!audioCache.has(note)) {
        console.log(`加载音频文件: ${note}`); // 调试信息
        const response = await fetch(`sounds/piano_key_${note+3}.ogg`);
        if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer); // 使用全局 audioContext
        audioCache.set(note, audioBuffer);
    }
    return audioCache.get(note);
}


    function createRibbon(note, key) {

    if (window.innerWidth < 1200) {
        return;
    }
        const hue = noteColors[note % 12];
        const ribbon = document.createElement('div');
        ribbon.className = 'ribbon';
        ribbon.style.setProperty('--hue', hue);


        ribbon.style.left = `${key.offsetLeft + key.offsetWidth / 2}px`;

        document.body.appendChild(ribbon);

        // 动态调整丝带长度
        const growInterval = setInterval(() => {
            if (!activeKeys.has(note)) {
                clearInterval(growInterval);
                ribbon.classList.add('release');
            } else {
                ribbon.style.height = `${ribbon.offsetHeight + 5}px`;
            }
        }, 20);

        ribbon.addEventListener('animationend', () => {
            ribbon.remove();
        });
    }

// 初始化播放器
document.getElementById('playButton').addEventListener('click', async () => {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('音频上下文已初始化'); // 调试信息
    }
    if (isPlaying) return;
    isPlaying = true;

    const filename = document.getElementById('musicSelect').value;
    console.log('选择的文件:', filename); // 调试信息
    try {
        const midi = await loadMIDI(filename);
        console.log('MIDI文件加载成功:', midi); // 调试信息
        scheduleNotes(midi.tracks);
    } catch (error) {
        console.error('播放失败:', error);
        isPlaying = false;
    }
});


document.getElementById('stopButton').addEventListener('click', () => {
    isPlaying = false;
isMidiPlayback = false;
    // 停止所有正在播放的音频源
    activeSources.forEach(source => {
        if (source.state === 'playing') {
            source.stop();
            source.disconnect();
        }
    });
    activeSources.clear(); // 清空活动音频源集合

    // 取消所有未触发的音符事件
    currentSchedule.forEach(event => {
        if (event.timeoutId) {
            clearTimeout(event.timeoutId); // 取消未触发的音符事件
        }
        if (event.source) {
            event.source.stop(); // 停止音频源
            event.source.disconnect(); // 断开音频源连接
        }
    });

    // 清空当前的播放计划
    currentSchedule = [];

    // 重置所有按键状态
    activeKeys.forEach(note => deactivateKey(note));
    activeKeys.clear(); // 清空活动按键集合
});

// 辅助函数：取消所有未播放的音符事件
function clearTimeouts() {
    // 遍历当前的调度事件，取消所有未播放的音符事件
    currentSchedule.forEach(event => {
        const triggerTime = audioContext.currentTime + event.time;
        if (triggerTime > audioContext.currentTime) {
            // 如果事件尚未触发，则取消该事件
            clearTimeout(event.timeoutId); // 假设每个事件都有一个对应的 timeoutId
        }
    });
}

function activateKey(note, isFromMidi = false) {
        if (activeKeys.has(note)) return;
        activeKeys.add(note);
        
        const key = document.querySelector(`[data-note="${note}"]`);
        if (!key) return;

        // 添加active类（按下效果）
        key.classList.add('active');

        // 创建丝带效果
        createRibbon(note, key);
    if (!isFromMidi) {
        playNote(note);
    }
    }

    function deactivateKey(note) {
        activeKeys.delete(note);
        const key = document.querySelector(`[data-note="${note}"]`);
        key?.classList.remove('active');
    }


async function preloadAllNotes() {
    console.log("开始预加载所有音符...");
    const startNote = 0; // 音符范围的起始值
    const endNote = 87;  // 音符范围的结束值

    // 确保 audioContext 已初始化
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log("音频上下文初始化完成");
    }

    for (let note = startNote; note <= endNote; note++) {
        try {
            await loadAudio(note); // 调用 loadAudio 函数加载音符
            console.log(`音符 ${note} 加载完成`);
        } catch (error) {
            console.error(`音符 ${note} 加载失败:`, error);
        }
    }
    console.log("所有音符加载完成");
}
// 轮播字幕配置
// 轮播字幕配置
const marqueeTexts = [
    "欢迎使用夸客博客在线钢琴",
    "可选音乐播放，支持上传本地MIDI文件",
    "初次加载较慢，建议等待一段时间再播放音乐",
    "点击琴键或使用键盘演奏",
    "如有意见、建议或MIDI资源投稿，欢迎联系站主jsxzznz@163.com"
];

// 轮播控制函数
function startMarquee() {
    const container = document.getElementById('marqueeText');
    if (!container) return;

    // 清空容器并移除初始的marquee-text类
    container.innerHTML = '';
    container.className = 'marquee-container';

    // 初始化字幕元素
    marqueeTexts.forEach((text, i) => {
        const el = document.createElement('div');
        el.className = `marquee-text ${i === 0 ? 'active' : ''}`; // 第一个元素默认激活
        el.textContent = text;
        container.appendChild(el);
    });

    const elements = document.querySelectorAll('.marquee-text');
    let index = 0;

    function updateMarquee() {
        console.log("更新轮播，当前索引:", index); // 调试日志

        // 移除所有元素的 active 类
        elements.forEach(el => el.classList.remove('active'));

        // 为当前元素添加 active 类
        elements[index].classList.add('active');

        // 更新索引
        index = (index + 1) % elements.length;

        // 设置下一次轮播
        setTimeout(updateMarquee, 5000);
    }

    // 启动轮播
    setTimeout(updateMarquee, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
     startMarquee();
    const pianoKeys = document.getElementById('pianoKeys');
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const WHITE_KEY_WIDTH = 40;
    const BLACK_KEY_WIDTH = 24;

    // 创建钢琴键盘
    function createPiano() {
        pianoKeys.innerHTML = '';
        let whiteKeyCount = 0;

        for (let note = 0; note < 88; note++) {
            const isBlack = [1, 3, 6, 8, 10].includes(note % 12);
            
            if (!isBlack) {
                createWhiteKey(note, whiteKeyCount);
                whiteKeyCount++;
            }
        }

        // 单独创建黑键确保正确覆盖
        for (let note = 0; note < 88; note++) {
            const isBlack = [1, 3, 6, 8, 10].includes(note % 12);
            if (isBlack) createBlackKey(note);
        }
    }

    function createWhiteKey(note, position) {
        const key = document.createElement('div');
        key.className = 'key white-key';
        key.style.left = `${position * WHITE_KEY_WIDTH}px`;
        key.dataset.note = note;
        
        const label = document.createElement('div');
        label.className = 'key-label';
        label.textContent = getKeyLabel(note);
        key.appendChild(label);
        
        pianoKeys.appendChild(key);
    }

    function createBlackKey(note) {
        const key = document.createElement('div');
        key.className = 'key black-key';
        
        // 计算黑键位置
        const referenceNote = note - (note % 12);
        const basePosition = Math.floor(referenceNote / 12) * 7;
        const offsetMap = {1:1, 3:2, 6:4, 8:5, 10:6};
        const position = basePosition + offsetMap[note % 12];
        
        key.style.left = `${position * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH/2}px`;
        key.dataset.note = note;
        
        const label = document.createElement('div');
        label.className = 'key-label';
        label.textContent = getKeyLabel(note);
        key.appendChild(label);
        
        pianoKeys.appendChild(key);
    }

    // 修正音名标签计算
function getKeyLabel(note) {
    const midiNumber = note + 24; // 直接对应MIDI编号21（A0）
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor((midiNumber) / 12) - 1;
    const noteIndex = midiNumber % 12;
    return notes[noteIndex] + octave;
}

    // 播放声音

    // 事件处理


    // 鼠标事件
    pianoKeys.addEventListener('mousedown', (e) => {
        const key = e.target.closest('.key');
        if (key) {
            const note = parseInt(key.dataset.note);
            activateKey(note);
        }
    });

    document.addEventListener('mouseup', () => {
        activeKeys.forEach(note => deactivateKey(note));
    });

    // 键盘事件
    document.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const note = keyMapping[e.key.toLowerCase()];
        if (note !== undefined) activateKey(note);
    });

    document.addEventListener('keyup', (e) => {
        const note = keyMapping[e.key.toLowerCase()];
        if (note !== undefined) deactivateKey(note);
    });

    // 触摸事件
    pianoKeys.addEventListener('touchstart', (e) => {
        e.preventDefault();
        Array.from(e.changedTouches).forEach(touch => {
            const key = document.elementFromPoint(touch.clientX, touch.clientY);
            if (key?.classList.contains('key')) {
                const note = parseInt(key.dataset.note);
                activateKey(note);
            }
        });
    });

    document.addEventListener('touchend', (e) => {
        activeKeys.forEach(note => deactivateKey(note));
    });

    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log("音频上下文初始化完成");
    }


    // 初始化
    createPiano();
 loadMusicList();
preloadAllNotes();
// 新增：处理上传的MIDI文件
document.getElementById('uploadPlayButton').addEventListener('click', () => {
    // 创建隐藏的文件输入元素
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.mid,.midi';
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 先执行停止操作
        document.getElementById('stopButton').click();

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const midi = await new Midi(arrayBuffer);
            scheduleNotes(midi.tracks);
            isPlaying = true;
        } catch (error) {
            console.error('上传文件播放失败:', error);
            isPlaying = false;
        }
    });

    fileInput.click();
});
});
