// 数据存储键名
const STORAGE_KEYS = {
    TASKS: 'quark_tasks',
    TIME_LOGS: 'quark_time_logs',
    FLAGS: 'quark_flags',
    TIMERS: 'quark_timers'
};

// 初始化数据
function initData() {
    if (!localStorage.getItem(STORAGE_KEYS.TASKS)) {
        localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.TIME_LOGS)) {
        localStorage.setItem(STORAGE_KEYS.TIME_LOGS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.FLAGS)) {
        localStorage.setItem(STORAGE_KEYS.FLAGS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.TIMERS)) {
        localStorage.setItem(STORAGE_KEYS.TIMERS, JSON.stringify([]));
    }
}

// 切换表单显示
function toggleForm(formId, button) {
    // 获取当前section中的所有form-content
    const section = button.closest('.full-width-section');
    const forms = section.querySelectorAll('.form-content');

    // 隐藏所有表单
    forms.forEach(form => {
        form.classList.remove('active');
    });

    // 显示选中的表单
    document.getElementById(formId).classList.add('active');

    // 更新切换按钮状态
    const buttons = section.querySelectorAll('.form-toggle button');
    buttons.forEach(btn => {
        btn.classList.remove('active');
    });
    button.classList.add('active');

    // 如果是图表视图，重新渲染图表
    if (formId === 'time-log-stats') {
        renderTimeChart();
    }

    // 如果是列表视图，重新加载数据
    if (formId === 'todo-list') {
        loadTasks();
    } else if (formId === 'time-log-list') {
        loadTimeLogs();
    } else if (formId === 'flag-list') {
        loadFlags();
    } else if (formId === 'timer-list') {
        loadTimers();
    }
}

// 渲染时间统计图表
function renderTimeChart() {
    const timeLogs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TIME_LOGS));
    const categories = ['work', 'study', 'entertainment', 'sport', 'social', 'other'];
    const categoryLabels = ['工作', '学习', '娱乐', '运动', '社交', '其他'];

    // 计算每个分类的总时间
    const categoryData = categories.map(category => {
        return timeLogs
            .filter(log => log.category === category)
            .reduce((sum, log) => sum + parseInt(log.duration), 0) / 60; // 转换为小时
    });

    const ctx = document.getElementById('time-chart').getContext('2d');

    const data = {
        labels: categoryLabels,
        datasets: [{
            label: '时间分配(小时)',
            data: categoryData,
            backgroundColor: [
                'rgba(66, 133, 244, 0.7)',
                'rgba(52, 168, 83, 0.7)',
                'rgba(251, 188, 5, 0.7)',
                'rgba(234, 67, 53, 0.7)',
                'rgba(155, 81, 224, 0.7)',
                'rgba(101, 115, 126, 0.7)'
            ],
            borderColor: [
                'rgba(66, 133, 244, 1)',
                'rgba(52, 168, 83, 1)',
                'rgba(251, 188, 5, 1)',
                'rgba(234, 67, 53, 1)',
                'rgba(155, 81, 224, 1)',
                'rgba(101, 115, 126, 1)'
            ],
            borderWidth: 1
        }]
    };

    const config = {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    };

    // 销毁旧图表实例（如果存在）
    if (window.timeChart) {
        window.timeChart.destroy();
    }

    window.timeChart = new Chart(ctx, config);
}

// 任务相关功能
function loadTasks() {
    const tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.TASKS));
    const taskList = document.getElementById('task-list');
    taskList.innerHTML = '';

    if (tasks.length === 0) {
        taskList.innerHTML = '<li class="empty-message">暂无待办任务</li>';
        return;
    }

    tasks.forEach((task, index) => {
        const taskItem = document.createElement('li');
        taskItem.className = `task-item priority-${task.priority}`;

        const dueDate = new Date(task.due);
        const formattedDue = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')} ${String(dueDate.getHours()).padStart(2, '0')}:${String(dueDate.getMinutes()).padStart(2, '0')}`;

        taskItem.innerHTML = `
                    <div class="task-info">
                        <span class="task-name">${task.name}</span>
                        <span class="task-due">截止: ${formattedDue}</span>
                        ${task.notes ? `<span class="task-notes">${task.notes}</span>` : ''}
                    </div>
                    <div class="task-actions">
                        <button class="btn btn-small btn-primary" onclick="completeTask(${index})">完成</button>
                        <button class="btn btn-small" onclick="editTask(${index})">编辑</button>
                        <button class="btn btn-small" onclick="deleteTask(${index})">删除</button>
                    </div>
                `;

        taskList.appendChild(taskItem);
    });
}

