// ./js/home.js

/**
 * 夸克博客 OJ 首页逻辑 (Home Page)
 * 包括运势抽取、随机跳题和本地数据展示
 * 依赖于 utils.js 中的 localStorage 操作
 */

// --- 运势数据（根据用户提供的 C++ 代码片段转换） ---
// 权值列表 (W_LIST): 宇宙超级凶, 大凶, 中平, 小平, 小凶, 中吉, 小吉, 超级吉, 中凶
const W_LIST = [2, 4, 15, 15, 16, 16, 25, 7, 5];
const FORTUNE_NAMES = [
    "宇宙超级凶", "大凶", "中平", "小平", "小凶", "中吉", "小吉", "超级吉", "中凶"
];

// 宜列表 (每个运势等级对应4条)
const YI_LIST = [
    ["宜:诸事不宜", "宜:诸事不宜", "宜:诸事不宜", "宜:诸事不宜"],
    ["宜:装弱", "宜:窝在家里", "宜:刷题", "宜:吃饭"],
    ["宜:刷题", "宜:开电脑", "宜:写作业", "宜:睡觉"],
    ["宜:发朋友圈", "宜:出去玩", "宜:打游戏", "宜:吃饭"],
    ["宜:学习", "宜:研究Ruby", "宜:研究c#", "宜:玩游戏"],
    ["宜:膜拜大神", "宜:扶老奶奶过马路", "宜:玩网游", "宜:喝可乐"],
    ["宜:写程序", "宜:使用Unity打包exe", "宜:装弱", "宜:打开CSDN"],
    ["宜:点开wx", "宜:刷题", "宜:打吃鸡", "宜:和别人分享你的程序"],
    ["宜:纳财", "宜:写程序超过500行", "宜:断网", "宜:检测Bug"]
];

// 宜释义列表 (与 YI_LIST 对应)
const YI_SHI_LIST = [
    ["", "", "", ""],
    ["被人看穿", "宅家保平安", "刷题可以提升自我", "吃好点"],
    ["提升自我", "可以启动", "写得好", "做梦都能AC"],
    ["被人点赞", "发现宝藏", "赢了", "吃了能AC"],
    ["提升自我", "增加新的知识", "增加新的知识", "输了还能再玩"],
    ["学习经验", "积累RP", "赢了", "喝了才能AC"],
    ["多写", "可以运行", "别人不能看穿你", "学好基础"],
    ["和别人联系", "提升自我", "被人带飞", "别人能帮你发现Bug"],
    ["财源滚滚", "99+AC", "没网了，只能写代码", "发现Bug，并修改它"]
];

// 忌列表 (每个运势等级对应4条)
const JI_LIST = [
    ["忌:诸事不宜", "忌:诸事不宜", "忌:诸事不宜", "忌:诸事不宜"],
    ["忌:膜拜大神", "忌:评论", "忌:研究Java", "忌:吃方便面"],
    ["忌:发朋友圈", "忌:打开洛谷", "忌:研究C++", "忌:出行"],
    ["忌:探险", "忌:发视频", "忌:发博客", "忌:给别人点赞"],
    ["忌:写程序", "忌:使用Unity打包exe", "忌:装弱", "忌:打开CSDN"],
    ["忌:点开wx", "忌:刷题", "忌:打吃鸡", "忌:和别人分享你的程序"],
    ["忌:纳财", "忌:写程序超过500行", "忌:断网", "忌:检测Bug"],
    ["忌:发朋友圈", "忌:出去玩", "忌:打游戏", "忌:吃饭"],
    ["忌:学习", "忌:研究Ruby", "忌:研究c#", "忌:玩游戏"]
];

// 忌释义列表 (与 JI_LIST 对应)
const JI_SHI_LIST = [
    ["", "", "", ""],
    ["今天状态不好", "路途也许坎坷", "好家伙，直接死机", "没有调味料"],
    ["死机了", "被制裁", "你没有财运", "没及格"],
    ["被人嘲笑", "被喷", "心态崩溃", "只有一包调味料"],
    ["被人当成买面膜的", "大凶", "五行代码198个报错", "路途坎坷"],
    ["你失踪了", "被人喷", "阅读量1", "被人嘲笑"],
    ["报错19999+", "电脑卡死，发现刚才做的demo全没了", "被人看穿", "被人陷害"],
    ["被人陷害", "WA", "被队友炸死", "别人发现了Bug"],
    ["没有财运", "99+报错", "连不上了", "503"]
];

// --- 工具函数 ---

