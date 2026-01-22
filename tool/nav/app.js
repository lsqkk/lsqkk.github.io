// DOM元素
const gridViewBtn = document.getElementById('grid-view');
const listViewBtn = document.getElementById('list-view');
const bookmarksGrid = document.getElementById('bookmarks-grid-view');
const bookmarksList = document.getElementById('bookmarks-list-view');
const addBookmarkBtn = document.getElementById('add-bookmark');
const addBookmarkModal = document.getElementById('add-bookmark-modal');
const closeAddBookmark = document.getElementById('close-add-bookmark');
const themeToggle = document.getElementById('theme-toggle');
const colorOptions = document.querySelectorAll('.color-option');
const randomColorBtn = document.getElementById('random-color');
const cancelModalBtn = document.getElementById('cancel-modal');
const saveBookmarkBtn = document.getElementById('save-bookmark');
const searchInput = document.getElementById('search-input');
const folderItems = document.querySelectorAll('.folder-item');
const addFolderBtn = document.getElementById('add-folder');
const addFolderModal = document.getElementById('add-folder-modal');
const closeAddFolder = document.getElementById('close-add-folder');
const cancelFolderBtn = document.getElementById('cancel-folder');
const saveFolderBtn = document.getElementById('save-folder');

// 当前编辑状态
let isEditing = false;
let editingElement = null;

// 切换视图模式
gridViewBtn.addEventListener('click', () => {
    gridViewBtn.classList.add('active');
    listViewBtn.classList.remove('active');
    bookmarksGrid.style.display = 'grid';
    bookmarksList.style.display = 'none';
});

listViewBtn.addEventListener('click', () => {
    listViewBtn.classList.add('active');
    gridViewBtn.classList.remove('active');
    bookmarksGrid.style.display = 'none';
    bookmarksList.style.display = 'flex';
});

// 显示添加书签模态框
addBookmarkBtn.addEventListener('click', () => {
    isEditing = false;
    editingElement = null;
    document.getElementById('modal-title').textContent = '添加新网站';
    document.getElementById('website-name').value = '';
    document.getElementById('website-url').value = '';
    document.getElementById('icon-text').value = '';
    addBookmarkModal.style.display = 'flex';
});

// 关闭添加书签模态框
closeAddBookmark.addEventListener('click', () => {
    addBookmarkModal.style.display = 'none';
});

cancelModalBtn.addEventListener('click', () => {
    addBookmarkModal.style.display = 'none';
});

// 点击模态框外部关闭
addBookmarkModal.addEventListener('click', (e) => {
    if (e.target === addBookmarkModal) {
        addBookmarkModal.style.display = 'none';
    }
});

// 切换暗黑模式
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    if (document.body.classList.contains('dark-mode')) {
        themeToggle.innerHTML = '<i class="fas fa-sun"></i> 明亮模式';
    } else {
        themeToggle.innerHTML = '<i class="fas fa-moon"></i> 暗黑模式';
    }
});

// 颜色选择
colorOptions.forEach(option => {
    option.addEventListener('click', () => {
        document.querySelector('.color-option.active').classList.remove('active');
        option.classList.add('active');
    });
});

// 随机颜色生成
randomColorBtn.addEventListener('click', () => {
    const colors = [
        '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444',
        '#F59E0B', '#10B981', '#6366F1', '#0EA5E9'
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    document.querySelector('.color-option.active').classList.remove('active');

    // 找到匹配的颜色选项并激活它
    const colorOption = Array.from(colorOptions).find(option =>
        option.getAttribute('data-color') === randomColor
    );

    if (colorOption) {
        colorOption.classList.add('active');
    }
});

// 保存书签
saveBookmarkBtn.addEventListener('click', () => {
    const name = document.getElementById('website-name').value.trim();
    const url = document.getElementById('website-url').value.trim();
    const iconText = document.getElementById('icon-text').value.trim();
    const selectedColor = document.querySelector('.color-option.active').getAttribute('data-color');

    if (!name || !url) {
        alert('请填写网站名称和网址！');
        return;
    }

    // 确保URL有协议前缀
    let fullUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        fullUrl = 'https://' + url;
    }

    // 提取域名用于显示
    const domain = url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];

    if (isEditing && editingElement) {
        // 编辑现有书签
        const bookmarkCard = editingElement.closest('.bookmark-card, .bookmark-item');
        const iconBox = bookmarkCard.querySelector('.icon-box');
        const title = bookmarkCard.querySelector('h3');
        const urlSpan = bookmarkCard.querySelector('span');

        iconBox.textContent = iconText || name.substring(0, 4);
        iconBox.style.backgroundColor = selectedColor;
        title.textContent = name;
        urlSpan.textContent = domain;

        if (bookmarkCard.tagName === 'A') {
            bookmarkCard.href = fullUrl;
        }
    } else {
        // 创建新书签
        const bookmarkCardHTML = `
                    <a href="${fullUrl}" target="_blank" class="bookmark-card">
                        <div class="icon-box" style="background-color: ${selectedColor};">
                            ${iconText || name.substring(0, 4)}
                        </div>
                        <h3>${name}</h3>
                        <span>${domain}</span>
                    </a>
                `;

        const bookmarkItemHTML = `
                    <a href="${fullUrl}" target="_blank" class="bookmark-item">
                        <div class="icon-box" style="background-color: ${selectedColor};">
                            ${iconText || name.substring(0, 4)}
                        </div>
                        <div class="bookmark-item-details">
                            <h3>${name}</h3>
                            <span>${fullUrl}</span>
                        </div>
                        <div class="bookmark-actions">
                            <button class="action-btn" onclick="editBookmark(event, this)"><i class="fas fa-pen"></i></button>
                            <button class="action-btn" onclick="deleteBookmark(event, this)"><i class="fas fa-times"></i></button>
                        </div>
                    </a>
                `;

        bookmarksGrid.insertAdjacentHTML('beforeend', bookmarkCardHTML);
        bookmarksList.insertAdjacentHTML('beforeend', bookmarkItemHTML);
    }

    addBookmarkModal.style.display = 'none';
});

