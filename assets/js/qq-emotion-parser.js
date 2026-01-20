/**
 * QQEmotionParser - QQ表情解析库
 * 版本: 1.0.0
 */
class QQEmotionParser {
    constructor(options = {}) {
        // 默认配置
        this.defaults = {
            baseUrl: 'https://qzonestyle.gtimg.cn/qzone/em/', // 图片基础URL
            className: 'qq-emotion',                           // 图片CSS类名
            size: 24,                                          // 图片大小(px)
            altFormat: '[表情{id}]',                           // alt文本格式
            enableTooltip: true,                               // 是否启用悬停提示
            onError: null                                      // 图片加载错误回调
        };

        this.config = { ...this.defaults, ...options };
        this.emotionRegex = /\[em\]e(\d+)\[\/em\]/gi;
    }

    /**
     * 解析文本中的表情代码
     * @param {string} text - 包含表情代码的文本
     * @param {object} options - 临时覆盖配置
     * @returns {string} 解析后的HTML
     */
    parse(text, options = {}) {
        if (!text || typeof text !== 'string') return text;

        const config = { ...this.config, ...options };

        return text.replace(this.emotionRegex, (match, id) => {
            const emotionId = id.trim();
            const altText = config.altFormat.replace('{id}', emotionId);
            const imageUrl = `${config.baseUrl}e${emotionId}.gif`;

            const tooltipAttr = config.enableTooltip ?
                `data-emotion-id="${emotionId}" title="${altText}"` : '';

            return `<img src="${imageUrl}" 
                   alt="${altText}"
                   class="${config.className}"
                   ${tooltipAttr}
                   style="width:${config.size}px; height:${config.size}px; 
                          vertical-align: middle; display: inline-block;
                          margin: 0 2px;">`;
        });
    }

    /**
     * 解析DOM元素中的表情代码
     * @param {string|Element} selector - CSS选择器或DOM元素
     * @param {object} options - 配置选项
     */
    parseElement(selector, options = {}) {
        const elements = typeof selector === 'string'
            ? document.querySelectorAll(selector)
            : [selector];

        elements.forEach(element => {
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                // 处理输入框的值
                element.value = this.parse(element.value, options);
            } else if (element.hasAttribute('data-emotion-content')) {
                // 处理data属性内容
                const content = element.getAttribute('data-emotion-content');
                element.setAttribute('data-emotion-content', this.parse(content, options));
            } else {
                // 处理普通元素内容
                element.innerHTML = this.parse(element.innerHTML, options);
            }
        });

        // 绑定图片错误处理
        this._bindErrorHandling(elements, options);
    }

    /**
     * 批量解析多个文本
     * @param {string[]} texts - 文本数组
     * @param {object} options - 配置选项
     * @returns {string[]} 解析后的文本数组
     */
    parseBatch(texts, options = {}) {
        return texts.map(text => this.parse(text, options));
    }

    /**
     * 安全解析（防止XSS）
     * @param {string} text - 原始文本
     * @returns {string} 安全解析后的文本
     */
    safeParse(text) {
        // 先进行基本的HTML转义
        const escapeHtml = (str) => {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        };

        const escapedText = escapeHtml(text);
        return this.parse(escapedText, {
            onError: (img, emotionId) => {
                img.outerHTML = `[表情${emotionId}]`;
            }
        });
    }

    /**
     * 提取文本中的表情ID
     * @param {string} text - 包含表情代码的文本
     * @returns {string[]} 表情ID数组
     */
    extractEmotionIds(text) {
        const ids = [];
        let match;

        while ((match = this.emotionRegex.exec(text)) !== null) {
            ids.push(match[1]);
        }

        // 重置正则表达式状态
        this.emotionRegex.lastIndex = 0;

        return [...new Set(ids)]; // 去重
    }

    /**
     * 私有方法：绑定错误处理
     */
    _bindErrorHandling(elements, options) {
        const config = { ...this.config, ...options };

        elements.forEach(element => {
            element.querySelectorAll(`.${config.className}`).forEach(img => {
                img.onerror = () => {
                    if (config.onError && typeof config.onError === 'function') {
                        config.onError(img, img.dataset.emotionId);
                    } else {
                        // 默认错误处理：替换为alt文本
                        img.outerHTML = img.alt;
                    }
                };
            });
        });
    }

    /**
     * 更新配置
     * @param {object} newConfig - 新的配置
     */
    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * 重置为默认配置
     */
    resetConfig() {
        this.config = { ...this.defaults };
    }
}

// 导出库
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QQEmotionParser;
} else if (typeof define === 'function' && define.amd) {
    define([], () => QQEmotionParser);
} else {
    window.QQEmotionParser = QQEmotionParser;
}