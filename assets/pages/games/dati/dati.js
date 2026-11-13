'use strict';

const $ = id => document.getElementById(id);
const API = 'https://quark-api.130923.xyz/api/quiz';
const WIN_SCORE = 100;
const ROUND_MS = 10000;
const REVEAL_MS = 3500;
const SLOTS = ['player1', 'player2'];
const clientId = crypto.randomUUID();
const local = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
};
const today = () => new Date().toLocaleDateString();
let stats = local('quizStats', {});
let recentRooms = local('recentRooms', []);
let mode = 'solo';
let color = localStorage.getItem('userColor') || '#a4f3ce';
let room, session, connection, connectedListener, clock, offsetListener, serverOffset = 0;
let pending = false;
let lobbyRequest = 0;
let battle = null;
let chosen = '';
let round = [];
let review = [];
let index = 0;
let streak = 0;
let best = 0;
let correct = 0;
let soloPhase = 'lobby';

async function quiz(path, answers) {
    const response = await fetch(API + path, {
        ...(answers ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers })
        } : {}),
        signal: AbortSignal.timeout(12000)
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error('Quiz API ' + response.status);
    return result.data;
}

function practice(count, source = '') {
    const query = new URLSearchParams({ count });
    if (source) query.set('source', source);
    return quiz('/practice?' + query).then(data => {
        if (!Array.isArray(data.questions) || !data.questions.length) throw new Error('题库没有可用题目');
        return data.questions;
    });
}

function optionButtons(container, question, choose) {
    container.replaceChildren();
    for (const option of question.options) {
        const button = document.createElement('button');
        button.className = 'option-btn';
        button.type = 'button';
        button.dataset.answer = option.letter;
        button.setAttribute('aria-pressed', 'false');
        const letter = document.createElement('kbd');
        letter.textContent = option.letter;
        const text = document.createElement('span');
        text.textContent = option.text;
        button.append(letter, text);
        button.addEventListener('click', () => choose(option.letter));
        container.append(button);
    }
}

function markOptions(container, selected, answer) {
    for (const button of container.querySelectorAll('button')) {
        const own = button.dataset.answer === selected;
        button.setAttribute('aria-pressed', String(own));
        button.classList.toggle('selected', own);
        button.classList.toggle('correct', Boolean(answer) && button.dataset.answer === answer);
        button.classList.toggle('wrong', Boolean(answer) && own && selected !== answer);
    }
}

function show(view) {
    for (const [id, name] of [['profileSetup', 'lobby'], ['soloContent', 'solo'], ['battleContent', 'battle']]) {
        $(id).hidden = name !== view;
    }
    $('backToLobby').hidden = view === 'lobby';
    $('sidebar').classList.remove('open');
}

function updateStats() {
    if (stats.date !== today()) stats = { date: today(), total: 0, correct: 0 };
    const accuracy = stats.total ? Math.round(stats.correct / stats.total * 100) : 0;
    $('stats').textContent = '今日 ' + stats.correct + ' / ' + stats.total + ' 答对 · 正确率 ' + accuracy + '%';
}

function showSoloQuestion() {
    const question = round[index];
    chosen = '';
    soloPhase = 'question';
    $('soloProgress').value = index;
    $('soloProgress').max = round.length;
    $('soloCounter').textContent = '第 ' + (index + 1) + ' / ' + round.length + ' 题';
    $('soloStreak').textContent = '连对 ' + streak;
    $('question').textContent = question.question;
    $('resultMessage').textContent = '';
    $('resultMessage').className = 'result-message';
    $('reviewBtn').hidden = true;
    optionButtons($('options'), question, answer => {
        if (soloPhase !== 'question') return;
        chosen = answer;
        markOptions($('options'), answer);
        $('submitBtn').disabled = false;
    });
    $('submitBtn').disabled = true;
    $('submitBtn').textContent = '锁定答案';
    $('question').focus();
}

function beginSolo(questions) {
    round = questions;
    index = streak = best = correct = 0;
    review = [];
    $('currentRoomTitle').textContent = '单人闯关';
    show('solo');
    showSoloQuestion();
}

