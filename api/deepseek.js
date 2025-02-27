import axios from 'axios';

export default async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { body } = req;
    const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY; // 从环境变量读取

    try {
        const response = await axios.post(DEEPSEEK_API_URL, body, {
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return res.status(200).json(response.data);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to call DeepSeek API' });
    }
};