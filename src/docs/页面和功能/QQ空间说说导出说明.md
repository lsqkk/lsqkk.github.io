# QQ 空间说说导出

`quark qqexport` 从 QQ 空间获取自己的说说动态，合并更新到 `assets/md/dt.md`。

## 使用方式

```bash
quark qqexport
```

首次运行会弹出二维码，用手机 QQ 扫码登录。后续运行自动使用已保存的登录态，如需重新登录，删除 `quark/qqexport/resource/user/` 下的文件即可。

## 行为说明

- **自动确定日期范围**：读取 `assets/md/dt.md` 中最新一条说说的日期，从次日开始导出直到当天，无需手动配置。
- **输出写入**：新内容追加到 `assets/md/dt.md` 文件头部（最新在前），保持与原有格式一致。
- **图片处理**：只保留图片 URL 引用，不下载图片本身。

## 依赖

需安装以下 Python 包：

```
Pillow
qrcode
pyzbar
requests
tqdm
```

通过 `pip install -r requirements.txt` 一键安装。

## 相关文件

| 路径 | 说明 |
|------|------|
| `quark/commands/qqexport.py` | CLI 命令入口 |
| `quark/qqexport/core.py` | 核心编排逻辑（日期检测、获取、合并） |
| `quark/qqexport/LoginUtil.py` | QQ 扫码登录 |
| `quark/qqexport/RequestUtil.py` | 请求工具与登录态 |
| `quark/qqexport/GetAllMomentsUtil.py` | QQ 空间说说 API |
| `quark/qqexport/ToolsUtil.py` | 工具函数 |
| `quark/qqexport/ConfigUtil.py` | 路径配置 |
| `quark/qqexport/resource/` | 运行时数据（cookies、缓存、临时文件），已被 `.gitignore` 排除 |
