# 待更新功能描述

新增或更新后请及时打[x]，并移除距今3天（含）的已完成内容

- [x] 主页的动态显示，应直接在每条下方显示其对应评论（显示最新3条），并可直接在主页点赞
完成时间：2026-04-22
完成说明：主页动态卡片已新增最新 3 条评论预览区，并支持在主页直接点赞；点赞数与评论数会随 Firebase 数据实时更新。

- [x] 登录管理页/admin-user，新增“显示/导出注册用户列表”功能
完成时间：2026-04-22
完成说明：已在 `/a/admin-users` 新增注册用户列表面板与“导出注册用户”功能，并补充 `/admin-user` 跳转入口兼容旧路径。

- [x] 大幅优化 `/a/terminal`，补充常见 shell 指令并接入 LLM 对话能力
完成时间：2026-04-23
完成说明：已重构 `/a/terminal` 的路径解析、文件系统与命令执行层，补充 `pwd`、`echo`、`find`、`grep`、`wc`、`head`、`tail`、`cp`、`mv`、`stat`、`env/export/unset` 等常见 shell 指令，并新增 `llm`、`llm-config`、`llm-key`、`llm-base`、`llm-model`、`llm-history` 等命令；同时让 `/a/ds` 与 `/a/terminal` 共用同一套 localStorage LLM 配置，若已在 `/a/ds` 保存 API Key / Base URL / Model，终端可直接读取后对话。
