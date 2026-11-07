import { getPersonalNotices, localDate, savePersonalNotices } from '../../js/site-notices.mjs';

const preferences = window.QuarkUserPreferences;
const config = window.QuarkLLMConfig;
const byId = (id) => document.getElementById(id);
const fields = [...document.querySelectorAll('[data-preference]')];
const setStatus = (id, message) => { byId(id).textContent = message; };
const isLoggedIn = () => ['github_user', 'github_code', 'qb_user'].some((key) => localStorage.getItem(key));

byId('settingLanguage').replaceChildren(...[
    ['chinese_simplified', '中文/CN'], ['english', 'English'], ['japanese', '日本語'],
    ['korean', '한국어'], ['french', 'Français'], ['german', 'Deutsch'],
    ['spanish', 'Español'], ['russian', 'Русский']
].map(([value, label]) => new Option(label, value)));
byId('settingFont').replaceChildren(...preferences.getFonts().map(({ label, id }) => new Option(label, id)));

function showPreferences(values) {
    for (const field of fields) {
        const value = values[field.dataset.preference];
        if (field.type === 'checkbox') field.checked = value;
        else field.value = value;
    }
}

function readPreferences() {
    return Object.fromEntries(fields.map((field) => [field.dataset.preference,
        field.type === 'checkbox' ? field.checked : field.value]));
}

async function commit(patch, restored = false) {
    const buttons = [byId('saveSettings'), byId('resetSettings')];
    buttons.forEach((button) => { button.disabled = true; });
    try {
        await preferences.update(patch, { sync: false });
        const synced = isLoggedIn() && await preferences.syncRemote();
        setStatus('settingsStatus', restored ? '已恢复默认偏好' : synced ? '已保存并同步' :
            isLoggedIn() ? '已保存到本机，账号同步暂不可用' : '已保存到本机');
    } catch (error) {
        setStatus('settingsStatus', error.message);
    } finally {
        buttons.forEach((button) => { button.disabled = false; });
    }
}

function showSyncHint() {
    setStatus('settingsSyncHint', isLoggedIn()
        ? '站点偏好可随账号同步。AI 密钥与个人提醒留在此浏览器。'
        : '当前使用本机设置。登录后可以同步站点偏好。');
}
showPreferences(preferences.get());
showSyncHint();
window.addEventListener('quark-user-updated', showSyncHint);
window.addEventListener(preferences.eventName, (event) => showPreferences(event.detail));
void preferences.loadRemote();
for (const field of fields) {
    field.addEventListener('change', () => {
        const value = field.type === 'checkbox' ? field.checked : field.value;
        void preferences.update({ [field.dataset.preference]: value }, { sync: false });
        setStatus('settingsStatus', isLoggedIn() ? '已在本机生效，点击保存同步到账号' : '已在本机生效');
    });
}
byId('saveSettings').onclick = () => void commit(readPreferences());
byId('resetSettings').onclick = () => void commit(preferences.defaults, true);

const aiForm = byId('aiSettingsForm');
const aiBase = byId('aiBase');
const aiModel = byId('aiModel');
const aiKey = byId('aiKey');
const readConnection = () => ({ baseUrl: aiBase.value, model: aiModel.value, apiKey: aiKey.value });
function showConnection() {
    const settings = config.getSettings();
    aiBase.value = settings.baseUrl;
    aiModel.value = settings.model;
    aiKey.value = settings.apiKey;
}
showConnection();
window.addEventListener('storage', (event) => {
    if (Object.values(config.STORAGE_KEYS).includes(event.key)) showConnection();
});
byId('showAIKey').onchange = (event) => { aiKey.type = event.target.checked ? 'text' : 'password'; };
aiForm.onsubmit = (event) => {
    event.preventDefault();
    try {
        config.saveSettings(readConnection());
        showConnection();
        setStatus('aiStatus', '连接已保存在此浏览器，三个入口均可使用。');
    } catch (error) { setStatus('aiStatus', error.message); }
};
byId('testAI').onclick = async () => {
    if (!aiForm.reportValidity()) return;
    const { baseUrl, model, apiKey } = readConnection();
    if (!apiKey.trim()) { setStatus('aiStatus', '请先填写 API Key。'); return; }
    const button = byId('testAI');
    button.disabled = true;
    setStatus('aiStatus', '正在直连模型服务…');
    try {
        const result = await config.testConnection(baseUrl, apiKey.trim(), model.trim());
        setStatus('aiStatus', result.ok ? '连接成功' : `连接失败：${result.error}`);
    } finally { button.disabled = false; }
};
byId('clearAIKey').onclick = () => {
    if (!window.confirm('清除本机当前密钥和所有模型预设中的密钥？')) return;
    try {
        config.clearCredentials();
        showConnection();
        setStatus('privacyStatus', '本机已保存的 AI 密钥已清除。');
    } catch (error) { setStatus('privacyStatus', error.message); }
};
byId('exportPreferences').onclick = () => {
    const selected = preferences.get();
    const exported = Object.fromEntries(Object.keys(preferences.defaults).map((key) => [key, selected[key]]));
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'quark-preferences.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const noticeForm = byId('personalNoticeForm');
const schedule = byId('personalNoticeList');
let editingId;
function resetEditor() {
    editingId = undefined;
    noticeForm.reset();
    noticeForm.elements.date.value = localDate();
    byId('noticeSave').textContent = '添加提醒';
    byId('noticeCancel').hidden = true;
}
function renderSchedule() {
    schedule.replaceChildren();
    for (const notice of getPersonalNotices()) {
        const row = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = `${notice.title} · ${notice.annual ? '每年 ' + notice.annual : notice.startDate}`;
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'btn ghost';
        edit.textContent = '编辑';
        edit.onclick = () => {
            editingId = notice.id;
            noticeForm.elements.title.value = notice.title;
            noticeForm.elements.content.value = notice.content;
            noticeForm.elements.date.value = notice.startDate;
            noticeForm.elements.repeat.value = notice.annual ? 'annual' : 'once';
            byId('noticeSave').textContent = '保存提醒';
            byId('noticeCancel').hidden = false;
            noticeForm.elements.title.focus();
        };
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn ghost';
        remove.textContent = '删除';
        remove.onclick = () => {
            if (editingId === notice.id) resetEditor();
            savePersonalNotices(getPersonalNotices().filter((item) => item.id !== notice.id));
            renderSchedule();
        };
        row.append(name, edit, remove);
        schedule.append(row);
    }
}
noticeForm.onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(noticeForm);
    const date = String(data.get('date'));
    const title = String(data.get('title')).trim();
    if (!title) return;
    const entry = {
        id: editingId || `personal-${config.generateId()}`, title, content: String(data.get('content')).trim(),
        kind: 'personal', popup: true, startDate: date, endDate: date
    };
    if (data.get('repeat') === 'annual') entry.annual = date.slice(5);
    savePersonalNotices([...getPersonalNotices().filter((item) => item.id !== entry.id), entry]);
    resetEditor();
    renderSchedule();
};
byId('noticeCancel').onclick = resetEditor;
resetEditor();
renderSchedule();
