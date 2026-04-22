# `/a/terminal` 与 `/a/ds` 联动说明

更新时间：2026-04-23

## 概述

`/a/terminal` 与 `/a/ds` 现已共用一套浏览器本地 LLM 配置，目标是让用户在任一页面保存 API Key / Base URL / Model 后，另一侧可直接读取并发起对话，无需重复配置。

## localStorage 键位

- `quark_llm_api_key`
- `quark_llm_base_url`
- `quark_llm_model`

兼容保留：

- `ds_api_key`

说明：

- `/a/ds` 保存配置时会同时写入共享键位和旧的 `ds_api_key`
- `/a/terminal` 优先读取共享键位，若不存在则回退读取 `ds_api_key`

## 默认值

- Base URL：`https://api.deepseek.com/v1`
- Model：`deepseek-reasoner`

`Base URL` 会在前端请求时自动拼接为 OpenAI 兼容的 `/chat/completions` 接口。

## `/a/terminal` 新增命令

- `llm <message>`：直接发起对话
- `llm-config`：查看当前配置
- `llm-key <api-key>`：保存 API Key
- `llm-base <base-url>`：保存 Base URL
- `llm-model <model>`：保存模型名
- `llm-history`：查看终端侧近期开启的对话摘要
- `llm-clear`：清空终端侧对话摘要

## 维护提醒

- 若未来新增第三个 LLM 页面，优先继续复用 `assets/js/llm-shared.js`
- 若修改存储键名，必须同步更新：
  - `/a/ds`
  - `/a/terminal`
  - 本文档
