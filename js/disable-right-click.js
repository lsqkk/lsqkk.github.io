// disable-right-click.js - 禁用右键菜单功能
(function () {
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
            // 禁用右键菜单
            $(document).on('contextmenu', function (event) {
                event.preventDefault();
            });
        });
    }
})();