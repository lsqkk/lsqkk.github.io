function resolveGameLink(link) {
  if (!link) return '#';
  if (/^(?:[a-z]+:)?\/\//i.test(link)) return link;
  if (link.startsWith('/')) return link;
  return `/games/${link.replace(/^\.?\//, '')}`;
}

function showGameSkeleton(container) {
  const sections = ['对战专区', '单机游戏', '经典复刻'];
  sections.forEach(title => {
    const skel = document.createElement('div');
    skel.className = 'game-skeleton';
    skel.innerHTML = '<div class="game-skeleton-title"></div><div class="game-skeleton-grid">' +
      Array(6).fill('<div class="game-skeleton-card"></div>').join('') + '</div>';
    container.appendChild(skel);
  });
}

function preloadImage(url, onLoad) {
  const img = new Image();
  img.onload = onLoad;
  img.onerror = onLoad;
  img.src = url;
}

async function loadGames() {
  const gameContainer = document.getElementById('game-container');
  showGameSkeleton(gameContainer);

  const data = window.__GAMES_DATA__ || await fetch('/assets/pages/games/game.json').then((response) => response.json());

  // 清除骨架
  gameContainer.querySelectorAll('.game-skeleton').forEach(el => el.remove());

  // 创建各个分区
  createGameSection(gameContainer, '对战专区', data.multiplayer);
  createGameSection(gameContainer, '单机游戏', data.singlePlayer);
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
    link.href = resolveGameLink(game.link);
    link.target = '_blank';

    const bg = document.createElement('div');
    bg.className = 'game-card-bg';

    // 预加载图片，加载完成后移除骨架
    preloadImage(game.image, () => {
      bg.style.backgroundImage = `url('${game.image}')`;
      bg.classList.add('is-loaded');
    });

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
