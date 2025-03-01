document.addEventListener('DOMContentLoaded', () => {
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

    const pianoKeys = document.getElementById('pianoKeys');
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const activeKeys = new Set();
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
    function activateKey(note) {
        if (activeKeys.has(note)) return;
        activeKeys.add(note);
        
        const key = document.querySelector(`[data-note="${note}"]`);
        if (!key) return;

        // 添加active类（按下效果）
        key.classList.add('active');

        // 创建丝带效果
        createRibbon(note, key);
    }

    function deactivateKey(note) {
        activeKeys.delete(note);
        const key = document.querySelector(`[data-note="${note}"]`);
        key?.classList.remove('active');
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
