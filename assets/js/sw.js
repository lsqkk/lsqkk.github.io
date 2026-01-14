// 定义缓存名称，版本号便于后续更新
const CACHE_NAME = 'quarkblog-cache-v1';
// 需要缓存的资源列表
const urlsToCache = [
    '/',
    '/index.html',
    '/posts'
    // 在这里添加你博客更多的核心资源路径，如CSS、JS、图片等
];

// 'install' 事件：当Service Worker安装时，缓存核心资源
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) {
                console.log('已打开缓存');
                return cache.addAll(urlsToCache);
            })
    );
});

// 'fetch' 事件：拦截网络请求，优先返回缓存内容
self.addEventListener('fetch', function (event) {
    event.respondWith(
        caches.match(event.request)
            .then(function (response) {
                // 如果缓存中有该请求的资源，则返回缓存内容，否则向网络请求
                if (response) {
                    return response;
                }
                return fetch(event.request);
            }
            )
    );
});