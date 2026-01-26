// api/ip-info.js
module.exports = async (req, res) => {
    const response = await fetch('https://whois.pconline.com.cn/ipJson.jsp?json=true');
    const data = await response.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(data);
};