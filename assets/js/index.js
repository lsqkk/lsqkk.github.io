document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.main-content').style.opacity = '1';
    loadRecentPosts(); // 加载文章
    loadHomeConfig();

    // 为导航盒子添加悬停效果
    document.querySelectorAll('.index-feature-box').forEach(box => {
        box.addEventListener('mouseover', () => {
            box.style.transform = 'translateY(-3px)';
            box.style.boxShadow = '0 0 15px rgba(255,255,255,0.7)';
        });
        box.addEventListener('mouseout', () => {
            box.style.transform = 'none';
            box.style.boxShadow = '0 0 15px rgba(255,255,255,0.5)';
        });
    });
});

// 加载最近三篇文章
async function loadRecentPosts() {
    const posts = await fetch('json/posts.json').then(r => r.json());
    const recentPosts = posts.slice(0, 3);  // 取前三条

    const list = recentPosts.map(post => `
                <div class="post-item" style="transition: all 0.3s ease;">
                    <a class="post-title" href=\"/posts/${post.file.replace('.md', '')}\" style="color: #0366d6; text-decoration: none; font-weight: 500;">
                        ${post.title}
                    </a>
                    <div class="post-date" style="color: #666; font-size: 0.9em; margin-top: 5px;">${post.date}</div>
                </div>
            `).join('');

    document.getElementById('recent-posts').innerHTML = list;

    // 为文章项添加悬停效果
    document.querySelectorAll('.post-item').forEach(item => {
        item.addEventListener('mouseover', () => {
            item.style.transform = 'translateX(5px)';
            item.style.boxShadow = '0 3px 10px rgba(0,0,0,0.1)';
        });
        item.addEventListener('mouseout', () => {
            item.style.transform = 'none';
            item.style.boxShadow = 'none';
        });
    });
}

// 新增PV/UV存储功能
function storeStatistics() {
    const pv = document.getElementById('busuanzi_value_site_pv').innerText;
    const uv = document.getElementById('busuanzi_value_site_uv').innerText;
    const today = new Date();
    // 格式化为 YYYY-MM-DD（本地时区）
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    localStorage.setItem(dateKey, JSON.stringify({
        pv: parseInt(document.getElementById('busuanzi_value_site_pv').innerText),
        uv: parseInt(document.getElementById('busuanzi_value_site_uv').innerText),
        timestamp: today.getTime()
    }));
}

// 监听不蒜子数据变化
new MutationObserver(() => {
    if (document.getElementById('busuanzi_value_site_pv').innerText &&
        document.getElementById('busuanzi_value_site_uv').innerText) {
        storeStatistics();
    }
}).observe(document.getElementById('busuanzi_value_site_pv'), {
    childList: true,
    subtree: true
});


// 检查是否已登录
const isLoggedIn = localStorage.getItem('github_code') || localStorage.getItem('github_user');

if (isLoggedIn) {
    // 隐藏电脑端和移动端的登录按钮
    document.getElementById('login-button').style.display = 'none';
    document.getElementById('mobile-login-button').style.display = 'none';
} else {
    // 确保登录按钮显示（可能在之前被隐藏了）
    document.getElementById('login-button').style.display = 'block';
    document.getElementById('mobile-login-button').style.display = 'block';
}

