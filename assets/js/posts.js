// 移除硬编码的标签数组
// const allTags = ['全部', '技术', '杂谈', '社科'];
let allTags = ['全部']; // 初始只包含"全部"标签
let currentTag = '全部';
let allColumns = ['全部'];
let currentColumn = '全部';
let currentPage = 1;
const postsPerPage = 10;
let allPosts = [];

function setFilterPanelsVisible(visible) {
    const tagPanel = document.getElementById('tagFilterPanel');
    const columnPanel = document.getElementById('columnFilterPanel');
    if (tagPanel) tagPanel.style.display = visible ? 'block' : 'none';
    if (columnPanel) columnPanel.style.display = visible ? 'block' : 'none';
}

function updateFilterCounts() {
    const tagCount = document.getElementById('tagCount');
    const columnCount = document.getElementById('columnCount');
    if (tagCount) tagCount.textContent = String(Math.max(0, allTags.length - 1));
    if (columnCount) columnCount.textContent = String(Math.max(0, allColumns.length - 1));
}

function initFoldPanels() {
    document.querySelectorAll('.posts-fold-toggle').forEach(btn => {
        if (!(btn instanceof HTMLButtonElement)) return;
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            if (!targetId) return;
            const panel = document.getElementById(targetId);
            const wrapper = btn.closest('.posts-fold-panel');
            if (!(panel instanceof HTMLElement) || !(wrapper instanceof HTMLElement)) return;

            const isOpen = wrapper.classList.contains('open');
            if (isOpen) {
                panel.style.maxHeight = `${panel.scrollHeight}px`;
                requestAnimationFrame(() => {
                    panel.style.maxHeight = '0px';
                    panel.style.opacity = '0';
                });
                wrapper.classList.remove('open');
                return;
            }

            wrapper.classList.add('open');
            panel.style.opacity = '1';
            panel.style.maxHeight = `${panel.scrollHeight}px`;
        });
    });
}

// 获取URL参数
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get('search');
    const tagParam = params.get('tag');
    const columnsParam = params.get('columns');
    return {
        search: searchParam,
        tag: tagParam,
        columns: columnsParam
    };
}

// 从文章数据中提取所有标签
function extractTagsFromPosts(posts) {
    const tagSet = new Set();

    posts.forEach(post => {
        if (post.tags && Array.isArray(post.tags)) {
            post.tags.forEach(tag => {
                if (tag && tag.trim() !== '') {
                    tagSet.add(tag.trim());
                }
            });
        }
    });

    // 将Set转换为数组并排序
    const tags = Array.from(tagSet).sort();

    // 在开头添加"全部"标签
    return ['全部', ...tags];
}

function extractColumnsFromPosts(posts) {
    const columnSet = new Set();

    posts.forEach(post => {
        if (post.columns && Array.isArray(post.columns)) {
            post.columns.forEach(column => {
                if (column && String(column).trim() !== '') {
                    columnSet.add(String(column).trim());
                }
            });
        }
    });

    const columns = Array.from(columnSet).sort();
    return ['全部', ...columns];
}

// 加载文章列表
async function loadPosts() {
    console.log('开始加载文章...');
    const preloadedPosts = Array.isArray(window.__POSTS_DATA__) ? window.__POSTS_DATA__ : null;
    allPosts = preloadedPosts || await fetch('/posts/posts.json').then(r => r.json());
    console.log('获取到文章数量:', allPosts.length);

    // 确保所有文章都有tags数组
    allPosts.forEach(post => {
        if (!post.tags) post.tags = ['未分类'];
        if (!post.columns) post.columns = [];
    });

    // 从文章数据中提取标签
    allTags = extractTagsFromPosts(allPosts);
    allColumns = extractColumnsFromPosts(allPosts);
    console.log('提取到的标签:', allTags);

    renderTagFilter();
    renderColumnFilter();
    updateFilterCounts();
    initFoldPanels();
    renderPosts();
    renderPagination();

    // 检查URL参数，如果有搜索词则自动执行搜索
    const urlParams = getUrlParams();
    console.log('URL参数:', urlParams);

    if (urlParams.search) {
        console.log('检测到搜索参数:', urlParams.search);

        // 等待导航栏加载完成
        setTimeout(() => {
            const searchInput = document.getElementById('searchInput');
            console.log('搜索框元素:', searchInput);

            if (searchInput) {
                console.log('设置搜索框值为:', urlParams.search);
                searchInput.value = urlParams.search;
                // 直接调用搜索函数，不等待用户操作
                performSearch(urlParams.search);
            } else {
                console.error('未找到搜索框元素!');
            }
        }, 100);
        return;
    }

    let didApplyFilter = false;
    if (urlParams.tag && allTags.includes(urlParams.tag)) {
        currentTag = urlParams.tag;
        didApplyFilter = true;
    }
    if (urlParams.columns && allColumns.includes(urlParams.columns)) {
        currentColumn = urlParams.columns;
        didApplyFilter = true;
    }

    if (didApplyFilter) {
        const searchResults = document.getElementById('searchResults');
        if (searchResults) searchResults.style.display = 'none';
        setFilterPanelsVisible(true);
        const posts = document.getElementById('posts');
        const pagination = document.getElementById('pagination');
        if (posts) posts.style.display = 'block';
        if (pagination) pagination.style.display = 'flex';
        renderTagFilter();
        renderColumnFilter();
        renderPosts();
        renderPagination();
    }
}

