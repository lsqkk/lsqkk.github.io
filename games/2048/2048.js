document.addEventListener('DOMContentLoaded', () => {
    // 游戏状态
    const gameState = {
        grid: Array(4).fill().map(() => Array(4).fill(0)),
        score: 0,
        bestScore: parseInt(localStorage.getItem('bestScore')) || 0,
        gameOver: false,
        won: false,
        moved: false,
        lastMove: null // 记录上一次移动的信息
    };

    // DOM元素
    const elements = {
        tileContainer: document.getElementById('tile-container'),
        score: document.getElementById('score'),
        bestScore: document.getElementById('best-score'),
        restartButton: document.getElementById('restart-button'),
        gameMessage: document.getElementById('game-message'),
        messageText: document.getElementById('message-text'),
        keepPlayingButton: document.getElementById('keep-playing-button'),
        retryButton: document.getElementById('retry-button'),
        upButton: document.getElementById('up'),
        leftButton: document.getElementById('left'),
        rightButton: document.getElementById('right'),
        downButton: document.getElementById('down')
    };

    // 初始化游戏
    function initGame() {
        resetGame();
        setupEventListeners();
    }

    // 重置游戏状态
    function resetGame() {
        gameState.grid = Array(4).fill().map(() => Array(4).fill(0));
        gameState.score = 0;
        gameState.gameOver = false;
        gameState.won = false;

        elements.score.textContent = '0';
        elements.bestScore.textContent = gameState.bestScore;
        elements.gameMessage.className = 'game-message';

        clearContainer(elements.tileContainer);
        addStartTiles();
        updateView();
    }

    // 清除容器
    function clearContainer(container) {
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
    }

    // 添加初始方块
    function addStartTiles() {
        for (let i = 0; i < 2; i++) {
            addRandomTile();
        }
    }

    // 添加随机方块
    function addRandomTile() {
        if (!hasEmptyTile()) return;

        let value = Math.random() < 0.9 ? 2 : 4;
        let position = getRandomEmptyPosition();

        if (position) {
            gameState.grid[position.row][position.col] = value;
            return position; // 返回新方块位置
        }
    }

    // 检查是否有空格子
    function hasEmptyTile() {
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                if (gameState.grid[row][col] === 0) return true;
            }
        }
        return false;
    }

    // 获取随机空格位置
    function getRandomEmptyPosition() {
        let emptyPositions = [];

        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                if (gameState.grid[row][col] === 0) {
                    emptyPositions.push({ row, col });
                }
            }
        }

        if (emptyPositions.length > 0) {
            return emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
        }
        return null;
    }

    // 更新视图 - 添加动画支持
    function updateView() {
        clearContainer(elements.tileContainer);

        // 记录新生成和合并的方块
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                if (gameState.grid[row][col] !== 0) {
                    const isNew = gameState.lastMove &&
                        gameState.lastMove.newTiles.some(t => t.row === row && t.col === col);

                    const isMerged = gameState.lastMove &&
                        gameState.lastMove.mergedTiles.some(t => t.row === row && t.col === col);

                    addTileToView(row, col, gameState.grid[row][col], isNew, isMerged);
                }
            }
        }

        updateScore();
        checkGameStatus();
    }
    // 添加方块到视图 - 已修正对齐问题
    // 添加方块到视图 - 添加动画效果
    function addTileToView(row, col, value, isNew = false, isMerged = false) {
        const tile = document.createElement('div');
        tile.className = `tile tile-${value}`;
        tile.textContent = value;

        // 计算位置
        const size = 95; // 每个格子大小
        const gap = 10;   // 间隔

        tile.style.width = `${size}px`;
        tile.style.height = `${size}px`;
        tile.style.left = `${col * (size + gap)}px`;
        tile.style.top = `${row * (size + gap)}px`;

        // 添加动画效果
        if (isNew) {
            tile.style.transform = 'scale(0)';
            tile.style.transition = 'transform 0.15s ease';
            setTimeout(() => {
                tile.style.transform = 'scale(1)';
            }, 10);
        } else if (isMerged) {
            tile.style.transform = 'scale(1.1)';
            tile.style.transition = 'transform 0.15s ease';
            setTimeout(() => {
                tile.style.transform = 'scale(1)';
            }, 150);
        } else {
            tile.style.transition = 'all 0.15s ease';
        }

        elements.tileContainer.appendChild(tile);
        return tile;
    }
    // 更新分数
    function updateScore() {
        elements.score.textContent = gameState.score;

        if (gameState.score > gameState.bestScore) {
            gameState.bestScore = gameState.score;
            elements.bestScore.textContent = gameState.bestScore;
            localStorage.setItem('bestScore', gameState.bestScore);
        }
    }

    // 检查游戏状态
    function checkGameStatus() {
        if (gameState.won) {
            elements.messageText.textContent = '你赢了!';
            elements.gameMessage.classList.add('game-won');
        } else if (gameState.gameOver) {
            elements.messageText.textContent = '游戏结束!';
            elements.gameMessage.classList.add('game-over');
        }
    }

    // 检查游戏是否结束
    function checkGameOver() {
        // 如果有空格，游戏还没结束
        if (hasEmptyTile()) return false;

        // 检查水平方向是否有可以合并的方块
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 3; col++) {
                if (gameState.grid[row][col] === gameState.grid[row][col + 1]) {
                    return false;
                }
            }
        }

        // 检查垂直方向是否有可以合并的方块
        for (let col = 0; col < 4; col++) {
            for (let row = 0; row < 3; row++) {
                if (gameState.grid[row][col] === gameState.grid[row + 1][col]) {
                    return false;
                }
            }
        }

        return true;
    }

    // 检查是否获胜
    function checkWin() {
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                if (gameState.grid[row][col] === 2048) {
                    return true;
                }
            }
        }
        return false;
    }

    // 移动方块
    function move(direction) {
        if (gameState.gameOver) return;

        const gridCopy = JSON.parse(JSON.stringify(gameState.grid)); // 复制当前网格
        let moved = false;
        const grid = gameState.grid;

        gameState.lastMove = {
            newTiles: [], // 新生成的方块
            mergedTiles: [], // 合并的方块
            movedTiles: [] // 移动的方块
        };

        // 根据方向处理移动
        switch (direction) {
            case 'left':
                for (let row = 0; row < 4; row++) {
                    const newRow = [];
                    let prev = null;

                    for (let col = 0; col < 4; col++) {
                        if (grid[row][col] !== 0) {
                            if (prev === null) {
                                prev = grid[row][col];
                            } else if (prev === grid[row][col]) {
                                newRow.push(prev * 2);
                                gameState.score += prev * 2;
                                prev = null;
                            } else {
                                newRow.push(prev);
                                prev = grid[row][col];
                            }
                        }
                    }

                    if (prev !== null) newRow.push(prev);
                    while (newRow.length < 4) newRow.push(0);

                    // 检查是否有移动
                    for (let col = 0; col < 4; col++) {
                        if (grid[row][col] !== newRow[col]) {
                            moved = true;
                            break;
                        }
                    }

                    grid[row] = newRow;
                }
                break;

            case 'right':
                for (let row = 0; row < 4; row++) {
                    const newRow = [];
                    let prev = null;

                    for (let col = 3; col >= 0; col--) {
                        if (grid[row][col] !== 0) {
                            if (prev === null) {
                                prev = grid[row][col];
                            } else if (prev === grid[row][col]) {
                                newRow.unshift(prev * 2);
                                gameState.score += prev * 2;
                                prev = null;
                            } else {
                                newRow.unshift(prev);
                                prev = grid[row][col];
                            }
                        }
                    }

                    if (prev !== null) newRow.unshift(prev);
                    while (newRow.length < 4) newRow.unshift(0);

                    // 检查是否有移动
                    for (let col = 0; col < 4; col++) {
                        if (grid[row][col] !== newRow[col]) {
                            moved = true;
                            break;
                        }
                    }

                    grid[row] = newRow;
                }
                break;

            case 'up':
                for (let col = 0; col < 4; col++) {
                    const newCol = [];
                    let prev = null;

                    for (let row = 0; row < 4; row++) {
                        if (grid[row][col] !== 0) {
                            if (prev === null) {
                                prev = grid[row][col];
                            } else if (prev === grid[row][col]) {
                                newCol.push(prev * 2);
                                gameState.score += prev * 2;
                                prev = null;
                            } else {
                                newCol.push(prev);
                                prev = grid[row][col];
                            }
                        }
                    }

                    if (prev !== null) newCol.push(prev);
                    while (newCol.length < 4) newCol.push(0);

                    // 检查是否有移动
                    for (let row = 0; row < 4; row++) {
                        if (grid[row][col] !== newCol[row]) {
                            moved = true;
                            break;
                        }
                    }

                    // 更新列
                    for (let row = 0; row < 4; row++) {
                        grid[row][col] = newCol[row];
                    }
                }
                break;

            case 'down':
                for (let col = 0; col < 4; col++) {
                    const newCol = [];
                    let prev = null;

                    for (let row = 3; row >= 0; row--) {
                        if (grid[row][col] !== 0) {
                            if (prev === null) {
                                prev = grid[row][col];
                            } else if (prev === grid[row][col]) {
                                newCol.unshift(prev * 2);
                                gameState.score += prev * 2;
                                prev = null;
                            } else {
                                newCol.unshift(prev);
                                prev = grid[row][col];
                            }
                        }
                    }

                    if (prev !== null) newCol.unshift(prev);
                    while (newCol.length < 4) newCol.unshift(0);

                    // 检查是否有移动
                    for (let row = 0; row < 4; row++) {
                        if (grid[row][col] !== newCol[row]) {
                            moved = true;
                            break;
                        }
                    }

                    // 更新列
                    for (let row = 0; row < 4; row++) {
                        grid[row][col] = newCol[row];
                    }
                }
                break;
        }

        if (moved) {

            const newTilePos = addRandomTile();
            if (newTilePos) {
                gameState.lastMove.newTiles.push(newTilePos);
            }

            updateView();

            // 检查游戏状态
            if (checkWin()) {
                gameState.won = true;
            } else if (checkGameOver()) {
                gameState.gameOver = true;
            }
        }
    }

    // 设置事件监听器
    function setupEventListeners() {
        // 键盘事件
        document.addEventListener('keydown', (e) => {
            if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) {
                e.preventDefault(); // 阻止默认行为，防止页面滚动
                move(e.key.replace('Arrow', '').toLowerCase());
            }

            if (e.key === 'ArrowUp') move('up');
            else if (e.key === 'ArrowRight') move('right');
            else if (e.key === 'ArrowDown') move('down');
            else if (e.key === 'ArrowLeft') move('left');
        });

        // 方向按钮事件
        elements.upButton.addEventListener('click', () => move('up'));
        elements.rightButton.addEventListener('click', () => move('right'));
        elements.downButton.addEventListener('click', () => move('down'));
        elements.leftButton.addEventListener('click', () => move('left'));

        // 重新开始按钮
        elements.restartButton.addEventListener('click', resetGame);
        elements.retryButton.addEventListener('click', resetGame);

        // 继续游戏按钮
        elements.keepPlayingButton.addEventListener('click', () => {
            elements.gameMessage.classList.remove('game-won');
            gameState.won = false;
        });

        // 触摸滑动支持
        let touchStartX, touchStartY;

        document.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        });

        document.addEventListener('touchend', (e) => {
            if (!touchStartX || !touchStartY) return;

            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;

            const dx = touchEndX - touchStartX;
            const dy = touchEndY - touchStartY;

            // 确定滑动方向
            if (Math.abs(dx) > Math.abs(dy)) {
                // 水平滑动
                if (dx > 50) move('right');
                else if (dx < -50) move('left');
            } else {
                // 垂直滑动
                if (dy > 50) move('down');
                else if (dy < -50) move('up');
            }

            touchStartX = null;
            touchStartY = null;
        });
    }

    // 初始化游戏
    initGame();
});