/**
 * 生成 [min, max] 之间的随机整数
 */
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- 运势功能逻辑 ---

/**
 * 基于权重的运势抽取核心逻辑
 * @returns {Object} 包含 name, yi, yi_shi, ji, ji_shi 的运势结果
 */
function drawWeightedFortune() {
    let w_sum = W_LIST.reduce((a, b) => a + b, 0);
    // 随机数范围 [1, w_sum]
    let randVal = getRandomInt(1, w_sum);
    let resultIndex = -1;

    for (let i = 0; i < W_LIST.length; i++) {
        if (randVal <= W_LIST[i]) {
            resultIndex = i;
            break;
        }
        randVal -= W_LIST[i];
    }

    if (resultIndex === -1) {
        // 兜底，理论上不会发生
        resultIndex = getRandomInt(0, FORTUNE_NAMES.length - 1);
    }

    // 随机抽取宜和忌的索引
    const yiIndex = getRandomInt(0, YI_LIST[resultIndex].length - 1);
    const jiIndex = getRandomInt(0, JI_LIST[resultIndex].length - 1);

    const result = {
        name: FORTUNE_NAMES[resultIndex],
        yi: YI_LIST[resultIndex][yiIndex],
        yi_shi: YI_SHI_LIST[resultIndex][yiIndex],
        ji: JI_LIST[resultIndex][jiIndex],
        ji_shi: JI_SHI_LIST[resultIndex][jiIndex],
    };

    return result;
}

/**
 * 渲染运势结果到 HTML 界面
 * @param {Object} result - 运势结果对象
 */
function renderFortune(result) {
    const fortuneContainer = document.getElementById('fortune-content');

    fortuneContainer.innerHTML = `
        <p class="oj-fortune-status">${result.name}</p>
        <p class="oj-fortune-yi" style="color: var(--oj-primary-color);">${result.yi.split(':')[1]}：${result.yi_shi}</p>
        <p class="oj-fortune-ji" style="color: #F44336;">${result.ji.split(':')[1]}：${result.ji_shi}</p>
        <p style="font-size: 0.8em; margin-top: 15px;">（今日运势已抽取，明日可再次抽取）</p>
    `;
}

/**
 * 检查并处理运势抽取逻辑
 */
function setupFortuneFeature() {
    const today = new Date().toDateString();
    const storedFortune = localStorage.getItem('quark_daily_fortune');
    const drawButton = document.getElementById('draw-fortune-btn');

    // 1. 检查今日是否已抽取
    if (storedFortune) {
        const data = JSON.parse(storedFortune);
        if (data.date === today) {
            renderFortune(data.result);
            return; // 今日已抽取，直接显示结果
        }
    }

    // 2. 未抽取或已过期，绑定抽取事件
    if (drawButton) {
        drawButton.onclick = () => {
            const result = drawWeightedFortune();

            // 存储结果到本地 localStorage
            localStorage.setItem('quark_daily_fortune', JSON.stringify({
                date: today,
                result: result
            }));

            renderFortune(result);
        };
    }
}


// 题目范围
const MIN_PROBLEM_ID = 1001;
const MAX_PROBLEM_ID = 1140;

/**
 * 全局函数：实现随机跳题，供 index.html 的 onclick 调用
 */
window.jumpToRandomProblem = function () {
    const randomId = getRandomInt(MIN_PROBLEM_ID, MAX_PROBLEM_ID);
    // 跳转到题目详情页，假设题目详情页的 URL 格式是 problem.html?p=ID
    window.location.href = `train.html?p=${randomId}`;
};


// --- 页面初始化及模拟数据加载 ---

/**
 * 页面初始化函数
 */
window.initializeHomePage = function () {
    // 1. 设置运势功能
    setupFortuneFeature();

    // 2. 模拟统计数据（纯前端模拟，无后端）
    document.getElementById('total-problems').textContent = '1024'; // 模拟总题目数
    document.getElementById('total-submissions').textContent = '56789'; // 模拟总提交数
    document.getElementById('today-ac').textContent = '245'; // 模拟今日 AC 人次

    console.log("夸克 OJ 首页初始化完成，运势和随机跳题功能已就绪。");
};

// 确保在 DOM 内容加载完成后执行初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查 utils.js 是否已加载（通过检查其中的函数是否存在）
    if (typeof getUrlParam === 'function') {
        initializeHomePage();
    } else {
        console.error("缺少必要的依赖文件 utils.js！请确保已在 index.html 中正确加载。");
    }
});