async function startSolo() {
    const request = ++lobbyRequest;
    $('startSoloBtn').disabled = true;
    $('joinRoomBtn').disabled = true;
    $('lobbyStatus').textContent = '正在抽题…';
    try {
        const questions = await practice($('quizCount').value, $('quizSource').value);
        if (request !== lobbyRequest) return;
        beginSolo(questions);
        $('lobbyStatus').textContent = '';
    } catch {
        $('lobbyStatus').textContent = '题库暂时不可用，请重试。';
    } finally {
        $('startSoloBtn').disabled = false;
        $('joinRoomBtn').disabled = false;
    }
}

function finishSolo() {
    soloPhase = 'summary';
    $('soloCounter').textContent = '闯关结束';
    $('question').textContent = '答对 ' + correct + ' / ' + round.length + ' 题';
    $('soloStreak').textContent = '最高连对 ' + best;
    $('options').replaceChildren();
    $('resultMessage').className = 'result-message';
    $('resultMessage').textContent = review.length ? '本局有 ' + review.length + ' 道错题，可立即重练。' : '本局全部答对！';
    $('reviewBtn').hidden = !review.length;
    $('submitBtn').textContent = '返回大厅';
    $('question').focus();
}

async function submitAnswer() {
    if (soloPhase === 'summary') return goLobby();
    if (soloPhase === 'feedback') {
        index++;
        return index < round.length ? showSoloQuestion() : finishSolo();
    }
    if (soloPhase !== 'question' || !chosen) return;

    soloPhase = 'grading';
    const question = round[index];
    const answer = chosen;
    const currentRound = round;
    $('submitBtn').disabled = true;
    $('submitBtn').textContent = '正在判分…';
    try {
        const { results: [result] } = await quiz('/grade', [{ id: question.global_id, answer }]);
        if (soloPhase !== 'grading' || currentRound !== round) return;
        if (!result || result.id !== question.global_id) throw new Error('题目与判分结果不匹配');
        updateStats();
        stats.total++;
        if (result.correct) {
            stats.correct++;
            correct++;
            streak++;
            best = Math.max(best, streak);
        } else {
            streak = 0;
            review.push(question);
        }
        localStorage.setItem('quizStats', JSON.stringify(stats));
        if (stats.correct >= 10) localStorage.setItem('dailyAchievement', today());
        updateStats();
        const solution = question.options.find(option => option.letter === result.correct_answer);
        markOptions($('options'), answer, result.correct_answer);
        for (const button of $('options').querySelectorAll('button')) button.disabled = true;
        $('resultMessage').className = 'result-message ' + (result.correct ? 'success' : 'error');
        $('resultMessage').textContent = result.correct
            ? '回答正确！'
            : '正确答案 · ' + result.correct_answer + ' ' + (solution?.text ?? '');
        $('soloProgress').value = index + 1;
        $('soloStreak').textContent = '连对 ' + streak;
        soloPhase = 'feedback';
        $('submitBtn').textContent = index + 1 === round.length ? '查看战绩' : '下一题';
    } catch {
        if (soloPhase !== 'grading' || currentRound !== round) return;
        soloPhase = 'question';
        $('resultMessage').textContent = '判分请求失败，已保留你的选择。';
        $('submitBtn').textContent = '重试判分';
    }
    $('submitBtn').disabled = false;
    $('submitBtn').focus();
}

const now = () => Date.now() + serverOffset;

function goLobby() {
    lobbyRequest++;
    const oldRoom = room;
    const oldSession = session;
    const oldMode = mode;
    room = session = null;
    pending = false;
    if (clock) clearInterval(clock);
    oldRoom?.off();
    connection?.off('value', connectedListener);
    offsetListener?.off();
    if (oldRoom && oldSession && SLOTS.includes(oldMode)) {
        oldRoom.child('players').child(oldMode).transaction(player => player?.id === clientId ? null : undefined).catch(console.error);
    }
    battle = null;
    soloPhase = 'lobby';
    $('currentRoomTitle').textContent = '知识擂台';
    $('winnerOverlay').hidden = true;
    show('lobby');
}

