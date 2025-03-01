// 全局声明（文件顶部）
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

    tracks.forEach(track => {
        track.notes.forEach(note => {
            const pianoNote = note.midi - 24;
            if (pianoNote < 0 || pianoNote > 87) return;

            const event = {
                time: note.time,
                duration: note.duration - 0.018, // 减一个微小的时间值
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

        // 保存 source 和 timeoutId
        event.source = source;
        event.timeoutId = setTimeout(() => {
            activateKey(event.note);
            setTimeout(() => deactivateKey(event.note), event.duration * 1000);
        }, event.time * 1000);
    });
}
async function playNote(note) {
    const targetNote = note+3;
    if (targetNote > 87) return;

    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('音频上下文已初始化');
    }

    try {
        const audioBuffer = await loadAudio(targetNote);
        
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
    if (!audioCache.has(note)) {
        console.log('加载音频文件:', note); // 调试信息
        const response = await fetch(`sounds/piano_key_${note}.ogg`);
        if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer); // 使用全局 audioContext
        audioCache.set(note, audioBuffer);
    }
    return audioCache.get(note);
}

    function createRibbon(note, key) {
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
    function activateKey(note) {
        if (activeKeys.has(note)) return;
        activeKeys.add(note);
        
        const key = document.querySelector(`[data-note="${note}"]`);
        if (!key) return;

        // 添加active类（按下效果）
        key.classList.add('active');

        // 创建丝带效果
        createRibbon(note, key);
playNote(note);
    }

    function deactivateKey(note) {
        activeKeys.delete(note);
        const key = document.querySelector(`[data-note="${note}"]`);
        key?.classList.remove('active');
    }



document.addEventListener('DOMContentLoaded', () => {
   

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
        const shiftedNote = note + 3; // 整体提升3个半音
        if(shiftedNote > 87) return ''; // 超出范围不显示
        
        const midiNumber = shiftedNote + 21; // 转换为MIDI编号
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNumber / 12) - 1;
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

    // 初始化
    createPiano();
 loadMusicList();
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
