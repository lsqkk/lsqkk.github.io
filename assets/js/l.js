document.addEventListener('DOMContentLoaded', function () {
    const longUrlInput = document.getElementById('long-url');
    const generateBtn = document.getElementById('generate-btn');
    const resultContainer = document.getElementById('result-container');
    const shortUrlElement = document.getElementById('short-url');
    const copyBtn = document.getElementById('copy-btn');
    const urlError = document.getElementById('url-error');
    const loading = document.getElementById('loading');

    // 检查URL参数，如果有编码参数则进行跳转
    const urlParams = new URLSearchParams(window.location.search);
    const encodedParam = urlParams.get('l');

    if (encodedParam) {
        try {
            const decodedUrl = decodeUrl(encodedParam);
            if (decodedUrl.startsWith('http://') || decodedUrl.startsWith('https://')) {
                window.location.href = decodedUrl;
            } else {
                throw new Error('解码后的URL无效');
            }
        } catch (e) {
            document.body.innerHTML = `
            <div class="container" style="text-align:center; padding:50px;">
                <h1 style="color:#e74c3c; margin-bottom:20px;">跳转失败</h1>
                <p style="font-size:1.2rem; margin-bottom:30px;">${e.message || '无效的短链接编码'}</p>
                <button onclick="window.location.href='/l'" style="background:#3498db; color:white; border:none; padding:12px 30px; border-radius:8px; font-size:1.1rem; cursor:pointer;">
                    <i class="fas fa-home"></i> 返回首页
                </button>
            </div>
        `;
        }
        return;
    }

    // 生成短链接
    generateBtn.addEventListener('click', function () {
        const longUrl = longUrlInput.value.trim();

        // 验证URL
        if (!longUrl.startsWith('http://') && !longUrl.startsWith('https://')) {
            urlError.style.display = 'block';
            return;
        }

        urlError.style.display = 'none';

        // 显示加载动画
        loading.style.display = 'block';

        // 模拟处理延迟
        setTimeout(() => {
            try {
                // 编码URL
                const encoded = encodeUrl(longUrl);

                // 生成短链接
                const baseUrl = window.location.href.split('?')[0];
                const shortUrl = `${baseUrl}?l=${encoded}`;

                shortUrlElement.textContent = shortUrl;
                resultContainer.style.display = 'block';

                // 滚动到结果
                resultContainer.scrollIntoView({ behavior: 'smooth' });
            } catch (e) {
                alert(`生成短链接时出错: ${e.message}`);
            } finally {
                loading.style.display = 'none';
            }
        }, 800);
    });

    // 复制功能
    copyBtn.addEventListener('click', function () {
        const textArea = document.createElement('textarea');
        textArea.value = shortUrlElement.textContent;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);

        // 显示复制成功反馈
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> 已复制';
        copyBtn.style.background = '#2ecc71';

        setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.style.background = '';
        }, 2000);
    });

    // URL编码函数
    function encodeUrl(url) {
        // 将字符串转换为二进制表示
        let binary = '';
        for (let i = 0; i < url.length; i++) {
            const charCode = url.charCodeAt(i).toString(2);
            // 确保每个字符是8位
            binary += '0'.repeat(8 - charCode.length) + charCode;
        }

        // 应用特殊编码：0→'a'(拉丁字母), 1→'а'(西里尔字母)
        let encoded = '';
        for (let i = 0; i < binary.length; i++) {
            if (binary[i] === '0') {
                encoded += 'l'; // 小写L
            } else {
                encoded += 'I'; // 
            }
        }

        return encodeURIComponent(encoded);
    }

    // URL解码函数
    function decodeUrl(encoded) {
        // URI解码
        const decodedParam = decodeURIComponent(encoded);
        let binary = '';

        // 将特殊编码转换回二进制
        for (let i = 0; i < decodedParam.length; i++) {
            const char = decodedParam[i];
            if (char === 'l') { // 英文字母a
                binary += '0';
            } else if (char === 'I') { // 西里尔字母а
                binary += '1';
            } else {
                throw new Error('无效的编码字符');
            }
        }

        // 将二进制转换为字符串
        let result = '';
        for (let i = 0; i < binary.length; i += 8) {
            const byte = binary.substr(i, 8);
            if (byte.length < 8) break; // 忽略不完整的字节
            result += String.fromCharCode(parseInt(byte, 2));
        }

        return result;
    }
});