function renderRecentRooms() {
    $('roomList').replaceChildren();
    for (const name of recentRooms) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'room-item';
        button.textContent = name;
        button.addEventListener('click', () => {
            $('roomInput').value = name;
            $('sidebar').classList.remove('open');
            $('roomInput').focus();
        });
        $('roomList').append(button);
    }
    if (!recentRooms.length) $('roomList').textContent = '加入过的房间会显示在这里';
}

async function joinRoom(event) {
    event.preventDefault();
    if (session) return;
    const name = $('roomInput').value.trim();
    if (!name || /[.#$\[\]/\x00-\x1f\x7f]/.test(name)) {
        $('lobbyStatus').textContent = '请输入有效房间号，不能包含 . # $ [ ] /';
        return;
    }
    const nickname = $('nicknameInput').value.trim();
    const role = $('battleRole').value;
    if (role !== 'spectator' && !nickname) {
        $('lobbyStatus').textContent = '请先填写对战昵称。';
        return;
    }
    if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
        $('lobbyStatus').textContent = '对战服务暂不可用，仍可单人闯关。';
        return;
    }
    mode = role;
    const joining = session = {};
    $('joinRoomBtn').disabled = true;
    $('startSoloBtn').disabled = true;
    $('lobbyStatus').textContent = '正在连接房间…';
    let playerRef;
    try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        const database = firebase.database();
        room = database.ref('quiz_battle').child(name).child('arena');
        offsetListener = database.ref('.info/serverTimeOffset');
        offsetListener.on('value', snapshot => { serverOffset = snapshot.val() || 0; });
        await database.ref('.info/serverTimeOffset').once('value');
        if (SLOTS.includes(mode)) {
            playerRef = room.child('players').child(mode);
            const info = { id: clientId, nickname, color, heartbeat: now() };
            const slot = await playerRef.transaction(player => {
                if (session !== joining) return;
                if (!player || player.id === clientId || player.heartbeat < now() - 30000) return info;
            }, undefined, false);
            if (!slot.committed) throw new Error('该席位已有人，请选择另一个席位或观战。');
            connection = database.ref('.info/connected');
            connectedListener = snapshot => {
                if (!snapshot.val() || session !== joining) return;
                playerRef.transaction(player => {
                    if (!player || player.id === clientId || player.heartbeat < now() - 30000) return { ...info, heartbeat: now() };
                }).catch(console.error);
            };
            connection.on('value', connectedListener);
            localStorage.setItem('nickname', nickname);
            localStorage.setItem('userColor', color);
        }
        if (session !== joining) return;
        recentRooms = [name, ...recentRooms.filter(item => item !== name)].slice(0, 5);
        localStorage.setItem('recentRooms', JSON.stringify(recentRooms));
        renderRecentRooms();
        $('currentRoomTitle').textContent = '擂台 · ' + name;
        $('lobbyStatus').textContent = '';
        show('battle');
        room.on('value', snapshot => {
            if (session !== joining) return;
            battle = snapshot.val() || {};
            renderBattle();
            advanceBattle();
        }, () => { $('battleStatus').textContent = '房间读取失败，请返回大厅重试。'; });
        let heartbeat = now();
        clock = setInterval(() => {
            if (playerRef && now() - heartbeat > 8000) {
                heartbeat = now();
                playerRef.transaction(player => player?.id === clientId ? { ...player, heartbeat } : undefined).catch(console.error);
            }
            renderBattle();
            advanceBattle();
        }, 250);
    } catch (error) {
        if (session === joining) {
            goLobby();
            $('lobbyStatus').textContent = error.message || '房间连接失败。';
        }
    } finally {
        $('joinRoomBtn').disabled = false;
        $('startSoloBtn').disabled = false;
    }
}

function playersReady(state) {
    return SLOTS.every(slot => state.players?.[slot]?.heartbeat >= now() - 30000);
}