function addTask(event) {
    event.preventDefault();

    const task = {
        name: document.getElementById('task-name').value,
        due: document.getElementById('task-due').value,
        priority: document.getElementById('task-priority').value,
        notes: document.getElementById('task-notes').value,
        createdAt: new Date().toISOString()
    };

    const tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.TASKS));
    tasks.push(task);
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));

    alert('任务已添加!');
    document.getElementById('add-task-form').reset();
    loadTasks();
}

function completeTask(index) {
    const tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.TASKS));
    tasks.splice(index, 1);
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    loadTasks();
}

function editTask(index) {
    const tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.TASKS));
    const task = tasks[index];

    document.getElementById('task-name').value = task.name;
    document.getElementById('task-due').value = task.due;
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('task-notes').value = task.notes || '';

    tasks.splice(index, 1);
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));

    // 切换到添加表单
    const section = document.querySelector('.full-width-section');
    const addButton = section.querySelector('.form-toggle button:first-child');
    toggleForm('todo-form', addButton);
}

function deleteTask(index) {
    if (confirm('确定要删除这个任务吗？')) {
        const tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.TASKS));
        tasks.splice(index, 1);
        localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
        loadTasks();
    }
}

// 时间记录相关功能
function loadTimeLogs() {
    const timeLogs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TIME_LOGS));
    const timeLogList = document.getElementById('time-log-list');
    timeLogList.innerHTML = '';

    if (timeLogs.length === 0) {
        timeLogList.innerHTML = '<li class="empty-message">暂无时间记录</li>';
        return;
    }

    timeLogs.forEach((log, index) => {
        const timeLogItem = document.createElement('li');
        timeLogItem.className = 'time-log-item';

        const categoryMap = {
            work: '工作',
            study: '学习',
            entertainment: '娱乐',
            sport: '运动',
            social: '社交',
            other: '其他'
        };

        timeLogItem.innerHTML = `
                    <div class="time-log-info">
                        <span class="time-log-activity">${log.activity} <small>(${categoryMap[log.category]})</small></span>
                        <span class="time-log-duration">${log.date} · ${log.duration}分钟</span>
                        ${log.participants ? `<span class="time-log-participants">与: ${log.participants}</span>` : ''}
                        ${log.location ? `<span class="time-log-location">地点: ${log.location}</span>` : ''}
                    </div>
                    <div class="time-log-actions">
                        <button class="btn btn-small" onclick="editTimeLog(${index})">编辑</button>
                        <button class="btn btn-small" onclick="deleteTimeLog(${index})">删除</button>
                    </div>
                `;

        timeLogList.appendChild(timeLogItem);
    });
}

function addTimeLog(event) {
    event.preventDefault();

    const timeLog = {
        activity: document.getElementById('time-log-activity').value,
        date: document.getElementById('time-log-date').value,
        duration: document.getElementById('time-log-duration').value,
        participants: document.getElementById('time-log-participants').value || null,
        location: document.getElementById('time-log-location').value || null,
        category: document.getElementById('time-log-category').value,
        createdAt: new Date().toISOString()
    };

    const timeLogs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TIME_LOGS));
    timeLogs.push(timeLog);
    localStorage.setItem(STORAGE_KEYS.TIME_LOGS, JSON.stringify(timeLogs));

    alert('时间记录已添加!');
    document.getElementById('add-time-log-form').reset();
    loadTimeLogs();
}

function editTimeLog(index) {
    const timeLogs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TIME_LOGS));
    const log = timeLogs[index];

    document.getElementById('time-log-activity').value = log.activity;
    document.getElementById('time-log-date').value = log.date;
    document.getElementById('time-log-duration').value = log.duration;
    document.getElementById('time-log-participants').value = log.participants || '';
    document.getElementById('time-log-location').value = log.location || '';
    document.getElementById('time-log-category').value = log.category;

    timeLogs.splice(index, 1);
    localStorage.setItem(STORAGE_KEYS.TIME_LOGS, JSON.stringify(timeLogs));

    // 切换到添加表单
    const section = document.querySelector('.full-width-section:nth-child(2)');
    const addButton = section.querySelector('.form-toggle button:first-child');
    toggleForm('time-log-form', addButton);
}