// 执行搜索的核心函数
function performSearch(searchTerm) {
    const searchTermLower = searchTerm.toLowerCase().trim();

    if (searchTermLower === '') {
        // 如果搜索词为空，显示正常列表
        document.getElementById('searchResults').style.display = 'none';
        setFilterPanelsVisible(true);
        document.getElementById('posts').style.display = 'block';
        document.getElementById('pagination').style.display = 'flex';
        return;
    }

    const searchResults = allPosts.filter(post =>
        post.title.toLowerCase().includes(searchTermLower) ||
        (post.tags && post.tags.some(tag => tag.toLowerCase().includes(searchTermLower))) ||
        (post.columns && post.columns.some(column => column.toLowerCase().includes(searchTermLower)))
    );

    const searchResultsContainer = document.getElementById('searchResults');
    searchResultsContainer.innerHTML = '';

    if (searchResults.length > 0) {
        searchResults.forEach(post => {
            // 计算阅读时长
            const readTime = Math.ceil((post.wordCount || 0) / 400);
            const postUrl = `/posts/${post.file.replace('.md', '')}`;

            const resultItem = document.createElement('a');
            resultItem.className = 'search-result-item post-item post-item-link';
            resultItem.href = postUrl;
            resultItem.innerHTML = `
                <div class="post-title">${post.title}</div>
                <div class="post-date">${post.date}</div>
                <div class="post-tags">
                    <span class="post-tag read-time">${post.wordCount || 0}字·${readTime}min</span>
                    ${(post.columns || []).map(column => `<span class="post-tag post-tag-column"><i class="fa-solid fa-folder"></i>${column}</span>`).join('')}
                    ${(post.tags || ['未分类']).map(tag => `<span class="post-tag"><i class="fa-solid fa-tag"></i>${tag}</span>`).join('')}
                </div>
            `;
            searchResultsContainer.appendChild(resultItem);
        });
    } else {
        searchResultsContainer.innerHTML = '<div style="color: #666; text-align: center;">未找到相关文章</div>';
    }

    // 显示搜索结果，隐藏正常列表
    document.getElementById('searchResults').style.display = 'block';
    setFilterPanelsVisible(false);
    document.getElementById('posts').style.display = 'none';
    document.getElementById('pagination').style.display = 'none';

    // 更新URL参数（不刷新页面）
    const url = new URL(window.location);
    if (searchTerm) {
        url.searchParams.set('search', searchTerm);
    } else {
        url.searchParams.delete('search');
    }
    window.history.replaceState({}, '', url);
}

// 搜索博客功能
async function searchBlog() {
    const searchTerm = document.getElementById('searchInput').value;
    performSearch(searchTerm);
}

// 获取当前页的文章
function getCurrentPagePosts() {
    const filteredPosts = getFilteredPosts();

    const startIndex = (currentPage - 1) * postsPerPage;
    const endIndex = startIndex + postsPerPage;
    return filteredPosts.slice(startIndex, endIndex);
}

// 渲染标签筛选器
function renderTagFilter() {
    const tagFilter = document.getElementById('tagFilter');
    tagFilter.innerHTML = allTags.map(tag => `
                <button class="tag-btn ${tag === currentTag ? 'active' : ''}" 
                        onclick="filterByTag('${tag}')">
                    ${tag}
                </button>
            `).join('');
}

