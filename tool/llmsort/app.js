document.addEventListener('DOMContentLoaded', function () {
    const apiKeyInput = document.getElementById('apiKey');
    const numbersInput = document.getElementById('numbers');
    const sortBtn = document.getElementById('sortBtn');
    const clearBtn = document.getElementById('clearBtn');
    const resultBox = document.getElementById('resultBox');
    const statusIndicator = document.querySelector('.status-indicator');

    // 示例数组，方便测试
    const exampleArrays = [
        "3, 7, 2, 9, 1, 5, 8, 4, 6",
        "10.5, 3.2, 8.9, 1.1, 5.7",
        "100, 42, 77, 15, 23, 56, 89"
    ];

    // 设置随机示例数组
    numbersInput.placeholder = `例如: ${exampleArrays[Math.floor(Math.random() * exampleArrays.length)]}`;

    // 清空按钮事件
    clearBtn.addEventListener('click', function () {
        apiKeyInput.value = '';
        numbersInput.value = '';
        resultBox.innerHTML = '<div class="result-placeholder">排序结果将显示在这里...</div>';
        setStatusIndicator(false);
    });

    // 排序按钮事件
    sortBtn.addEventListener('click', async function () {
        const apiKey = apiKeyInput.value.trim();
        const numbersStr = numbersInput.value.trim();

        // 验证输入
        if (!apiKey) {
            showResult('请输入有效的 DeepSeek API 密钥', 'error');
            return;
        }

        if (!numbersStr) {
            showResult('请输入要排序的数字数组', 'error');
            return;
        }

        // 解析数字数组
        let numbers;
        try {
            numbers = numbersStr.split(',').map(num => {
                const parsed = parseFloat(num.trim());
                if (isNaN(parsed)) throw new Error(`"${num}" 不是有效的数字`);
                return parsed;
            });
        } catch (error) {
            showResult(`输入格式错误: ${error.message}`, 'error');
            return;
        }

        if (numbers.length === 0) {
            showResult('请输入至少一个数字', 'error');
            return;
        }

        // 开始排序
        setStatusIndicator(true);
        sortBtn.disabled = true;
        sortBtn.innerHTML = '<span class="status-indicator status-active"></span>排序中...';

        try {
            const sortedArray = await deepseekSort(numbers, apiKey);

            if (sortedArray === 'Failed to sort.') {
                showResult('排序失败：DeepSeek API 返回了无效的排序结果或已达到重试次数限制', 'error');
            } else {
                showResult(`原始数组: [${numbers.join(', ')}]\n\n排序结果: [${sortedArray.join(', ')}]`, 'success');
            }
        } catch (error) {
            showResult(`排序过程中出现错误: ${error.message}`, 'error');
        } finally {
            setStatusIndicator(false);
            sortBtn.disabled = false;
            sortBtn.innerHTML = '<span class="status-indicator"></span>开始排序';
        }
    });

    // DeepSeek 排序函数 - 基于提供的Python代码逻辑
    async function deepseekSort(nums, apiKey) {
        const l = nums.length;
        const numsStr = '[' + nums.join(', ') + ']';

        // 最大重试次数
        const maxRetries = 5;

        for (let i = 0; i < maxRetries; i++) {
            try {
                // 调用 DeepSeek API
                const response = await callDeepSeekAPI(apiKey, numsStr);

                // 解析返回的排序数组
                const sortedStr = response.trim();
                let sortedArray;

                try {
                    // 尝试解析JSON格式
                    if (sortedStr.startsWith('[') && sortedStr.endsWith(']')) {
                        sortedArray = JSON.parse(sortedStr);
                    } else {
                        // 如果不是标准JSON，尝试提取数字
                        const numbersInStr = sortedStr.match(/[-+]?\d*\.?\d+/g);
                        if (numbersInStr) {
                            sortedArray = numbersInStr.map(Number);
                        } else {
                            throw new Error('无法解析返回的数组');
                        }
                    }
                } catch (parseError) {
                    console.warn(`第 ${i + 1} 次尝试: 解析响应失败`, parseError);
                    continue; // 重试
                }

                // 验证结果
                if (sortedArray.length === l && isSorted(sortedArray)) {
                    return sortedArray;
                } else {
                    console.warn(`第 ${i + 1} 次尝试: 结果未通过验证`);
                }
            } catch (apiError) {
                console.error(`第 ${i + 1} 次尝试: API调用失败`, apiError);
                // 如果是最后一次尝试，抛出错误
                if (i === maxRetries - 1) {
                    throw apiError;
                }
            }
        }

        return 'Failed to sort.';
    }

    // 调用 DeepSeek API - 真实调用
    async function callDeepSeekAPI(apiKey, numsStr) {
        // 使用 DeepSeek 官方 API 端点
        const apiUrl = "https://api.deepseek.com/v1/chat/completions";

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: "You will be given an array. Sort the elements in the array from smallest to largest, where each preceding element is less than or equal to the next. Do not delete or add any elements. Only output the array!!!"
                    },
                    {
                        role: "user",
                        content: numsStr
                    }
                ],
                stream: false
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API 请求失败: ${response.status} ${response.statusText} - ${errorData.error?.message || '未知错误'}`);
        }

        const data = await response.json();

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('API 返回格式无效');
        }

        return data.choices[0].message.content;
    }

    // 检查数组是否已排序
    function isSorted(nums) {
        for (let i = 0; i < nums.length - 1; i++) {
            if (nums[i] > nums[i + 1]) {
                return false;
            }
        }
        return true;
    }

    // 显示结果
    function showResult(message, type = 'info') {
        resultBox.innerHTML = '';
        const resultElement = document.createElement('div');
        resultElement.textContent = message;
        resultElement.className = type === 'success' ? 'result-success' :
            type === 'error' ? 'result-error' : '';
        resultBox.appendChild(resultElement);

        // 滚动到结果区域
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 设置状态指示器
    function setStatusIndicator(active) {
        if (active) {
            statusIndicator.classList.add('status-active');
        } else {
            statusIndicator.classList.remove('status-active');
        }
    }

    // 页面加载时显示安全提示
    console.log(
        "%cDeepSeek 数组排序工具\n%c这是一个纯前端实现，所有代码都在您的浏览器中运行。\n您的 API 密钥仅用于本次 DeepSeek API 调用，不会被存储或发送到其他服务器。\n您可以查看源代码验证安全性。",
        "color: #4CAF50; font-size: 16px; font-weight: bold;",
        "color: #aaa; font-size: 14px;"
    );
});