function deleteTimeLog(index) {
    if (confirm('确定要删除这个时间记录吗？')) {
        const timeLogs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TIME_LOGS));
        timeLogs.splice(index, 1);
        localStorage.setItem(STORAGE_KEYS.TIME_LOGS, JSON.stringify(timeLogs));
        loadTimeLogs();
    }
}

// FLAG相关功能
function loadFlags() {
    const flags = JSON.parse(localStorage.getItem(STORAGE_KEYS.FLAGS));
    const flagList = document.getElementById('flag-list');
    flagList.innerHTML = '';

    if (flags.length === 0) {
        flagList.innerHTML = '<li class="empty-message">暂无FLAG</li>';
        return;
    }

    flags.forEach((flag, index) => {
        const flagItem = document.createElement('li');
        flagItem.className = `flag-item status-${flag.status}`;

        flagItem.innerHTML = `
                    <div class="flag-info">
                        <span class="flag-name">${flag.name}</span>
                        <span class="flag-period">${flag.start} 至 ${flag.end}</span>
                        ${flag.reward ? `<span class="flag-reward">奖励: ${flag.reward}</span>` : ''}
                        <span class="flag-status">状态: ${getStatusText(flag.status)}</span>
                    </div>
                    <div class="flag-actions">
                        <button class="btn btn-small btn-secondary" onclick="completeFlag(${index})">完成</button>
                        <button class="btn btn-small" onclick="editFlag(${index})">编辑</button>
                        <button class="btn btn-small" onclick="deleteFlag(${index})">删除</button>
                    </div>
                `;

        flagList.appendChild(flagItem);
    });
}

function getStatusText(status) {
    const statusMap = {
        ongoing: '进行中',
        completed: '已完成',
        failed: '已放弃'
    };
    return statusMap[status] || status;
}

function addFlag(event) {
    event.preventDefault();

    const flag = {
        name: document.getElementById('flag-name').value,
        start: document.getElementById('flag-start').value,
        end: document.getElementById('flag-end').value,
        reward: document.getElementById('flag-reward').value || null,
        priority: document.getElementById('flag-priority').value,
        status: document.getElementById('flag-status').value,
        createdAt: new Date().toISOString()
    };

    const flags = JSON.parse(localStorage.getItem(STORAGE_KEYS.FLAGS));
    flags.push(flag);
    localStorage.setItem(STORAGE_KEYS.FLAGS, JSON.stringify(flags));

    alert('FLAG已立下!');
    document.getElementById('add-flag-form').reset();
    loadFlags();
}

function completeFlag(index) {
    const flags = JSON.parse(localStorage.getItem(STORAGE_KEYS.FLAGS));
    flags[index].status = 'completed';
    localStorage.setItem(STORAGE_KEYS.FLAGS, JSON.stringify(flags));
    loadFlags();
}

function editFlag(index) {
    const flags = JSON.parse(localStorage.getItem(STORAGE_KEYS.FLAGS));
    const flag = flags[index];

    document.getElementById('flag-name').value = flag.name;
    document.getElementById('flag-start').value = flag.start;
    document.getElementById('flag-end').value = flag.end;
    document.getElementById('flag-reward').value = flag.reward || '';
    document.getElementById('flag-priority').value = flag.priority;
    document.getElementById('flag-status').value = flag.status;

    flags.splice(index, 1);
    localStorage.setItem(STORAGE_KEYS.FLAGS, JSON.stringify(flags));

    // 切换到添加表单
    const section = document.querySelector('.full-width-section:nth-child(3)');
    const addButton = section.querySelector('.form-toggle button:first-child');
    toggleForm('flag-form', addButton);
}

function deleteFlag(index) {
    if (confirm('确定要删除这个FLAG吗？')) {
        const flags = JSON.parse(localStorage.getItem(STORAGE_KEYS.FLAGS));
        flags.splice(index, 1);
        localStorage.setItem(STORAGE_KEYS.FLAGS, JSON.stringify(flags));
        loadFlags();
    }
}

