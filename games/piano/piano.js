
document.addEventListener('DOMContentLoaded', () => {
const noteColors = {
    0: 0,    // C
    1: 30,   // C#
    2: 60,   // D（修复D键颜色）
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

    const pianoKeys = document.getElementById('pianoKeys');
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const activeKeys = new Set();
    const WHITE_KEY_WIDTH = 40;
    const BLACK_KEY_WIDTH = 24;

    // 创建钢琴键盘
// 修改后的createPiano函数
function createPiano() {
    pianoKeys.innerHTML = '';
    let whiteKeyCount = 0;

    // 创建白键 (总数减至85)
    for (let note = 0; note < 85; note++) {
        const isBlack = [1, 3, 6, 8, 10].includes(note % 12);
        
        if (!isBlack) {
            createWhiteKey(note, whiteKeyCount);
            whiteKeyCount++;
        }
    }

    // 创建黑键 (同步减至85)
    for (let note = 0; note < 85; note++) {
        const isBlack = [1, 3, 6, 8, 10].includes(note % 12);
        if (isBlack) createBlackKey(note);
    }

    // 居中调整
    const totalWidth = whiteKeyCount * WHITE_KEY_WIDTH;
    pianoKeys.style.width = `${totalWidth}px`;
}

// 修改后的createWhiteKey函数
function createWhiteKey(note, position) {
    const key = document.createElement('div');
    key.className = 'key white-key';
    key.style.cssText = `
        position: relative;
        display: inline-block;
        width: ${WHITE_KEY_WIDTH}px;
        height: 200px;
        margin-left: -1px; /* 消除间隙 */
    `;
    key.dataset.note = note;
    
    // 标签生成
    const label = document.createElement('div');
    label.className = 'key-label';
    label.textContent = getKeyLabel(note);
    key.appendChild(label);
    
    pianoKeys.appendChild(key);
}

// 修改后的createBlackKey函数
function createBlackKey(note) {
    const key = document.createElement('div');
    key.className = 'key black-key';
    
    // 计算相对位置
    const referenceNote = note - (note % 12);
    const basePosition = Math.floor(referenceNote / 12) * 7;
    const offsetMap = {1:1, 3:2, 6:4, 8:5, 10:6};
    const whiteKeyIndex = basePosition + offsetMap[note % 12];
    
    key.style.cssText = `
        position: absolute;
        width: ${BLACK_KEY_WIDTH}px;
        height: 120px;
        left: ${whiteKeyIndex * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH/2}px;
        top: 0;
        z-index: 2;
    `;
    
    key.dataset.note = note;
    
    // 标签生成
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
    async function playNote(note) {
const targetNote = note + 3; // 实际播放的音符
    if(targetNote > 87) return; // 禁止播放超出范围的音频
        try {

            const source = audioContext.createBufferSource();
            const audioBuffer = await loadAudio(targetNote);
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start(0);
        } catch (error) {
            console.error('播放失败:', error);
        }
    }

    const audioCache = new Map();
    async function loadAudio(note) {
        if (!audioCache.has(note)) {
            const response = await fetch(`sounds/piano_key_${note}.ogg`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            audioCache.set(note, audioBuffer);
        }
        return audioCache.get(note);
    }

    // 事件处理
// 修改piano.js中的activateKey函数
function activateKey(note) {
    if (activeKeys.has(note)) return;
    activeKeys.add(note);
    
    const key = document.querySelector(`[data-note="${note}"]`);
    if (!key) return;

    // 添加active类（按下效果）
    key.classList.add('active');

    // 计算按键中心绝对位置
    const rect = key.getBoundingClientRect();
    const centerX = rect.left + rect.width/2;
    const startY = window.innerHeight;

    // 创建彩带元素
    const effect = document.createElement('div');
    effect.className = 'key-effect';
    
    // 设置动态CSS变量
    const hue = noteColors[note % 12];
    effect.style.setProperty('--hue', hue);
    
    // 设置初始位置
    effect.style.left = `${centerX}px`;
    effect.style.bottom = `${startY}px`;

    // 添加动画结束监听
    effect.addEventListener('animationend', function() {
        this.remove();
    });

    // 调试日志
    console.log('Creating ribbon at:', centerX, startY);
    console.log('Effect element:', effect);

    document.body.appendChild(effect);
    playNote(note);
}

function deactivateKey(note) {
    activeKeys.delete(note);
    const key = document.querySelector(`[data-note="${note}"]`);
    key?.classList.remove('active');
}

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
});
