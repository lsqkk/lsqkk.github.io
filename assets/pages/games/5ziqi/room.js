(() => {
    const size = 15;
    const roles = ['black', 'white'];
    const roleLabel = { black: '黑方', white: '白方' };
    const historyKey = 'quark.gomoku.recentRooms';
    const nicknameKey = 'quark.gomoku.nickname';
    const roomPattern = /^[\p{L}\p{N}_-]{1,24}$/u;
    const playerId = Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(36)).join('-');
    const $ = id => document.getElementById('gm-' + id);
    const emptyBoard = () => ({ state: Array.from({ length: size }, () => Array(size).fill(0)), currentPlayer: 'black' });
    let history = [];
    try {
        const stored = JSON.parse(localStorage.getItem(historyKey));
        if (Array.isArray(stored)) history = stored.filter(value => typeof value === 'string' && roomPattern.test(value)).slice(0, 8);
        $('nickname').value = localStorage.getItem(nicknameKey) || '';
    } catch { /* Offline or restricted storage is optional. */ }

    const cells = [];
    let db;
    let connected = false;
    let room = '';
    let roomRef;
    let presenceRef;
    let record;
    let pending = false;
    let cursor = 7 * size + 7;

    function seat(value, side) {
        const player = value?.players?.[side];
        return player?.id && value.presence?.[player.id] ? player : null;
    }

    function mySide(value = record) {
        return roles.find(side => seat(value, side)?.id === playerId);
    }

    function position(index) {
        return String.fromCharCode(65 + index % size) + (Math.floor(index / size) + 1);
    }

    function showMessage(message = '') {
        $('message').textContent = message;
        $('message').hidden = !message;
    }

    function renderHistory() {
        $('history').replaceChildren();
        if (!history.length) $('history').append(Object.assign(document.createElement('li'), { textContent: '暂无对局记录' }));
        for (const name of history) {
            const item = document.createElement('li');
            const button = Object.assign(document.createElement('button'), { type: 'button', textContent: name });
            if (name === room) button.setAttribute('aria-current', 'true');
            button.addEventListener('click', () => enter(name));
            item.append(button);
            $('history').append(item);
        }
    }

    function render() {
        const game = record?.board || emptyBoard();
        const side = mySide();
        const ready = roles.every(role => seat(record, role));
        const playing = Boolean(room && ready && !game.winner);
        const canMove = connected && !pending && playing && side === game.currentPlayer;
        const matchPieces = new Set((game.line || []).map(({ x, y }) => y * size + x));
        let moves = 0;

        $('title').textContent = room ? '房间 ' + room : '等待入座';
        $('room-actions').hidden = $('match').hidden = !room;
        $('stand').hidden = !side;
        $('stand').disabled = pending || !connected;
        $('rematch').hidden = !side || !game.winner;
        const voted = game.rematch?.[side] === playerId;
        $('rematch').disabled = pending || !connected || !ready || voted;
        $('rematch').textContent = voted ? '等待对方同意' : '再来一局';

        for (const role of roles) {
            const player = seat(record, role);
            $(role).textContent = player ? player.nickname + (role === side ? '（你）' : '') : '空位';
            $(role).closest('.gm-seat').toggleAttribute('data-active', playing && game.currentPlayer === role);
            $('join-' + role).disabled = pending || !connected || !record?.presence?.[playerId] || Boolean(player || side);
            $('join-' + role).textContent = player ? '已入座' : '入座';
        }

        cells.forEach((cell, index) => {
            const x = index % size;
            const y = Math.floor(index / size);
            const stone = game.state?.[y]?.[x];
            if (stone === 1 || stone === 2) {
                cell.dataset.piece = stone;
                moves++;
            } else {
                delete cell.dataset.piece;
            }
            cell.toggleAttribute('data-last', game.lastMove?.x === x && game.lastMove?.y === y);
            cell.toggleAttribute('data-winning', matchPieces.has(index));
            cell.setAttribute('aria-label', position(index) + (stone === 1 ? ' 黑棋' : stone === 2 ? ' 白棋' : ' 空位'));
            cell.setAttribute('aria-disabled', String(!canMove || Boolean(stone)));
        });

        $('moves').textContent = moves + ' 手' + (game.lastMove ? ' · 上一手 ' + position(game.lastMove.y * size + game.lastMove.x) : '');
        let status = '创建房间，或输入好友分享的房间号。';
        if (room) {
            status = '观战中 · 等待黑白双方入座';
            if (game.winner === 'draw') status = '本局和棋';
            else if (game.winner) status = roleLabel[game.winner] + '获胜';
            else if (playing) status = (side ? '' : '观战中 · ') + (side === game.currentPlayer ? '轮到你落子' : '等待' + roleLabel[game.currentPlayer] + '落子');
            else if (side) status = '你执' + roleLabel[side] + ' · 等待对手入座';
        }
        $('status').textContent = status;
    }

    function openPresence(ref) {
        if (!connected || !ref) return;
        ref.onDisconnect().remove()
            .then(() => ref === presenceRef && connected && ref.set(true))
            .catch(() => {
                if (ref === presenceRef) showMessage('无法连接房间，请检查网络后重试。');
            });
    }

    function detach() {
        roomRef?.off();
        if (presenceRef) {
            const previous = presenceRef;
            if (connected) previous.remove().then(() => previous.onDisconnect().cancel()).catch(() => {});
        }
        roomRef = presenceRef = null;
        record = null;
    }

    function enter(name) {
        name = name.trim();
        if (!roomPattern.test(name)) {
            showMessage('房间号须为 1–24 位字母、汉字、数字、下划线或短横线。');
            return;
        }
        if (!db) {
            showMessage('对战服务未加载，请刷新后重试。');
            return;
        }
        if (pending || room === name) return;
        detach();
        showMessage();
        room = name;
        $('room').value = name;
        history = [name, ...history.filter(value => value !== name)].slice(0, 8);
        try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch { /* Optional history. */ }
        const url = new URL(location.href);
        url.searchParams.set('room', name);
        window.history.replaceState(null, '', url);
        const joined = db.ref('gomoku/' + room);
        roomRef = joined;
        presenceRef = joined.child('presence').child(playerId);
        joined.on('value', snapshot => {
            if (roomRef !== joined) return;
            record = snapshot.val();
            render();
        }, () => showMessage('无法读取房间，请退出后重新进入。'));
        openPresence(presenceRef);
        renderHistory();
        render();
    }

    async function change(update, rejection) {
        const ref = roomRef;
        if (!ref || pending || !connected) return;
        pending = true;
        showMessage();
        render();
        try {
            const result = await ref.transaction(value => update(value || {}), undefined, false);
            if (!result.committed) showMessage(rejection);
        } catch {
            showMessage('操作失败，请检查连接后重试。');
        } finally {
            pending = false;
            render();
        }
    }

    function takeSeat(side) {
        const nickname = $('nickname').value.trim();
        if (!nickname) {
            showMessage('请先填写昵称。');
            $('nickname').focus();
            return;
        }
        try { localStorage.setItem(nicknameKey, nickname); } catch { /* Optional nickname. */ }
        change(value => {
            if (!value.presence?.[playerId] || seat(value, side) || mySide(value)) return;
            value.players ||= {};
            value.players[side] = { id: playerId, nickname };
            return value;
        }, '棋位已被占用或连接未就绪，请重试。');
    }

    function winningLine(board, x, y) {
        const stone = board[y][x];
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
            const line = [{ x, y }];
            for (const sign of [-1, 1]) {
                let nx = x + sign * dx;
                let ny = y + sign * dy;
                while (board[ny]?.[nx] === stone) {
                    line.push({ x: nx, y: ny });
                    nx += sign * dx;
                    ny += sign * dy;
                }
            }
            if (line.length >= 5) return line;
        }
        return null;
    }

    function place(index) {
        if (cells[index].getAttribute('aria-disabled') === 'true') return;
        change(value => {
            const side = mySide(value);
            const game = value.board || emptyBoard();
            const x = index % size;
            const y = Math.floor(index / size);
            if (!side || !roles.every(role => seat(value, role)) || game.winner || game.currentPlayer !== side || game.state[y][x] !== 0) return;
            game.state[y][x] = side === 'black' ? 1 : 2;
            game.lastMove = { x, y };
            game.currentPlayer = side === 'black' ? 'white' : 'black';
            game.line = winningLine(game.state, x, y);
            game.winner = game.line ? side : game.state.every(row => row.every(Boolean)) ? 'draw' : null;
            value.board = game;
            return value;
        }, '棋盘已更新，请确认当前回合后再落子。');
    }

    function moveCursor(index) {
        cells[cursor].tabIndex = -1;
        cursor = index;
        cells[cursor].tabIndex = 0;
    }

    for (let index = 0; index < size * size; index++) {
        const cell = document.createElement('button');
        cell.className = 'gm-cell';
        cell.type = 'button';
        cell.tabIndex = index === cursor ? 0 : -1;
        if ([48, 56, 112, 168, 176].includes(index)) cell.dataset.star = '';
        cell.addEventListener('focus', () => moveCursor(index));
        cell.addEventListener('click', () => place(index));
        cell.addEventListener('keydown', event => {
            const x = index % size;
            const moves = { ArrowLeft: x > 0 ? -1 : 0, ArrowRight: x < size - 1 ? 1 : 0, ArrowUp: index >= size ? -size : 0, ArrowDown: index < size * (size - 1) ? size : 0 };
            if (!Object.hasOwn(moves, event.key)) return;
            event.preventDefault();
            cells[index + moves[event.key]].focus();
        });
        cells.push(cell);
        $('board').append(cell);
    }

    $('join').addEventListener('submit', event => {
        event.preventDefault();
        enter($('room').value);
    });
    $('create').addEventListener('click', () => {
        const code = Array.from(crypto.getRandomValues(new Uint32Array(2)), value => value.toString(36)).join('-');
        enter(code);
    });
    $('leave').addEventListener('click', () => {
        if (pending) return;
        detach();
        room = '';
        const url = new URL(location.href);
        url.searchParams.delete('room');
        window.history.replaceState(null, '', url);
        showMessage();
        renderHistory();
        render();
    });
    $('invite').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(location.href);
            showMessage('邀请链接已复制。');
        } catch {
            showMessage('请复制浏览器地址栏中的邀请链接。');
        }
    });
    roles.forEach(side => $('join-' + side).addEventListener('click', () => takeSeat(side)));
    $('stand').addEventListener('click', () => change(value => {
        const side = mySide(value);
        if (!side) return;
        delete value.players[side];
        if (value.board?.rematch) delete value.board.rematch[side];
        return value;
    }, '当前棋位已释放。'));
    $('rematch').addEventListener('click', () => change(value => {
        const side = mySide(value);
        if (!side || !value.board?.winner || !roles.every(role => seat(value, role))) return;
        const game = value.board;
        game.rematch ||= {};
        game.rematch[side] = playerId;
        if (roles.every(role => game.rematch[role] === seat(value, role).id)) value.board = emptyBoard();
        return value;
    }, '对手已离开房间。'));

    renderHistory();
    render();
    try {
        db = (firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig)).database();
        db.ref('.info/connected').on('value', snapshot => {
            const online = snapshot.val() === true;
            const reconnected = online && !connected;
            connected = online;
            $('connection').textContent = connected ? '在线' : '尚未连接 · 正在重试';
            if (reconnected) openPresence(presenceRef);
            render();
        });
        const invited = new URLSearchParams(location.search).get('room');
        if (invited) enter(invited);
    } catch {
        $('connection').textContent = '对战服务暂不可用';
        showMessage('请检查网络后刷新页面。');
    }
})();
