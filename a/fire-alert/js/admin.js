// 管理页面专用JavaScript
let isAdmin = false;

document.addEventListener('DOMContentLoaded', function () {
    checkAdminStatus();
});

function checkAdminStatus() {
    isAdmin = localStorage.getItem('fireAdmin') === 'true';
    if (isAdmin) {
        showAdminPanel();
    } else {
        showLoginPanel();
    }
}

async function adminLogin() {
    const password = document.getElementById('adminPassword').value;

    if (!password) {
        alert('请输入密码');
        return;
    }

    try {
        const hash = await sha256(password);
        const expectedHash = '936a185caaa266bb9cbe981e9e05cb78cd732b0b3280eb944412bb6f8f8f07af'; // helloworld

        if (hash === expectedHash) {
            isAdmin = true;
            localStorage.setItem('fireAdmin', 'true');
            showAdminPanel();
            alert('管理员登录成功');
        } else {
            alert('密码错误');
        }
    } catch (error) {
        alert('登录失败: ' + error.message);
    }
}

function showLoginPanel() {
    document.getElementById('loginPanel').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
}

function showAdminPanel() {
    document.getElementById('loginPanel').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    loadAdminData();
}

function logoutAdmin() {
    isAdmin = false;
    localStorage.setItem('fireAdmin', 'false');
    showLoginPanel();
    document.getElementById('adminPassword').value = '';
}

async function publishAlert() {
    const title = document.getElementById('alertTitle').value;
    const level = document.getElementById('alertLevel').value;
    const content = document.getElementById('alertContent').value;

    if (!title || !content) {
        alert('请填写预警标题和内容');
        return;
    }

    const alertData = {
        title: title,
        level: level,
        content: content,
        timestamp: Date.now(),
        publisher: '系统管理员'
    };

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        const alertsRef = firebase.database().ref('fire-alert/alerts');
        await alertsRef.push(alertData);

        alert('预警发布成功！');
        document.getElementById('alertTitle').value = '';
        document.getElementById('alertContent').value = '';
    } catch (error) {
        alert('发布失败: ' + error.message);
    }
}

function loadAdminData() {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    const firesRef = firebase.database().ref('fire-alert/fires');
    firesRef.on('value', (snapshot) => {
        const fires = [];
        snapshot.forEach((childSnapshot) => {
            const fire = childSnapshot.val();
            fire.id = childSnapshot.key;
            fires.push(fire);
        });

        updateAdminFireList(fires);
    });
}

function updateAdminFireList(fires) {
    const container = document.getElementById('adminFiresList');

    if (fires.length === 0) {
        container.innerHTML = '<div class="no-fires">暂无火情数据</div>';
        return;
    }

    container.innerHTML = fires.map(fire => `
        <div class="fire-item">
            <div class="fire-header">
                <div class="fire-location">${fire.location}</div>
                <div class="fire-status">${fire.severity}</div>
            </div>
            <div class="fire-details">
                上报时间: ${new Date(fire.timestamp).toLocaleString()}<br>
                描述: ${fire.description}<br>
                上报人: ${fire.reporter || '未知'}
            </div>
            <div class="fire-actions">
                <button class="btn-secondary" onclick="deleteFire('${fire.id}')">删除</button>
                <button class="btn-secondary" onclick="updateFireStatus('${fire.id}', 'contained')">标记为已控制</button>
            </div>
        </div>
    `).join('');
}

async function deleteFire(fireId) {
    if (!confirm('确定要删除这条火情记录吗？')) return;

    try {
        const fireRef = firebase.database().ref(`fire-alert/fires/${fireId}`);
        await fireRef.remove();
        alert('删除成功');
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

async function updateFireStatus(fireId, status) {
    try {
        const fireRef = firebase.database().ref(`fire-alert/fires/${fireId}`);
        await fireRef.update({ status: status });
        alert('状态更新成功');
    } catch (error) {
        alert('状态更新失败: ' + error.message);
    }
}

function saveSettings() {
    const tempWeight = document.getElementById('tempWeight').value;
    const humidityWeight = document.getElementById('humidityWeight').value;
    const windWeight = document.getElementById('windWeight').value;

    const settings = {
        tempWeight: parseFloat(tempWeight),
        humidityWeight: parseFloat(humidityWeight),
        windWeight: parseFloat(windWeight)
    };

    localStorage.setItem('fireSettings', JSON.stringify(settings));
    alert('设置保存成功');
}