let renderedBattleId = '';
function renderBattle() {
    if (!battle) return;
    const match = battle.match;
    for (const [index, slot] of SLOTS.entries()) {
        const profile = battle.players?.[slot];
        const online = profile?.heartbeat >= now() - 30000;
        const player = $(slot);
        player.querySelector('.player-name').textContent = online ? profile.nickname : '等待玩家 ' + (index + 1);
        player.querySelector('.player-role').textContent = (mode === slot ? '你 · ' : '') + (online ? '在线' : '空席');
        player.querySelector('.player-avatar').style.backgroundColor = online ? profile.color : '';
        const score = match?.scores?.[slot] ?? 0;
        $('score' + (index + 1)).textContent = score;
        $('progress' + (index + 1)).style.width = Math.min(100, score) + '%';
    }
    const ownsSlot = battle.players?.[mode]?.id === clientId;
    $('restartBtn').hidden = !ownsSlot || !match?.winner;
    $('winnerOverlay').hidden = !match?.winner;
    $('overlayRestart').hidden = !ownsSlot;
    if (match?.winner) $('winnerName').textContent = battle.players?.[match.winner]?.nickname ?? match.winner;

    const questionId = match?.id ?? '';
    if (!questionId || renderedBattleId !== questionId) {
        renderedBattleId = questionId;
        $('battleQuestion').textContent = match?.question?.question ?? '等待双方入席';
        $('battleOptions').replaceChildren();
        if (match?.question) optionButtons($('battleOptions'), match.question, answerBattle);
    }
    if (!match) {
        $('timer').textContent = '—';
        $('battleStatus').textContent = playersReady(battle) ? '正在准备题目…' : '同一个房间号，两个不同席位即可开局。';
        return;
    }

    const remaining = Math.max(0, Math.ceil((match.deadline - now()) / 1000));
    const answer = match.answers?.[mode]?.answer;
    $('timer').textContent = match.phase === 'reveal' ? '—' : remaining;
    markOptions($('battleOptions'), answer, match.correctAnswer);
    for (const button of $('battleOptions').querySelectorAll('button')) {
        button.disabled = !ownsSlot || Boolean(answer) || match.phase !== 'play' || remaining === 0;
    }
    const solution = match.question.options.find(option => option.letter === match.correctAnswer);
    $('battleStatus').textContent = now() < retryAfter ? '题库连接中，稍后重试…' : solution ? '正确答案 · ' + solution.letter + ' ' + solution.text
        : match.phase === 'reveal' ? '本题无人作答'
        : answer ? '答案已锁定，等待结算' : mode === 'spectator' ? '观战中' : remaining ? '先答对 +10，随后答对 +5，答错 −5' : '正在结算…';
}

let submittingBattle = false;
async function answerBattle(answer) {
    const ref = room;
    const id = battle?.match?.id;
    if (!ref || !id || submittingBattle || !SLOTS.includes(mode)) return;
    const slot = mode;
    submittingBattle = true;
    try {
        await ref.transaction(state => {
            const match = state?.match;
            if (state?.players?.[slot]?.id !== clientId || match?.id !== id || match.phase !== 'play' ||
                match.answers?.[slot] || now() >= match.deadline) return;
            match.answers ??= {};
            match.answers[slot] = { answer, at: now() };
            return state;
        }, undefined, false);
    } catch {
        $('battleStatus').textContent = '提交失败，可在倒计时内重试。';
    } finally {
        submittingBattle = false;
    }
}

