// disable-right-click.js - 改进版右键禁用功能
(function () {
    // 检查当前主机是否为localhost，如果是则不启用禁用功能
    var isLocalhost = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '::1';

    // 如果是localhost环境，直接跳过
    if (isLocalhost) {
        console.log('检测到localhost环境，禁用功能已跳过');
        return;
    }

    // 检查是否已加载jQuery
    if (typeof jQuery === 'undefined') {
        // 动态加载jQuery
        var script = document.createElement('script');
        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
        script.onload = function () {
            // jQuery加载完成后初始化功能
            initializeRightClickDisable();
        };
        document.head.appendChild(script);
    } else {
        // jQuery已存在，直接初始化功能
        initializeRightClickDisable();
    }

    function initializeRightClickDisable() {
        $(document).ready(function () {
            // 再次确认不是localhost（双重保险）
            if (window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1' ||
                window.location.hostname === '::1') {
                console.log('检测到localhost环境，禁用功能已跳过');
                return;
            }

            // 检查localStorage中的解禁状态
            var isRightClickEnabled = localStorage.getItem('rightClickEnabled') === 'true';

            // 如果已解禁，则不初始化禁用功能
            if (isRightClickEnabled) {
                console.log('右键功能已解禁');
                return;
            }

            // 创建弹窗HTML（但不立即添加到页面）
            var modalHTML = `
                <div id="right-click-modal" style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    display: none;
                    justify-content: center;
                    align-items: center;
                    z-index: 999999;
                    font-family: 'Microsoft YaHei', Arial, sans-serif;
                ">
                    <div style="
                        background: white;
                        padding: 30px;
                        border-radius: 10px;
                        box-shadow: 0 5px 25px rgba(0, 0, 0, 0.3);
                        max-width: 400px;
                        text-align: center;
                        position: relative;
                    ">
                        <button id="close-modal" style="
                            position: absolute;
                            top: 10px;
                            right: 10px;
                            background: none;
                            border: none;
                            font-size: 20px;
                            cursor: pointer;
                            color: #999;
                        ">×</button>
                        <h3 style="margin-top: 0; color: #333;">夸克博客</h3>
                        <p style="color: #666; line-height: 1.6;">为了页面美观，本页右键功能已关闭~</p>
                        <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">
                            <small style="color: #999;">提示：在弹窗显示期间输入特定密码可解禁右键功能</small>
                        </div>
                    </div>
                </div>
            `;

            // 添加弹窗到页面（初始隐藏）
            $('body').append(modalHTML);

            // 关闭弹窗功能
            $(document).on('click', '#close-modal, #right-click-modal', function (event) {
                if ($(event.target).is('#right-click-modal') || $(event.target).is('#close-modal')) {
                    $('#right-click-modal').hide();
                }
            });

            // 显示弹窗的函数
            function showModal() {
                $('#right-click-modal').css('display', 'flex');
                // 重置密码输入
                secretInput = '';
            }

            // 禁用右键菜单
            $(document).on('contextmenu', function (event) {
                event.preventDefault();
                // 显示弹窗
                showModal();
            });

            // 防止Ctrl+S保存网页
            $(document).on('keydown', function (event) {
                // 检测Ctrl+S
                if ((event.ctrlKey || event.metaKey) && event.key === 's') {
                    event.preventDefault();
                    // 显示弹窗
                    showModal();
                }

                // 防止F12开发者工具（部分浏览器）
                if (event.key === 'F12') {
                    event.preventDefault();
                }

                // 防止Ctrl+Shift+I（开发者工具）
                if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'I') {
                    event.preventDefault();
                }

                // 防止Ctrl+Shift+J（开发者工具-控制台）
                if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'J') {
                    event.preventDefault();
                }

                // 防止Ctrl+U（查看源代码）
                if ((event.ctrlKey || event.metaKey) && event.key === 'u') {
                    event.preventDefault();
                }
            });

            // 检测"helloworld"输入以解禁右键
            var secretInput = '';
            var secretCode = 'helloworld';

            $(document).on('keydown', function (event) {
                // 只在弹窗显示期间检测
                if ($('#right-click-modal').css('display') !== 'flex') return;

                // 获取按下的键（排除功能键）
                if (event.key.length === 1) {
                    secretInput += event.key.toLowerCase();
                }

                // 如果输入过长，截断
                if (secretInput.length > secretCode.length) {
                    secretInput = secretInput.substr(secretInput.length - secretCode.length);
                }

                // 检查是否匹配密码
                if (secretInput === secretCode) {
                    // 解禁右键
                    $(document).off('contextmenu');

                    // 移除弹窗
                    $('#right-click-modal').remove();

                    // 保存解禁状态到localStorage
                    localStorage.setItem('rightClickEnabled', 'true');

                    // 显示解禁成功提示（可选）
                    alert('右键功能已解禁！刷新页面后依然有效。');

                    console.log('右键功能已通过密码解禁');
                }
            });

            // 防止拖拽保存图片
            $(document).on('dragstart', function (event) {
                if (event.target.tagName === 'IMG') {
                    event.preventDefault();
                }
            });

            // 防止选择文本后右键菜单（增强）
            $(document).on('selectstart', function (event) {
                event.preventDefault();
            });
        });
    }
})();