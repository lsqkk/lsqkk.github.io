export default async function handler(req, res) {
    // 设置CORS，只允许特定域名
    const allowedOrigins = [
        'https://lsqkk.github.io',
        'http://localhost:8080',
        'http://127.0.0.1:8080'
    ];

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { model, messages, stream } = req.body;

        // 从环境变量读取API密钥 - 安全！
        const API_KEY = process.env.DEEPSEEK_API_KEY;

        if (!API_KEY) {
            throw new Error('API密钥未配置');
        }

        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model,
                messages,
                stream
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeepSeek API错误: ${response.status} - ${errorText}`);
        }

        // 设置响应头
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');

        // 流式传输响应
        const reader = response.body.getReader();
        const encoder = new TextEncoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // 直接转发chunk
            res.write(value);
        }

        res.end();

    } catch (error) {
        console.error('代理错误:', error);
        res.status(500).json({
            error: '内部服务器错误',
            message: error.message
        });
    }
}