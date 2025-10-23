
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelector('.main-content').style.opacity = '1';
            loadRecentPosts(); // 加载文章
            
            // 为社交图标添加悬停效果
            document.querySelectorAll('.social-icons a').forEach(icon => {
                icon.addEventListener('mouseover', () => {
                    icon.style.transform = 'translateY(-3px)';
                });
                icon.addEventListener('mouseout', () => {
                    icon.style.transform = 'none';
                });
            });
            
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
                    <a class="post-title" href="post.html?file=${post.file}" style="color: #0366d6; text-decoration: none; font-weight: 500;">
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

        // 搜索博客功能
        async function searchBlog() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            const posts = await fetch('json/posts.json').then(r => r.json());
            const filteredPosts = posts.filter(post => post.title.toLowerCase().includes(searchTerm));

            const searchResultsContainer = document.getElementById('searchResults');
            searchResultsContainer.innerHTML = ''; // 清空之前的搜索结果

            if (filteredPosts.length > 0) {
                // 如果有匹配的博客，展示结果
                filteredPosts.forEach(post => {
                    const resultItem = document.createElement('div');
                    resultItem.className = 'search-result-item';
                    resultItem.style.transition = 'all 0.3s ease';
                    resultItem.innerHTML = `
                        <a href="post.html?file=${post.file}" style="color: #0366d6; text-decoration: none; font-weight: 500;">
                            ${post.title}
                        </a>
                        <div style="color: #666; font-size: 0.9em; margin-top: 5px;">${post.date}</div>
                    `;
                    searchResultsContainer.appendChild(resultItem);
                    
                    // 为搜索结果项添加悬停效果
                    resultItem.addEventListener('mouseover', () => {
                        resultItem.style.transform = 'translateX(5px)';
                        resultItem.style.boxShadow = '0 3px 10px rgba(0,0,0,0.1)';
                    });
                    resultItem.addEventListener('mouseout', () => {
                        resultItem.style.transform = 'none';
                        resultItem.style.boxShadow = 'none';
                    });
                });
            } else {
                // 如果没有匹配的博客，显示提示信息
                searchResultsContainer.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">未找到相关博客</div>';
            }
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
            if(document.getElementById('busuanzi_value_site_pv').innerText && 
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

document.addEventListener('DOMContentLoaded', function() {
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
                Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return Math.round(R * c);
        }

// 根据省份返回俏皮话
function getProvinceBanter(province) {
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
    
    return banterMap[province] || '欢迎来玩！'; // 如果没有匹配的省份，返回默认欢迎语
}

        // 获取访客信息
        async function getVisitorInfo() {
            try {
                const response = await fetch('https://api.b52m.cn/api/IP/?key=60606913cdba7c');
                const data = await response.json();
                
                if (data.code === 200) {
                    const ipInfo = data.data;
                    const ip = data.ip;
                    
                    // 站主位置
                    const bloggerLat = 34.252705;
                    const bloggerLon = 108.990221;
                    
                    const distance = getDistance(
                        bloggerLat, bloggerLon,
                        ipInfo.latitude_3, ipInfo.longitude_3
                    );

// 获取省份俏皮话
                    const provinceBanter = getProvinceBanter(ipInfo.province_name_3);

                    // 显示欢迎信息
                    document.getElementById('welcome-info').innerHTML = `
                        欢迎来自 <span class="highlight">${ipInfo.province_name_3} ${ipInfo.city_name_3} ${ipInfo.district_name_3}</span> 的朋友<br>
                        <span class="highlight">${provinceBanter}</span><br>
                        您当前距站主约 <span class="highlight">${distance}</span> 公里<br>
                        您的IP地址为: <span class="highlight">${ip}</span>
                    `;
                } else {
                    throw new Error('API返回错误');
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
        const response = await fetch('dt/dt.md');
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
    return entries.reverse(); // 最新在前
}

function renderDynamicEntries(entries) {
    const container = document.getElementById('dynamic-entries');
    container.innerHTML = entries.map(entry => `
        <div class="dynamic-card">
            <div class="dynamic-title">${entry.title}</div>
            ${entry.date ? `<div class="dynamic-date">📅 ${entry.date}</div>` : ''}
            <div class="dynamic-content">${marked.parse(entry.content.join('\n'))}</div>
        </div>
    `).join('');
}

// 加载最近留言
async function loadRecentMessages() {
    try {
        // Firebase配置（与留言板相同）
        const firebaseConfig = {
            apiKey: "AIzaSyAeSI1akqwsPBrVyv7YKirV06fqdkL3YNI",
            authDomain: "quark-b7305.firebaseapp.com",
            projectId: "quark-b7305",
            storageBucket: "quark-b7305.firebasestorage.app",
            messagingSenderId: "843016834358",
            appId: "1:843016834358:web:9438c729be28c4d492f797",
            measurementId: "G-5BVT26KRT6"
        };

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

        // 初始化Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
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
        const dateStr = `${date.getMonth()+1}-${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
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
                <img src="${friend.icon}" alt="${friend.nickname}" class="friend-icon" onerror="this.src='image/logo_blue.png'">
                <div class="friend-info">
                    <div class="friend-nickname">${friend.nickname}</div>
                    <div class="friend-describe">${friend.describe}</div>
                </div>
            </a>
        `;
    });
    
    container.innerHTML = html;
}



document.addEventListener('DOMContentLoaded', function() {
   loadDynamicFeed();
        loadRecentMessages();
    loadFriendLinks(); // 加载友链
});