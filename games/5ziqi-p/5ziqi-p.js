// 游戏常量
const BOARD_SIZE = 15;
const CELL_SIZE = 30;
const PIECE_RADIUS = 13;

// 游戏状态
let currentPlayer = 'black'; // 'black' 或 'white'
let boardState = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0)); // 0: 空, 1: 黑, 2: 白
let lastMove = null; // 最后一步棋的位置 {x, y}
let moveHistory = []; // 棋步历史记录
let gameActive = true; // 游戏是否进行中

// DOM元素
let boardCanvas, boardCtx;

// 初始化游戏
function initGame() {
    // 获取棋盘画布
    boardCanvas = document.getElementById('boardCanvas');
    boardCtx = boardCanvas.getContext('2d');
    boardCanvas.width = BOARD_SIZE * CELL_SIZE;
    boardCanvas.height = BOARD_SIZE * CELL_SIZE;

    // 初始化棋盘
    drawBoard();

    // 添加点击事件
    boardCanvas.addEventListener('click', handleBoardClick);

    // 初始化主题切换
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // 更新玩家状态
    updatePlayerStatus();
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

    // 绘制棋子
    drawPieces();
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
    if (!gameActive) return;

    const rect = boardCanvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((event.clientY - rect.top) / CELL_SIZE);

    // 检查位置是否有效
    if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE && boardState[y][x] === 0) {
        // 记录棋步历史
        moveHistory.push({
            x, y,
            player: currentPlayer,
            boardState: JSON.parse(JSON.stringify(boardState))
        });

        // 放置棋子
        boardState[y][x] = currentPlayer === 'black' ? 1 : 2;
        lastMove = { x, y };

        // 检查是否获胜
        if (checkWinner(x, y)) {
            showWinner(currentPlayer);
            return;
        }

        // 切换玩家
        currentPlayer = currentPlayer === 'black' ? 'white' : 'black';

        // 重绘棋盘
        drawBoard();

        // 更新状态
        updatePlayerStatus();
    }
}

// 检查胜利条件
function checkWinner(x, y) {
    const player = boardState[y][x];
    const directions = [
        [1, 0], [0, 1], [1, 1], [1, -1] // 水平、垂直、对角线
    ];

    for (const [dx, dy] of directions) {
        let count = 1;

        // 正向检查
        for (let i = 1; i < 5; i++) {
            const nx = x + i * dx;
            const ny = y + i * dy;
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && boardState[ny][nx] === player) {
                count++;
            } else {
                break;
            }
        }

        // 反向检查
        for (let i = 1; i < 5; i++) {
            const nx = x - i * dx;
            const ny = y - i * dy;
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && boardState[ny][nx] === player) {
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

// 更新玩家状态显示
function updatePlayerStatus() {
    document.getElementById('blackPlayer').classList.toggle('active', currentPlayer === 'black');
    document.getElementById('whitePlayer').classList.toggle('active', currentPlayer === 'white');
    document.getElementById('gameStatus').textContent = `${currentPlayer === 'black' ? '黑' : '白'}方回合`;
}

// 显示胜利者
function showWinner(winner) {
    gameActive = false;
    document.getElementById('winnerName').textContent = winner === 'black' ? '黑方' : '白方';
    document.getElementById('winnerOverlay').style.display = 'flex';
}

// 悔棋
function undoMove() {
    if (moveHistory.length === 0 || !gameActive) return;

    const lastMoveData = moveHistory.pop();
    boardState = lastMoveData.boardState;
    currentPlayer = lastMoveData.player;

    // 更新最后一步
    if (moveHistory.length > 0) {
        lastMove = { x: moveHistory[moveHistory.length - 1].x, y: moveHistory[moveHistory.length - 1].y };
    } else {
        lastMove = null;
    }

    // 重绘棋盘
    drawBoard();

    // 更新状态
    updatePlayerStatus();
}

// 重置游戏
function resetGame() {
    // 重置游戏状态
    boardState = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
    currentPlayer = 'black';
    lastMove = null;
    moveHistory = [];
    gameActive = true;

    // 隐藏胜利界面
    document.getElementById('winnerOverlay').style.display = 'none';

    // 重绘棋盘
    drawBoard();

    // 更新状态
    updatePlayerStatus();
}

// 切换主题
function toggleTheme() {
    const isDark = document.body.classList.contains('dark-mode');
    const newTheme = isDark ? 'light' : 'dark';

    document.body.classList.remove(isDark ? 'dark-mode' : 'light-mode');
    document.body.classList.add(newTheme + '-mode');

    // 更新图标
    const icon = document.getElementById('themeToggle').querySelector('i');
    icon.className = newTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';

    // 重新绘制棋盘
    drawBoard();
}

// 初始化游戏
window.onload = initGame;