// 搜索功能
searchInput.addEventListener('input', () => {
    const searchTerm = searchInput.value.toLowerCase();
    const bookmarks = document.querySelectorAll('.bookmark-card, .bookmark-item');

    bookmarks.forEach(bookmark => {
        const title = bookmark.querySelector('h3').textContent.toLowerCase();
        const url = bookmark.querySelector('span').textContent.toLowerCase();

        if (title.includes(searchTerm) || url.includes(searchTerm)) {
            bookmark.style.display = '';
        } else {
            bookmark.style.display = 'none';
        }
    });
});

// 文件夹选择
folderItems.forEach(item => {
    item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('fa-pen')) {
            folderItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // 更新标题
            const folderName = item.querySelector('span').textContent;
            document.querySelector('.bookmarks-header h2').textContent = folderName;
        }
    });
});

// 编辑文件夹
window.editFolder = function (event, element) {
    event.stopPropagation();
    const folderItem = element.closest('.folder-item');
    const folderName = folderItem.querySelector('span').textContent;

    const newName = prompt('请输入新的文件夹名称：', folderName);
    if (newName && newName.trim()) {
        folderItem.querySelector('span').textContent = newName.trim();

        // 如果当前文件夹是活动的，更新标题
        if (folderItem.classList.contains('active')) {
            document.querySelector('.bookmarks-header h2').textContent = newName.trim();
        }
    }
};

// 添加文件夹
addFolderBtn.addEventListener('click', () => {
    addFolderModal.style.display = 'flex';
});

closeAddFolder.addEventListener('click', () => {
    addFolderModal.style.display = 'none';
});

cancelFolderBtn.addEventListener('click', () => {
    addFolderModal.style.display = 'none';
});

addFolderModal.addEventListener('click', (e) => {
    if (e.target === addFolderModal) {
        addFolderModal.style.display = 'none';
    }
});

saveFolderBtn.addEventListener('click', () => {
    const folderName = document.getElementById('folder-name').value.trim();

    if (!folderName) {
        alert('请输入文件夹名称！');
        return;
    }

    const folderHTML = `
                <li class="folder-item">
                    <span>${folderName}</span>
                    <i class="fas fa-pen" onclick="editFolder(event, this)"></i>
                </li>
            `;

    document.querySelector('.folders-list').insertAdjacentHTML('beforeend', folderHTML);
    addFolderModal.style.display = 'none';
    document.getElementById('folder-name').value = '';

    // 重新绑定事件
    document.querySelectorAll('.folder-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('fa-pen')) {
                document.querySelectorAll('.folder-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                const folderName = item.querySelector('span').textContent;
                document.querySelector('.bookmarks-header h2').textContent = folderName;
            }
        });
    });
});

// 编辑书签
window.editBookmark = function (event, element) {
    event.preventDefault();
    event.stopPropagation();

    const bookmarkItem = element.closest('.bookmark-item, .bookmark-card');
    const iconBox = bookmarkItem.querySelector('.icon-box');
    const title = bookmarkItem.querySelector('h3').textContent;
    const urlSpan = bookmarkItem.querySelector('span').textContent;
    const url = bookmarkItem.href || 'https://' + urlSpan;

    isEditing = true;
    editingElement = element;

    document.getElementById('modal-title').textContent = '编辑网站';
    document.getElementById('website-name').value = title;
    document.getElementById('website-url').value = urlSpan;
    document.getElementById('icon-text').value = iconBox.textContent;

    // 设置当前颜色
    const currentColor = iconBox.style.backgroundColor;
    const rgbToHex = (rgb) => {
        const result = rgb.match(/\d+/g);
        if (!result) return '#3B82F6';
        const r = parseInt(result[0]).toString(16).padStart(2, '0');
        const g = parseInt(result[1]).toString(16).padStart(2, '0');
        const b = parseInt(result[2]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toUpperCase();
    };

    const currentHex = rgbToHex(currentColor);
    document.querySelector('.color-option.active').classList.remove('active');

    const matchingColor = Array.from(colorOptions).find(option =>
        option.getAttribute('data-color') === currentHex
    );

    if (matchingColor) {
        matchingColor.classList.add('active');
    } else {
        colorOptions[0].classList.add('active');
    }

    addBookmarkModal.style.display = 'flex';
};

// 删除书签
window.deleteBookmark = function (event, element) {
    event.preventDefault();
    event.stopPropagation();

    if (confirm('确定要删除这个书签吗？')) {
        const bookmarkItem = element.closest('.bookmark-item, .bookmark-card');
        bookmarkItem.remove();
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 默认显示网格视图
    bookmarksGrid.style.display = 'grid';
    bookmarksList.style.display = 'none';

    // 为书签卡片添加点击效果
    document.querySelectorAll('.bookmark-card, .bookmark-item').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('action-btn') &&
                !e.target.parentElement.classList.contains('action-btn')) {
                card.style.transform = card.classList.contains('bookmark-card') ? 'scale(0.95)' : 'translateX(10px)';
                setTimeout(() => {
                    card.style.transform = '';
                }, 200);
            }
        });
    });
});