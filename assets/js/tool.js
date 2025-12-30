// 主工具加载函数
async function loadTools() {
    const container = document.getElementById('tools-container');

    // 1. 检查容器是否存在
    if (!container) {
        console.error('错误：找不到工具容器元素 (tools-container)');
        showErrorUI('系统配置错误，请联系管理员');
        return;
    }

    // 2. 显示加载状态
    container.innerHTML = `
        <div class="tech-card" style="text-align: center;">
            <div class="loading-spinner"></div>
            <p>工具加载中...</p>
        </div>
    `;

    try {
        // 3. 获取工具数据
        const response = await fetch('json/tool.json');

        // 检查响应状态
        if (!response.ok) {
            throw new Error(`数据加载失败 (HTTP ${response.status})`);
        }

        const data = await response.json();

        // 4. 验证数据结构
        if (!data.categories || !Array.isArray(data.categories)) {
            throw new Error('无效的工具数据格式');
        }

        // 5. 清空容器
        container.innerHTML = '';

        // 6. 渲染工具卡片
        data.categories.forEach(category => {
            if (!category.name || !category.tools) return;

            const card = document.createElement('div');
            card.className = 'tech-card';

            // 添加分类标题
            const title = document.createElement('h3');
            title.className = 'tech-subtitle';
            title.innerHTML = category.name;
            card.appendChild(title);

            // 添加工具链接
            category.tools.forEach(tool => {
                if (!tool.name || !tool.url) return;

                const link = document.createElement('a');
                link.className = 'tech-link';
                link.href = tool.url;
                link.textContent = tool.name;
                link.target = tool.target || '_blank';  // 默认新标签页打开

                // 添加点击动画效果
                link.addEventListener('click', function (e) {
                    this.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        this.style.transform = '';
                    }, 200);
                });

                card.appendChild(link);
            });

            container.appendChild(card);
        });

        // 7. 如果没有工具数据
        if (data.categories.length === 0) {
            showErrorUI('当前没有可用工具');
        }

    } catch (error) {
        console.error('工具加载失败:', error);
        showErrorUI(`加载失败: ${error.message}`);
    }
}

// 显示错误信息
function showErrorUI(message) {
    const container = document.getElementById('tools-container') || document.querySelector('.content-container');
    if (container) {
        container.innerHTML = `
            <div class="tech-card" style="color: #ff6b6b; text-align: center;">
                <h3>⚠️ 加载错误</h3>
                <p>${message}</p>
                <button onclick="location.reload()" style="
                    background: rgba(93, 208, 255, 0.2);
                    border: 1px solid #5dd0ff;
                    color: white;
                    padding: 8px 15px;
                    border-radius: 5px;
                    margin-top: 10px;
                    cursor: pointer;
                ">重试</button>
            </div>
        `;
    }
}

// 添加加载动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    .loading-spinner {
        border: 3px solid rgba(93, 208, 255, 0.3);
        border-radius: 50%;
        border-top: 3px solid #5dd0ff;
        width: 30px;
        height: 30px;
        animation: spin 1s linear infinite;
        margin: 0 auto 15px;
    }
`;
document.head.appendChild(style);

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    loadTools();
});