let retryAfter = 0;
async function advanceBattle() {
    if (pending || !battle || !SLOTS.includes(mode) || battle.players?.[mode]?.id !== clientId || now() < retryAfter) return;
    // 一号位主持。断线后由二号位结算已经开始的回合。
    const slot = mode;
    if (slot === 'player2' && (!battle.match || now() < battle.match.deadline + 3500)) return;
    const ref = room;
    const previous = battle.match;
    if (previous?.winner) return;
    const ready = SLOTS.every(player => previous?.answers?.[player]);
    const reveal = previous?.phase === 'play' && (ready || now() >= previous.deadline);
    const next = playersReady(battle) && (!previous || (previous.phase === 'reveal' && now() >= previous.nextAt));
    if (!reveal && !next) return;
    pending = true;
    try {
        if (reveal) {
            const ordered = Object.entries(previous.answers || {}).sort((a, b) => a[1].at - b[1].at);
            const checked = await Promise.all(ordered.map(async ([player, { answer }]) => {
                const result = await quiz('/grade', [{ id: previous.question.global_id, answer }]);
                return [player, result.results[0]];
            }));
            const scores = { ...previous.scores };
            let first = true;
            for (const [player, result] of checked) {
                scores[player] = Math.max(0, scores[player] + (result.correct ? (first ? 10 : 5) : -5));
                if (result.correct) first = false;
            }
            if (room !== ref) return;
            await ref.child('match').transaction(match => {
                if (match?.id !== previous.id || match.phase !== 'play') return;
                if (JSON.stringify(match.answers || {}) !== JSON.stringify(previous.answers || {})) return;
                return {
                    ...match, phase: 'reveal', scores, nextAt: now() + REVEAL_MS,
                    correctAnswer: checked[0]?.[1].correct_answer ?? null,
                    winner: SLOTS.find(player => scores[player] >= WIN_SCORE) ?? null
                };
            }, undefined, false);
        } else {
            const [question] = await practice(1);
            if (room !== ref) return;
            await ref.transaction(state => {
                if (!state || !playersReady(state) || state.players?.[slot]?.id !== clientId) return;
                const match = state.match;
                if (previous ? match?.id !== previous.id || match.phase !== 'reveal' : Boolean(match)) return;
                state.match = {
                    id: crypto.randomUUID(), question, phase: 'play', deadline: now() + ROUND_MS,
                    scores: previous?.scores ?? { player1: 0, player2: 0 }
                };
                return state;
            }, undefined, false);
        }
    } catch {
        retryAfter = now() + 4000;
        $('battleStatus').textContent = '题库连接中，稍后重试…';
    } finally {
        if (room === ref) pending = false;
    }
}

function requestRestart() {
    const id = battle?.match?.id;
    if (!room || battle.players?.[mode]?.id !== clientId || !battle.match?.winner) return;
    room.child('match').transaction(match => match?.id === id && match.winner ? null : undefined).catch(console.error);
}

function toggleTheme() {
    const light = document.body.classList.toggle('light-mode');
    document.body.classList.toggle('dark-mode', !light);
    localStorage.setItem('quizTheme', light ? 'light' : 'dark');
    $('themeToggle').setAttribute('aria-pressed', String(light));
}

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('quizTheme') === 'light') toggleTheme();
    $('nicknameInput').value = localStorage.getItem('nickname') || '';
    $('themeToggle').addEventListener('click', toggleTheme);
    $('mobileMenuBtn').addEventListener('click', () => $('sidebar').classList.toggle('open'));
    $('backToLobby').addEventListener('click', goLobby);
    $('winnerClose').addEventListener('click', goLobby);
    $('joinForm').addEventListener('submit', joinRoom);
    $('startSoloBtn').addEventListener('click', startSolo);
    $('submitBtn').addEventListener('click', submitAnswer);
    $('reviewBtn').addEventListener('click', () => beginSolo([...review]));
    $('restartBtn').addEventListener('click', requestRestart);
    $('overlayRestart').addEventListener('click', requestRestart);
    $('colorPicker').value = /^#[0-9a-f]{6}$/i.test(color) ? color : '#a4f3ce';
    $('colorPicker').addEventListener('input', event => { color = event.target.value; });
    document.addEventListener('keydown', event => {
        if ($('soloContent').hidden && $('battleContent').hidden) return;
        if (event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
            event.target.closest('input, select, textarea, [contenteditable]')) return;
        const container = $('soloContent').hidden ? $('battleOptions') : $('options');
        const buttons = [...container.querySelectorAll('button')];
        const answer = /^[1-9]$/.test(event.key)
            ? buttons[Number(event.key) - 1]
            : buttons.find(button => button.dataset.answer === event.key.toUpperCase());
        if (answer && !answer.disabled) {
            event.preventDefault();
            answer.click();
        }
    });
    renderRecentRooms();
    updateStats();
    quiz('').then(({ quizzes }) => {
        for (const bank of quizzes) $('quizSource').add(new Option(bank.title + ' · ' + bank.stats.actual + ' 题', bank.id));
    }).catch(() => { $('quizSource').options[0].textContent = '混合题库（专题列表加载失败）'; });
});
