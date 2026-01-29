// copyright-injector.js
// 版本: 1.0.0
// 作者: 蓝色奇夸克
// 许可证: MIT

(function () {
    'use strict';

    // 配置项
    const CONFIG = {
        // 是否在控制台显示日志
        debug: false,
        // 延迟时间（毫秒）
        delay: 100,
        // 版权信息模板
        template: `\n——————\n来源：【{title}】\n链接：【{url}】\n作者：蓝色奇夸克\n网站内容使用CC BY-NC-SA 4.0协议共享，请内容分发者遵守开源协议规定。\n——————`,
        // 复制的最小字符数（少于这个数不添加版权信息）
        minLength: 20,
        // 排除的元素选择器（这些元素内的复制不添加版权信息）
        excludeSelectors: [
            'input',
            'textarea',
            'code',
            'pre',
            '.no-copyright'
        ]
    };

    // 工具函数：日志输出
    function log(...args) {
        if (CONFIG.debug) {
            console.log('[Copyright Injector]', ...args);
        }
    }

    // 工具函数：检查是否在排除元素内
    function isExcluded(target) {
        if (!target || !target.closest) return false;

        for (const selector of CONFIG.excludeSelectors) {
            if (target.closest(selector)) {
                return true;
            }
        }
        return false;
    }

    // 主函数：处理复制事件
    function handleCopy(event) {
        try {
            // 获取选中的文本
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();

            // 检查是否有选中的文本
            if (!selectedText || selectedText.length < CONFIG.minLength) {
                log('选中的文本太短，跳过添加版权信息');
                return;
            }

            // 检查是否在排除元素内
            if (isExcluded(event.target)) {
                log('在排除元素内，跳过添加版权信息');
                return;
            }

            // 阻止默认复制行为
            event.preventDefault();

            // 获取页面信息
            const pageTitle = document.title || '未知标题';
            const pageUrl = window.location.href;

            // 构建版权信息
            const copyrightText = CONFIG.template
                .replace('{title}', pageTitle)
                .replace('{url}', pageUrl);

            // 组合原始文本和版权信息
            const finalText = selectedText + copyrightText;

            // 将文本复制到剪贴板
            if (event.clipboardData) {
                event.clipboardData.setData('text/plain', finalText);
                log('版权信息已添加到剪贴板');

                // 显示提示（可选）
                showNotification('复制成功！');
            } else {
                // 降级方案：使用异步方式复制
                setTimeout(() => {
                    navigator.clipboard.writeText(finalText).then(() => {
                        log('版权信息已添加到剪贴板');
                        showNotification('复制成功！');
                    }).catch(err => {
                        console.error('复制失败:', err);
                        // 如果异步复制失败，回退到原始复制
                        copyFallback(selectedText);
                    });
                }, CONFIG.delay);
            }

        } catch (error) {
            console.error('处理复制时出错:', error);
            // 出错时允许默认复制行为
        }
    }

    // 降级方案：传统的复制方法
    function copyFallback(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand('copy');
            log('使用降级方案复制成功');
        } catch (err) {
            console.error('降级复制也失败了:', err);
        } finally {
            document.body.removeChild(textarea);
        }
    }

    // 显示通知提示
    function showNotification(message) {
        // 检查是否已有提示元素
        let notification = document.getElementById('copyright-notification');

        if (!notification) {
            // 创建提示元素
            notification = document.createElement('div');
            notification.id = 'copyright-notification';
            notification.style.cssText = `
                position: fixed;
                top: 50px;
                right: 20px;
                background: #429cebc4;
                color: white;
                padding: 12px 24px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                z-index: 999999;
                font-size: 14px;
                transition: opacity 0.3s;
                opacity: 0;
                transform: translateY(-10px);
            `;
            document.body.appendChild(notification);
        }

        // 更新内容并显示
        notification.textContent = message;
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';

        // 3秒后隐藏
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-10px)';
        }, 3000);
    }

    // 初始化函数
    function init() {
        log('版权注入器初始化...');

        // 检查浏览器支持
        if (!document.addEventListener) {
            console.warn('浏览器不支持 addEventListener，版权注入器无法工作');
            return;
        }

        // 监听复制事件
        document.addEventListener('copy', handleCopy);

        log('版权注入器已启动，监听复制事件中...');

        // 添加样式（可选）
        addStyles();
    }

    // 添加一些基本样式
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* 可以为选中的文本添加特殊样式提示 */
            ::selection {
                background-color: rgba(76, 175, 80, 0.2);
            }
            
            /* 通知动画 */
            @keyframes copyrightNotificationSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            @keyframes copyrightNotificationSlideOut {
                from {
                    opacity: 1;
                    transform: translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateY(-10px);
                }
            }
        `;
        document.head.appendChild(style);
    }

    // 提供公共API（可选）
    window.CopyrightInjector = {
        config: function (newConfig) {
            Object.assign(CONFIG, newConfig);
            log('配置已更新:', CONFIG);
        },
        disable: function () {
            document.removeEventListener('copy', handleCopy);
            log('版权注入器已禁用');
        },
        enable: function () {
            document.addEventListener('copy', handleCopy);
            log('版权注入器已启用');
        },
        getConfig: function () {
            return Object.assign({}, CONFIG);
        }
    };

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 0);
    }

})();