function renderColumnFilter() {
    const columnFilter = document.getElementById('columnFilter');
    columnFilter.innerHTML = allColumns.map(column => `
                <button class="tag-btn ${column === currentColumn ? 'active' : ''}" 
                        onclick="filterByColumn('${column}')">
                    ${column}
                </button>
            `).join('');
}

// 按标签筛选
function filterByTag(tag) {
    currentTag = tag;
    currentPage = 1;
    renderTagFilter();
    renderPosts();
    renderPagination();

    // 清除搜索状态
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').style.display = 'none';
    setFilterPanelsVisible(true);
    document.getElementById('posts').style.display = 'block';
    document.getElementById('pagination').style.display = 'flex';

    // 清除URL中的搜索参数
    const url = new URL(window.location);
    url.searchParams.delete('search');
    if (tag && tag !== '全部') {
        url.searchParams.set('tag', tag);
    } else {
        url.searchParams.delete('tag');
    }
    window.history.replaceState({}, '', url);
}

function filterByColumn(column) {
    currentColumn = column;
    currentPage = 1;
    renderColumnFilter();
    renderPosts();
    renderPagination();

    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').style.display = 'none';
    setFilterPanelsVisible(true);
    document.getElementById('posts').style.display = 'block';
    document.getElementById('pagination').style.display = 'flex';

    const url = new URL(window.location);
    url.searchParams.delete('search');
    if (column && column !== '全部') {
        url.searchParams.set('columns', column);
    } else {
        url.searchParams.delete('columns');
    }
    window.history.replaceState({}, '', url);
}

function getFilteredPosts() {
    return allPosts.filter(post => {
        const tagPass = currentTag === '全部' || (post.tags && post.tags.includes(currentTag));
        const columnPass = currentColumn === '全部' || (post.columns && post.columns.includes(currentColumn));
        return tagPass && columnPass;
    });
}

// 渲染文章列表
function renderPosts() {
    const postsToShow = getCurrentPagePosts();

    const list = postsToShow.map(post => {
        // 计算阅读时长
        const readTime = Math.ceil((post.wordCount || 0) / 400);
        const postUrl = `/posts/${post.file.replace('.md', '')}`;

        return `
                <a class="post-item post-item-link" href="${postUrl}">
                    <div class="post-title">${post.title}</div>
                    <div class="post-date">${post.date}</div>
                    <div class="post-tags">
                        <span class="post-tag read-time">${post.wordCount || 0}字·${readTime}min</span>
                        ${(post.columns || []).map(column => `<span class="post-tag post-tag-column"><i class="fa-solid fa-folder"></i>${column}</span>`).join('')}
                        ${(post.tags || ['未分类']).map(tag => `<span class="post-tag"><i class="fa-solid fa-tag"></i>${tag}</span>`).join('')}
                    </div>
                </a>
            `;
    }).join('');

    document.getElementById('posts').innerHTML = list;
}

// 渲染分页
function renderPagination() {
    const filteredPosts = getFilteredPosts();

    const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
    const pageNumbers = document.getElementById('pageNumbers');
    pageNumbers.innerHTML = '';

    // 显示页码按钮
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => goToPage(i);
        pageNumbers.appendChild(pageBtn);
    }

    // 更新上一页/下一页按钮状态
    document.querySelector('.prev-btn').disabled = currentPage === 1;
    document.querySelector('.next-btn').disabled = currentPage === totalPages;

    // 如果只有一页，隐藏分页
    document.getElementById('pagination').style.display = totalPages <= 1 ? 'none' : 'flex';
}

// 跳转到指定页
function goToPage(page) {
    currentPage = page;
    renderPosts();
    renderPagination();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 上一页
function prevPage() {
    if (currentPage > 1) {
        goToPage(currentPage - 1);
    }
}

// 下一页
function nextPage() {
    const filteredPosts = getFilteredPosts();
    const totalPages = Math.ceil(filteredPosts.length / postsPerPage);

    if (currentPage < totalPages) {
        goToPage(currentPage + 1);
    }
}

// 初始化加载
document.addEventListener('DOMContentLoaded', loadPosts);

// 监听搜索输入框的Enter键
document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                searchBlog();
            }
        });
    }
});