document.addEventListener('DOMContentLoaded', function () {
    const typewriterElement = document.getElementById('typewriter');
    const phrases = [
        "无穷的远方，无数的人们，都和我有关。",
        "Idealists Need Timeless Journeys",
        "比金钱更珍贵是知识，比知识更珍贵的是无休止的好奇心，而比好奇心更珍贵的，是我们头上的星空。",
        "哲学家们只是用不同的方式解释世界，而问题在于改变世界。",
        "人民，只有人民，才是创造世界历史的动力。",
        "在黑暗里点灯的人，终将照亮整个时代。",
        "如果风只吹向一个方向，那就改变风的轨迹。",
        "理想不会老去，它只会等待新的战士。",
        "你要成为改变世界的火焰，而非被世界熄灭的火星。",
        "黑暗不能驱除黑暗，只有光明可以；仇恨不能驱除仇恨，只有爱可以。",
        "理想不是终点，而是让现实变得更好的方向。",
        "真正的乌托邦不在远方，而在我们此刻的选择里。",
        "不要害怕理想太高，要害怕自己蹲得太低。",
        "当一个人开始为他人点亮蜡烛，黑夜便有了裂缝。",
        "理想主义者的力量，在于他们拒绝接受'不可能'的判决。",
        "文明的进步，始于有人坚持'本该如此'。",
        "即使翅膀被现实打湿，也要记得天空的存在。"
    ];
    let phraseIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let isWaiting = false;

    function typeWriter() {
        const currentPhrase = phrases[phraseIndex];
        let displayText = currentPhrase.substring(0, charIndex);

        // 更新显示文本（保留空格防止布局塌陷）
        typewriterElement.innerHTML = displayText || '&nbsp;';

        if (isDeleting) {
            // 删除字符
            charIndex--;

            if (charIndex <= 0) {
                isDeleting = false;
                phraseIndex = (phraseIndex + 1) % phrases.length;
                setTimeout(typeWriter, 500); // 转到下一句前的暂停
            } else {
                setTimeout(typeWriter, 50); // 更快的删除速度
            }
        } else if (isWaiting) {
            // 关键修改：等待状态结束后先显示完整句子，再开始删除
            if (charIndex < currentPhrase.length) {
                // 如果还没显示完，继续显示
                charIndex++;
                setTimeout(typeWriter, 100);
            } else {
                // 完整显示后才进入删除模式
                isWaiting = false;
                isDeleting = true;
                setTimeout(typeWriter, 1500); // 完整显示1.5秒后再开始删除
            }
        } else {
            // 添加字符
            charIndex++;

            if (charIndex >= currentPhrase.length) {
                isWaiting = true; // 标记为等待状态
                setTimeout(typeWriter, 100); // 立即继续执行（会进入上面的isWaiting分支）
            } else {
                setTimeout(typeWriter, 100 + Math.random() * 50);
            }
        }
    }

    // 初始化光标样式（保持不变）
    const style = document.createElement('style');
    style.innerHTML = `
        #typewriter::after {
            content: "|";
            animation: blink 0.7s infinite;
            position: relative;
            left: -0.1em;
        }
        @keyframes blink { 0%,100% {opacity:1;} 50% {opacity:0;} }
    `;
    document.head.appendChild(style);

    setTimeout(typeWriter, 1000);
});
// 更新时间
function updateTime() {
    const now = new Date();
    document.getElementById('hours').textContent = now.getHours().toString().padStart(2, '0');
    document.getElementById('minutes').textContent = now.getMinutes().toString().padStart(2, '0');
    document.getElementById('seconds').textContent = now.getSeconds().toString().padStart(2, '0');
    document.getElementById('date').textContent = now.toLocaleDateString('zh-CN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

// 更新问候语
function updateGreeting() {
    const hour = new Date().getHours();
    let greeting = '';

    if (hour < 6) greeting = '凌晨好';
    else if (hour < 9) greeting = '早上好';
    else if (hour < 12) greeting = '上午好';
    else if (hour < 14) greeting = '中午好';
    else if (hour < 18) greeting = '下午好';
    else greeting = '晚上好';

    document.getElementById('greeting').textContent = greeting;
    document.getElementById('tip').textContent = getRandomTip();
}

// 随机提示语
function getRandomTip() {
    const tips = [
        '欢迎来到这片绿洲。愿这里的文字能像星光一样，为你照亮未知的路径',
        '在这里，我们谈论星辰、泥土，以及如何用双手构建乌托邦',
        '愿你始终保有追问的勇气，像一棵树那样生长——向下扎根，向上触摸天空',
        '世界或许不够完美，但改变始于每一个不肯沉默的灵魂。很高兴遇见你',
        '这里没有答案，只有真诚的提问与探索。欢迎加入这场思想的冒险',
        '如果语言是种子，愿这些文字能在你心里开出一朵小小的、倔强的花',
        '理想主义者是现实的建筑师——我们承认阴影，但永远面向光',
        '欢迎来到这个角落。让我们一起保持‘天真’的力量：相信改变，相信微小事物的伟大',
        '这里记录着对自由的注解、对爱的实验，以及永不熄灭的好奇心',
        '你并非独自在深夜思考人类与宇宙。看，我们留下了这些灯火'

    ];
    return tips[Math.floor(Math.random() * tips.length)];
}

// 计算距离
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 地球半径(km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

// 根据省份返回俏皮话
function getProvinceBanter(province) {
    // 创建一个映射，将不包含后缀的省份名称映射到完整的省份名称
    const provinceMapping = {
        '北京': '北京市',
        '上海': '上海市',
        '广东': '广东省',
        '四川': '四川省',
        '重庆': '重庆市',
        '陕西': '陕西省',
        '山西': '山西省',
        '内蒙古': '内蒙古自治区',
        '新疆': '新疆维吾尔自治区',
        '西藏': '西藏自治区',
        '云南': '云南省',
        '贵州': '贵州省',
        '广西': '广西壮族自治区',
        '海南': '海南省',
        '福建': '福建省',
        '浙江': '浙江省',
        '江苏': '江苏省',
        '山东': '山东省',
        '河南': '河南省',
        '河北': '河北省',
        '天津': '天津省',
        '辽宁': '辽宁省',
        '吉林': '吉林省',
        '黑龙江': '黑龙江省',
        '江西': '江西省',
        '安徽': '安徽省',
        '湖北': '湖北省',
        '湖南': '湖南省',
        '甘肃': '甘肃省',
        '宁夏': '宁夏回族自治区',
        '青海': '青海省',
        '台湾': '台湾省',
        '香港': '香港',
        '澳门': '澳门'
    };

    const banterMap = {
        '北京市': '来碗豆汁儿配焦圈？',
        '上海市': '侬好呀！要尝尝小笼包伐？',
        '广东省': '饮茶先啦！',
        '四川省': '火锅整起？微辣还是中辣？',
        '重庆市': '重庆火锅，巴适得板！',
        '陕西省': '来碗羊肉泡馍？',
        '山西省': '老陈醋管够！',
        '内蒙古自治区': '草原骑马去不？',
        '新疆维吾尔自治区': '羊肉串来十串？',
        '西藏自治区': '布达拉宫约起？',
        '云南省': '过桥米线整一碗？',
        '贵州省': '茅台还是老干妈？',
        '广西壮族自治区': '桂林山水甲天下！',
        '海南省': '椰子管饱！',
        '福建省': '喝茶话仙啦！',
        '浙江省': '龙井茶来一杯？',
        '江苏省': '盐水鸭来一份？',
        '山东省': '煎饼卷大葱整起？',
        '河南省': '烩面来一碗？',
        '河北省': '驴肉火烧走起？',
        '天津省': '煎饼果子来一套？',
        '辽宁省': '整点锅包肉？',
        '吉林省': '东北酸菜管够！',
        '黑龙江省': '冰雪大世界走起？',
        '江西省': '瓦罐汤来一盅？',
        '安徽省': '黄山烧饼来几个？',
        '湖北省': '热干面过早？',
        '湖南省': '辣椒炒肉走起？',
        '甘肃省': '兰州拉面来一碗？',
        '宁夏回族自治区': '枸杞泡起来？',
        '青海省': '青海湖约起？',
        '台湾省': '珍珠奶茶来一杯？',
        '香港': '饮茶食点心啦！',
        '澳门': '葡式蛋挞来一打？'
    };

    // 将输入的省份名称转换为完整的省份名称
    const fullProvinceName = provinceMapping[province] || province;

    return banterMap[fullProvinceName] || '欢迎来玩！';
}

async function getVisitorInfo() {
    try {
        // 使用您提供的API获取IP地理信息
        const ipResponse = await fetch('https://api.b52m.cn/api/IP/');
        const ipData = await ipResponse.json();

        if (ipData.code === 200) {
            const ip = ipData.data.ip;
            const ipPro = ipData.data.region_name || ipData.data.province_name_2;
            const ipCity = ipData.data.city_name || ipData.data.city_name_2;
            const district = ipData.data.district_name_3 || ipData.data.district_name || "";

            // 获取经纬度（优先使用latitude_2/longitude_2，如果没有则使用latitude_3/longitude_3）
            const latitude = ipData.data.latitude_2 || ipData.data.latitude_3 || 0;
            const longitude = ipData.data.longitude_2 || ipData.data.longitude_3 || 0;

            // 站主位置（西安）
            const bloggerLat = 34.252705;
            const bloggerLon = 108.990221;

            let distance = "未知距离";
            if (latitude && longitude) {
                distance = getDistance(
                    bloggerLat, bloggerLon,
                    latitude, longitude
                );
            }

            // 获取省份俏皮话
            const provinceBanter = getProvinceBanter(ipPro);

            // 显示位置信息（如果有区县信息，则显示）
            let locationText = `${ipPro} ${ipCity}`;
            if (district) {
                locationText = `${ipPro} ${ipCity} ${district}`;
            }

            // 显示欢迎信息
            document.getElementById('welcome-info').innerHTML = `
                欢迎来自 <span class="highlight">${locationText}</span> 的朋友<br>
                <span class="highlight">${provinceBanter}</span><br>
                ${distance !== "未知距离" ? `您当前距站主约 <span class="highlight">${distance}</span> 公里<br>` : ""}
                您的IP地址为: <span class="highlight">${ip}</span>
            `;
        } else {
            throw new Error(`IP数据API返回错误: ${ipData.message}`);
        }
    } catch (error) {
        console.error('获取IP信息失败:', error);
        document.getElementById('welcome-info').textContent = '欢迎访问夸克博客';
    }
}
// 初始化
document.addEventListener('DOMContentLoaded', () => {
    updateTime();
    updateGreeting();
    getVisitorInfo();

    setInterval(updateTime, 1000);
    setInterval(updateGreeting, 60000);
});

async function loadDynamicFeed() {
    try {
        const response = await fetch('/blog/dt/dt.md');
        const mdContent = await response.text();
        const entries = parseMdEntries(mdContent);
        renderDynamicEntries(entries.slice(0, 5));
    } catch (error) {
        console.error('加载动态失败:', error);
        document.getElementById('dynamic-entries').innerHTML =
            '<div class="dynamic-card">动态加载中...</div>';
    }
}

function parseMdEntries(content) {
    const entries = [];
    const lines = content.split('\n');
    let currentEntry = null;

    lines.forEach(line => {
        if (line.startsWith('# ')) {
            if (currentEntry) entries.push(currentEntry);
            currentEntry = {
                title: line.replace('# ', '').trim(),
                content: [],
                date: ''
            };
        } else if (currentEntry) {
            if (line.startsWith('## 日期：')) {
                currentEntry.date = line.replace('## 日期：', '').trim();
            } else if (!line.startsWith('#') && line.trim()) {
                currentEntry.content.push(line.trim());
            }
        }
    });

    if (currentEntry) entries.push(currentEntry);
    return entries;
}

function renderDynamicEntries(entries) {
    const container = document.getElementById('dynamic-entries');
    const emotionParser = new QQEmotionParser();

    container.innerHTML = entries.map(entry => {
        // 将数组内容合并为字符串
        const contentString = entry.content.join('\n');

        // 先用marked解析markdown
        let htmlContent = marked.parse(contentString);

        // 原有的图片处理逻辑保持不变（在处理表情之前）
        const firstImgMatch = htmlContent.match(/<img[^>]+>/);
        if (firstImgMatch) {
            const firstImg = firstImgMatch[0];
            // 移除所有图片标签
            htmlContent = htmlContent.replace(/<img[^>]+>/g, '');
            // 重新插入第一张图片
            htmlContent = htmlContent + firstImg;
        }

        // 现在解析表情代码
        htmlContent = emotionParser.parse(htmlContent);

        return `
        <div class="dynamic-card">
            <div class="dynamic-title">${entry.title}</div>
            ${entry.date ? `<div class="dynamic-date">📅 ${entry.date}</div>` : ''}
            <div class="dynamic-content">${htmlContent}</div>
        </div>
        `;
    }).join('');
}

// 加载最新视频
async function loadLatestVideo() {
    try {
        const uid = '2105459088'; // 您的B站UID
        const apiUrl = 'https://uapis.cn/api/v1/social/bilibili/archives';

        const params = new URLSearchParams({
            mid: uid,
            pn: '1',
            ps: '1', // 只获取最新1个视频
            orderby: 'pubdate'
        });

        const response = await fetch(`${apiUrl}?${params}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.videos && data.videos.length > 0) {
            const latestVideo = data.videos[0];
            renderLatestVideo(latestVideo);
        } else {
            throw new Error('No videos found');
        }
    } catch (error) {
        console.error('加载最新视频失败:', error);
        document.getElementById('latest-video-container').innerHTML = `
            <div style="text-align: center; padding: 20px; color: #999;">
                视频加载失败
            </div>
        `;
    }
}

// 渲染最新视频
function renderLatestVideo(video) {
    const container = document.getElementById('latest-video-container');

    // 使用图片代理服务解决防盗链问题
    const proxyCoverUrl = `https://images.weserv.nl/?url=${encodeURIComponent(video.cover)}&w=320&h=180`;

    // 格式化播放量
    const playCount = formatVideoCount(video.play_count);
    // 格式化发布时间
    const publishTime = formatVideoTime(video.publish_time);

    container.innerHTML = `
        <div class="latest-video-card" style="cursor: pointer; transition: all 0.3s ease;">
            <div style="position: relative;">
                <img src="${proxyCoverUrl}" 
                     alt="${video.title}" 
                     style="width: 100%; height: auto; border-radius: 8px 8px 0 0;"
                     onerror="this.src='https://via.placeholder.com/320x180/1e88e5/ffffff?text=封面加载中'">
                <div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em;">
                    ${formatVideoDuration(video.duration)}
                </div>
            </div>
            <div style="padding: 12px;  background: rgba(255, 255, 255, 0.2);backdrop-filter: blur(10px) saturate(160%);-webkit-backdrop-filter: blur(10px) saturate(160%); border-radius: 0 0 8px 8px;">
                <h4 style="margin: 0 0 8px 0; font-size: 0.95em; line-height: 1.4; color: #333; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                    ${video.title}
                </h4>
                <div style="display: flex; justify-content: space-between; font-size: 0.8em; color: #666;">
                    <span>播放: ${playCount}</span>
                    <span>${publishTime}</span>
                </div>
            </div>
        </div>
    `;

    // 添加点击事件，跳转到B站视频页面
    container.querySelector('.latest-video-card').addEventListener('click', () => {
        window.open(`https://www.bilibili.com/video/${video.bvid}`, '_blank');
    });

    // 添加悬停效果
    const videoCard = container.querySelector('.latest-video-card');
    videoCard.addEventListener('mouseover', () => {
        videoCard.style.transform = 'translateY(-3px)';
        videoCard.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)';
    });
    videoCard.addEventListener('mouseout', () => {
        videoCard.style.transform = 'none';
        videoCard.style.boxShadow = 'none';
    });
}

// 格式化视频时长（秒 -> MM:SS）
function formatVideoDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 格式化视频播放量
function formatVideoCount(count) {
    if (count >= 100000000) {
        return (count / 100000000).toFixed(1) + '亿';
    } else if (count >= 10000) {
        return (count / 10000).toFixed(1) + '万';
    }
    return count;
}

// 格式化视频发布时间
function formatVideoTime(timestamp) {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diff === 0) {
        return '今天';
    } else if (diff === 1) {
        return '昨天';
    } else if (diff < 7) {
        return `${diff}天前`;
    } else if (diff < 30) {
        return `${Math.floor(diff / 7)}周前`;
    } else {
        return `${date.getMonth() + 1}-${date.getDate()}`;
    }
}

// 加载最近留言
async function loadRecentMessages() {
    try {
        // 检查配置是否已加载
        if (typeof firebaseConfig === 'undefined') {
            console.error('Firebase配置未加载，请确保firebase-config.js已加载');
            document.getElementById('recent-messages').innerHTML =
                '<div class="index-announcement"><p style="margin: 0;">留言功能初始化失败</p></div>';
            return;
        }

        // 动态加载Firebase（如果尚未加载）
        if (typeof firebase === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js';
                script.onload = () => {
                    const script2 = document.createElement('script');
                    script2.src = 'https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js';
                    script2.onload = resolve;
                    script2.onerror = reject;
                    document.head.appendChild(script2);
                };
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        // 初始化Firebase - 使用全局的firebaseConfig
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);  // 使用全局配置
        }

        const messagesRef = firebase.database().ref('chatrooms/lsqkk-lyb/messages');

        messagesRef.orderByChild('timestamp').limitToLast(3).once('value').then(snapshot => {
            const messages = [];
            snapshot.forEach(childSnapshot => {
                const message = childSnapshot.val();
                messages.push(message);
            });

            // 按时间倒序排列
            messages.reverse();
            displayRecentMessages(messages);
        }).catch(error => {
            console.error('加载留言失败:', error);
            document.getElementById('recent-messages').innerHTML =
                '<div class="index-announcement"><p style="margin: 0;">留言加载失败</p></div>';
        });

    } catch (error) {
        console.error('初始化Firebase失败:', error);
        document.getElementById('recent-messages').innerHTML =
            '<div class="index-announcement"><p style="margin: 0;">留言功能暂不可用</p></div>';
    }
}

// 显示最近留言
function displayRecentMessages(messages) {
    const container = document.getElementById('recent-messages');

    if (messages.length === 0) {
        container.innerHTML = '<div class="index-announcement"><p style="margin: 0;">暂无留言</p></div>';
        return;
    }

    let html = '';
    messages.forEach(message => {
        const date = new Date(message.timestamp);
        const dateStr = `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
        // 截取内容前30个字符
        const content = message.text.length > 30 ? message.text.substring(0, 30) + '...' : message.text;

        html += `
            <div class="index-announcement" style="margin-bottom: 10px; padding: 10px; border-radius: 5px; background: rgba(0,0,0,0.03);">
                <div style="font-weight: bold; margin-bottom: 5px;">${message.nickname}</div>
                <div style="font-size: 0.9em; color: #666;">${content}</div>
                <div style="font-size: 0.8em; color: #999; margin-top: 5px;">${dateStr}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// 加载友链
async function loadFriendLinks() {
    try {
        const response = await fetch('json/friends.json');
        const friends = await response.json();
        displayFriendLinks(friends);
    } catch (error) {
        console.error('加载友链失败:', error);
        document.getElementById('friend-links').innerHTML =
            '<div class="index-announcement"><p style="margin: 0;">友链加载失败</p></div>';
    }
}

// 显示友链
function displayFriendLinks(friends) {
    const container = document.getElementById('friend-links');

    if (!friends || friends.length === 0) {
        container.innerHTML = '<div class="index-announcement"><p style="margin: 0;">暂无友链</p></div>';
        return;
    }

    let html = '';
    friends.forEach(friend => {
        html += `
            <a href="${friend.url}" target="_blank" class="friend-link-item">
                <img src="${friend.icon}" alt="${friend.nickname}" class="friend-icon" onerror="this.src='assets/img/logo_blue.png'">
                <div class="friend-info">
                    <div class="friend-nickname">${friend.nickname}</div>
                    <div class="friend-describe">${friend.describe}</div>
                </div>
            </a>
        `;
    });

    container.innerHTML = html;
}


// 加载主页配置数据
async function loadHomeConfig() {
    try {
        const response = await fetch('/json/index.json');
        const config = await response.json();
        renderHomeConfig(config);
    } catch (error) {
        console.error('加载主页配置失败:', error);
        // 设置默认内容
        setDefaultContent();
    }
}

// 渲染主页配置
function renderHomeConfig(config) {
    // 渲染社交链接
    const socialContainer = document.getElementById('social-icons-container');
    socialContainer.innerHTML = config.socialLinks.map(link => `
        <a href="${link.url}" target="_blank">
            <img src="${link.icon}" alt="${link.alt}" 
                 style="height:30px; width:30px; border-radius: 50%;">
        </a>
    `).join('');

    // 渲染欢迎文本
    document.getElementById('welcome-text').textContent = config.welcomeText;

    // 渲染功能列表
    const featuresContainer = document.getElementById('features-container');
    featuresContainer.innerHTML = config.features.map(feature => `
        <div class="index-feature-box">
            <a href="${feature.url}">${feature.name}</a>
        </div>
    `).join('');

    // 渲染公告
    const announcementContainer = document.getElementById('announcement-container');
    announcementContainer.innerHTML = `
        <p style="margin: 0;">${config.announcement.title}<br>${config.announcement.content}</p>
    `;

    // 为动态生成的内容添加事件监听
    addEventListenersToDynamicContent();
}

// 设置默认内容（备用）
function setDefaultContent() {
    document.getElementById('social-icons-container').innerHTML = `
        <a href="https://github.com/lsqkk" target="_blank">
            <img src="https://cdn.pixabay.com/photo/2022/01/30/13/33/github-6980894_1280.png" 
                 style="height:30px; width:30px; border-radius: 50%;">
        </a>
        <!-- 其他默认社交图标 -->
    `;

    document.getElementById('welcome-text').textContent = "这里记录了我的学习历程、生活感悟和技术分享。";

    document.getElementById('features-container').innerHTML = `
        <div class="index-feature-box"><a href="tool/weather.html">天气查询</a></div>
        <!-- 其他默认功能 -->
    `;

    document.getElementById('announcement-container').innerHTML = `
        <p style="margin: 0;">想要更方便的阅读博文、移动端获得更好的阅读体验？<br>
        欢迎<a href="/assets/apk/QuarkBlog.apk" style="color: #007bff; font-weight: bold;">下载『夸克博客』APP</a>！</p>
    `;
}

// 为动态生成的内容添加事件监听
function addEventListenersToDynamicContent() {

    // 功能盒子悬停效果
    document.querySelectorAll('#features-container .index-feature-box').forEach(box => {
        box.addEventListener('mouseover', () => {
            box.style.transform = 'translateY(-3px)';
            box.style.boxShadow = '0 0 15px rgba(255,255,255,0.7)';
        });
        box.addEventListener('mouseout', () => {
            box.style.transform = 'none';
            box.style.boxShadow = '0 0 15px rgba(255,255,255,0.5)';
        });
    });
}


// 弹窗系统
let currentPopup = null;

// 检查并显示弹窗
async function checkAndShowPopup() {
    try {
        const response = await fetch('json/popups.json');
        const popups = await response.json();

        const today = new Date().toISOString().split('T')[0];

        for (const popup of popups) {
            if (shouldShowPopup(popup, today)) {
                showPopup(popup);
                break; // 每次只显示一个弹窗
            }
        }
    } catch (error) {
        console.error('加载弹窗配置失败:', error);
    }
}

// 判断是否应该显示弹窗
function shouldShowPopup(popup, today) {
    // 检查日期范围
    if (today < popup.startDate || today > popup.endDate) {
        return false;
    }

    // 检查是否被永久禁用
    const neverShowKey = `popup_never_${popup.id}`;
    if (localStorage.getItem(neverShowKey) === 'true') {
        return false;
    }

    // 检查今天是否已经显示过
    const todayShownKey = `popup_shown_${popup.id}_${today}`;
    if (localStorage.getItem(todayShownKey) === 'true') {
        return false;
    }

    return true;
}

// 显示弹窗
function showPopup(popup) {

    document.body.style.cursor = 'auto';
    currentPopup = popup;

    const overlay = document.getElementById('popup-overlay');
    const container = document.getElementById('popup-container');
    const title = document.getElementById('popup-title');
    const content = document.getElementById('popup-content');

    // 设置弹窗内容
    title.textContent = popup.title;
    content.innerHTML = marked.parse(popup.content);

    // 设置弹窗样式
    if (popup.backgroundColor) {
        container.style.background = popup.backgroundColor;
    }
    if (popup.textColor) {
        container.style.color = popup.textColor;
        title.style.color = popup.textColor;
    }

    // 显示弹窗
    overlay.style.display = 'flex';

    // 记录今天已显示
    const today = new Date().toISOString().split('T')[0];
    const todayShownKey = `popup_shown_${popup.id}_${today}`;
    localStorage.setItem(todayShownKey, 'true');

    // 自动关闭
    if (popup.autoClose) {
        setTimeout(() => {
            closePopup();
        }, 8000);
    }

    // 庆祝动效
    if (popup.celebration) {
        startCelebration();
    }

    // 设置事件监听
    setupPopupEvents();
}

// 设置弹窗事件
function setupPopupEvents() {
    const overlay = document.getElementById('popup-overlay');
    const closeBtn = document.getElementById('popup-close');
    const confirmBtn = document.getElementById('popup-confirm');
    const neverShowCheckbox = document.getElementById('popup-never-show');

    // 关闭按钮
    closeBtn.onclick = closePopup;

    // 确认按钮
    confirmBtn.onclick = closePopup;

    // 点击遮罩层关闭
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            closePopup();
        }
    };

    // ESC键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closePopup();
        }
    });

    // 不再显示选项
    neverShowCheckbox.onchange = (e) => {
        if (e.target.checked && currentPopup) {
            localStorage.setItem(`popup_never_${currentPopup.id}`, 'true');
        }
    };
}

