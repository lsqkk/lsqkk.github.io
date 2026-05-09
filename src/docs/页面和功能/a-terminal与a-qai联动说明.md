# `/a/terminal` 与 `/a/qai` 联动说明

更新时间：2026-05-09

## 概述

`/a/terminal` 与 `/a/qai` 现已共用一套浏览器本地 LLM 配置，目标是让用户在任一页面保存 API Key / Base URL / Model 后，另一侧可直接读取并发起对话，无需重复配置。

## localStorage 键位

### 基础配置（两侧共用）

- `quark_llm_api_key`
- `quark_llm_base_url`
- `quark_llm_model`

兼容保留：
- `ds_api_key`

说明：
- `/a/qai` 保存配置时会同时写入共享键位和旧的 `ds_api_key`
- `/a/terminal` 优先读取共享键位，若不存在则回退读取 `ds_api_key`

### 高级参数（仅 `/a/qai` 使用）

- `quark_llm_params` — JSON 对象，包含 temperature、top_p、top_k、presence_penalty、frequency_penalty、stop、contextWindow、maxTokens、stream 等参数

### 预设管理（仅 `/a/qai` 使用）

- `quark_llm_profiles` — JSON 数组，保存多个模型配置预设
- `quark_llm_active_profile` — 当前激活的预设 ID

### 人格管理（仅 `/a/qai` 使用）

- `quark_llm_personas` — JSON 数组，保存多个人格（系统提示词）
- `quark_llm_active_persona` — 当前激活的人格 ID

## 默认值

- Base URL：`https://api.deepseek.com/v1`
- 默认模型：`deepseek-reasoner`
- Temperature：`0.7`
- Max Tokens：`4096`
- Context Window：`15` 条消息

`Base URL` 会在前端请求时自动拼接为 OpenAI 兼容的 `/chat/completions` 接口。

## `/a/qai` 功能说明

### 设置弹窗（多标签）
- **连接**：服务商选择、API Key、Base URL、模型选择、上下文消息数、最大输出 Token、测试连接、获取模型列表
- **参数**：Temperature、Top P、Top K、Presence Penalty、Frequency Penalty、停止序列、Stream 开关
- **预设**：保存/加载/删除模型配置预设，快速切换不同模型和参数组合

### 人格管理（Personas）
- 在侧栏底部点击「人格」打开管理弹窗
- 支持新建、编辑、删除、导入（.txt/.md）、导出人格
- 人格内容作为 System Prompt 发送给 API
- 可在聊天中随时切换或清除人格

### V2 新增功能 (2026-05-09)

#### 1. 对话分类
- 侧栏顶部新增分类栏，支持创建/重命名/删除分类
- 对话历史可通过分类筛选显示
- 支持拖拽：直接拖动历史项到分类标签上即可移动
- 数据存储在 `quark_llm_categories`

#### 2. 移动端侧栏优化
- 侧栏头部新增关闭按钮（×），仅移动端可见
- 点击右侧聊天区域空白处收起侧栏
- 支持滑动手势：左滑侧栏关闭，从左侧边缘右滑打开
- 数据存储在 `quark_llm_active_category`

#### 3. 消息星标与备注
- 每条 AI 回复左下角显示星标（☆/★）和备注（📝）按钮
- 星标消息可添加备注文本
- 侧栏底部「星标」按钮打开星标管理器，支持跳转和取消星标
- 数据存储在 `quark_llm_starred`

#### 4. 命令系统
- 输入框输入 `/` 触发命令自动补全弹窗
- 可用命令：
  - `/new` - 新建对话
  - `/clear` - 清空当前对话
  - `/settings` - 打开设置
  - `/persona` - 人格管理
  - `/templates` - 提示词模板
  - `/export` - 导出对话
  - `/summarize` - 总结当前对话
  - `/translate <文本>` - 翻译模式
  - `/starred` - 查看星标消息
  - `/help` - 显示所有命令
- 支持 Tab 选择、方向键导航、Enter 确认
- 提示词模板可自动注册为命令（`/模板名`）

#### 5. 提示词模板库
- 侧栏底部「模板」按钮打开模板管理弹窗
- 模板包含：名称、标签、系统提示词、用户消息前缀
- 从弹窗「应用到当前对话」或通过命令 `/模板名` 调用
- 比人格更灵活：可多次叠加、可携带用户前缀
- 数据存储在 `quark_llm_templates`

#### 6. AI 输出中断
- AI 生成时发送按钮变为红色停止按钮（脉冲动画）
- 点击停止立即中断输出
- 已生成的部分保留，仍可复制、下载、星标、重新生成
- 通过 AbortController 实现

### 其他功能
- 多会话历史管理（保存在 localStorage）
- Markdown 渲染（通过 marked.js）
- 流式输出（SSE）
- 思维链（reasoning_content）显示
- 文件上传作为上下文
- 暗色模式

## `/a/terminal` LLM 命令

- `llm <message>`：直接发起对话
- `llm` / `llm-on`：进入连续对话模式
- `llm-off`：退出连续对话模式
- `llm-config`：查看当前配置
- `llm-key <api-key>`：保存 API Key
- `llm-base <base-url>`：保存 Base URL
- `llm-model <model>`：保存模型名
- `llm-history`：查看终端侧近期对话摘要
- `llm-clear`：清空终端侧对话摘要

## 维护提醒

- 若未来新增第三个 LLM 页面，优先继续复用 `assets/js/llm-shared.js`
- 若修改存储键名，必须同步更新：
  - `/a/qai`
  - `/a/terminal`
  - 本文档
- 新增高级参数时，只需修改 `llm-shared.js` 中的 `DEFAULTS` 和 `STORAGE_KEYS`
