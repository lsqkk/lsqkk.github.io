import tools from '../../assets/pages/tool/tool.json';
import games from '../../assets/pages/games/game.json';
import labs from '../../assets/pages/a/projects.json';
import blog from '../../assets/pages/blog/functions.json';

const localPath = (href: string, prefix: string) => {
  if (/^https?:/.test(href)) return '';
  return (href.startsWith('/') ? href : `/${prefix}/${href}`).replace(/\/$/, '') || '/';
};
const entries = [
  ...tools.categories.flatMap(group => group.tools.map(item => ({ name: item.name, path: localPath(item.url, 'tool'), area: '工具' }))),
  ...labs.categories.flatMap(group => group.projects.map(item => ({ name: item.name, path: localPath(item.link, 'a'), area: '实验室' }))),
  ...Object.values(games).flat().map(item => ({ name: item.name, path: localPath(item.link, 'games'), area: '游戏' })),
  ...blog.categories.flatMap(group => group.functions.map(item => ({ name: item.name, path: localPath(item.link, 'blog'), area: '功能' }))),
];
export const pocketCatalog = [...new Map(entries.filter(item => item.path).map(item => [item.path, item])).values()];
