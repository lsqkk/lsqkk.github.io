async function loadGames() {
    const response = await fetch('game.json');
    const data = await response.json();
    const gameContainer = document.getElementById('game-container');

    // 创建对战专区
    createGameSection(gameContainer, '对战专区', data.multiplayer);

    // 创建单机游戏
    createGameSection(gameContainer, '单机游戏', data.singlePlayer);

    // 创建经典复刻
    createGameSection(gameContainer, '经典复刻', data.classic);
}

function createGameSection(container, title, games) {
    if (!games || games.length === 0) return;

    const section = document.createElement('div');
    section.className = 'game-section';

    const titleElement = document.createElement('h2');
    titleElement.className = 'game-section-title';
    titleElement.textContent = title;
    section.appendChild(titleElement);

    const list = document.createElement('div');
    list.className = 'game-list';

    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';

        const link = document.createElement('a');
        link.href = game.link;
        link.target = '_blank';

        const bg = document.createElement('div');
        bg.className = 'game-card-bg';
        bg.style.backgroundImage = `url('${game.image}')`;

        const overlay = document.createElement('div');
        overlay.className = 'game-card-overlay';

        const name = document.createElement('h3');
        name.className = 'game-card-name';
        name.textContent = game.name;

        overlay.appendChild(name);
        link.appendChild(bg);
        link.appendChild(overlay);
        card.appendChild(link);
        list.appendChild(card);
    });

    section.appendChild(list);
    container.appendChild(section);
}

document.addEventListener('DOMContentLoaded', () => {
    loadGames();
});