// 关闭弹窗
function closePopup() {
    document.body.style.cursor = 'none';
    const overlay = document.getElementById('popup-overlay');
    const neverShowCheckbox = document.getElementById('popup-never-show');

    overlay.style.display = 'none';
    neverShowCheckbox.checked = false;
    stopCelebration();
    currentPopup = null;
}

// 庆祝动效
function startCelebration() {
    const container = document.getElementById('celebration-container');
    container.innerHTML = '';

    // 创建彩色纸屑效果
    for (let i = 0; i < 50; i++) {
        createConfetti(container);
    }
}

function createConfetti(container) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + 'vw';
    confetti.style.animationDelay = Math.random() * 2 + 's';
    confetti.style.background = getRandomColor();
    container.appendChild(confetti);

    // 自动清理
    setTimeout(() => {
        if (confetti.parentNode) {
            confetti.parentNode.removeChild(confetti);
        }
    }, 3000);
}

function getRandomColor() {
    const colors = [
        '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57',
        '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

function stopCelebration() {
    const container = document.getElementById('celebration-container');
    container.innerHTML = '';
}

document.addEventListener('DOMContentLoaded', function () {
    loadDynamicFeed();
    loadRecentMessages();
    loadFriendLinks();
    loadLatestVideo();
    checkAndShowPopup();
});