// 定时器相关功能
function loadTimers() {
    const timers = JSON.parse(localStorage.getItem(STORAGE_KEYS.TIMERS));
    const timerList = document.getElementById('timer-list');
    timerList.innerHTML = '';

    if (timers.length === 0) {
        timerList.innerHTML = '<li class="empty-message">暂无定时提醒</li>';
        return;
    }

    timers.forEach((timer, index) => {
        const timerItem = document.createElement('li');
        timerItem.className = 'timer-item';

        const repeatMap = {
            none: '不重复',
            daily: '每天',
            weekly: '每周',
            monthly: '每月',
            yearly: '每年'
        };

        const typeMap = {
            notification: '系统通知',
            email: '电子邮件',
            both: '系统通知和电子邮件'
        };

        const time = new Date(timer.time);
        const formattedTime = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}-${String(time.getDate()).padStart(2, '0')} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

        timerItem.innerHTML = `
                    <div class="timer-info">
                        <span class="timer-name">${timer.name}</span>
                        <span class="timer-time">${formattedTime} (${typeMap[timer.type]})</span>
                        <span class="timer-repeat">${repeatMap[timer.repeat]}</span>
                        ${timer.description ? `<span class="timer-description">${timer.description}</span>` : ''}
                    </div>
                    <div class="timer-actions">
                        <button class="btn btn-small" onclick="editTimer(${index})">编辑</button>
                        <button class="btn btn-small" onclick="deleteTimer(${index})">删除</button>
                    </div>
                `;

        timerList.appendChild(timerItem);
    });
}

function addTimer(event) {
    event.preventDefault();

    const timer = {
        name: document.getElementById('timer-name').value,
        type: document.getElementById('timer-type').value,
        time: document.getElementById('timer-time').value,
        repeat: document.getElementById('timer-repeat').value,
        description: document.getElementById('timer-description').value || null,
        createdAt: new Date().toISOString()
    };

    const timers = JSON.parse(localStorage.getItem(STORAGE_KEYS.TIMERS));
    timers.push(timer);
    localStorage.setItem(STORAGE_KEYS.TIMERS, JSON.stringify(timers));

    alert('提醒已设置!');
    document.getElementById('add-timer-form').reset();
    loadTimers();
}

function editTimer(index) {
    const timers = JSON.parse(localStorage.getItem(STORAGE_KEYS.TIMERS));
    const timer = timers[index];

    document.getElementById('timer-name').value = timer.name;
    document.getElementById('timer-type').value = timer.type;
    document.getElementById('timer-time').value = timer.time;
    document.getElementById('timer-repeat').value = timer.repeat;
    document.getElementById('timer-description').value = timer.description || '';

    timers.splice(index, 1);
    localStorage.setItem(STORAGE_KEYS.TIMERS, JSON.stringify(timers));

    // 切换到添加表单
    const section = document.querySelector('.full-width-section:nth-child(4)');
    const addButton = section.querySelector('.form-toggle button:first-child');
    toggleForm('timer-form', addButton);
}

function deleteTimer(index) {
    if (confirm('确定要删除这个提醒吗？')) {
        const timers = JSON.parse(localStorage.getItem(STORAGE_KEYS.TIMERS));
        timers.splice(index, 1);
        localStorage.setItem(STORAGE_KEYS.TIMERS, JSON.stringify(timers));
        loadTimers();
    }
}

// 页面加载时初始化
window.addEventListener('DOMContentLoaded', () => {
    initData();

    // 设置表单提交事件
    document.getElementById('add-task-form').addEventListener('submit', addTask);
    document.getElementById('add-time-log-form').addEventListener('submit', addTimeLog);
    document.getElementById('add-flag-form').addEventListener('submit', addFlag);
    document.getElementById('add-timer-form').addEventListener('submit', addTimer);

    // 设置默认日期时间
    const now = new Date();
    const timeString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    document.getElementById('task-due').value = timeString;
    document.getElementById('timer-time').value = timeString;

    const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    document.getElementById('time-log-date').value = dateString;
    document.getElementById('flag-start').value = dateString;

    // 加载初始数据
    loadTasks();
    loadTimeLogs();
    loadFlags();
    loadTimers();
});