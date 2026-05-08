## Quark 管理面板 Web UI

`quark web` 会启动本地管理面板 Web UI；`quark config` 仍保留为兼容入口，二者当前指向同一套 Flask 应用。

默认地址：

```bash
quark web
# http://127.0.0.1:5050
```

面板支持树形、代码、预览三种 JSON 编辑模式；保存前会由后端重新序列化 JSON。

当前可在 Web UI 执行的维护命令：
- `npm run build`
- `npm run typecheck`
- `npm run check:syntax`
- `quark updateposts`
- `quark updatelog`
- `git status --short`