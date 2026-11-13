(() => {
    const get = (id) => document.getElementById(id);
    const storageKey = 'quark:focus-relay:v1';
    const pageTitle = document.title;
    const modes = { focus: '专注', break: '休息' };
    const time = get('timer');
    const start = get('start');
    const stop = get('stop');
    const dial = get('focusDial');
    const minutes = get('focus-minutes');
    const notifications = get('focusNotifications');
    const presets = [...document.querySelectorAll('[data-time]')];
    let audio;
    let previousTime;

    const fresh = () => ({
        mode: 'focus', durations: { focus: 1500, break: 300 }, remaining: 1500000,
        deadline: null, complete: false, task: '', note: '', handoff: '',
        inbox: [], history: [], sound: true, theme: 'auto'
    });

    function read() {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey));
            if (saved) return { ...fresh(), ...saved };
            const oldTheme = localStorage.getItem('themePreference');
            return { ...fresh(), theme: oldTheme === 'light' || oldTheme === 'dark' ? oldTheme : 'auto' };
        } catch {
            return fresh();
        }
    }

    let state = read();

    function save() {
        try {
            localStorage.setItem(storageKey, JSON.stringify(state));
        } catch {
            // Keep the timer available if browser storage is full or disabled.
        }
    }

    function notify(message) {
        get('focus-status').textContent = message;
    }

    function initAudio() {
        if (!state.sound) return;
        try {
            audio ??= new AudioContext();
            audio.resume().catch(() => {});
        } catch {
            // The visual completion state is always shown.
        }
    }

    function chime() {
        if (!state.sound || audio?.state !== 'running') return;
        [659, 880, 1047].forEach((frequency, index) => {
            const begin = audio.currentTime + index * .15;
            const oscillator = audio.createOscillator();
            const gain = audio.createGain();
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(.09, begin);
            gain.gain.exponentialRampToValueAtTime(.001, begin + .26);
            oscillator.connect(gain).connect(audio.destination);
            oscillator.start(begin);
            oscillator.stop(begin + .26);
        });
    }

    function refreshTime() {
        if (state.deadline !== null && state.deadline <= Date.now()) {
            const finishedAt = state.deadline;
            state.deadline = null;
            state.remaining = 0;
            state.complete = true;
            if (state.mode === 'focus') {
                const record = { finishedAt, seconds: state.durations.focus, task: state.task.trim() };
                const latest = read().history;
                state.history = [record, ...latest.filter((entry) => entry.finishedAt !== finishedAt)].slice(0, 200);
                if (state.note.trim()) state.handoff = state.note.trim();
            }
            save();
            chime();
            if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                try {
                    new Notification(`${modes[state.mode]}时间结束`, { tag: `focus-relay-${finishedAt}` });
                } catch {
                    // Some browsers only allow notifications from a service worker.
                }
            }
            renderControls();
            renderDesk();
            notify(state.mode === 'focus' ? '本轮专注已记入记录。可以留条线索，再开始休息。' : '休息结束，可以开始下一轮专注。');
        }
        const remaining = state.deadline === null ? state.remaining : Math.max(0, state.deadline - Date.now());
        const seconds = Math.ceil(remaining / 1000);
        const formatted = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        if (time.textContent !== formatted) time.textContent = formatted;
        const newTitle = state.deadline === null ? pageTitle : `${formatted} · ${modes[state.mode]}`;
        if (document.title !== newTitle) document.title = newTitle;
        if (previousTime !== seconds) {
            previousTime = seconds;
            dial.style.setProperty('--sweep', `${360 * seconds / state.durations[state.mode]}deg`);
        }
    }

    function renderControls() {
        const running = state.deadline !== null;
        const elapsed = state.remaining !== state.durations[state.mode] * 1000;
        previousTime = undefined;
        get('modeFocus').setAttribute('aria-pressed', String(state.mode === 'focus'));
        get('modeBreak').setAttribute('aria-pressed', String(state.mode === 'break'));
        dial.dataset.mode = state.mode;
        start.disabled = running;
        stop.disabled = !running;
        start.textContent = state.complete ? (state.mode === 'focus' ? '开始休息' : '开始专注') : elapsed ? '继续' : '开始';
        get('focusPhase').textContent = state.complete ? `${modes[state.mode]}结束`
            : running ? `${modes[state.mode]}中`
            : elapsed ? '已暂停' : `准备${modes[state.mode]}`;
        get('focusEnd').textContent = running
            ? `预计 ${new Date(state.deadline).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 结束`
            : state.complete ? '准备好后进入下一轮' : elapsed ? '进度已保留' : '按下开始后计时';
        presets.forEach((button) => {
            const value = Number(button.dataset.time);
            button.hidden = (state.mode === 'focus') !== (value >= 1500);
            button.setAttribute('aria-pressed', String(value === state.durations[state.mode]));
        });
        minutes.value = String(state.durations[state.mode] / 60);
        get('focusSound').setAttribute('aria-pressed', String(state.sound));
        get('themeToggle').textContent = `外观 · ${{ auto: '跟随网站', light: '浅色', dark: '深色' }[state.theme]}`;
        if (state.theme === 'auto') delete document.body.dataset.timerTheme;
        else document.body.dataset.timerTheme = state.theme;
    }

    function renderDesk() {
        get('focus-task').value = state.task;
        get('focus-note').value = state.note;
        get('focus-handoff').hidden = !state.handoff;
        get('focus-handoff-text').textContent = state.handoff ? `上轮留下 · ${state.handoff}` : '';
        const inbox = get('focus-inbox');
        inbox.replaceChildren();
        state.inbox.forEach((entry) => {
            const item = document.createElement('li');
            const text = document.createElement('span');
            const remove = document.createElement('button');
            text.textContent = entry.text;
            remove.type = 'button';
            remove.textContent = '划掉';
            remove.setAttribute('aria-label', `划掉：${entry.text}`);
            remove.addEventListener('click', () => {
                state.inbox = state.inbox.filter((candidate) => candidate.id !== entry.id);
                save();
                renderDesk();
                get('focus-inbox-input').focus();
            });
            item.append(text, remove);
            inbox.append(item);
        });

        const history = get('focus-history');
        history.replaceChildren();
        const today = new Date().toDateString();
        const todayEntries = state.history.filter((entry) => new Date(entry.finishedAt).toDateString() === today);
        get('focus-today').textContent = `今日 ${todayEntries.length} 轮 · ${todayEntries.reduce((total, entry) => total + entry.seconds / 60, 0)} 分钟`;
        if (!state.history.length) {
            const empty = document.createElement('li');
            empty.className = 'focus-log-empty';
            empty.textContent = '完成第一轮后，专注时间会记在这里。';
            history.append(empty);
        }
        state.history.slice(0, 10).forEach((entry) => {
            const item = document.createElement('li');
            const task = document.createElement('strong');
            const meta = document.createElement('span');
            task.textContent = entry.task || '未命名任务';
            const date = new Date(entry.finishedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            meta.textContent = `${date} · ${entry.seconds / 60} 分钟`;
            item.append(task, meta);
            history.append(item);
        });
    }

    function resetTimer(mode, seconds = state.durations[mode]) {
        if (state.mode === 'focus' && mode === 'break' && state.note.trim()) {
            state.handoff = state.note.trim();
            state.note = '';
        }
        state.mode = mode;
        state.durations[mode] = seconds;
        state.remaining = seconds * 1000;
        state.deadline = null;
        state.complete = false;
    }

    function changeTimer(mode, seconds, confirmChange = true) {
        refreshTime();
        const underway = state.deadline !== null || (!state.complete && state.remaining !== state.durations[state.mode] * 1000);
        if (confirmChange && underway && !window.confirm('结束当前计时并应用设置？')) return;
        resetTimer(mode, seconds);
        notify('');
        save();
        renderControls();
        renderDesk();
        refreshTime();
    }

    start.addEventListener('click', () => {
        if (state.complete) resetTimer(state.mode === 'focus' ? 'break' : 'focus');
        initAudio();
        state.deadline = Date.now() + state.remaining;
        notify('');
        save();
        renderControls();
        renderDesk();
        refreshTime();
    });

    stop.addEventListener('click', () => {
        refreshTime();
        if (state.deadline === null) return;
        state.remaining = Math.max(0, state.deadline - Date.now());
        state.deadline = null;
        save();
        renderControls();
        refreshTime();
    });

    get('reset').addEventListener('click', () => changeTimer(state.mode, state.durations[state.mode], false));
    get('modeFocus').addEventListener('click', () => {
        if (state.mode !== 'focus') changeTimer('focus');
    });
    get('modeBreak').addEventListener('click', () => {
        if (state.mode !== 'break') changeTimer('break');
    });
    presets.forEach((button) => button.addEventListener('click', () => {
        const duration = Number(button.dataset.time);
        if (duration !== state.durations[state.mode] || state.complete) changeTimer(state.mode, duration);
    }));
    get('focus-duration').addEventListener('submit', (event) => {
        event.preventDefault();
        changeTimer(state.mode, Number(minutes.value) * 60);
    });
    get('focusSound').addEventListener('click', () => {
        state.sound = !state.sound;
        initAudio();
        save();
        renderControls();
    });
    if ('Notification' in window && Notification.permission === 'default') {
        notifications.hidden = false;
        notifications.addEventListener('click', async () => {
            try {
                const permission = await Notification.requestPermission();
                if (permission !== 'default') notifications.hidden = true;
                notify(permission === 'granted' ? '桌面通知已开启。' : '桌面通知未开启。');
            } catch {
                notify('当前浏览器无法开启桌面通知。');
            }
        });
    }
    get('themeToggle').addEventListener('click', () => {
        state.theme = { auto: 'light', light: 'dark', dark: 'auto' }[state.theme];
        save();
        renderControls();
    });
    get('focus-task').addEventListener('input', (event) => {
        state.task = event.target.value;
        save();
    });
    get('focus-note').addEventListener('input', (event) => {
        state.note = event.target.value;
        save();
    });
    get('focus-handoff-use').addEventListener('click', () => {
        if (state.task.trim() && state.task !== state.handoff && !window.confirm('用续做线索替换当前任务？')) return;
        state.task = state.handoff;
        state.handoff = '';
        save();
        renderDesk();
        get('focus-task').focus();
    });
    get('focus-inbox-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const input = get('focus-inbox-input');
        const value = input.value.trim();
        if (!value) return;
        if (state.inbox.length >= 30) {
            notify('暂存区已有 30 条，请先划掉几条。');
            return;
        }
        state.inbox.unshift({ id: crypto.randomUUID(), text: value });
        input.value = '';
        save();
        renderDesk();
        notify('已暂存。');
    });
    window.addEventListener('storage', (event) => {
        if (event.key !== storageKey) return;
        state = read();
        renderControls();
        renderDesk();
        refreshTime();
    });
    document.addEventListener('visibilitychange', refreshTime);
    renderControls();
    renderDesk();
    refreshTime();
    window.setInterval(refreshTime, 200);
})();
