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
