firebase.initializeApp(firebaseConfig);

        // 全局变量
        const BOARD_SIZE = 15;
        const CELL_SIZE = 30;
        const PIECE_RADIUS = 13;

        let roomName = '';
        let gameRef = null;
        let playersRef = null;
        let boardRef = null;
        let userColor = localStorage.getItem('userColor') || '#40E0D0';
        let nickname = localStorage.getItem('nickname') || '';
        let myRole = '';
        let boardCanvas, boardCtx;
        let boardState = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
        let currentPlayer = 'black';
        let gameActive = false;
        let blackPlayer = null;
        let whitePlayer = null;
        let recentRooms = JSON.parse(localStorage.getItem('recentRooms') || '[]');
        let lastMove = null;

        // DOM 加载完成后初始化
        document.addEventListener('DOMContentLoaded', function () {
            // 初始化主题
            initTheme();

            // 初始化移动端菜单按钮
            document.getElementById('mobileMenuBtn').addEventListener('click', toggleSidebar);

            // 初始化主题切换按钮
            document.getElementById('themeToggle').addEventListener('click', toggleTheme);

            // 初始化最近房间列表
            updateRecentRoomsList();

            // 初始化棋盘
            boardCanvas = document.getElementById('boardCanvas');
            boardCtx = boardCanvas.getContext('2d');
            boardCanvas.width = BOARD_SIZE * CELL_SIZE;
            boardCanvas.height = BOARD_SIZE * CELL_SIZE;

            // 如果已有昵称，填充个人资料
            if (nickname) {
                document.getElementById('nicknameInput').value = nickname;
            }

            // 标记当前选中的颜色
            document.querySelectorAll('.color-option').forEach(opt => {
                opt.classList.toggle('selected', opt.style.background === userColor);
            });
        });

        // 初始化主题
        function initTheme() {
            const savedTheme = localStorage.getItem('theme') || 'dark';
            document.body.className = savedTheme + '-mode';
            updateThemeIcon(savedTheme);
        }

        // 切换主题
        function toggleTheme() {
            const isDark = document.body.classList.contains('dark-mode');
            const newTheme = isDark ? 'light' : 'dark';

            document.body.classList.remove(isDark ? 'dark-mode' : 'light-mode');
            document.body.classList.add(newTheme + '-mode');
            localStorage.setItem('theme', newTheme);

            updateThemeIcon(newTheme);

            // 重新绘制棋盘
            if (gameActive) {
                drawBoard();
                drawPieces();
            }
        }

        // 更新主题图标
        function updateThemeIcon(theme) {
            const icon = document.getElementById('themeToggle').querySelector('i');
            icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }

        // 切换侧边栏（移动端）
        function toggleSidebar() {
            document.getElementById('sidebar').classList.toggle('open');
        }

        // 更新最近房间列表
        function updateRecentRoomsList() {
            const roomList = document.getElementById('roomList');

            if (recentRooms.length === 0) {
                roomList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="fas fa-chess-board"></i>
                        </div>
                        <p>暂无房间记录</p>
                    </div>
                `;
                return;
            }

            roomList.innerHTML = '';
            recentRooms.forEach(room => {
                const roomItem = document.createElement('div');
                roomItem.className = 'room-item';
                roomItem.innerHTML = `
                    <i class="fas fa-chess-board room-icon"></i>
                    <span>${room}</span>
                `;
                roomItem.addEventListener('click', () => {
                    document.getElementById('roomInput').value = room;
                    joinRoom();
                });
                roomList.appendChild(roomItem);
            });
        }

        // 添加最近房间
        function addRecentRoom(room) {
            if (!recentRooms.includes(room)) {
                recentRooms.unshift(room);
                if (recentRooms.length > 5) {
                    recentRooms = recentRooms.slice(0, 5);
                }
                localStorage.setItem('recentRooms', JSON.stringify(recentRooms));
                updateRecentRoomsList();
            }
        }

        // 选择角色
        function selectRole(role, evt) {
            document.querySelectorAll('.role-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
            const target = evt && (evt.currentTarget || evt.target);
            if (target) {
                target.classList.add('selected');
            }
            myRole = role;
        }

        // 加入房间
        function joinRoom() {
            roomName = document.getElementById('roomInput').value.trim();
            if (!roomName) return;

            // 添加到最近房间
            addRecentRoom(roomName);

            // 更新当前房间标题
            document.getElementById('currentRoomTitle').textContent = `房间: ${roomName}`;

            // 关闭移动端侧边栏
            document.getElementById('sidebar').classList.remove('open');

            // 如果已有昵称，直接初始化游戏
            if (nickname && myRole) {
                initializeGame();
            }
        }

        // 选择颜色
        function selectColor(element) {
            document.querySelectorAll('.color-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            element.classList.add('selected');
            userColor = element.style.backgroundColor;
        }

        // 保存个人资料
        function saveProfile() {
            nickname = document.getElementById('nicknameInput').value.trim();
            if (!nickname || !myRole) {
                alert('请填写昵称并选择角色');
                return;
            }

            localStorage.setItem('nickname', nickname);
            localStorage.setItem('userColor', userColor);

            initializeGame();
        }

        // 初始化游戏
        function initializeGame() {
            // 隐藏个人资料设置
            document.getElementById('profileSetup').style.display = 'none';

            // 显示游戏内容
            document.getElementById('gameContent').style.display = 'block';

            // 初始化 Firebase 引用
            gameRef = firebase.database().ref(`gomoku/${roomName}`);
            playersRef = gameRef.child('players');
            boardRef = gameRef.child('board');

            // 设置当前玩家信息
            const myPlayerInfo = {
                nickname: nickname,
                color: userColor,
                role: myRole,
                timestamp: Date.now()
            };

            // 加入游戏
            playersRef.child(myRole).set(myPlayerInfo);

            // 监听玩家变化
            playersRef.on('value', snapshot => {
                const players = snapshot.val() || {};

                blackPlayer = players.black || null;
                whitePlayer = players.white || null;

                updatePlayerInfo();

                // 检查游戏是否可以开始
                checkGameStart();
            });

            // 监听棋盘变化
            boardRef.on('value', snapshot => {
                const gameData = snapshot.val() || {};

                if (gameData.state) {
                    boardState = gameData.state;
                    currentPlayer = gameData.currentPlayer || 'black';
                    lastMove = gameData.lastMove || null;

                    if (gameData.winner) {
                        showWinner(gameData.winner);
                    } else {
                        updateGameStatus();
                    }

                    drawBoard();
                    drawPieces();
                }
            });

            // 初始化棋盘点击事件
            boardCanvas.addEventListener('click', handleBoardClick);
        }

        // 更新玩家信息显示
        function updatePlayerInfo() {
            // 更新黑方信息
            const blackPlayerEl = document.getElementById('blackPlayer');
            if (blackPlayer) {
                blackPlayerEl.innerHTML = `
                    <div class="player-avatar" style="background: ${blackPlayer.color}">${blackPlayer.nickname[0].toUpperCase()}</div>
                    <div>
                        <div class="player-name">${blackPlayer.nickname}</div>
                        <div class="player-role">黑方 ${myRole === 'black' ? '(你)' : ''}</div>
                    </div>
                `;
            } else {
                blackPlayerEl.innerHTML = `
                    <div class="player-avatar">B</div>
                    <div>
                        <div class="player-name">等待黑方...</div>
                        <div class="player-role">黑方</div>
                    </div>
                `;
            }

            // 更新白方信息
            const whitePlayerEl = document.getElementById('whitePlayer');
            if (whitePlayer) {
                whitePlayerEl.innerHTML = `
                    <div class="player-avatar" style="background: ${whitePlayer.color}">${whitePlayer.nickname[0].toUpperCase()}</div>
                    <div>
                        <div class="player-name">${whitePlayer.nickname}</div>
                        <div class="player-role">白方 ${myRole === 'white' ? '(你)' : ''}</div>
                    </div>
                `;
            } else {
                whitePlayerEl.innerHTML = `
                    <div class="player-avatar">W</div>
                    <div>
                        <div class="player-name">等待白方...</div>
                        <div class="player-role">白方</div>
                    </div>
                `;
            }

            // 高亮当前玩家
            blackPlayerEl.classList.toggle('active', currentPlayer === 'black' && gameActive);
            whitePlayerEl.classList.toggle('active', currentPlayer === 'white' && gameActive);
        }

        // 检查游戏是否可以开始
        function checkGameStart() {
            if (blackPlayer && whitePlayer && !gameActive) {
                gameActive = true;

                // 初始化棋盘状态
                if (!boardRef.once('value', snapshot => {
                    if (!snapshot.val()) {
                        // 第一次初始化棋盘
                        const initialBoard = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
                        boardRef.set({
                            state: initialBoard,
                            currentPlayer: 'black',
                            lastMove: null,
                            winner: null
                        });
                    }
                }));

                // 显示重新开始按钮给玩家
                if (myRole === 'black' || myRole === 'white') {
                    document.getElementById('restartBtn').style.display = 'block';
                } else {
                    document.getElementById('restartBtn').style.display = 'none';
                }

                updateGameStatus();
                drawBoard();
            }
        }

        // 绘制棋盘
        function drawBoard() {
            // 棋盘背景
            boardCtx.fillStyle = '#dcb35c';
            boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

            // 网格线
            boardCtx.strokeStyle = '#000';
            boardCtx.lineWidth = 1;

            for (let i = 0; i < BOARD_SIZE; i++) {
                // 横线
                boardCtx.beginPath();
                boardCtx.moveTo(CELL_SIZE / 2, i * CELL_SIZE + CELL_SIZE / 2);
                boardCtx.lineTo((BOARD_SIZE - 0.5) * CELL_SIZE, i * CELL_SIZE + CELL_SIZE / 2);
                boardCtx.stroke();

                // 竖线
                boardCtx.beginPath();
                boardCtx.moveTo(i * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE / 2);
                boardCtx.lineTo(i * CELL_SIZE + CELL_SIZE / 2, (BOARD_SIZE - 0.5) * CELL_SIZE);
                boardCtx.stroke();
            }

            // 五个小点
            const dots = [
                [3, 3], [3, 11], [7, 7], [11, 3], [11, 11]
            ];

            boardCtx.fillStyle = '#000';
            dots.forEach(([x, y]) => {
                boardCtx.beginPath();
                boardCtx.arc(
                    x * CELL_SIZE + CELL_SIZE / 2,
                    y * CELL_SIZE + CELL_SIZE / 2,
                    3,
                    0,
                    Math.PI * 2
                );
                boardCtx.fill();
            });
        }

        // 绘制棋子
        function drawPieces() {
            for (let y = 0; y < BOARD_SIZE; y++) {
                for (let x = 0; x < BOARD_SIZE; x++) {
                    if (boardState[y][x] !== 0) {
                        const pieceColor = boardState[y][x] === 1 ? 'black' : 'white';

                        // 绘制棋子
                        boardCtx.beginPath();
                        boardCtx.arc(
                            x * CELL_SIZE + CELL_SIZE / 2,
                            y * CELL_SIZE + CELL_SIZE / 2,
                            PIECE_RADIUS,
                            0,
                            Math.PI * 2
                        );

                        // 棋子渐变效果
                        const gradient = boardCtx.createRadialGradient(
                            x * CELL_SIZE + CELL_SIZE / 2 - PIECE_RADIUS / 3,
                            y * CELL_SIZE + CELL_SIZE / 2 - PIECE_RADIUS / 3,
                            PIECE_RADIUS / 4,
                            x * CELL_SIZE + CELL_SIZE / 2,
                            y * CELL_SIZE + CELL_SIZE / 2,
                            PIECE_RADIUS
                        );

                        if (pieceColor === 'black') {
                            gradient.addColorStop(0, '#666');
                            gradient.addColorStop(1, '#000');
                        } else {
                            gradient.addColorStop(0, '#fff');
                            gradient.addColorStop(1, '#ddd');
                        }

                        boardCtx.fillStyle = gradient;
                        boardCtx.fill();

                        // 如果是最后一步，标记
                        if (lastMove && lastMove.x === x && lastMove.y === y) {
                            boardCtx.beginPath();
                            boardCtx.arc(
                                x * CELL_SIZE + CELL_SIZE / 2,
                                y * CELL_SIZE + CELL_SIZE / 2,
                                5,
                                0,
                                Math.PI * 2
                            );
                            boardCtx.fillStyle = 'red';
                            boardCtx.fill();
                        }
                    }
                }
            }
        }

        // 处理棋盘点击
        function handleBoardClick(event) {
            if (!gameActive || myRole !== currentPlayer || (myRole !== 'black' && myRole !== 'white')) {
                return;
            }

            const rect = boardCanvas.getBoundingClientRect();
            const x = Math.floor((event.clientX - rect.left) / CELL_SIZE);
            const y = Math.floor((event.clientY - rect.top) / CELL_SIZE);

            // 检查位置是否有效
            if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE && boardState[y][x] === 0) {
                // 更新棋盘状态
                const newState = JSON.parse(JSON.stringify(boardState));
                newState[y][x] = myRole === 'black' ? 1 : 2;

                // 检查是否获胜
                const winner = checkWinner(newState, x, y) ? myRole : null;

                // 更新游戏状态
                boardRef.set({
                    state: newState,
                    currentPlayer: currentPlayer === 'black' ? 'white' : 'black',
                    lastMove: { x, y },
                    winner: winner
                });

                // 如果是观众，不播放声音
                if (myRole !== 'spectator') {
                    playPlaceSound();
                }
            }
        }

        // 检查胜利条件
        function checkWinner(board, x, y) {
            const player = board[y][x];
            const directions = [
                [1, 0], [0, 1], [1, 1], [1, -1] // 水平、垂直、对角线
            ];

            for (const [dx, dy] of directions) {
                let count = 1;

                // 正向检查
                for (let i = 1; i < 5; i++) {
                    const nx = x + i * dx;
                    const ny = y + i * dy;
                    if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === player) {
                        count++;
                    } else {
                        break;
                    }
                }

                // 反向检查
                for (let i = 1; i < 5; i++) {
                    const nx = x - i * dx;
                    const ny = y - i * dy;
                    if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === player) {
                        count++;
                    } else {
                        break;
                    }
                }

                if (count >= 5) {
                    return true;
                }
            }

            return false;
        }

        // 更新游戏状态显示
        function updateGameStatus() {
            const gameStatusEl = document.getElementById('gameStatus');

            if (!gameActive) {
                gameStatusEl.textContent = '等待另一位玩家加入...';
                return;
            }

            if (currentPlayer === myRole) {
                gameStatusEl.textContent = '轮到你了!';
            } else {
                const playerName = currentPlayer === 'black'
                    ? (blackPlayer ? blackPlayer.nickname : '黑方')
                    : (whitePlayer ? whitePlayer.nickname : '白方');
                gameStatusEl.textContent = `等待 ${playerName} 下棋...`;
            }

            // 高亮当前玩家
            document.getElementById('blackPlayer').classList.toggle('active', currentPlayer === 'black');
            document.getElementById('whitePlayer').classList.toggle('active', currentPlayer === 'white');
        }

        // 显示胜利者
        function showWinner(winner) {
            gameActive = false;

            const winnerName = winner === 'black'
                ? (blackPlayer ? blackPlayer.nickname : '黑方')
                : (whitePlayer ? whitePlayer.nickname : '白方');

            document.getElementById('winnerName').textContent = winnerName;
            document.getElementById('winnerOverlay').style.display = 'flex';

            // 播放胜利音效
            if (myRole !== 'spectator') {
                playWinSound();
            }
        }

        // 请求重新开始游戏
        function requestRestart() {
            if (confirm('确定要重新开始游戏吗?')) {
                // 重置棋盘
                const initialBoard = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
                boardRef.set({
                    state: initialBoard,
                    currentPlayer: 'black',
                    lastMove: null,
                    winner: null
                }).then(() => {
                    // 清除胜利者显示
                    document.getElementById('winnerOverlay').style.display = 'none';
                    // 重新绘制棋盘
                    drawBoard();
                    drawPieces();
                    // 更新游戏状态
                    updateGameStatus();
                }).catch(error => {
                    console.error('Failed to reset game:', error);
                });
            }
        }

        // 播放落子音效
        function playPlaceSound() {
            const sound = new Audio('place-piece.mp3');
            sound.play();
        }

        // 播放胜利音效
        function playWinSound() {
            const sound = new Audio('win.mp3');
            sound.play();
        }
